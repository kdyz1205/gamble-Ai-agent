import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { CompileRequestError, compileProtocolForUser } from "@/lib/protocol-compiler";
import { rateLimit } from "@/lib/rate-limit";
import { paymentJurisdictionFromRequest, paymentPolicyStatus } from "@/lib/payment-policy";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const limited = await rateLimit(req, { scope: "compile-protocol", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const inputText = String(body.inputText || body.prompt || "").trim();
  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : undefined;
  const model = typeof body.model === "string" ? body.model.trim() : undefined;
  const language = body.language === "en" || body.language === "zh" || body.language === "auto" ? body.language : "auto";
  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : undefined;
  const paymentPolicy = paymentPolicyStatus(paymentJurisdictionFromRequest(req, context));
  const trustedContext = {
    ...(context ?? {}),
    paymentPolicy,
  };

  try {
    const compiled = await compileProtocolForUser({
      userId: user.userId,
      inputText,
      providerId,
      model,
      language,
      context: trustedContext,
      tierId: 1,
      route: "/api/challenges/compile",
    });
    return Response.json(compiled);
  } catch (error) {
    const status = error instanceof CompileRequestError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Protocol compilation failed";
    console.error("[compile-protocol] failed", { providerId: providerId ?? null, model: model ?? null, status, error: message });
    return Response.json(
      {
        error: `AI protocol compilation failed: ${message}`,
        rawPrompt: inputText,
        source: "error",
        providerId: providerId ?? null,
        model: model ?? null,
        needsUpgrade: status === 402,
      },
      { status },
    );
  }
}
