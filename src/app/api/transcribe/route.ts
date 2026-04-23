import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";

const DEFAULT_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI Whisper cap — reject larger before forwarding

// In-memory per-user rate limiter. Serverless lambda-local so it's best-effort
// (multiple warm instances each carry their own map), but stops a single runaway
// tab from opening 1000 transcription requests per second.
const RATE_WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20; // 20 transcriptions/minute per user is generous for real usage
const userHits = new Map<string, number[]>();

function hitRate(userId: string): { ok: boolean; retryInSec?: number } {
  const now = Date.now();
  const prior = userHits.get(userId) ?? [];
  const fresh = prior.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= MAX_PER_WINDOW) {
    const oldest = fresh[0];
    return { ok: false, retryInSec: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000)) };
  }
  fresh.push(now);
  userHits.set(userId, fresh);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  // Auth gate — transcription forwards to OpenAI and costs real money.
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const rl = hitRate(user.userId);
  if (!rl.ok) {
    return Response.json(
      { error: `Too many transcription requests. Try again in ${rl.retryInSec}s.` },
      { status: 429 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const previewText = String(form.get("previewText") || "").trim();
    const languageHintRaw = String(form.get("languageHint") || "").trim().toLowerCase();
    const languageHint = languageHintRaw === "zh" || languageHintRaw === "en" ? languageHintRaw : "";

    if (!(file instanceof File) && !previewText) {
      return Response.json({ error: "audio file or preview text is required" }, { status: 400 });
    }
    if (file instanceof File && file.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: `Audio file too large (${file.size} bytes). Max ${MAX_AUDIO_BYTES} bytes.` },
        { status: 413 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({
        transcript: previewText,
        language: languageHint || "unknown",
        provider: "preview_fallback",
        usedFallback: true,
      });
    }

    if (!(file instanceof File)) {
      return Response.json({
        transcript: previewText,
        language: languageHint || "unknown",
        provider: "preview_fallback",
        usedFallback: true,
      });
    }

    const upstream = new FormData();
    upstream.append("file", file, file.name || "voice.webm");
    upstream.append("model", DEFAULT_MODEL);
    upstream.append("response_format", "json");

    if (languageHint) {
      upstream.append("language", languageHint);
    }

    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: upstream,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({
        transcript: previewText,
        language: languageHint || "unknown",
        provider: "preview_fallback",
        usedFallback: true,
        error: `Upstream transcription failed: ${errorText}`,
      }, { status: 200 });
    }

    const data = await response.json() as { text?: string; language?: string };
    const transcript = (data.text || previewText || "").trim();

    return Response.json({
      transcript,
      language: data.language || languageHint || "unknown",
      provider: "openai_audio_transcriptions",
      usedFallback: !data.text,
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to transcribe audio",
    }, { status: 500 });
  }
}
