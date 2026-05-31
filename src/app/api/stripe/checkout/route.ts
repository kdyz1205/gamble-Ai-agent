import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { stripeCheckoutEnabled } from "@/lib/payment-policy";

const STRIPE_API_VERSION = "2026-02-25.clover";

function getOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  if (!stripeCheckoutEnabled()) {
    return Response.json(
      {
        error: "Stripe Checkout is not enabled.",
        code: "stripe_not_configured",
        message:
          "Set ENABLE_STRIPE_CHECKOUT=true and STRIPE_SECRET_KEY to enable non-wagering payments. This route does not fund stakes or payouts.",
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const product = typeof body.product === "string" ? body.product : "beta_supporter";
  if (product !== "beta_supporter") {
    return Response.json(
      {
        error: "Unsupported Stripe product.",
        code: "unsupported_product",
        supportedProducts: ["beta_supporter"],
      },
      { status: 400 },
    );
  }

  const amountCentsRaw = Number(body.amountCents ?? 500);
  const amountCents = Number.isFinite(amountCentsRaw)
    ? Math.min(100_000, Math.max(100, Math.floor(amountCentsRaw)))
    : 500;
  const origin = getOrigin(req);

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${origin}/?payment=stripe_success`);
  params.set("cancel_url", `${origin}/?payment=stripe_cancelled`);
  params.set("client_reference_id", user.userId);
  if (user.email) params.set("customer_email", user.email);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(amountCents));
  params.set("line_items[0][price_data][product_data][name]", "StepOne beta supporter");
  params.set(
    "line_items[0][price_data][product_data][description]",
    "Non-wagering beta support payment. Does not buy stake credits, cash balance, or payout rights.",
  );
  params.set("metadata[userId]", user.userId);
  params.set("metadata[product]", product);
  params.set("metadata[wagering]", "false");
  params.set("payment_intent_data[metadata][userId]", user.userId);
  params.set("payment_intent_data[metadata][product]", product);
  params.set("payment_intent_data[metadata][wagering]", "false");
  params.set("custom_text[submit][message]", "This payment does not fund wagers, stakes, prize pools, or payouts.");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: params,
  });

  const payload = await response.json().catch(() => ({})) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.url) {
    return Response.json(
      {
        error: payload.error?.message || "Stripe Checkout session creation failed.",
        code: "stripe_checkout_failed",
      },
      { status: 502 },
    );
  }

  return Response.json({
    id: payload.id,
    url: payload.url,
    product,
    wagering: false,
  });
}
