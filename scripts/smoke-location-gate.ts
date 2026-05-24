import assert from "node:assert/strict";
import {
  evaluateLocationEligibility,
  needsLocationJoinGate,
  validLatLng,
  type LocationEligibilityChallenge,
} from "../src/lib/location-eligibility";
import type { ProtocolSpecV2 } from "../src/lib/protocol-spec-v2";

function protocol(mode: ProtocolSpecV2["locationProtocol"]["mode"], radiusMeters = 500): ProtocolSpecV2 {
  return {
    version: "2.0",
    title: "Walk-to-join smoke",
    userFacingSummary: "Nearby users can join only inside the radius.",
    rawPrompt: "Create a nearby challenge at my current location.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "location_checkin",
    evidenceProtocol: {
      mode: "gps",
      requiredEvidence: ["GPS check-in"],
      captureInstructions: ["Share location while joining."],
      invalidEvidenceRules: ["No stale or spoofed location."],
      requiredMetadata: ["lat", "lng"],
    },
    identityProtocol: {
      mode: "account_only",
      required: false,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false },
        { role: "opponent", label: "Opponent", expectedPosition: "any", requiredQrOrCode: false },
      ],
      autoSettlementRequiresIdentityConfidence: 1,
    },
    locationProtocol: {
      mode,
      joinRadiusMeters: radiusMeters,
      challengeRadiusMeters: radiusMeters,
      requiresLiveLocation: mode !== "none",
      requiresCoPresence: mode === "same_place_required",
      locationPrivacy: mode === "none" ? "hidden" : "approximate",
    },
    timingProtocol: {
      startCondition: "After joining inside the radius.",
      endCondition: "At the check-in deadline.",
      deadline: "2026-05-25T00:00:00.000Z",
      allowedAttempts: "One check-in.",
    },
    settlementProtocol: {
      mode: "manual_review",
      winCondition: "Participant is inside the required radius.",
      judgeInstructions: ["Verify location eligibility."],
      autoSettleConfidenceThreshold: 0.99,
      manualReviewTriggers: ["Location missing or outside radius."],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: [],
      restrictions: ["Approximate public location only."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 0,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
    },
  };
}

const baseChallenge: LocationEligibilityChallenge = {
  locationMode: "walk_to_join",
  discoveryLat: 37.7749,
  discoveryLng: -122.4194,
  creator: { latitude: null, longitude: null },
  protocol: null,
};

const walkProtocol = protocol("walk_to_join", 500);
assert.equal(validLatLng(37.7, -122.4), true);
assert.equal(validLatLng(120, -122.4), false);
assert.equal(needsLocationJoinGate(walkProtocol), true);
assert.equal(needsLocationJoinGate(protocol("none")), false);

const noLocation = evaluateLocationEligibility(baseChallenge, null, walkProtocol);
assert.equal(noLocation.required, true);
assert.equal(noLocation.eligible, false);
assert.match(noLocation.reason, /required/i);

const near = evaluateLocationEligibility(baseChallenge, { lat: 37.775, lng: -122.4195 }, walkProtocol);
assert.equal(near.required, true);
assert.equal(near.eligible, true);
assert.ok((near.distanceMeters ?? Number.POSITIVE_INFINITY) <= 500);

const far = evaluateLocationEligibility(baseChallenge, { lat: 37.7849, lng: -122.4194 }, walkProtocol);
assert.equal(far.required, true);
assert.equal(far.eligible, false);
assert.ok((far.distanceMeters ?? 0) > 500);

const nonGated = evaluateLocationEligibility(
  { locationMode: "none", discoveryLat: null, discoveryLng: null, creator: null, protocol: null },
  null,
  protocol("none"),
);
assert.equal(nonGated.required, false);
assert.equal(nonGated.eligible, true);

console.log(JSON.stringify({
  ok: true,
  near,
  far,
  noLocation,
  nonGated,
}, null, 2));
