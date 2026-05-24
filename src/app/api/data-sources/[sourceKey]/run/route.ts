import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { executeDataSourceAdapter } from "@/lib/data-source-adapters";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sourceKey: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { sourceKey } = await params;
  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }
  const paramsBody = body.params && typeof body.params === "object" && !Array.isArray(body.params)
    ? body.params as Record<string, unknown>
    : {};
  const result = await executeDataSourceAdapter({
    sourceKey,
    params: paramsBody,
    dryRun: body.dryRun === true,
  });
  return Response.json(result, { status: result.status === "not_registered" ? 404 : 200 });
}
