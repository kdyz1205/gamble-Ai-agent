# Video Winner Settlement E2E Proof

Date: 2026-05-18

Commit SHA: `2f342bcfb72fd1ab2ad7506568b3c06977bd571b`

Production deployment:
- Alias: `https://gamble-ai-agent.vercel.app`
- Deployment URL: `https://gamble-ai-agent-d7pjm38sw-kdyz1205s-projects.vercel.app`

Environment note:
- `ALLOW_PAID_AI=1` was required in Vercel Production so the real OpenAI vision provider is enabled.

Scope:
- Production E2E used stable generated push-up fixture videos with visual rep labels and 60-second duration.
- This proves the production video evidence -> vision judge -> auto-settlement -> ledger path.
- It does not prove unconstrained real-human pose-estimation reliability for arbitrary phone videos.

## Redacted Test Accounts

- Creator: `[redacted]`, `redacted@example.com`, username `vid_creator_-i7ijw`
- Opponent: `[redacted]`, `redacted@example.com`, username `vid_opp_-i7ijw`

## Challenge

- Challenge ID: `cmpb3e6zo000704ktxeo8dfem`
- URL: `https://gamble-ai-agent.vercel.app/challenge/cmpb3e6zo000704ktxeo8dfem`
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
