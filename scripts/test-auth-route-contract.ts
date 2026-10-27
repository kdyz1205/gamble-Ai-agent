import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as legacyLogin } from "../src/app/api/auth/login/route";
import { POST as legacyRegister } from "../src/app/api/auth/register/route";

async function main() {
  const originalFetch = globalThis.fetch;
  let forwarded = 0;
  // A successful HTTP response from NextAuth's sign-in page is NOT a session.
  globalThis.fetch = async () => {
    forwarded++;
    return Response.json({ url: "http://localhost:3000/auth/signin?csrf=true" });
  };
  try {
    for (const [name, handler] of [["login", legacyLogin], ["register", legacyRegister]] as const) {
      for (const body of [JSON.stringify({ email: "route-contract@example.invalid", username: "fixture", password: "not-a-real-password" }), "{", "null"]) {
        const response = await handler(new NextRequest(`http://localhost:3000/api/auth/${name}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body,
        }));
        assert.equal(response.status, 410, `${name}: retired endpoint must not claim successful authentication or crash on malformed JSON`);
        assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        const result = await response.json();
        assert.equal(result.code, "AUTH_USE_NEXTAUTH");
        assert.equal(result.signInPath, "/auth/signin");
        assert.equal(response.headers.get("set-cookie"), null);
      }
    }
    assert.equal(forwarded, 0, "Legacy routes must never forward passwords or bypass the CSRF-protected NextAuth flow");
    console.log("PASS auth route contract: 6 real route invocations fail explicitly, do not forward credentials, do not set a session, and reject malformed payloads safely");
  } finally {
    globalThis.fetch = originalFetch;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
