import crypto from "node:crypto";
import prisma from "@/lib/db";

export const runtime = "nodejs";

function verifyStripeSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: "Stripe webhook secret is not configured." }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), webhookSecret)) {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    data?: {
      object?: {
        id?: string;
        client_reference_id?: string;
        amount_total?: number;
        currency?: string;
        metadata?: Record<string, string>;
      };
    };
  };

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    const userId = session?.client_reference_id || session?.metadata?.userId || null;
    await prisma.auditLog.create({
      data: {
        action: "stripe_checkout_completed",
        actorUserId: userId,
        payload: JSON.stringify({
          stripeEventId: event.id,
          sessionId: session?.id,
          amountTotal: session?.amount_total,
          currency: session?.currency,
          product: session?.metadata?.product,
          wagering: false,
        }),
      },
    }).catch((err) => {
      console.error("stripe_checkout_completed audit log failed", err);
    });
  }

  return Response.json({ received: true });
}
