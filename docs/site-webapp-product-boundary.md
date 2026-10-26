# Summoner.world and SUM — product boundaries

## Single product, two deliberately different surfaces

| Public marketing website | SUM player client |
| --- | --- |
| Route: `/` | Routes: `/app`, `/app/today`, `/app/story`, `/app/quiz`, etc. |
| Purpose: explain the world, gameplay, Pico, and invite users to start | Purpose: actual player account, playable chapters, Quests, invitations, evidence, verified results |
| CTA: **Open SUM / 进入 SUM 客户端** | CTAs: **Create Quest / 创建 Quest**, **Play chapter / 进入序章**, **Invite friend / 邀请好友** |
| Website has a brand header and section anchors, no game dock | Client has its own game header and five-tab navigation (except immersive story) |
| No real balances, outcomes or invented public opponents | Game state and rewards come only from existing authenticated server APIs |

- `/enter` is a permanent compatibility redirect to `/`.
- Landing shortcuts and feature cards never link to the legacy second client (`/summons`, `/markets`, `/rituals`, `/judgment/demo`). Those legacy pages remain accessible for compatibility and existing flows, not as the canonical SUM experience.
- The PWA manifest has `start_url: /app/today` and `scope: /app/`. Installing SUM opens the client rather than marketing.
- A separate native iOS package should use the SUM client UI and backend, never embed the marketing landing as the application interface.

## Bilingual product terms and editorial rules

| English | 简体中文 | Usage |
| --- | --- | --- |
| Summoner.world | Summoner.world | Brand / website only |
| SUM Web App | SUM 客户端 | Actual browser app, including mobile and desktop |
| Summoner | 召唤师 | Player |
| Familiar | 召唤兽 | Companion/character |
| Pico | Pico | First Familiar; proper noun |
| Quest | Quest / 挑战 | Real user challenge; keep Quest identifier stable |
| Proof | 证据 | Real attributed evidence submitted by participants |
| Verified result / receipt | 可核查的结果 / 结果记录 | Only when actual server verdict exists |
| XP | XP / 经验 | Never invent or backfill reward amounts |
| Story chapter | 剧情章节 | Local, visual content; no fake XP or credits |
| Explore | 发现 / 探索 | Client discovery mode, not a fake market |

- Persist language preference as `sum-language=en|zh` in browser localStorage. Same preference on the site and the app; browser language helps initial selection.
- Keep backend status enums, endpoints, IDs and financial terms unchanged. Translation must not introduce a different verdict or entitlement.
- Product UX language should not call the public landing a 'game', 'wallet', or 'booking/reservation system'. No appointment/reservation feature is present.
- The first bilingual release covers the public website, global client navigation and high-traffic game entrances (Home, Story, Quiz, Create, Discover, Pico). The follow-up also localizes the real Quest invitation/consent, detail, proof-submission, created and settled-result shells while preserving server-generated titles, rules, and verdict reasoning verbatim. The subsequent profile/achievements/evidence gallery/activity statistics/settings pass localizes player-facing page copy and local-only display controls; profile account names, user-authored evidence/Quest text, credit balances, and server errors remain authoritative and untranslated. Specialized legal, external-upload widgets and long-form AI adjudication screens still require review before claiming complete linguistic localization.
- All user-controlled strings and server messages stay unmodified. No language selection can submit a Quest, accept a challenge, credit XP or change an account.

## Acceptance

1. `/` and `/enter` resolve to the public marketing website only.
2. `/app` redirects to `/app/today`, and both browser and installed-PWA routes enter the player UI.
3. In both languages, the marketing CTA opens `/app`; the app includes exactly one game dock, never a marketing dock.
4. The selected language persists across site to app, reload, story and back. Switching must not change route destinations.
5. English app tests, business/integration tests, and iOS native smoke remain green.

## Read-only account-language follow-up

- The shared EN / 简体中文 selection also changes account navigation, unsigned-user prompts, earned/locked badge descriptions, the evidence-category filter, weekly activity captions, and settings labels.
- Display mode and reduced-motion preference keep their original device-local keys and values. Translation must not send mutations or turn on push notifications; notification delivery remains explicitly not configured.
- CI checks the five account routes as a guest in both languages, persists local-only settings across reload, and checks there are no app API write requests. Screenshot capture scrolls to the lazily loaded Pico companion art, verifies image decode, then captures the full marketing page; an unloaded image is a test failure, not an empty placeholder in visual evidence.
- This is stacked on the validated Quest-localization branch and not a change to account identity, XP, proofs, credits, adjudication or production settings.
