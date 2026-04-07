import { NextRequest } from "next/server";

/**
 * POST /api/transcribe
 * Accepts audio blob, returns high-quality transcript.
 *
 * Uses Anthropic's audio capability or OpenAI Whisper as available.
 * Falls back to returning empty transcript if no ASR configured.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const langHint = formData.get("lang") as string | null;

    if (!audioFile) {
      return Response.json({ error: "No audio file provided" }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Try OpenAI Whisper API if available
    if (process.env.OPENAI_API_KEY) {
      const whisperForm = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: audioFile.type });
      whisperForm.append("file", audioBlob, "audio.webm");
      whisperForm.append("model", "whisper-1");
      if (langHint && langHint !== "auto") {
        whisperForm.append("language", langHint === "zh" ? "zh" : "en");
      }
      whisperForm.append("response_format", "verbose_json");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: whisperForm,
      });

      if (whisperRes.ok) {
        const data = await whisperRes.json();
        return Response.json({
          transcript: data.text || "",
          language: data.language || "en",
          confidence: 0.95,
          source: "whisper",
          segments: data.segments?.map((s: { text: string; start: number; end: number }) => ({
            text: s.text,
            startMs: Math.round(s.start * 1000),
            endMs: Math.round(s.end * 1000),
          })) || [],
        });
      }
    }

    // Try Anthropic if available (audio input in messages)
    if (process.env.ANTHROPIC_API_KEY) {
      const base64Audio = audioBuffer.toString("base64");
      const mimeType = audioFile.type || "audio/webm";

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-20250414",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: mimeType, data: base64Audio },
              },
              {
                type: "text",
                text: `Transcribe this audio exactly. Output ONLY the transcript text, nothing else. The speaker may use English, Chinese, or mixed. Preserve all numbers, names, and currency amounts exactly as spoken.${langHint ? ` Hint: primary language is ${langHint}.` : ""}`,
              },
            ],
          }],
        }),
      });

      if (anthropicRes.ok) {
        const data = await anthropicRes.json();
        const transcript = data.content?.[0]?.text || "";
        return Response.json({
          transcript,
          language: /[\u4e00-\u9fff]/.test(transcript) ? "zh" : "en",
          confidence: 0.9,
          source: "anthropic",
          segments: [],
        });
      }
    }

    // No ASR available — return empty
    return Response.json({
      transcript: "",
      language: "unknown",
      confidence: 0,
      source: "none",
      error: "No ASR service configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    }, { status: 200 });

  } catch (err) {
    console.error("Transcribe error:", err);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
