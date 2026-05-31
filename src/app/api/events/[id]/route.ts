import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { eventPublicInclude } from "@/lib/challenge-events";
import { parseProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import { extractWeatherOracleSpec, normalizeWeatherOracleProtocol } from "@/lib/weather-oracle";

async function selfHealOracleProtocol(event: { id: string; title: string; protocolJson: string }) {
  let protocol = null;
  try {
    protocol = parseProtocolSpecV2(JSON.parse(event.protocolJson));
  } catch {
    return { healed: false };
  }

  if (protocol?.settlementProtocol.mode !== "auto_oracle") return { healed: false };
  if (extractWeatherOracleSpec({ protocol, title: event.title })) return { healed: false };

  const normalized = await normalizeWeatherOracleProtocol(protocol);
  if (!extractWeatherOracleSpec({ protocol: normalized, title: event.title })) return { healed: false };

  await prisma.challengeEvent.update({
    where: { id: event.id },
    data: {
      title: normalized.title || event.title,
      protocolJson: JSON.stringify(normalized),
    },
  });
  return { healed: true };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    include: eventPublicInclude,
  });

  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  const healed = await selfHealOracleProtocol(event).catch((error) => {
    console.error("[event GET] oracle protocol self-heal failed", { eventId: id, error });
    return { healed: false };
  });
  if (!healed.healed) return Response.json({ event });

  const healedEvent = await prisma.challengeEvent.findUnique({
    where: { id },
    include: eventPublicInclude,
  });
  return Response.json({ event: healedEvent ?? event, oracleProtocolHealed: true });
}
