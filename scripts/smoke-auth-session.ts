import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_SESSION_UPDATE_AGE_SECONDS,
  authOptions,
} from "../src/lib/auth-options";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(authOptions.session?.strategy === "jwt", "Auth must use jwt sessions");
assert(
  authOptions.session?.maxAge === AUTH_SESSION_MAX_AGE_SECONDS,
  `Session maxAge must be ${AUTH_SESSION_MAX_AGE_SECONDS}s`,
);
assert(
  authOptions.session?.updateAge === AUTH_SESSION_UPDATE_AGE_SECONDS,
  `Session updateAge must be ${AUTH_SESSION_UPDATE_AGE_SECONDS}s`,
);
assert(
  authOptions.jwt?.maxAge === AUTH_SESSION_MAX_AGE_SECONDS,
  `JWT maxAge must match session maxAge ${AUTH_SESSION_MAX_AGE_SECONDS}s`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      strategy: authOptions.session.strategy,
      sessionMaxAgeDays: AUTH_SESSION_MAX_AGE_SECONDS / 60 / 60 / 24,
      sessionUpdateAgeHours: AUTH_SESSION_UPDATE_AGE_SECONDS / 60 / 60,
      jwtMaxAgeDays: (authOptions.jwt.maxAge ?? 0) / 60 / 60 / 24,
    },
    null,
    2,
  ),
);
