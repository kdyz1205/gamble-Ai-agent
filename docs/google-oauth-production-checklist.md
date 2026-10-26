# Summoner.world Google sign-in: production checklist

## Reproduced on 2026-10-26

Both hosts currently return a working NextAuth provider list. Requesting Google OAuth from each host produces a different authorization request:

- `https://summoner.world` → `https://summoner.world/api/auth/callback/google`
- `https://www.summoner.world` → `https://www.summoner.world/api/auth/callback/google`

Google screenshot provided by the user shows `Error 400: redirect_uri_mismatch`.

## One canonical origin

Production site URL: `https://summoner.world` only. `src/proxy.ts` normalizes `www` and known legacy Vercel hosts before session cookies/Google auth. Do not create separate app accounts across www/non-www.

Set Vercel **Production** `NEXTAUTH_URL` to `https://summoner.world` (no path, no slash). Google OAuth client credentials must be for the client connected to this production deployment. Preview/staging should use a separate OAuth client where feasible.

## Required Google Auth Platform changes (external to source)

In the Google Cloud project that owns the production `GOOGLE_CLIENT_ID`:

1. Google Auth Platform → Clients → **Web application** client → **Authorized redirect URIs**: add exactly `https://summoner.world/api/auth/callback/google`.
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
