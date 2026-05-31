# Video Winner Settlement E2E Proof

Date: 2026-05-18

Proof run commit: `2f342bcfb72fd1ab2ad7506568b3c06977bd571b`

Docs/current HEAD commit when this proof was recorded: `20d4e9bbbed9323a6e620da1660f699cc5f84c68`

Production deployment:
- Alias: `https://stubborn-ai.vercel.app`
- Deployment URL: `https://stubborn-d7pjm38sw-kdyz1205s-projects.vercel.app`

Environment note:
- `ALLOW_PAID_AI=1` was required in Vercel Production so the real OpenAI vision provider is enabled.

Scope:
- Production E2E used stable generated push-up fixture videos with visual rep labels and 60-second duration.
- This proves the production video evidence -> vision judge -> auto-settlement -> ledger path.
- It does not prove unconstrained real-human pose-estimation reliability for arbitrary phone videos.

This proof used generated fixture videos and does not prove arbitrary real phone video reliability.

## Redacted Test Accounts

- Creator: `[redacted]`, `redacted@example.com`, username `vid_creator_-i7ijw`
- Opponent: `[redacted]`, `redacted@example.com`, username `vid_opp_-i7ijw`

## Challenge

- Challenge ID: `cmpb3e6zo000704ktxeo8dfem`
- URL: `https://stubborn-ai.vercel.app/challenge/cmpb3e6zo000704ktxeo8dfem`
- Created status: `waiting_for_opponent`
- Opponent accepted status: `evidence_window_open`
- Stake: `1` credit each
- Evidence type: `video`
- Settlement mode: `auto_settle_ai_high_confidence`

## Evidence

- Creator evidence ID: `cmpb3eavv000004l7edv1szkv`
- Opponent evidence ID: `cmpb3eb2o000204l70rvnyxld`
- Creator prepared frames: `10`
- Opponent prepared frames: `10`
- Prepare mode: `uniform_fallback`
- Status before judge: `ai_reviewing`

## Judgment

- Judgment ID: `cmpb3evrw000104iijutkr3zh`
- Judge source: `vision_llm`
- Model: `OpenAI · gpt-4o`
- Status returned by judge route: `settled`
- Winner ID: `cmpb3dvbp000004kt84k2bd5m`
- Confidence: `0.95`
- Evidence quality: `good`
- Settlement recommendation: `settle_winner`
- Final challenge status: `settled`
- winnerSettled: `true`

Video metrics:

```json
{
  "participantA": {
    "validRepCount": 12,
    "invalidRepNotes": [],
    "fullDurationCovered": true,
    "unclearReason": null
  },
  "participantB": {
    "validRepCount": 6,
    "invalidRepNotes": [],
    "fullDurationCovered": true,
    "unclearReason": null
  },
  "validRepDefinition": "Arms locked at the top, chest lowers near the floor, hips stay aligned with shoulders and heels.",
  "framesInspected": 20,
  "judgingMethod": "frame-by-frame analysis"
}
```

Reasoning:

> Participant A performed more valid push-ups (12) compared to Participant B (6) within the 60-second time limit, meeting all the challenge requirements.

## Balances

- Creator before: `50`
- Creator after: `50`
- Opponent before: `50`
- Opponent after: `49`

Creator ledger rows:

```json
[
  {
    "id": "cmpb3e6yw000604kttfnzt7dt",
    "type": "stake",
    "amount": -1,
    "balanceAfter": 49,
    "challengeId": "cmpb3e6zo000704ktxeo8dfem"
  },
  {
    "id": "cmpb3egmz000004iiggxgajgh",
    "type": "ai_judge",
    "amount": -1,
    "balanceAfter": 48,
    "challengeId": "cmpb3e6zo000704ktxeo8dfem"
  },
  {
    "id": "cmpb3evtd000304ii78ow3pks",
    "type": "win",
    "amount": 2,
    "balanceAfter": 50,
    "challengeId": "cmpb3e6zo000704ktxeo8dfem"
  }
]
```

Opponent ledger rows:

```json
[
  {
    "id": "cmpb3e7bb000a04kti88eeiko",
    "type": "stake",
    "amount": -1,
    "balanceAfter": 49,
    "challengeId": "cmpb3e6zo000704ktxeo8dfem"
  },
  {
    "id": "cmpb3evsw000204ii76ouan12",
    "type": "loss",
    "amount": -1,
    "balanceAfter": 49,
    "challengeId": "cmpb3e6zo000704ktxeo8dfem"
  }
]
```

