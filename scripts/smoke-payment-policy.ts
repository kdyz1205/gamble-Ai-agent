import assert from "node:assert/strict";
import {
  isStakeTokenAllowed,
  paymentJurisdictionFromRequest,
  paymentPolicyStatus,
  usdcCreditTopupEnabled,
} from "../src/lib/payment-policy";

const originalEnv = { ...process.env };

function restoreEnv() {
  process.env = { ...originalEnv };
}

try {
  process.env.REAL_MONEY_WAGERING_ENABLED = "true";
  process.env.LEGAL_REAL_MONEY_APPROVED = "true";
  process.env.PAYMENT_PROCESSOR_WAGERING_APPROVED = "true";
  process.env.ENABLE_USDC_CREDIT_TOPUP = "true";
  process.env.REAL_MONEY_ALLOWED_COUNTRIES = "US,GB";
  process.env.REAL_MONEY_ALLOWED_REGIONS = "CA-ON";

  const us = { country: "US", region: "CA", source: "body" as const };
  const gb = { country: "GB", region: null, source: "body" as const };
  const caOn = { country: "CA", region: "ON", source: "body" as const };
  const caBc = { country: "CA", region: "BC", source: "body" as const };
  const unknown = { country: null, region: null, source: "unknown" as const };

  assert.equal(isStakeTokenAllowed("credits", us), true, "internal credits must always remain usable");
  assert.equal(isStakeTokenAllowed("usdc", us), false, "US must remain hard-blocked even if allowlisted");
  assert.equal(isStakeTokenAllowed("usdc", gb), true, "allowlisted non-US country should pass");
  assert.equal(isStakeTokenAllowed("usdc", caOn), true, "allowlisted non-US region should pass");
  assert.equal(isStakeTokenAllowed("usdc", caBc), false, "non-allowlisted region should fail");
  assert.equal(isStakeTokenAllowed("usdc", unknown), false, "unknown jurisdiction should fail closed");
  assert.equal(usdcCreditTopupEnabled(us), false, "US top-up must remain blocked");
  assert.equal(usdcCreditTopupEnabled(gb), true, "allowlisted non-US top-up should pass when flags are enabled");

  const detected = paymentJurisdictionFromRequest(new Request("https://example.test", {
    headers: {
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "CA",
    },
  }));
  assert.deepEqual(detected, { country: "US", region: "CA", source: "vercel" });

  const usPolicy = paymentPolicyStatus(us);
  assert.equal(usPolicy.cashStakeAllowed, false);
  assert.equal(usPolicy.hardBlocked, true);
  assert.equal(usPolicy.reason, "hard_blocked_country");

  const gbPolicy = paymentPolicyStatus(gb);
  assert.equal(gbPolicy.cashStakeAllowed, true);
  assert.equal(gbPolicy.reason, null);

  console.log("payment-policy smoke passed", {
    usCash: usPolicy.cashStakeAllowed,
    gbCash: gbPolicy.cashStakeAllowed,
    caOnCash: isStakeTokenAllowed("usdc", caOn),
    unknownCash: isStakeTokenAllowed("usdc", unknown),
    detected,
  });
} finally {
  restoreEnv();
}
