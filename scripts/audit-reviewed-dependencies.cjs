"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const REVIEW = Object.freeze({
  advisory: "https://github.com/advisories/GHSA-g3hv-75wg-m249",
  version: "3.1.5",
  integrity: "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
  sourceSHA256: "746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d",
  expiresAt: "2026-11-18T00:00:00Z",
});

// A source-specific non-applicability decision, not a general audit allowlist.
// Raw npm findings are preserved. Any other advisory, production node, version,
// source change or expired review must fail. See docs/security/minimatch-20261104.md.
function assessAudit(audit, lock, verifySource, now = new Date()) {
  assert(!audit.error, "npm audit reported an error");
  assert(audit.metadata?.vulnerabilities && audit.vulnerabilities, "Incomplete audit response");
  const findings = Object.entries(audit.vulnerabilities);
  assert.equal(findings.length, audit.metadata.vulnerabilities.total, "Audit finding count mismatch");
  if (!findings.length) {
    assert.equal(audit.metadata.vulnerabilities.total, 0, "Audit count mismatch");
    return { rawFindings: 0, reviewedNonApplicable: [], unreviewed: 0 };
  }
  assert(now.getTime() < Date.parse(REVIEW.expiresAt), "Source-specific review expired; reassess upstream");
  const inspected = new Set();
  let leafAdvisories = 0;
  for (const [name, finding] of findings) {
    assert.equal(finding.name, name, "Audit name mismatch");
    assert.equal(finding.severity, "moderate", "Unreviewed severity");
    assert(finding.nodes?.length && finding.via?.length, "Incomplete dependency finding");
    for (const node of finding.nodes) {
      assert.equal(lock.packages[node]?.dev, true, `Production dependency must never be exempted: ${node}`);
      if (name === "minimatch") {
        const row = lock.packages[node];
        assert.equal(row.version, REVIEW.version, `Unreviewed minimatch version: ${node}`);
        assert.equal(row.integrity, REVIEW.integrity, `Unreviewed package archive: ${node}`);
        verifySource(node);
        inspected.add(node);
      }
    }
    for (const via of finding.via) {
      if (typeof via === "string") {
        assert(audit.vulnerabilities[via], `Unresolved vulnerability dependency: ${via}`);
      } else {
        assert.equal(name, "minimatch", "New direct advisory requires review");
        assert.equal(via.dependency, "minimatch", "Unreviewed advisory dependency");
        assert.equal(via.url, REVIEW.advisory, "New advisory requires review");
        assert.equal(via.severity, "moderate", "Advisory severity changed");
        leafAdvisories++;
      }
    }
  }
  const reachesReviewedLeaf = (name, seen = new Set()) => {
    if (name === "minimatch") return true;
    if (seen.has(name)) return false;
    const next = new Set(seen); next.add(name);
    return audit.vulnerabilities[name].via.some(via => typeof via === "string" && reachesReviewedLeaf(via, next));
  };
  for (const [name] of findings) assert(reachesReviewedLeaf(name), "Disconnected unreviewed finding: " + name);
  assert.equal(leafAdvisories, 1, "Exactly the reviewed leaf advisory is allowed");
  assert(inspected.size > 0, "No pinned legacy source was verified");
  return { rawFindings: audit.metadata.vulnerabilities.total,
    reviewedNonApplicable: [{ advisory: REVIEW.advisory, version: REVIEW.version,
      sourceSHA256: REVIEW.sourceSHA256, nodes: [...inspected], expiresAt: REVIEW.expiresAt }], unreviewed: 0 };
}

function verifyInstalledSource(root, node) {
  const dir = path.resolve(root, node);
  assert(dir.startsWith(path.resolve(root, "node_modules") + path.sep), "Unexpected package path");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version, REVIEW.version);
  const source = fs.readFileSync(path.join(dir, "minimatch.js"));
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"), REVIEW.sourceSHA256, "Installed legacy source changed");
  assert(!/firstPhasePreProcess|secondPhasePreProcess|optimizationLevel/.test(source.toString("utf8")), "Affected optimizer unexpectedly present");
}

function run() {
  const root = path.resolve(__dirname, "..");
  const out = path.join(root, "output", "security");
  fs.mkdirSync(out, { recursive: true });
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const invoke = args => spawnSync(command, args, { cwd: root, encoding: "utf8",
    shell: process.platform === "win32", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  const full = invoke(["audit", "--json"]);
  fs.writeFileSync(path.join(out, "dependency-audit.json"), full.stdout || "");
  assert(!full.error && [0, 1].includes(full.status), "npm audit did not complete");
  const audit = JSON.parse(full.stdout);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const reviewed = assessAudit(audit, lock, node => verifyInstalledSource(root, node));
  const production = invoke(["audit", "--omit=dev", "--json"]);
  fs.writeFileSync(path.join(out, "production-dependency-audit.json"), production.stdout || "");
  assert(!production.error && production.status === 0, "Production audit must remain clean");
  const prod = JSON.parse(production.stdout);
  assert(!prod.error && prod.metadata?.vulnerabilities?.total === 0, "Production audit findings are never exempted");
  const receipt = { ...reviewed, productionFindings: 0, checkedAt: new Date().toISOString(),
    lockSHA256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "package-lock.json"))).digest("hex") };
  fs.writeFileSync(path.join(out, "dependency-audit-review.json"), JSON.stringify(receipt, null, 2));
  console.log("DEPENDENCY_AUDIT_REVIEW_PASS " + JSON.stringify(receipt));
}
module.exports = { REVIEW, assessAudit, verifyInstalledSource };
if (require.main === module) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