Refund rows: `0`

## Checks Passed

- Created public video challenge.
- Opponent accepted and reached `evidence_window_open`.
- Both video evidence uploads succeeded.
- Both evidence rows had prepared frames before judging.
- Judge source was `vision_llm`, not deterministic/fallback.
- Model was a real vision provider/model: `OpenAI · gpt-4o`.
- Judge returned structured video metrics.
- Judge returned `winnerId`, `confidence >= 0.85`, and `settlementRecommendation=settle_winner`.
- Route auto-settled to `settled`.
- Winner ledger contains stake, judge spend, and win rows.
- Loser ledger contains stake and loss rows.
- No refund rows.
- `winnerSettled=true`.

---

## Guardrail Re-Proof After Settlement Policy Hardening

Date: 2026-05-18

Code commit: `3c594ad80909880fc5128b1057b0791939281e7f`

Production deployment:
- Alias: `https://stubborn-ai.vercel.app`
- Deployment URL: `https://stubborn-7jw9rmog2-kdyz1205s-projects.vercel.app`
- Vercel deployment ID: `dpl_ENq1PYVk1Crb3X3LkFVFieyg7sbP`

Scope:
- This re-proof verifies the stricter settlement guardrail added after production-equivalent robustness testing found a model inconsistency: a vision response selected a winner while structured rep metrics were tied at `0` and `0`.
- Auto-settlement now requires `recommendation=settle_winner`, `confidence>=0.85`, `evidenceQuality=good`, a non-null winner, no blocking issues, vision metrics, and for rep-count challenges the winner's valid rep count must be strictly higher.
- This still uses generated phone-style fixture videos, not arbitrary real human phone videos.

### Local Verification

Commands passed:

```powershell
npm run lint
npx tsc --noEmit
npm run build
npx tsx -e "<policy smoke test>"
```

Policy smoke checks passed:
- high confidence + good evidence + settle recommendation can settle
- `confidence=0.62` blocks settlement
- `evidenceQuality=unclear` blocks settlement
- missing winner / tie is `ai_inconclusive`
- required vision with non-vision source blocks settlement
- rep-count mismatch / tied `0-0` blocks settlement with `manual_review_required`

### Production Winner Settlement Re-Proof

Command:

```powershell
node scripts\e2e-video-winner-settlement.mjs
```

Result:
- Challenge ID: `cmpbmt8no000705jmyb3wavyo`
- URL: `https://stubborn-ai.vercel.app/challenge/cmpbmt8no000705jmyb3wavyo`
- Creator evidence ID: `cmpbmtjtp000004jssml8prqy`
- Opponent evidence ID: `cmpbmtk05000204jsoz3nwwfu`
- Judgment ID: `cmpbmu878000104l10tjipp27`
- Judge source: `vision_llm`
- Model: `OpenAI · gpt-4o`
- Metrics: Participant A `15` valid reps, Participant B `13` valid reps
- Confidence: `0.9`
- Evidence quality: `good`
- Recommendation: `settle_winner`
- Final status: `settled`
- winnerSettled: `true`
- Refund rows: `0`

Ledger proof:
- Creator: stake `-1`, AI judge `-1`, win `+2`
- Opponent: stake `-1`, loss `-1`
- Creator balance: `50 -> 50`
- Opponent balance: `50 -> 49`

### Production Robustness Suite

Command:

```powershell
node scripts\e2e-real-video-robustness.mjs
```

Result: `passed=true`, 10 cases.

Positive cases that settled:
- `clean_a_beats_b`
- `no_visible_role_label`

Negative cases that did not auto-settle:
- `bad_angle`
- `partial_body`
- `too_dark_blurry`
- `cropped_video`
- `short_video`
- `tie_video`
- `non_pushup_video`
- `static_loop`

Important remaining limitation:
- This proves the guardrail and robustness behavior against controlled generated phone-style fixtures.
- It does not prove fully reliable judging for arbitrary real-world phone videos from uncontrolled humans, lighting, camera placement, clothing, occlusion, or adversarial behavior.
