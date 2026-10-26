# Summoner.world Google sign-in: production checklist

## Reproduced on 2026-10-26

Both hosts currently return a working NextAuth provider list. Requesting Google OAuth from each host produces a different authorization request:

- `https://summoner.world` → `https://summoner.world/api/auth/callback/google`
- `https://www.summoner.world` → `https://www.summoner.world/api/auth/callback/google`

Google screenshot provided by the user shows `Error 400: redirect_uri_mismatch`.

## Verified cloud change and follow-up (2026-10-26)

- Matched the production authorization request's Google OAuth client number to **Google Cloud project `luckyplay-494202`, client `LuckyPlay Web`**. No client secret was read or modified.
- The client previously allowed localhost and old Vercel callback URLs, **but not** the production `summoner.world` callback; this confirmed the 400 root cause.
- Added exactly `https://summoner.world/api/auth/callback/google` to **Authorized redirect URIs**, preserving the previous entries. Google Cloud displayed **OAuth client saved**.
- After saving, an isolated, unauthenticated Chrome/Playwright OAuth probe obtained `HTTP 200` at `accounts.google.com`, title **Sign in - Google Accounts**, and `redirectMismatch=false` (the old 400 did not occur). The production authorization request still used the exact expected callback.
- This verifies the **authorization-request boundary**, not a complete signed-in user session. Full Google account selection, NextAuth callback, cookie persistence, iPhone Safari and the eventual production UI deployment remain distinct acceptance gates.
- Branch `fix/oauth-unified-summoner-ui-20261026` is independently tested; the new auth UI was verified on Vercel Preview (three Playwright page-flow checks and no React hydration errors on five scene/viewport probes). The 2026-10-26 GitHub CI run `40333356243` passed including 17 browser journeys. **Do not confuse this with promoting the Preview to production.**
- The client display name is still **LuckyPlay Web** in Google Cloud. Any Google consent-branding rename, logo/authorized-domain change or verification review requires separate consideration; these are not needed to correct the redirect mismatch.
- The existing production `www.summoner.world` host was separately confirmed to generate `https://www.summoner.world/api/auth/callback/google`, which returned `Error 400: redirect_uri_mismatch` before the additional Cloud update. On the same client, added this **www callback** and received a second **OAuth client saved** confirmation, preserving all existing entries. The post-save `www` account-page probe did not complete and is still **unverified**; do not claim a successful www login yet. The canonical-host proxy in this branch will redirect www to the apex after a safe production deployment.

## One canonical origin

Production site URL: `https://summoner.world` only. `src/proxy.ts` normalizes `www` and known legacy Vercel hosts before session cookies/Google auth. Do not create separate app accounts across www/non-www.

Set Vercel **Production** `NEXTAUTH_URL` to `https://summoner.world` (no path, no slash). Google OAuth client credentials must be for the client connected to this production deployment. Preview/staging should use a separate OAuth client where feasible.

## Google Auth Platform review (remaining branding/origin checks)

In the Google Cloud project that owns the production `GOOGLE_CLIENT_ID`:

1. **Completed:** Google Auth Platform → Clients → **Web application** client → **Authorized redirect URIs** contains exactly `https://summoner.world/api/auth/callback/google`.
2. **Authorized JavaScript origins**, if the client uses this option: add `https://summoner.world` (origin only, no path).
3. Google Auth Platform → Branding: ensure display name “Summoners World” or “Summoner.world”, verified domain `summoner.world`, consistent logo from `public/icon-192.png`, and the required support/developer contact email.
4. Ensure the selected client ID matches the one used by the production deployment. Never copy OAuth secrets into frontend code.
5. Remove unsupported preview/legacy callbacks only after confirming no legitimate app still uses them.

Google's authorization page has Google-owned styling; only the app branding (name/logo) and our own pages can be controlled.

## Actual verification, not just homepage HTTP 200

- Visit `https://www.summoner.world/enter`; expect 308 to `https://summoner.world/enter`.
- Check production `/api/auth/providers` offers Google and credentials.
- From `https://summoner.world/auth/signin`, start Google sign-in and inspect the `redirect_uri` on the Google request: must be exactly `https://summoner.world/api/auth/callback/google`.
- Complete account selection and verify return to `/app/today` with a persisted signed-in session.
- Retry on iPhone Safari and desktop Chrome; also test email/password fallback and the branded `/auth/error?error=OAuthCallback` page.
- Treat **Google OAuth as unverified** until the Google console change and a completed production user session have both been observed.

The `redirect_uri_mismatch` error cannot be repaired by CSS or by changing only the NextAuth `callbackUrl` post-login destination.
