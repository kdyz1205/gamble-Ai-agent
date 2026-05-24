import { agentGraphCatalog } from "@/lib/agent/agent-graph";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(agentGraphCatalog());
}
