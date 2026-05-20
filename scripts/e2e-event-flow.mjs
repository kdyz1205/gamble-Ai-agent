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
    password: "TestPass123!event",
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
  if (!session?.user?.id) {
    throw new Error(`No session established for ${email}`);
  }
  return { jar, session, email };
}

function requireCheck(proof, name, passed, detail) {
  proof.checks[name] = { passed, detail };
  if (!passed) throw new Error(`E2E check failed: ${name}`);
}

function eventProtocol(stamp) {
  return {
    version: "2.0",
    title: `Mass leaderboard event ${stamp}`,
    userFacingSummary: "A large public leaderboard challenge where many users can join with tickets.",
    rawPrompt: "I want 5,000 people to compete in a safe leaderboard challenge.",
    language: "en",
    participantMode: "mass_crowd",
    outcomeType: "ranking",
    evidenceProtocol: {
      mode: "manual_review",
      requiredEvidence: ["Each participant submits a score entry or evidence package."],
      captureInstructions: ["Follow the event prompt and submit once."],
      invalidEvidenceRules: ["Duplicate, unsafe, or unverifiable submissions are invalid."],
      requiredMetadata: ["created_at", "participant_ticket"],
    },
    identityProtocol: {
      mode: "group_lobby_ticket",
      required: true,
      participantBindings: [
        { role: "creator", label: "Host", expectedPosition: "any", requiredQrOrCode: true },
        { role: "participant", label: "Participant", expectedPosition: "any", requiredQrOrCode: true },
      ],
      autoSettlementRequiresIdentityConfidence: 0.85,
    },
    locationProtocol: {
      mode: "none",
      requiresLiveLocation: false,
      requiresCoPresence: false,
      locationPrivacy: "hidden",
    },
    timingProtocol: {
      startCondition: "Event opens when the host publishes it.",
      endCondition: "Event ends when the host closes submissions.",
      deadline: "24 hours",
      tieBreaker: "Earlier valid submission wins ties.",
      allowedAttempts: "One official submission per participant.",
    },
    settlementProtocol: {
      mode: "leaderboard",
      winCondition: "Highest validated score ranks first.",
      judgeInstructions: ["Validate submissions before ranking.", "Do not auto-settle unless event finalization rules are implemented."],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Ambiguous evidence", "Duplicate ticket", "Unsafe submission"],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: ["Internal credits/points only."],
      restrictions: ["No real-money gambling."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 1800,
      judgeMaxTokens: 1200,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = { base, stamp, checks: {} };

try {
  const creator = await register(`codex.event.creator.${stamp}@example.com`, `event_creator_${stamp.slice(-6)}`);
  const participant = await register(`codex.event.joiner.${stamp}@example.com`, `event_joiner_${stamp.slice(-6)}`);
  const protocol = eventProtocol(stamp);

  const created = await postJson(creator.jar, "/api/challenges", {
    protocol,
    maxParticipants: 5000,
  });
  proof.created = {
    requiresEventFlow: created.requiresEventFlow,
    eventId: created.event?.id ?? null,
    challengeReturned: Boolean(created.challenge),
    eventUrl: created.eventUrl,
    maxParticipants: created.event?.maxParticipants ?? null,
    creatorEntryId: created.creatorEntry?.id ?? null,
  };

  requireCheck(proof, "challenge_create_routed_to_event", created.requiresEventFlow === true && Boolean(created.event?.id) && !created.challenge, proof.created);
  requireCheck(proof, "max_participants_preserved", created.event.maxParticipants === 5000, created.event.maxParticipants);
  requireCheck(proof, "creator_ticket_created", created.event._count.entries === 1, created.event._count);

  const eventId = created.event.id;
  const joined = await postJson(participant.jar, `/api/events/${eventId}/join`, {});
  proof.join = {
    eventId: joined.event.id,
    entryId: joined.entry.id,
    alreadyJoined: joined.alreadyJoined,
    entryCount: joined.event._count.entries,
  };

  requireCheck(proof, "participant_joined_event", joined.event._count.entries === 2 && Boolean(joined.entry.ticketCode), proof.join);

  const duplicate = await postJson(participant.jar, `/api/events/${eventId}/join`, {});
  proof.duplicateJoin = {
    alreadyJoined: duplicate.alreadyJoined,
    entryCount: duplicate.event._count.entries,
  };
  requireCheck(proof, "duplicate_join_idempotent", duplicate.alreadyJoined === true && duplicate.event._count.entries === 2, proof.duplicateJoin);

  const detail = await getJson(creator.jar, `/api/events/${eventId}`);
  proof.detail = {
    id: detail.event.id,
    title: detail.event.title,
    entryCount: detail.event._count.entries,
    status: detail.event.status,
  };
  requireCheck(proof, "event_detail_readable", detail.event.id === eventId && detail.event._count.entries === 2, proof.detail);

  const leaderboard = await getJson(creator.jar, `/api/events/${eventId}/leaderboard`);
  proof.leaderboard = {
    eventId: leaderboard.eventId,
    entries: leaderboard.entries.length,
  };
  requireCheck(proof, "leaderboard_route_readable", leaderboard.eventId === eventId && Array.isArray(leaderboard.entries), proof.leaderboard);

  const creatorSubmission = await postJson(creator.jar, `/api/events/${eventId}/submissions`, {
    score: 10,
    evidenceId: `creator-evidence-${stamp}`,
  });
  const participantSubmission = await postJson(participant.jar, `/api/events/${eventId}/submissions`, {
    score: 20,
    evidenceId: `participant-evidence-${stamp}`,
  });
  proof.submissions = {
    creatorScore: creatorSubmission.entry.score,
    participantScore: participantSubmission.entry.score,
    creatorStatus: creatorSubmission.entry.validationStatus,
    participantStatus: participantSubmission.entry.validationStatus,
  };
  requireCheck(proof, "event_submissions_created", creatorSubmission.entry.score === 10 && participantSubmission.entry.score === 20, proof.submissions);

  const recomputed = await postJson(creator.jar, `/api/events/${eventId}/leaderboard/recompute`, {});
  const top = recomputed.entries[0];
  proof.recompute = {
    entryCount: recomputed.entries.length,
    topUserRedacted: top ? "[redacted]" : null,
    topRank: top?.rank ?? null,
    topScore: top?.score ?? null,
    statuses: recomputed.entries.map((entry) => entry.validationStatus),
  };
  requireCheck(proof, "leaderboard_recomputed_participant_first", top?.rank === 1 && top?.score === 20, proof.recompute);

  const finalized = await postJson(creator.jar, `/api/events/${eventId}/finalize`, {});
  proof.finalize = {
    status: finalized.event.status,
    entryCount: finalized.entries.length,
    alreadyFinalized: finalized.alreadyFinalized,
  };
  requireCheck(proof, "event_finalized", finalized.event.status === "finalized" && finalized.entries.length === 2, proof.finalize);

  const page = await request(null, `/events/${eventId}`);
  proof.page = {
    status: page.res.status,
    containsTitle: typeof page.text === "string" && page.text.includes(protocol.title),
    containsLeaderboard: typeof page.text === "string" && page.text.includes("Leaderboard"),
  };
  requireCheck(proof, "event_page_renders", proof.page.status === 200 && proof.page.containsTitle && proof.page.containsLeaderboard, proof.page);

  proof.eventFlowReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.eventFlowReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
