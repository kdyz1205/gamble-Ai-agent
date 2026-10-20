/** Exercises the production router against real local HTTP requests; no paid model calls. */
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
  completeOraclePrompt,
  completeOraclePromptWithTools,
  completeOracleJudgeVision,
} from "../src/lib/llm-router";
import { getProviderById } from "../src/lib/llm-providers";
import { AI_RECEIPT_ACTION, AI_RESERVATION_ACTION, AiBudgetError, extractAiUsage, withAiContext } from "../src/lib/ai-governance";
import prisma from "../src/lib/db";

type RequestBody = { max_tokens: number; tools?: unknown[]; messages: Array<{ content: unknown }> };
type Reply = (response: ServerResponse, body: RequestBody) => void;

async function main() {
  assert.deepEqual(extractAiUsage({ usage: { prompt_tokens: 17, completion_tokens: 4,
    total_tokens: 21, prompt_tokens_details: { cached_tokens: 3 } } }, "openai"),
  { inputTokens: 17, outputTokens: 4, cachedInputTokens: 3, totalTokens: 21 });
  assert.deepEqual(extractAiUsage({ usage: { input_tokens: 11, output_tokens: 5,
    cache_read_input_tokens: 7, cache_creation_input_tokens: 2 } }, "anthropic"),
  { inputTokens: 11, outputTokens: 5, cachedInputTokens: 7, totalTokens: 25 });
  assert.deepEqual(extractAiUsage({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3,
    totalTokenCount: 20, cachedContentTokenCount: 4 } }, "google"),
  { inputTokens: 10, outputTokens: 3, cachedInputTokens: 4, totalTokens: 20 });
  for (const provider of ["openai", "anthropic", "google"] as const) {
    assert.deepEqual(extractAiUsage({}, provider),
      { inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null });
  }
  assert.equal(extractAiUsage({ usage: { prompt_tokens: -1, completion_tokens: NaN } }, "openai").totalTokens, null);
  console.log("PASS usage normalization: OpenAI, Anthropic cache, Gemini, unknown and invalid");
  if (process.argv.includes("--usage-only")) return;
  const bodies: RequestBody[] = [];
  const pendingResponses = new Set<ServerResponse>();
  let disconnected = 0;
  let reply: Reply = (response) => response.end(JSON.stringify({
    choices: [{ message: { content: "local response" } }],
    usage: { prompt_tokens: 17, completion_tokens: 4, total_tokens: 21 },
  }));
  const defaultReply = reply;
  const server = createServer(async (request, response) => {
    pendingResponses.add(response);
    response.on("close", () => { pendingResponses.delete(response); disconnected++; });
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as RequestBody;
    bodies.push(body);
    response.setHeader("content-type", "application/json");
    reply(response, body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const provider = getProviderById("openai")!;
  const originalBaseUrl = provider.baseUrl;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalTimeout = process.env.AI_TEXT_TIMEOUT_MS;
  const originalCallLimit = process.env.AI_REQUEST_CALL_LIMIT;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalAnthropicBase = process.env.ANTHROPIC_BASE_URL;
  provider.baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.OPENAI_API_KEY = "local-transport-test";
  process.env.ANTHROPIC_API_KEY = "local-transport-test";
  process.env.ANTHROPIC_BASE_URL = provider.baseUrl;
  const params = { providerId: "openai", model: `local-test-${randomUUID()}`, system: "system", user: "user" };
  const originalVisionModels = provider.visionModels;
  provider.visionModels = [...(provider.visionModels ?? []), params.model]; // Explicit simulated transport model, test process only.
  let passed = 0;
  const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
  try {
    assert.equal(await completeOraclePrompt(params), "local response");
    assert.equal(bodies.at(-1)?.max_tokens, 1024);
    pass("text result contract and default token budget");

    for (const [supplied, expected] of [[999_999, 4096], [NaN, 1024], [Infinity, 1024], [-1, 1024], [0.5, 1]]) {
      await completeOraclePrompt({ ...params, maxTokens: supplied });
      assert.equal(bodies.at(-1)?.max_tokens, expected);
    }
    pass("non-finite, negative, excessive and fractional token budgets bounded");

    assert.equal(await completeOracleJudgeVision({ ...params, userText: "image", images: [
      { caption: "local", mimeType: "image/png", base64: "dGVzdA==" },
    ] }), "local response");
    const visionContent = bodies.at(-1)?.messages.at(-1)?.content;
    assert(Array.isArray(visionContent) && visionContent.length === 2);
    pass("vision preserves multimodal payload and text result");

    const beforeEmptyVision = bodies.length;
    await assert.rejects(completeOracleJudgeVision({ ...params, userText: "text only", images: [] }), /readable image evidence/);
    assert.equal(bodies.length, beforeEmptyVision);
    pass("empty vision fails closed without a text request");

    reply = (response, body) => response.end(JSON.stringify(body.tools ? {
      choices: [{ message: { content: null, tool_calls: [
        { id: "call-local", type: "function", function: { name: "unknown_local_test_tool", arguments: "{}" } },
      ] } }], usage: { prompt_tokens: 10, completion_tokens: 5 },
    } : { choices: [{ message: { content: "tool complete" } }], usage: { prompt_tokens: 15, completion_tokens: 3 } }));
    const beforeTools = bodies.length;
    const result = await completeOraclePromptWithTools({ ...params, tools: [], maxIterations: 100 });
    assert.equal(bodies.length - beforeTools, 3);
    assert.equal(result.text, "tool complete");
    assert.equal(result.toolInvocations.length, 2);
    assert.equal(result.toolInvocations[0].result.ok, false);
    assert.equal(bodies.at(-1)?.tools, undefined);
    pass("tool requests capped at three with final answer and visible failed tool result");

    const beforeZero = bodies.length;
    await completeOraclePromptWithTools({ ...params, tools: [], maxIterations: 0 });
    assert.equal(bodies.length - beforeZero, 1);
    pass("zero iterations clamps to one physical request");

    process.env.AI_REQUEST_CALL_LIMIT = "1";
    const beforeLimited = bodies.length;
    await assert.rejects(withAiContext({ purpose: "local-router-budget-test" }, () =>
      completeOraclePromptWithTools({ ...params, tools: [], maxIterations: 3 })),
    (error: unknown) => error instanceof AiBudgetError && error.reason === "request");
    assert.equal(bodies.length - beforeLimited, 1);
    if (originalCallLimit === undefined) delete process.env.AI_REQUEST_CALL_LIMIT;
    else process.env.AI_REQUEST_CALL_LIMIT = originalCallLimit;
    pass("shared request budget prevents second physical tool request");

    reply = (response) => response.end(JSON.stringify({
      id: "msg-local", type: "message", role: "assistant", model: params.model,
      content: [{ type: "text", text: "anthropic local response" }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 11, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 2 },
    }));
    assert.equal(await completeOraclePrompt({ ...params, providerId: "anthropic" }), "anthropic local response");
    pass("Anthropic SDK traverses real local transport and returns text");

    reply = (response) => { response.statusCode = 429; response.end(JSON.stringify({
      type: "error", error: { type: "rate_limit_error", message: "local test rate limit" },
    })); };
    const beforeAnthropicFailure = bodies.length;
    await assert.rejects(completeOraclePrompt({ ...params, providerId: "anthropic" }));
    assert.equal(bodies.length - beforeAnthropicFailure, 1);
    pass("Anthropic SDK does not perform hidden physical retries");

    reply = (response) => { response.statusCode = 429; response.end("sensitive-provider-body"); };
    const beforeFailure = bodies.length;
    await assert.rejects(completeOraclePrompt(params), (error: unknown) => {
      assert(error instanceof Error);
      assert.match(error.message, /HTTP 429/);
      assert(!error.message.includes("sensitive-provider-body"));
      return true;
    });
    assert.equal(bodies.length - beforeFailure, 1);
    pass("HTTP failure propagates safely without hidden retries");

    reply = (response) => response.end("invalid-json");
    await assert.rejects(completeOraclePrompt(params), SyntaxError);
    pass("invalid provider response fails instead of fabricating text");

    process.env.AI_TEXT_TIMEOUT_MS = "80";
    reply = () => { /* Hold real socket until router aborts. */ };
    let beforeDisconnect = disconnected;
    await assert.rejects(completeOraclePrompt(params), (error: unknown) => {
      assert(error instanceof Error);
      assert.match(error.name, /Timeout|Abort/);
      return true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert(disconnected > beforeDisconnect, "upstream socket must actually close");
    pass("hung HTTP request aborts upstream transport");

    reply = (response) => { response.writeHead(200); response.write('{"choices":'); };
    beforeDisconnect = disconnected;
    await assert.rejects(completeOraclePrompt(params));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert(disconnected > beforeDisconnect, "stalled body socket must actually close");
    pass("timeout also aborts stalled response body parsing");

    reply = defaultReply;
    process.env.AI_TEXT_TIMEOUT_MS = "not-a-number";
    assert.equal(await completeOraclePrompt(params), "local response");
    pass("invalid timeout config falls back and subsequent request recovers");

    const reservations = await prisma.auditLog.count({ where: {
      action: AI_RESERVATION_ACTION, payload: { contains: params.model },
    } });
    const receipts = await prisma.auditLog.findMany({ where: {
      action: AI_RECEIPT_ACTION, payload: { contains: params.model },
    } });
    assert.equal(reservations, bodies.length, "every physical request must reserve exactly once");
    assert.equal(receipts.length, bodies.length, "every physical request must persist exactly one outcome");
    const outcomes = receipts.map((row) => JSON.parse(row.payload!) as {
      outcome: string; usage: { inputTokens: number; outputTokens: number } | null; billedUsd: unknown;
    });
    assert.equal(outcomes.filter((row) => row.outcome === "failed").length, 5);
    assert(outcomes.filter((row) => row.outcome === "succeeded").every((row) => row.usage !== null));
    assert(outcomes.every((row) => row.billedUsd === null));
    pass("real database has one reservation and outcome per request, including failures");
    console.log(`${passed} LLM router transport tests passed`);
  } finally {
    provider.baseUrl = originalBaseUrl;
    provider.visionModels = originalVisionModels;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalTimeout === undefined) delete process.env.AI_TEXT_TIMEOUT_MS;
    else process.env.AI_TEXT_TIMEOUT_MS = originalTimeout;
    if (originalCallLimit === undefined) delete process.env.AI_REQUEST_CALL_LIMIT;
    else process.env.AI_REQUEST_CALL_LIMIT = originalCallLimit;
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    if (originalAnthropicBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = originalAnthropicBase;
    for (const response of pendingResponses) response.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
