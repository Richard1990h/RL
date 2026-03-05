import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, resetRateLimitStoreForTests } from "../src/lib/rate-limit";

test("checkRateLimit blocks after max requests", () => {
  resetRateLimitStoreForTests();
  const key = "test:max";
  assert.equal(checkRateLimit(key, 2, 60_000), true);
  assert.equal(checkRateLimit(key, 2, 60_000), true);
  assert.equal(checkRateLimit(key, 2, 60_000), false);
});

test("checkRateLimit is per-key", () => {
  resetRateLimitStoreForTests();
  assert.equal(checkRateLimit("key:a", 1, 60_000), true);
  assert.equal(checkRateLimit("key:a", 1, 60_000), false);
  assert.equal(checkRateLimit("key:b", 1, 60_000), true);
});
