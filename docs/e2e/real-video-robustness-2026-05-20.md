# Real Video Robustness E2E - 2026-05-20

Production-equivalent target: `https://gamble-ai-agent.vercel.app`

Commit under test: `3afedf168e896b3ed3def99a5e9caca5befb2699`

Deployment URL: `https://gamble-ai-agent-ky5ggbm1i-kdyz1205s-projects.vercel.app`

Command:

```powershell
node scripts\e2e-real-video-robustness.mjs
```

Proof artifact:

```text
tmp/e2e-real-video-robustness-latest.json
```

Result: all 10 cases passed.

Important limitation: this proof uses controlled generated/public fixture videos. It proves the current production vision judge, frame preparation, structured metrics, settlement gates, and ledger path against these fixtures. It does not prove arbitrary real phone videos of human push-ups are fully reliable.

## Case Summary

| Case | Challenge | Judgment | Final status | Source | Model | Confidence | Recommendation | Auto-settle | Winner |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| clean_a_beats_b | `cmpehmxgr000t04jrzx43cjpj` | `cmpehnc23001604jrtvv3shre` | `settled` | `vision_llm` | OpenAI gpt-4o | 0.95 | `settle_winner` | true | `cmpehmwov000m04jrrswsn65n` |
| bad_angle | `cmpehoce9001i04jrcsyw47lx` | `cmpehooux001t04jri934ibfe` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.60 | `needs_review` | false | null |
| partial_body | `cmpehpp7k002304jrlw32y62f` | `cmpehq4uk002e04jrd2ds1pqt` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.60 | `invalid_evidence` | false | null |
| too_dark_blurry | `cmpehr593002o04jrkgw78b8s` | `cmpehrgiy002z04jrdxorfz6s` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.60 | `invalid_evidence` | false | null |
| cropped_video | `cmpehsgv3003904jreis68r8c` | `cmpehssrh003k04jrxwf8an20` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.70 | `invalid_evidence` | false | null |
| short_video | `cmpehtt4d003u04jr8qzqx8gx` | `cmpehu3do004504jrc91ges6y` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.90 | `invalid_evidence` | false | null |
| tie_video | `cmpehv3p4004f04jrao94fp7g` | `cmpehvhlw004q04jrggix07ey` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.90 | `tie_or_no_winner` | false | null |
| non_pushup_video | `cmpehwhzy005004jr2emjdvpl` | `cmpehwvgd005b04jrwjgw0k0l` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 0.90 | `invalid_evidence` | false | null |
| no_visible_role_label | `cmpehxwjl000604ju01lkpfle` | `cmpehy8y6000h04juws75jz80` | `settled` | `vision_llm` | OpenAI gpt-4o | 0.90 | `settle_winner` | true | `cmpehxvq2000004juykj9uxnc` |
| static_loop | `cmpehz9hd000r04juar3w4uf0` | `cmpehzmi0001204juqdtwzbmv` | `ai_inconclusive` | `vision_llm` | OpenAI gpt-4o | 1.00 | `invalid_evidence` | false | null |

## Evidence IDs

| Case | Creator evidence | Opponent evidence |
| --- | --- | --- |
| clean_a_beats_b | `cmpehmy30000804lc588lfluo` | `cmpehmy98000c04lcyrg2y4ib` |
| bad_angle | `cmpehocyd000g04lc428mg2sg` | `cmpehod7l000k04lcwgbsv6f9` |
| partial_body | `cmpehppof000o04lcc8apsrot` | `cmpehppur000s04lc9hnroll8` |
| too_dark_blurry | `cmpehr5pr000w04lc9uaueauo` | `cmpehr5ws001004lcax3qn2a8` |
| cropped_video | `cmpehshd2001404lcxnosmtuj` | `cmpehshii001804lc37it50jo` |
| short_video | `cmpehtto6001c04lcyght4sks` | `cmpehtttk001g04lcoucn3kai` |
| tie_video | `cmpehv471001k04lcqk8dslej` | `cmpehv4c9001o04lcmsqkmwpa` |
| non_pushup_video | `cmpehwice001s04lc1nlayswk` | `cmpehwiim001w04lcx1kdria6` |
| no_visible_role_label | `cmpehxx4g002004lckh7500e8` | `cmpehxxai002404lc18rur4ql` |
| static_loop | `cmpehz9ux002804lcpwuk5a78` | `cmpehza11002c04lcjr1ahloy` |

## What This Proves

- The judge used a real vision provider path for every case: `source=vision_llm`, OpenAI gpt-4o.
- The frame pipeline passed 24 prepared visual inputs to the provider without exceeding current TPM limits.
- The two valid winner cases settled automatically.
- The eight unsafe/unclear/invalid/tie cases did not auto-settle.
- The negative cases preserved credit safety: no winner settlement when evidence was insufficient, invalid, tied, cropped, too short, too dark, bad angle, non-push-up, or static/looped.

