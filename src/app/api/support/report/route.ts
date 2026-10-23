import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth-options";
import prisma from "@/lib/db";

const actionByKind = {
  report_content: "support.report_content",
  block_user: "support.block_user",
  support_request: "support.support_request",
} as const;

type SupportKind = keyof typeof actionByKind;

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readKind(value: unknown): SupportKind | null {
  if (typeof value !== "string") return null;
  return value in actionByKind ? (value as SupportKind) : null;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const kind = readKind(record.kind);
  const target = readString(record.target, 500);
  const reason = readString(record.reason, 2_000);
  const contact = readString(record.contact, 320);

  if (!kind) {
    return Response.json({ error: "Choose report_content, block_user, or support_request" }, { status: 400 });
  }

  if (reason.length < 10) {
    return Response.json({ error: "Add at least 10 characters explaining the request" }, { status: 400 });
  }

  const session = await getServerSession(authOptions).catch(() => null);
  const actorUserId = session?.user && "id" in session.user ? String(session.user.id) : undefined;

  if (kind === "block_user") {
    // A report is not itself a block: the authenticated account must get an
    // enforced, durable block before the API acknowledges success.
    if (!actorUserId) return Response.json({ error: "Sign in to block a user" }, { status: 401 });
    let identifier = target.replace(/^@/, "");
    if (target.startsWith("https://")) {
      try {
        const url = new URL(target);
        if (!["summoner.world", "www.summoner.world"].includes(url.hostname)) {
          return Response.json({ error: "Use a Summoner profile link or exact username" }, { status: 400 });
        }
        identifier = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
      } catch {
        return Response.json({ error: "Invalid profile link" }, { status: 400 });
      }
    }
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(identifier)) {
      return Response.json({ error: "Provide an exact username, user ID, or Summoner profile link" }, { status: 400 });
    }
    const found = await prisma.user.findFirst({
      where: { OR: [{ id: identifier }, { username: identifier }] },
      select: { id: true },
    });
    if (!found) return Response.json({ error: "User not found" }, { status: 404 });
    if (found.id === actorUserId) return Response.json({ error: "Cannot block your own account" }, { status: 400 });
    const auditLog = await prisma.$transaction(async (tx) => {
      await tx.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: actorUserId, blockedId: found.id } },
        create: { blockerId: actorUserId, blockedId: found.id },
        update: {},
      });
      return tx.auditLog.create({ data: {
        action: actionByKind[kind], actorUserId, targetUserId: found.id,
        payload: JSON.stringify({ kind, reason, target: identifier, contact }),
      } });
    });
    return Response.json({ ok: true, blocked: true, reportId: auditLog.id }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const auditLog = await prisma.auditLog.create({
    data: {
      action: actionByKind[kind],
      actorUserId,
      payload: JSON.stringify({
        kind,
        target,
        reason,
        contact,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      }),
    },
  });

  return Response.json({ ok: true, reportId: auditLog.id });
}
