import prisma from './db';

export const EVIDENCE_UPLOAD_MAX_BYTES = 80 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska', 'video/mpeg', 'video/3gpp', 'video/3gpp2', 'video/x-m4v'];
const PHOTO_EXTENSIONS = new Set(['jpg','jpeg','png','webp','gif','avif','heic','heif','bmp','tif','tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4','webm','mov','ogg','ogv','mkv','mpeg','mpg','3gp','3g2','m4v']);

export class EvidenceUploadPolicyError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Authorization for new storage tokens; proof submission rechecks state after bytes upload. */
export async function authorizeEvidenceUpload(input: {
  userId: string; challengeId: string; contentType?: string; pathname?: string;
}) {
  const challenge = await prisma.challenge.findUnique({ where: { id: input.challengeId },
    include: { participants: { where: { userId: input.userId } } } });
  if (!challenge) throw new EvidenceUploadPolicyError('Quest not found', 404);
  if (!challenge.participants.some(p => p.status === 'accepted' && (p.role === 'creator' || p.role === 'opponent'))) {
    throw new EvidenceUploadPolicyError('Only accepted quest players can upload proof', 403);
  }
  if (!['live','matched'].includes(challenge.status)) throw new EvidenceUploadPolicyError('Proof uploads require an active quest', 409);
  const now = Date.now();
  if (challenge.deadline && challenge.deadline.getTime() <= now) throw new EvidenceUploadPolicyError('The proof deadline has passed', 409);
  const policy = challenge.evidenceType.trim().toLowerCase();
  const allowedContentTypes = policy === 'photo' ? PHOTO_TYPES : policy === 'video' ? VIDEO_TYPES
    : [...PHOTO_TYPES, ...VIDEO_TYPES];
  // Written-proof quests can attach supporting media; submission still requires a description.
  if (input.contentType !== undefined && !allowedContentTypes.includes(input.contentType)) {
    throw new EvidenceUploadPolicyError('File type does not match the quest proof requirements', 400);
  }
  if (input.pathname !== undefined) {
    const prefix = `evidence/${input.challengeId}/`;
    const name = input.pathname.slice(prefix.length);
    if (!input.pathname.startsWith(prefix) || !name || input.pathname.length > 512
      || name.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || /[\u0000-\u001f]/.test(name)) {
      throw new EvidenceUploadPolicyError('Invalid proof upload path', 400);
    }
    const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
    if (!(policy === 'video' ? VIDEO_EXTENSIONS.has(extension) : policy === 'photo' ? PHOTO_EXTENSIONS.has(extension)
      : PHOTO_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension))) {
      throw new EvidenceUploadPolicyError('Choose a supported file matching the quest proof type', 400);
    }
  }
  return { allowedContentTypes: [...allowedContentTypes], maximumSizeInBytes: EVIDENCE_UPLOAD_MAX_BYTES,
    validUntil: Math.min(now + 15 * 60_000, challenge.deadline?.getTime() ?? Infinity) };
}
