import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { DATA_SOURCE_TOPICS as TOPICS } from "../src/lib/data-source-catalog";

function extractPreviousValues(source: string, key: "prompt" | "category") {
  return new Set([...source.matchAll(new RegExp(`${key}:\\s*"([^"]+)"`, "g"))].map((match) => match[1].toLowerCase()));
}

function validateTopics() {
  assert.equal(TOPICS.length, 100, "Data-source topic catalog must contain exactly 100 topics.");
  assert.equal(new Set(TOPICS.map((item) => item.id)).size, 100, "Topic ids must be unique.");
  assert.equal(new Set(TOPICS.map((item) => item.topicKey)).size, 100, "Topic keys must be unique.");
  assert.equal(new Set(TOPICS.map((item) => item.prompt.toLowerCase())).size, 100, "Prompts must be unique.");
  assert.equal(new Set(TOPICS.map((item) => item.dataSource.sourceKey)).size, 100, "Data source keys must be unique.");
  const previousScript = readFileSync("scripts/eval-diverse-judgeability-140.ts", "utf8");
  const previousPrompts = extractPreviousValues(previousScript, "prompt");
  const previousCategories = extractPreviousValues(previousScript, "category");
  for (const item of TOPICS) {
    assert.ok(!previousPrompts.has(item.prompt.toLowerCase()), `Prompt overlaps previous diverse 140: ${item.prompt}`);
    assert.ok(!previousCategories.has(item.topicKey.toLowerCase()), `Topic key overlaps previous diverse 140: ${item.topicKey}`);
    assert.ok(item.dataSource.provider.trim(), `Missing provider for ${item.topicKey}`);
    assert.ok(item.dataSource.endpoint.trim(), `Missing endpoint for ${item.topicKey}`);
    assert.ok(item.dataSource.docsUrl.trim(), `Missing docs URL for ${item.topicKey}`);
    assert.ok(item.dataSource.requiredFields.length > 0, `Missing required fields for ${item.topicKey}`);
    assert.ok(!/unknown|tbd/i.test([
      item.dataSource.provider,
      item.dataSource.endpoint,
      item.dataSource.docsUrl,
    ].join(" ")), `Unconfigured data source placeholder in ${item.topicKey}`);
  }
}

function summarize() {
  return TOPICS.reduce<Record<string, number>>((acc, item) => {
    acc[item.resolutionMethod] = (acc[item.resolutionMethod] ?? 0) + 1;
    acc[item.dataSource.adapterStatus] = (acc[item.dataSource.adapterStatus] ?? 0) + 1;
    return acc;
  }, {});
}

function renderMarkdown() {
  const summary = summarize();
  return [
    "# GambleAI 100 New Topic Data Source Catalog",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This catalog is intentionally separate from the diverse 140 judgeability eval. It adds 100 new topics with explicit data sources. The script validates exactly 100 topics, unique topic keys, unique prompts, unique source keys, no exact overlap with the prior diverse 140 prompts/categories, and no missing provider/endpoint/docs/required fields.",
    "",
    "## Summary",
    "",
    `- Total topics: ${TOPICS.length}`,
    `- Unique prompts: ${new Set(TOPICS.map((item) => item.prompt.toLowerCase())).size}`,
    `- Unique topic keys: ${new Set(TOPICS.map((item) => item.topicKey)).size}`,
    `- Unique data source keys: ${new Set(TOPICS.map((item) => item.dataSource.sourceKey)).size}`,
    ...Object.entries(summary).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Topics",
    "",
    "| # | Topic | Resolution | Adapter | Provider | Endpoint | Required Fields | Prompt |",
    "|---:|---|---|---|---|---|---|---|",
    ...TOPICS.map((item) => `| ${item.id} | ${item.topicKey} | ${item.resolutionMethod} | ${item.dataSource.adapterStatus} | ${item.dataSource.provider.replaceAll("|", "\\|")} | ${item.dataSource.endpoint.replaceAll("|", "\\|")} | ${item.dataSource.requiredFields.join(", ").replaceAll("|", "\\|")} | ${item.prompt.replaceAll("|", "\\|")} |`),
    "",
  ].join("\n");
}

function main() {
  validateTopics();
  const reportPath = "docs/evals/gambleai-100-new-topic-data-sources-2026-05-24.md";
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderMarkdown(), "utf8");
  console.log(JSON.stringify({
    totalTopics: TOPICS.length,
    uniquePrompts: new Set(TOPICS.map((item) => item.prompt.toLowerCase())).size,
    uniqueTopicKeys: new Set(TOPICS.map((item) => item.topicKey)).size,
    uniqueDataSources: new Set(TOPICS.map((item) => item.dataSource.sourceKey)).size,
    reportPath,
    summary: summarize(),
  }, null, 2));
}

main();
