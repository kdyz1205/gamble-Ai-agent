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
