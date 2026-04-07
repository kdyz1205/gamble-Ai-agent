import { NextRequest } from "next/server";

const DEFAULT_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const previewText = String(form.get("previewText") || "").trim();
    const languageHintRaw = String(form.get("languageHint") || "").trim().toLowerCase();
    const languageHint = languageHintRaw === "zh" || languageHintRaw === "en" ? languageHintRaw : "";

    if (!(file instanceof File) && !previewText) {
      return Response.json({ error: "audio file or preview text is required" }, { status: 400 });
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
