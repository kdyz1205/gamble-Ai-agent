import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";

// Default to classic whisper-1 because it is the most battle-tested multilingual
// transcription model on OpenAI's platform — Chinese, Spanish, Arabic, Hindi,
// Japanese, etc. all work out of the box. gpt-4o-mini-transcribe is a newer
// model that has broader capabilities but is NOT yet available for every
// project/region, and silently behaves poorly on non-English audio in some
// accounts. A previous default of gpt-4o-mini-transcribe caused Chinese voice
// input to come back empty or as English gibberish for some users, so we're
// moving back to the proven path unless an operator explicitly overrides via
// OPENAI_TRANSCRIBE_MODEL.
const DEFAULT_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
// If the primary model call fails (model not available to this project, etc.)
// try this as a fallback.
const FALLBACK_MODEL = "whisper-1";
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

    // Single-shot call builder — reused for primary + fallback so the audio
    // `File` isn't accidentally consumed between attempts.
    const callWhisper = async (modelName: string, audioFile: File): Promise<Response> => {
      const upstream = new FormData();
      upstream.append("file", audioFile, audioFile.name || "voice.webm");
      upstream.append("model", modelName);
      upstream.append("response_format", "json");
      if (languageHint) upstream.append("language", languageHint);
      return fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: upstream,
      });
    };

    let response = await callWhisper(DEFAULT_MODEL, file);
    let modelUsed = DEFAULT_MODEL;

    // Model-not-available / permission errors from OpenAI come back as 4xx.
    // Retry once on `whisper-1` — it's ubiquitously available and excellent
    // for Chinese. Keeps Chinese input working even if the newer model isn't
    // enabled on this key.
    if (!response.ok && DEFAULT_MODEL !== FALLBACK_MODEL) {
      const errBody = await response.text().catch(() => "");
      console.warn(`[transcribe] primary model "${DEFAULT_MODEL}" failed (${response.status}): ${errBody.slice(0, 160)}. Falling back to ${FALLBACK_MODEL}.`);
      response = await callWhisper(FALLBACK_MODEL, file);
      modelUsed = FALLBACK_MODEL;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[transcribe] upstream failed (${response.status}): ${errorText.slice(0, 300)}`);
      return Response.json({
        transcript: previewText,
        language: languageHint || "unknown",
        provider: "preview_fallback",
        usedFallback: true,
        error: `Upstream transcription failed (${response.status}): ${errorText.slice(0, 200)}`,
        model: modelUsed,
      }, { status: 200 });
    }

    const data = await response.json() as { text?: string; language?: string };
    const transcript = (data.text || previewText || "").trim();
    if (!transcript) {
      console.warn(`[transcribe] empty transcript from ${modelUsed}, lang=${data.language ?? "n/a"}`);
    }

    return Response.json({
      transcript,
      language: data.language || languageHint || "unknown",
      provider: "openai_audio_transcriptions",
      model: modelUsed,
      usedFallback: !data.text,
    });
  } catch (err) {
    console.error("[transcribe] exception:", err);
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to transcribe audio",
    }, { status: 500 });
  }
}
