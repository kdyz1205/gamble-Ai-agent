# Real Video Robustness E2E - 2026-05-20

Production-equivalent target: `https://stubborn-ai.vercel.app`

Commit under test: `0bbbab82a06e079ecc3a7dedb0bbc21197c22a03`

Deployment URL: `https://stubborn-oo7tik3ye-kdyz1205s-projects.vercel.app`

Command:

```powershell
node scripts\e2e-real-video-robustness.mjs
```

Proof artifact:

```text
tmp/e2e-real-video-robustness-final.json
```

Result: all 10 cases passed.

Important limitation: this proof uses controlled generated/public fixture videos. It proves the current production vision judge, frame preparation, structured metrics, settlement gates, and ledger path against these fixtures. It does not prove arbitrary real phone videos of human push-ups are fully reliable.

## Case Summary

| Case | Challenge | Judgment | Final status | Source | Model | Confidence | Recommendation | Auto-settle | Winner |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| clean_a_beats_b | `cmpekrwb2000s04jrr9m3t1sd` | `cmpeksi4s000304icxbtmeqsd` | `settled` | `vision_llm` | OpenAI gpt-4o | 0.95 | `settle_winner` | true | `cmpekrviu000l04jrh554q01w` |
| bad_angle | `cmpektik2000f04icciwrt31g` | `cmpeku3qp000q04icguuqpcs8` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.60 | `needs_review` | false | null |
| partial_body | `cmpekv41o001004icddfw1wzz` | `cmpekvliy001b04icml0qbj74` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.70 | `needs_review` | false | null |
| too_dark_blurry | `cmpekwlt1001l04ic8u585h71` | `cmpekwxya001w04ictba8zxkg` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.50 | `invalid_evidence` | false | null |
| cropped_video | `cmpekxyaq002604ica6jhwgyx` | `cmpekygg8002h04ic3803nx2t` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.70 | `invalid_evidence` | false | null |
| short_video | `cmpekzh2r002r04ict50tlfx5` | `cmpekzqfh003204ico4abqtqn` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.90 | `needs_review` | false | null |
| tie_video | `cmpel0qps003c04ic4bh8abeg` | `cmpel14qv003n04ice1lz8o02` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.90 | `tie_or_no_winner` | false | null |
| non_pushup_video | `cmpel24zx003x04icfurth4jh` | `cmpel2mac004804icjn66jwll` | `manual_review_required` | `vision_llm` | OpenAI gpt-4o | 0.95 | `invalid_evidence` | false | `cmpel24a0003r04icl5ci5y9r` |
| no_visible_role_label | `cmpel3mju004i04ic32py6wf7` | `cmpel3yxp004t04ic8p2kvnjj` | `settled` | `vision_llm` | OpenAI gpt-4o | 0.95 | `settle_winner` | true | `cmpel3ltt004c04ic6bxq9amv` |
| static_loop | `cmpel4z91005304icuqt5cn5l` | `cmpel5mzx005e04ic411hx3at` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 1.00 | `invalid_evidence` | false | null |

## Evidence IDs

| Case | Creator evidence | Opponent evidence |
| --- | --- | --- |
| clean_a_beats_b | `cmpekrwva000804ih4qkyy944` | `cmpekrx15000c04ih7iyxrdip` |
| bad_angle | `cmpektjuc000004leaofm6y9j` | `cmpektk2q000404le16mmp44g` |
| partial_body | `cmpekv4nz000804ledk6x16pk` | `cmpekv4ug000c04leax9l3xlw` |
| too_dark_blurry | `cmpekwmbg000g04le4gz0qmzm` | `cmpekwmh9000k04le87r5bufd` |
| cropped_video | `cmpekxysy000o04le4v3ailo0` | `cmpekxyym000s04leypviipyc` |
| short_video | `cmpekzhk9000w04le0cbtgeos` | `cmpekzhqc001004lepxk63g24` |
| tie_video | `cmpel0r6d001404le3h1fz9rq` | `cmpel0rbl001804lei8gexrnn` |
| non_pushup_video | `cmpel25gz001c04leugpj6vwr` | `cmpel25mr001g04lelmz0xbsa` |
| no_visible_role_label | `cmpel3mx4001k04leh9go2fjs` | `cmpel3n2o001o04le2zs4owjg` |
| static_loop | `cmpel4zoy001s04lekmdfbcio` | `cmpel4zum001w04letzultju4` |

