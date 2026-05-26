import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { CompileRequestError, compileProtocolForUser } from "@/lib/protocol-compiler";
import { challengeSpecFromProtocol } from "@/lib/protocol-spec-v2";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const limited = await rateLimit(req, { scope: "generate-spec", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const inputText = String(body.inputText || body.prompt || "").trim();
  const providerId = typeof body.providerId === "string" ? body.providerId.trim() : undefined;
  const model = typeof body.model === "string" ? body.model.trim() : undefined;
  const language = body.language === "en" || body.language === "zh" || body.language === "auto" ? body.language : "auto";
  const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : undefined;

  try {
    const compiled = await compileProtocolForUser({
      userId: user.userId,
      inputText,
      providerId,
      model,
      language,
      context: {
        surface: "legacy_generate_spec",
        flow: "protocol_backed_generate_spec",
        ...(context ?? {}),
      },
      tierId: 1,
      route: "/api/challenges/generate-spec",
    });
    const spec = challengeSpecFromProtocol(compiled.protocol);
    return Response.json({
      rawPrompt: inputText,
      spec,
      protocol: compiled.protocol,
      preview: compiled.preview,
      model: compiled.model,
      source: compiled.source,
      providerId: compiled.providerId,
      externalApiCharged: compiled.externalApiCharged,
      providerCall: compiled.providerCall,
      dailyQuota: compiled.dailyQuota,
      aiAccess: "aiAccess" in compiled ? compiled.aiAccess : undefined,
      modelAccess: "modelAccess" in compiled ? compiled.modelAccess : undefined,
      agentGraph: compiled.agentGraph,
    });
  } catch (error) {
    const status = error instanceof CompileRequestError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Challenge spec generation failed";
    console.error("[generate-spec] failed", { providerId: providerId ?? null, model: model ?? null, status, error: message });
    return Response.json(
      {
        error: `AI challenge spec generation failed: ${message}`,
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
