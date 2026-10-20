import { NextRequest } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { presignEvidencePut, isS3PresignConfigured } from '@/lib/s3-evidence-presign';
import { authorizeEvidenceUpload, EvidenceUploadPolicyError } from '@/lib/evidence-upload-policy';

export const runtime = 'nodejs';

/** Authorize an active player's media before issuing an S3 PUT capability. */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Response.json({ error: 'An upload object is required' }, { status: 400 });
  const body = raw as Record<string, unknown>;
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
  if (!challengeId || !contentType || (body.filename !== undefined && typeof body.filename !== 'string')) {
    return Response.json({ error: 'challengeId, contentType and a valid filename are required' }, { status: 400 });
  }
  try {
    const policy = await authorizeEvidenceUpload({ userId: user.userId, challengeId, contentType });
    if (!isS3PresignConfigured()) return Response.json({ error: 'Direct upload is unavailable. Use a public HTTPS proof URL or try again later.', configured: false }, { status: 503 });
    const expiresSeconds = Math.floor((policy.validUntil - Date.now()) / 1000);
    if (expiresSeconds < 1) throw new EvidenceUploadPolicyError("The proof deadline has passed", 409);
    const out = await presignEvidencePut({ challengeId, userId: user.userId, contentType,
      filename: typeof body.filename === 'string' ? body.filename : undefined,
      expiresSeconds });
    return Response.json({ configured: true, uploadUrl: out.uploadUrl, key: out.key, publicUrl: out.publicUrl,
      expiresIn: out.expiresIn, method: 'PUT', headers: { 'Content-Type': contentType } });
  } catch (error) {
    if (error instanceof EvidenceUploadPolicyError) return Response.json({ error: error.message }, { status: error.status });
    console.error('[evidence-presign] failed', { type: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'Could not prepare the upload. Please retry.', configured: false }, { status: 500 });
  }
}
