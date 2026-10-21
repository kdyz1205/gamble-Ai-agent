/** Browser-side proof contract; the server still validates the uploaded asset. */
export function mediaProofKind(policy: string): "photo" | "video" | null {
  policy = policy.trim().toLowerCase();
  return policy === "photo" ? "photo" : policy === "video" ? "video" : null;
}

export function proofInputError(policy: string, input: { fileType?: string; url?: string; description?: string }): string | null {
  const kind = mediaProofKind(policy);
  if (kind && input.fileType !== undefined && !input.fileType.startsWith(kind === "photo" ? "image/" : "video/")) {
    return `This quest requires ${kind} proof. Choose a matching file.`;
  }
  if (input.url) {
    try {
      const url = new URL(input.url);
      if (url.protocol !== "https:" || url.username || url.password) return "Use a public HTTPS link to the proof file.";
    } catch { return "Use a valid public HTTPS link to the proof file."; }
  }
  if (kind && input.fileType === undefined && !input.url) return `This quest requires ${kind} proof. Add a matching file or public HTTPS link.`;
  if (["text", "self_report"].includes(policy.trim().toLowerCase()) && !input.description?.trim()) return "Describe what you did before submitting written proof.";
  if (!input.fileType && !input.url && !input.description?.trim()) return "Add proof before submitting.";
  return null;
}

/** Use capabilities, including MP4-only recorders; undefined lets the browser choose its default. */
export function recordingMimeType(isSupported: (type: string) => boolean): string | undefined {
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=avc1", "video/mp4"].find(isSupported);
}

export function recordingExtension(mime: string): "mp4" | "webm" {
  return mime.toLowerCase().includes("mp4") ? "mp4" : "webm";
}
