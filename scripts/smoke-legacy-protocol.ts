import { legacyProtocolSpecFromRequest } from "@/lib/legacy-protocol";

function assertCheck(name: string, condition: unknown, detail?: unknown) {
  if (!condition) {
    console.error(JSON.stringify({ name, passed: false, detail }, null, 2));
    process.exitCode = 1;
    throw new Error(`legacy protocol smoke failed: ${name}`);
  }
  console.log(JSON.stringify({ name, passed: true, detail }, null, 2));
}

const soloCat = legacyProtocolSpecFromRequest({
  rawPrompt: "I bet my cat can finish the food under one minute.",
  title: "Cat food challenge",
  description: "My cat finishes the food under one minute.",
  evidenceType: "video",
  aiReview: true,
});

assertCheck("solo_pet_prompt_becomes_solo_protocol", soloCat?.participantMode === "solo", soloCat);
assertCheck(
  "solo_protocol_has_only_creator_binding",
  soloCat?.identityProtocol.participantBindings.length === 1 &&
    soloCat.identityProtocol.participantBindings[0]?.role === "creator",
  soloCat?.identityProtocol.participantBindings,
);
assertCheck("video_legacy_protocol_requires_identity", soloCat?.identityProtocol.required === true, soloCat?.identityProtocol);
assertCheck("video_legacy_protocol_uses_vision_settlement", soloCat?.settlementProtocol.mode === "auto_ai_vision", soloCat?.settlementProtocol);

const textHeadToHead = legacyProtocolSpecFromRequest({
  rawPrompt: "I bet Jerry I can answer the phrase BLUE-CROWN-91 correctly.",
  title: "Phrase answer challenge",
  description: "Winner is whoever submits the exact phrase.",
  proposition: "The winner is the participant whose evidence contains BLUE-CROWN-91.",
  rules: "If only one participant includes BLUE-CROWN-91, that participant wins.",
  evidenceType: "self_report",
  settlementMode: "manual_confirmation",
  aiReview: true,
});

assertCheck("explicit_counterparty_becomes_head_to_head", textHeadToHead?.participantMode === "head_to_head", textHeadToHead);
assertCheck("self_report_maps_to_text_judge_mode", textHeadToHead?.evidenceProtocol.mode === "witness", textHeadToHead?.evidenceProtocol);
assertCheck("self_report_can_use_ai_text_judge", textHeadToHead?.settlementProtocol.mode === "auto_ai_text", textHeadToHead?.settlementProtocol);
assertCheck("text_evidence_does_not_require_liveness", textHeadToHead?.identityProtocol.required === false, textHeadToHead?.identityProtocol);
assertCheck("legacy_protocol_allows_rejudge_escalation", textHeadToHead?.aiBudgetPolicy.allowEscalation === true, textHeadToHead?.aiBudgetPolicy);

const sameCamera = legacyProtocolSpecFromRequest({
  rawPrompt: "Jerry and I use one phone to see who can do 10 pushups faster.",
  title: "Same camera pushup challenge",
  description: "One phone records both participants.",
  evidenceType: "same_camera_video",
  aiReview: true,
});

assertCheck("same_camera_uses_left_right_identity", sameCamera?.identityProtocol.mode === "left_right_assignment", sameCamera?.identityProtocol);
assertCheck(
  "same_camera_assigns_positions",
  sameCamera?.identityProtocol.participantBindings.some((binding) => binding.role === "creator" && binding.expectedPosition === "left") &&
    sameCamera.identityProtocol.participantBindings.some((binding) => binding.role === "opponent" && binding.expectedPosition === "right"),
  sameCamera?.identityProtocol.participantBindings,
);
