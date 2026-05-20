import { haversineMiles } from "@/lib/challenge-discovery";
import { parseProtocolSpecV2, type ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export type LocationSnapshot = {
  lat: number;
  lng: number;
};

export type LocationEligibilityChallenge = {
  locationMode?: string | null;
  discoveryLat?: number | null;
  discoveryLng?: number | null;
  creator?: { latitude: number | null; longitude: number | null } | null;
  protocol?: { specJson: string | null } | null;
};

export type LocationEligibilityResult = {
  required: boolean;
  eligible: boolean;
  mode: string;
  distanceMeters: number | null;
  requiredRadiusMeters: number;
  reason: string;
};

const JOIN_GATED_LOCATION_MODES = new Set([
  "nearby_discovery",
  "same_place_required",
  "walk_to_join",
  "geo_fenced_zone",
  "live_route",
  "mass_local_event",
]);

export function validLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function parseStoredProtocol(raw: string | null | undefined): ProtocolSpecV2 | null {
  if (!raw) return null;
  try {
    return parseProtocolSpecV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function needsLocationJoinGate(
  protocol: ProtocolSpecV2 | null,
  challengeLocationMode?: string | null,
): boolean {
  const mode = protocol?.locationProtocol.mode ?? challengeLocationMode ?? "none";
  return (
    JOIN_GATED_LOCATION_MODES.has(mode) ||
    protocol?.locationProtocol.requiresLiveLocation === true ||
    protocol?.locationProtocol.requiresCoPresence === true
  );
}

export function evaluateLocationEligibility(
  challenge: LocationEligibilityChallenge,
  snapshot?: LocationSnapshot | null,
  parsedProtocol?: ProtocolSpecV2 | null,
): LocationEligibilityResult {
  const protocol = parsedProtocol ?? parseStoredProtocol(challenge.protocol?.specJson);
  const mode = protocol?.locationProtocol.mode ?? challenge.locationMode ?? "none";
  const requiredRadiusMeters =
    protocol?.locationProtocol.joinRadiusMeters ??
    protocol?.locationProtocol.challengeRadiusMeters ??
    500;

  if (!needsLocationJoinGate(protocol, challenge.locationMode)) {
    return {
      required: false,
      eligible: true,
      mode,
      distanceMeters: null,
      requiredRadiusMeters,
      reason: "Challenge does not require location eligibility.",
    };
  }

  const targetLat = challenge.discoveryLat ?? challenge.creator?.latitude ?? null;
  const targetLng = challenge.discoveryLng ?? challenge.creator?.longitude ?? null;
  if (targetLat == null || targetLng == null) {
    return {
      required: true,
      eligible: false,
      mode,
      distanceMeters: null,
      requiredRadiusMeters,
      reason: "Challenge has no location snapshot.",
    };
  }

  if (!snapshot) {
    return {
      required: true,
      eligible: false,
      mode,
      distanceMeters: null,
      requiredRadiusMeters,
      reason: "Location is required before joining this nearby challenge.",
    };
  }

  const distanceMeters = Math.round(haversineMiles(snapshot.lat, snapshot.lng, targetLat, targetLng) * 1609.344);
  const eligible = distanceMeters <= requiredRadiusMeters;
  return {
    required: true,
    eligible,
    mode,
    distanceMeters,
    requiredRadiusMeters,
    reason: eligible
      ? "You are within the challenge join radius."
      : "You are outside the challenge join radius.",
  };
}
