# Interaction review: reference behavior and SUM changes

## Source and scope

The live baseline was independently read as cc23802735c9b34cd463b848e493bebc3b9ee189. It already contains newer proof, list-return and draft-continuity work, which must not be replaced by older conversation baselines.

Reference interactions were performed in fresh anonymous desktop Chrome contexts, including a 390px mobile viewport. No third-party registration, subscription, private account, notification enrollment or multiplayer match was performed.

- Duolingo: language selection -> Spanish -> welcome -> source selection (Other) -> learning reason. This is public onboarding, not a claim about the full signed-in app.
- Habitica: public Quest FAQ -> features -> browser Back retaining the selected answer/hash. Scroll restoration is not claimed; a separate screenshot was deliberately scrolled to inspect the answer.
- Lichess: beginner rook lesson -> start -> select/move the rook to the indicated legal square -> success feedback -> lesson menu. This was a real local exercise, not an online match.

Sources: https://www.duolingo.com/ ; https://habitica.com/static/faq ; https://habitica.com/static/features ; https://lichess.org/learn . These references inform clear next actions, disclosure and recovery, not copied branding or graphics.

## Reproduced problems and changes

Quest and Quiz silently swallow unsupported sharing/clipboard failures. Two synchronous clicks invoke native sharing twice. InvitationShare now owns one operation per current account/room, distinguishes copy from system handoff, and exposes an accessible selected manual link when copying is unavailable. The explicit copy action remains available even when native sharing exists.

The Web Share specification intentionally uses AbortError for both cancellation and missing targets. Do not auto-copy or infer which happened; retain an explicit user-controlled copy exit. A resolved share promise also does not prove recipient delivery, so UI feedback says only that the request was handed to system sharing. See https://www.w3.org/TR/web-share/ and https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share .

The companion page now prioritizes a real Quest action and actual owner-scoped collection. Milestone/XP/ticket receipts and concept prototypes are optional disclosures, not removed logic. Unknown inventory remains unknown, not a fabricated zero. Server-gated draw/evolution behavior and accepted rules/credits are unchanged.

Concept tabs retain choices and support one tab stop, arrow navigation, Home/End and focusable content panels, following https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ . The full existing atlas, prototype, fusion and truthful-inventory assertions remain; QA opens the intentional disclosures before inspecting their content.

## Verification limits

Reference app observations are limited to the exact public interactions above. Browser capability failures and account boundary tests use explicit synthetic transport on actual deployed components, not production mutations. Native compilation/home-screen smoke tests do not verify the operating system's share sheet or a real recipient accepting an invitation. Physical-device share/clipboard/WebView behavior remains an independent check.

No backend API, schema, dependency lock, authentication policy, reward gate, ledger or settlement implementation is changed by this review. Release still requires the exact clean source, full existing CI, native checks, production-config candidate verification and post-activation testing.
