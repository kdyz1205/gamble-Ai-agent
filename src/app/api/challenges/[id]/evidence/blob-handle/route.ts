import { NextRequest } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { authorizeEvidenceUpload, EvidenceUploadPolicyError } from '@/lib/evidence-upload-policy';

export const runtime = 'nodejs';

/** Storage callbacks retain SDK signature verification; token generation requires a current player session. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Response.json({ error: 'An upload object is required' }, { status: 400 });
  const candidate = raw as Record<string, unknown>;
  if (!['blob.generate-client-token', 'blob.upload-completed'].includes(String(candidate.type))
    || !candidate.payload || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload)) {
    return Response.json({ error: 'Invalid upload request' }, { status: 400 });
  }
  const body = raw as HandleUploadBody;
  if (body.type === 'blob.generate-client-token' && typeof body.payload.pathname !== 'string') {
    return Response.json({ error: 'Invalid upload pathname' }, { status: 400 });
  }
  try {
    if (body.type === 'blob.generate-client-token') {
      const user = await getAuthUser();
      if (!user) return unauthorized();
      await authorizeEvidenceUpload({ userId: user.userId, challengeId: id, pathname: body.payload.pathname });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return Response.json({ error: 'Direct upload is unavailable. Use a public HTTPS proof URL or try again later.', configured: false }, { status: 503 });
    const jsonResponse = await handleUpload({ request: req, body,
      onBeforeGenerateToken: async pathname => {
        const user = await getAuthUser();
        if (!user) throw new EvidenceUploadPolicyError('Authentication required', 401);
        const policy = await authorizeEvidenceUpload({ userId: user.userId, challengeId: id, pathname });
        return { ...policy, addRandomSuffix: true };
      },
    });
    return Response.json(jsonResponse);
  } catch (error) {
    if (error instanceof EvidenceUploadPolicyError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Upload could not be authorized. Please retry.', configured: false }, { status: 400 });
  }
}
