import assert from "node:assert/strict";
import test from "node:test";
import { parseDisputeWindowMs } from "../src/lib/verdict-review";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("parseDisputeWindowMs honors the challenge dispute window", () => {
  assert.equal(parseDisputeWindowMs("90 minutes"), 90 * MINUTE);
  assert.equal(parseDisputeWindowMs("12 hours"), 12 * HOUR);
  assert.equal(parseDisputeWindowMs("2 days"), 2 * DAY);
  assert.equal(parseDisputeWindowMs("1 week"), 7 * DAY);
});

test("parseDisputeWindowMs fails closed to 24 hours for invalid input", () => {
  assert.equal(parseDisputeWindowMs(null), DAY);
  assert.equal(parseDisputeWindowMs("whenever"), DAY);
  assert.equal(parseDisputeWindowMs("-2 hours"), DAY);
});

test("parseDisputeWindowMs caps an excessive window at 30 days", () => {
  assert.equal(parseDisputeWindowMs("365 days"), 30 * DAY);
});
