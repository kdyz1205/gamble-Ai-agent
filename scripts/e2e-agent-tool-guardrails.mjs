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
    password: "TestPass123!agent",
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
    title: `Agent same-camera guardrail ${stamp}`,
    userFacingSummary: "A two-person same-camera protocol proof for agent tool guardrails.",
    rawPrompt: "Two players use one camera and submit one shared clip.",
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "count",
    evidenceProtocol: {
      mode: "same_camera_video",
      requiredEvidence: ["One continuous same-camera video showing both participants."],
      captureInstructions: ["Creator stands left.", "Opponent stands right.", "Both say their liveness codes."],
      invalidEvidenceRules: ["Missing liveness code.", "Edited video.", "Only one participant visible."],
      requiredMetadata: ["recording_session_id", "shared_same_camera"],
    },
    identityProtocol: {
      mode: "left_right_assignment",
      required: true,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "left", requiredQrOrCode: true },
        { role: "opponent", label: "Opponent", expectedPosition: "right", requiredQrOrCode: true },
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
      startCondition: "Start after the recording countdown.",
      endCondition: "End when both participants finish the attempt.",
      deadline: "1 hour",
      tieBreaker: "Higher valid count wins; if tied, manual review.",
      allowedAttempts: "One official same-camera recording session.",
    },
    settlementProtocol: {
      mode: "auto_ai_vision",
      winCondition: "The participant with the higher valid count wins.",
      judgeInstructions: ["Verify both identities first.", "Only settle if evidence and identity gates pass."],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Missing liveness code", "Unclear participant identity", "Unclear body visibility"],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: ["Internal credits only."],
      restrictions: ["No real-money gambling."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 1800,
      judgeMaxTokens: 1200,
      maxVisionFrames: 8,
      allowEscalation: false,
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

async function callAgentTool(jar, message, expectedTool) {
  const out = await postJson(jar, "/api/agent/respond", {
    message,
    conversationHistory: [],
    draftState: {},
  });
  if (out.toolName !== expectedTool) {
    throw new Error(`Agent did not call ${expectedTool}; got ${out.toolName || "none"}: ${out.userVisibleReply}`);
  }
  if (out.toolError) {
    throw new Error(`Agent ${expectedTool} failed: ${out.toolError}`);
  }
  if (!out.toolResult) {
    throw new Error(`Agent ${expectedTool} returned no toolResult`);
  }
  return out;
}

function bindingCode(bindings, role) {
  const binding = bindings.find((item) => item.role === role);
  if (!binding?.livenessCode) throw new Error(`Missing ${role} livenessCode`);
  return binding.livenessCode;
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const proof = { base, stamp, checks: {} };

try {
  const creator = await register(`codex.agent.creator.${stamp}@example.com`, `agent_creator_${stamp.slice(-6)}`);
  const opponent = await register(`codex.agent.opponent.${stamp}@example.com`, `agent_opponent_${stamp.slice(-6)}`);
  const created = await postJson(creator.jar, "/api/challenges", {
    protocol: protocol(stamp),
    stake: 0,
  });
  const challengeId = created.challenge?.id;
  proof.create = {
    challengeId,
    status: created.challenge?.status,
    evidenceMode: created.challenge?.evidenceMode,
    identityMode: created.challenge?.identityMode,
  };
  requireCheck(proof, "challenge_created_with_protocol", Boolean(challengeId) && created.challenge.evidenceMode === "same_camera_video", proof.create);

  const accepted = await callAgentTool(
    opponent.jar,
    `For this E2E proof, call the backend acceptChallenge tool with exactly {"challengeId":"${challengeId}"}. Do not call any other tool.`,
    "acceptChallenge",
  );
  proof.accept = accepted.toolResult;
  requireCheck(proof, "agent_accept_opened_evidence_window", accepted.toolResult.status === "evidence_window_open", proof.accept);

  const protocolAfterAccept = await getJson(opponent.jar, `/api/challenges/${challengeId}/protocol`);
  proof.bindings = {
    count: protocolAfterAccept.participantBindings.length,
    opponentBinding: protocolAfterAccept.participantBindings.find((item) => item.role === "opponent"),
  };
  requireCheck(
    proof,
    "opponent_binding_created",
    protocolAfterAccept.participantBindings.some((item) => item.role === "opponent" && item.userId === opponent.session.user.id && item.bindingStatus === "pending"),
    proof.bindings,
  );

  const recording = await postJson(creator.jar, `/api/challenges/${challengeId}/recording-session/start`, {
    mode: "same_camera_video",
  });
  const creatorCode = bindingCode(recording.participantBindings, "creator");
  const opponentCode = bindingCode(recording.participantBindings, "opponent");
  proof.recording = {
    recordingSessionId: recording.recordingSessionId,
    bindingCount: recording.participantBindings.length,
    mode: recording.mode,
  };
  requireCheck(proof, "recording_session_started", Boolean(recording.recordingSessionId) && recording.mode === "same_camera_video", proof.recording);

  const uploadMessage = [
    "For this E2E proof, call the backend uploadEvidence tool with exactly this JSON:",
    JSON.stringify({
      challengeId,
      type: "video",
      url: `https://example.com/agent-same-camera-${stamp}.mp4`,
      description: `Shared same-camera proof. Creator code: ${creatorCode}. Opponent code: ${opponentCode}. Both participants are visible.`,
      metadata: { sharedSameCamera: true, fileSizeBytes: 12345 },
      recordingSessionId: recording.recordingSessionId,
    }),
    "Do not call any other tool.",
  ].join("\n");
  const uploaded = await callAgentTool(creator.jar, uploadMessage, "uploadEvidence");
  proof.upload = uploaded.toolResult;
  requireCheck(proof, "agent_upload_created_shared_evidence_rows", uploaded.toolResult.sharedEvidenceCount === 2 && uploaded.toolResult.evidenceIds?.length === 2, proof.upload);
  requireCheck(
    proof,
    "agent_upload_created_passed_evidence_checks",
    uploaded.toolResult.verification?.length === 2 && uploaded.toolResult.verification.every((item) => item.decision === "passed"),
    proof.upload,
  );

  const finalChallenge = await getJson(creator.jar, `/api/challenges/${challengeId}`);
  proof.finalChallenge = {
    id: finalChallenge.challenge.id,
    status: finalChallenge.challenge.status,
    evidenceCount: finalChallenge.challenge._count.evidence,
    participantCount: finalChallenge.challenge._count.participants,
  };
  requireCheck(
    proof,
    "challenge_reached_ai_reviewing_after_shared_upload",
    finalChallenge.challenge.status === "ai_reviewing" && finalChallenge.challenge._count.evidence === 2,
    proof.finalChallenge,
  );

  proof.agentToolGuardrailsReady = true;
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.error = {
    message: error?.message,
    status: error?.status,
    data: error?.data,
  };
  proof.agentToolGuardrailsReady = false;
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}
