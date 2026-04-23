# LuckyPlay

Proprietary / confidential. See [LICENSE](./LICENSE). Do not share, fork, or mirror.

LuckyPlay is a chat-first AI-judged challenge & betting platform. Users type a
bet in natural language, AI compiles it into a structured market (with real
oracle attachments when relevant — e.g. live CoinGecko prices for crypto
predictions), an opponent accepts via a shareable link, both submit video/photo
evidence, and GPT-4o vision judges with rubric-based reasoning and confidence
calibration. Credits settle automatically on creator confirmation.

## Stack

- **Next.js 16** (App Router, Turbopack dev) + **React 19** + **Tailwind v4**
- **Prisma 7** + **PostgreSQL** (Supabase)
- **NextAuth** (Credentials + Google OAuth)
- **OpenAI** GPT-4o / GPT-4o-mini for parse & vision judgment, **Whisper** for voice
- **Anthropic** Claude (optional secondary provider via `ORACLE_DEFAULT_PROVIDER`)
- **ffmpeg-static** + **sharp** for video frame extraction at evidence-submit time
- **Vercel Blob** for evidence and pre-extracted vision frames
- **Framer Motion** for canonical spring-token motion

## Agentic capabilities

- Tool calling (CoinGecko / Open-Meteo) at parse time — oracle sources attach
  directly to the draft so settlement has ground truth, not self-report.
- Proactive `actionItems` (top up / reduce scope / adjust stake) surfaced as
  clickable buttons in the draft panel.
- Self-correction: stub/low-confidence parse passes automatically retry on the
  flagship model in the same family (gpt-4o-mini → gpt-4o; haiku → sonnet;
  flash → 2.5-pro).
- Conversation memory: localStorage-backed draft history per user so
  "再来一个 / another one" branches from the prior draft.
- Voice input: Whisper transcription wired into the composer Mic button.
- Pre-extracted vision frames on evidence submit → judge latency ~17s → ~5s.

## Development

```bash
npm install                 # postinstall auto-runs prisma generate
cp .env.example .env.local  # then fill in real values
npm run db:push             # sync schema to your Postgres
npm run dev                 # Turbopack dev server on :3000
```

## Entry-point files

| Area | File |
|---|---|
| Chat-first composer + flow | `src/app/page.tsx` |
| Canonical API contract | `src/lib/api-client.ts` |
| Data model | `prisma/schema.prisma` |
| State machine | `src/lib/challenge-state-machine.ts` |
| Credits ledger | `src/lib/credits.ts` |
| AI parse + judge | `src/lib/ai-engine.ts` |
| LLM router (multi-provider, tool-use loop) | `src/lib/llm-router.ts` |
| Oracle tools (CoinGecko, Open-Meteo) | `src/lib/oracle-tools.ts` |
| Evidence frame pre-extraction | `src/lib/media/pre-extract-frames.ts` |
| Judgment orchestration | `src/lib/challenge-judgment.ts` |

## Deployment

Production auto-deploys from `main` on Vercel. `prisma migrate deploy` runs in
the build step (see `build:vercel` in `package.json`).

---

© 2026 kdyz1205. All rights reserved. Unauthorized use is strictly prohibited.
