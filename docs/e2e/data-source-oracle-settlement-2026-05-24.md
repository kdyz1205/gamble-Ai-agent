# Data-Source Oracle Settlement E2E - 2026-05-24

This proof verifies that a public data-source challenge can use the live router/API path, get an AI verdict from returned API data, and settle credits.

## Proof Run

- Production URL: https://gamble-ai-agent.vercel.app
- Challenge ID: `cmpjdd7vf000904l55qghfo2y`
- Challenge URL: https://gamble-ai-agent.vercel.app/challenge/cmpjdd7vf000904l55qghfo2y
- Join URL: https://gamble-ai-agent.vercel.app/join/cmpjdd7vf000904l55qghfo2y
- Evidence IDs: `cmpjddau4000004juijm2lvmk`, `cmpjddb76000404jugpf5l0uy`
- Judgment ID: `cmpjddhk5000204lai02qexbf`
- Proof run commit: `c7ec97d98487903826ae6fd43f29672092a0463d`
- Docs/current commit: see the Git commit that adds this proof note and E2E script.

## Scenario

- Protocol: `ProtocolSpecV2`
- Evidence mode: `public_oracle`
- Settlement mode: `auto_oracle`
- Data source key: `npm_registry_package`
- Data source params: `{ "package": "react" }`
- Router URL: `https://registry.npmjs.org/react`
- Router result: live HTTP `200`
- Judge model: `Oracle - OpenAI gpt-4o-mini`

## Result

- Judge source: `oracle`
- Winner ID: creator test account, redacted
- Confidence: `0.95`
- Evidence quality: `good`
- Recommendation: `settle_winner`
- Final challenge status: `settled`
- `winnerSettled`: `true`

## Ledger Proof

Creator test account:

- `stake -1`
- `ai_judge -1`
- `win +2`
- Balance: `50 -> 50`

Opponent test account:

- `stake -1`
- `loss -1` ledger row
- Balance: `50 -> 49`

Refund rows: `0`

## Notes

- The first production attempt hit a transient NextAuth/DB connection timeout during registration. The E2E script now retries transient auth connection failures before failing the proof.
- This proves the router-backed public-oracle settlement path for a simple public API fact. It does not prove every external source is reliable or that OAuth/private-account sources can settle without their required integrations.
