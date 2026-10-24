import { NextRequest } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth';
import { assessJudgeability } from '@/lib/judgeability';

/**
 * Free, deterministic preflight. It never calls an LLM or moves Credits.
 * The result describes proof *reviewability*, not physical achievability.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    return Response.json(
      { judgeability: assessJudgeability(body) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('[judgeability] unexpected preflight failure', { type: error instanceof Error ? error.name : 'UnknownError' });
    return Response.json({ error: 'Could not assess proof requirements' }, { status: 500 });
  }
}
