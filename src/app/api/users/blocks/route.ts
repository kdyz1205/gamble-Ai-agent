import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: user.userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      blocked: { select: { id: true, username: true, image: true } },
      createdAt: true,
    },
  });
  return Response.json({
    blockedUsers: rows.map(r => ({ ...r.blocked, createdAt: r.createdAt })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = body && typeof body === "object" && "targetUserId" in body
    ? (body as Record<string, unknown>).targetUserId : null;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || id === user.userId) {
    return Response.json({ error: "Invalid blocked user ID" }, { status: 400 });
  }
  await prisma.$transaction(async tx => {
    const result = await tx.userBlock.deleteMany({
      where: { blockerId: user.userId, blockedId: id },
    });
    if (result.count) await tx.auditLog.create({ data: {
      action: "support.unblock_user", actorUserId: user.userId, targetUserId: id,
    } });
  });
  return Response.json({ ok: true, blocked: false }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
