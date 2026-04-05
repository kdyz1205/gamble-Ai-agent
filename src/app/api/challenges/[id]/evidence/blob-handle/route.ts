import { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 80 * 1024 * 1024;

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * POST /api/challenges/[id]/evidence/blob-handle
 * Vercel Blob client-upload handshake (token generation). Bytes go to Blob storage, not through this route.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!blobConfigured()) {
    return Response.json(
      {
        error:
          "Vercel Blob is not configured. In Vercel: Storage → Blob → connect store (adds BLOB_READ_WRITE_TOKEN).",
        configured: false,
      },
      { status: 503 },
    );
  }

  const { id } = await params;

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const user = await getAuthUser();

  if (body.type === "blob.generate-client-token") {
    if (!user) return unauthorized();
    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!challenge) {
      return Response.json({ error: "Challenge not found" }, { status: 404 });
    }
    if (!["open", "live", "matched"].includes(challenge.status)) {
      return Response.json(
        { error: "Evidence locked — challenge is judging, settled, or closed." },
        { status: 400 },
      );
    }
    const isParticipant = challenge.participants.some((p) => p.userId === user.userId);
    if (!isParticipant) {
      return Response.json({ error: "You are not a participant in this challenge" }, { status: 403 });
    }

    const prefix = `evidence/${id}/`;
    if (!body.payload.pathname.startsWith(prefix)) {
      return Response.json({ error: "Invalid pathname" }, { status: 400 });
    }
  }

  try {
    const jsonResponse = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = `evidence/${id}/`;
        if (!pathname.startsWith(prefix)) {
          throw new Error("Invalid pathname");
        }
        return {
          allowedContentTypes: ["video/*", "image/*"],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(jsonResponse);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Blob upload failed" },
      { status: 400 },
    );
  }
}