## What This Proves

- The judge used a real vision provider path for every case: `source=vision_llm`, OpenAI gpt-4o.
- The frame pipeline passed 24 prepared visual inputs to the provider without exceeding current TPM limits.
- The two valid winner cases settled automatically.
- The eight unsafe/unclear/invalid/tie cases did not auto-settle.
- The negative cases preserved credit safety: no winner settlement when evidence was insufficient, invalid, tied, cropped, too short, too dark, bad angle, non-push-up, or static/looped.

---

## 2026-05-22 Re-Proof After No-Label Fixture Hardening

Production target: `https://stubborn-ai.vercel.app`

Commit under test: `4975c9152e2715f3b3573a7e2ebe7cc1c81965e7`

Deployment URL: `https://stubborn-2c567fi5d-kdyz1205s-projects.vercel.app`

Deployment ID: `dpl_E1MFQEpjkv9XxQpjyvK65D6mE3g1`

Command:

```powershell
$env:E2E_BASE_URL='https://stubborn-ai.vercel.app'
$env:E2E_JUDGE_PROVIDER='openai'
$env:E2E_JUDGE_MODEL='gpt-4o'
Remove-Item Env:RUN_ROBUSTNESS_CASES -ErrorAction SilentlyContinue
$env:E2E_ROBUSTNESS_CASE_DELAY_MS='0'
npm run e2e:real-video-robustness
```

Result: `passed=true`, 10 cases.

Why this run was needed:
- A previous production run on commit `ad8e2409ab517fd1002ff365103b0b033bd62e72` proved the bad-evidence guardrails, but the `no_visible_role_label` positive case failed safely as `ai_inconclusive`.
- The no-label B fixture was first made static, but that correctly triggered `invalid_evidence` because a zero-motion submission is not a valid completed push-up attempt.
- Commit `4975c9152e2715f3b3573a7e2ebe7cc1c81965e7` changes the no-label B fixture to one slow visible push-up attempt, preserving the rule that the model must infer from motion/body position instead of reading a direct answer label.

Confirmed positive cases:
- `clean_a_beats_b`: settled with `source=vision_llm`, OpenAI `gpt-4o`, `requestKind=vision`, `usedApi=true`, `confidence=0.95`, `evidenceQuality=good`, `settlementRecommendation=settle_winner`.
- `no_visible_role_label`: settled with `source=vision_llm`, OpenAI `gpt-4o`, `requestKind=vision`, `usedApi=true`, `confidence=0.9`, `evidenceQuality=good`, `settlementRecommendation=settle_winner`. The model counted Participant A higher than Participant B without visible role/answer text.

Confirmed negative cases:
- `bad_angle`: did not auto-settle.
- `partial_body`: did not auto-settle.
- `too_dark_blurry`: did not auto-settle.
- `cropped_video`: did not auto-settle.
- `short_video`: did not auto-settle.
- `tie_video`: did not auto-settle.
- `non_pushup_video`: did not auto-settle.
- `static_loop`: did not auto-settle; final status `ai_inconclusive`, `evidenceQuality=invalid`, `settlementRecommendation=invalid_evidence`, `autoSettleEligible=false`.

Important limitation:
- This is still a controlled generated/public fixture suite. It is stronger than the earlier single happy-path fixture proof, but it still does not prove reliable automatic judging for arbitrary real phone videos from uncontrolled users.
