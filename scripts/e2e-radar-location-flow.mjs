const base = process.env.E2E_BASE_URL || "https://gamble-ai-agent.vercel.app";

class Jar {
  constructor(name) {
    this.name = name;
    this.map = new Map();
  }

  store(res) {
    const cookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
    for (const line of cookies) {
      const first = line?.split(";")[0];
      if (!first) continue;
      const idx = first.indexOf("=");
      if (idx > 0) this.map.set(first.slice(0, idx), first.slice(idx + 1));
    }
  }

  header() {
    return [...this.map.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

async function request(jar, path, options = {}) {
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const headers = { ...(options.headers || {}) };
  const cookie = jar?.header();
  if (cookie) headers.cookie = cookie;

  const res = await fetch(url, {
    ...options,
    headers,
    redirect: options.redirect || "manual",
  });
  jar?.store(res);

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    return request(jar, new URL(res.headers.get("location"), url).href, { method: "GET" });
  }

  if (!res.ok) {
    const err = new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { res, data, text };
}

async function requestAllowError(jar, path, options = {}) {
  try {
    return await request(jar, path, options);
  } catch (error) {
    return { error, data: error.data, status: error.status };
  }
}

function postJson(jar, path, body) {
  return request(jar, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((out) => out.data);
}

function getJson(jar, path) {
  return request(jar, path).then((out) => out.data);
}

async function register(email, username) {
  const jar = new Jar(username);
  const csrf = (await getJson(jar, "/api/auth/csrf")).csrfToken;
  const form = new URLSearchParams({
    email,
    password: "TestPass123!radar",
    username,
    action: "register",
    csrfToken: csrf,
    callbackUrl: base,
    json: "true",
  });
  await request(jar, "/api/auth/callback/credentials?json=true", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const session = await getJson(jar, "/api/auth/session");
  if (!session?.user?.id) throw new Error(`No session established for ${email}`);
  return { jar, session, email };
}

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`E2E check failed: ${name}`);
}

function protocol(stamp) {
  return {
    version: "2.0",
    title: `Radar walk-to-join challenge ${stamp}`,
    userFacingSummary: "A nearby public challenge that can only be joined from inside the location radius.",
    rawPrompt: "I want nearby people to join a safe text challenge when they walk by.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "yes_no",
    evidenceProtocol: {
      mode: "platform_metric",
      requiredEvidence: ["Submit the exact text answer from the challenge prompt."],
      captureInstructions: ["Join near the challenge location.", "Submit one text answer."],
      invalidEvidenceRules: ["Missing answer.", "Wrong challenge location."],
      requiredMetadata: ["joined_location"],
    },
    identityProtocol: {
      mode: "account_only",
      required: false,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "any" },
        { role: "opponent", label: "Opponent", expectedPosition: "any" },
      ],
      autoSettlementRequiresIdentityConfidence: 0.85,
    },
    locationProtocol: {
      mode: "walk_to_join",
      joinRadiusMeters: 500,
      challengeRadiusMeters: 500,
      requiresLiveLocation: true,
      requiresCoPresence: false,
      locationPrivacy: "approximate",
    },
    timingProtocol: {
      startCondition: "Opponent joins from inside the nearby radius.",
      endCondition: "Both participants submit text evidence.",
      deadline: "1 hour",
      tieBreaker: "Manual review if both answers are equivalent.",
      allowedAttempts: "One answer per participant.",
    },
    settlementProtocol: {
      mode: "auto_ai_text",
      winCondition: "Correct answer wins.",
      judgeInstructions: ["Verify the answer text and location eligibility."],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Location missing", "Ambiguous answer"],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: ["Approximate public location only."],
      restrictions: ["No real-money gambling."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 1200,
      judgeMaxTokens: 800,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = { base, stamp, checks: {} };
const near = { lat: 37.7749, lng: -122.4194 };
const nearOpponent = { lat: 37.7751, lng: -122.4195 };
const far = { lat: 34.0522, lng: -118.2437 };

try {
  const creator = await register(`codex.radar.creator.${stamp}@example.com`, `radar_creator_${stamp.slice(-6)}`);
  const opponent = await register(`codex.radar.opponent.${stamp}@example.com`, `radar_opponent_${stamp.slice(-6)}`);

  await postJson(creator.jar, "/api/map/ping", { ...near, accuracy: 15, mode: "browsing" });
  await postJson(opponent.jar, "/api/map/ping", { ...nearOpponent, accuracy: 15, mode: "browsing" });

  const created = await postJson(creator.jar, "/api/challenges", {
    protocol: protocol(stamp),
    discoveryLat: near.lat,
    discoveryLng: near.lng,
    stake: 0,
  });
  const challengeId = created.challenge?.id;
  proof.create = {
    challengeId,
    status: created.challenge?.status,
    locationMode: created.challenge?.locationMode,
    discoveryCaptured: Boolean(created.challenge?.discoveryCapturedAt),
  };
  requireCheck(proof, "location_challenge_created", Boolean(challengeId) && created.challenge.locationMode === "walk_to_join", proof.create);

  const map = await getJson(opponent.jar, `/api/map/challenges?lat=${nearOpponent.lat}&lng=${nearOpponent.lng}&radiusMiles=2&limit=20`);
  const found = map.challenges.find((challenge) => challenge.id === challengeId);
  proof.map = {
    mode: map.radar?.mode,
    found: Boolean(found),
    distanceMeters: found?.radar?.approximateDistanceMeters ?? null,
    privacy: found?.radar?.locationPrivacy ?? null,
  };
  requireCheck(proof, "radar_discovers_nearby_challenge", Boolean(found) && found.radar?.locationPrivacy === "approximate", proof.map);

  const presence = await getJson(opponent.jar, `/api/map/presence?lat=${nearOpponent.lat}&lng=${nearOpponent.lng}&radiusMiles=2`);
  const creatorPresence = presence.users.find((user) => user.id === creator.session.user.id);
  proof.presence = {
    privacy: presence.privacy,
    creatorFound: Boolean(creatorPresence),
    creatorDistanceMeters: creatorPresence?.approximateDistanceMeters ?? null,
  };
  requireCheck(proof, "presence_returns_approximate_creator", Boolean(creatorPresence) && presence.privacy === "approximate", proof.presence);

  const nearEligibility = await postJson(opponent.jar, `/api/challenges/${challengeId}/check-location-eligibility`, nearOpponent);
  proof.nearEligibility = nearEligibility;
  requireCheck(proof, "near_location_eligible", nearEligibility.eligible === true && nearEligibility.distanceMeters <= 500, proof.nearEligibility);

  const noLocationAccept = await requestAllowError(opponent.jar, `/api/challenges/${challengeId}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  proof.noLocationAccept = { status: noLocationAccept.status, data: noLocationAccept.data };
  requireCheck(proof, "accept_requires_location", noLocationAccept.status === 428, proof.noLocationAccept);

  const farAccept = await requestAllowError(opponent.jar, `/api/challenges/${challengeId}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(far),
  });
  proof.farAccept = { status: farAccept.status, data: farAccept.data };
  requireCheck(proof, "far_location_cannot_accept", farAccept.status === 403, proof.farAccept);

  const accepted = await postJson(opponent.jar, `/api/challenges/${challengeId}/accept`, nearOpponent);
  proof.accept = {
    challengeId: accepted.challenge.id,
    status: accepted.challenge.status,
    participantCount: accepted.challenge.participants.length,
  };
  requireCheck(proof, "near_location_accepts_and_opens_evidence", accepted.challenge.status === "evidence_window_open", proof.accept);

  proof.radarLocationFlowReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.radarLocationFlowReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
