import assert from "node:assert/strict";
import { checkRateLimit, resetRateLimitStoreForTests } from "../src/lib/rate-limit.ts";
import { getRequestIp, isAccountRestricted, isOwnerDeviceGateEnforced } from "../src/lib/security-policy.ts";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("isOwnerDeviceGateEnforced defaults true", () => {
  assert.equal(isOwnerDeviceGateEnforced({}), true);
});

run("isOwnerDeviceGateEnforced explicit false disables gate", () => {
  assert.equal(isOwnerDeviceGateEnforced({ ENFORCE_OWNER_DEVICE_GATE: "false" }), false);
  assert.equal(isOwnerDeviceGateEnforced({ ENFORCE_OWNER_DEVICE_GATE: "FALSE" }), false);
  assert.equal(isOwnerDeviceGateEnforced({ ENFORCE_OWNER_DEVICE_GATE: "true" }), true);
});

run("isAccountRestricted recognizes banned/deactivated users", () => {
  assert.equal(isAccountRestricted({ isBanned: true, isDeactivated: false }), true);
  assert.equal(isAccountRestricted({ isBanned: false, isDeactivated: true }), true);
  assert.equal(isAccountRestricted({ isBanned: false, isDeactivated: false }), false);
});

run("getRequestIp selects forwarded ip then real ip", () => {
  assert.equal(getRequestIp("1.1.1.1, 2.2.2.2", null), "1.1.1.1");
  assert.equal(getRequestIp(null, "3.3.3.3"), "3.3.3.3");
  assert.equal(getRequestIp(null, null), "unknown");
});

run("checkRateLimit blocks after max requests", () => {
  resetRateLimitStoreForTests();
  const key = "test:max";
  assert.equal(checkRateLimit(key, 2, 60_000), true);
  assert.equal(checkRateLimit(key, 2, 60_000), true);
  assert.equal(checkRateLimit(key, 2, 60_000), false);
});

run("checkRateLimit is isolated per key", () => {
  resetRateLimitStoreForTests();
  assert.equal(checkRateLimit("key:a", 1, 60_000), true);
  assert.equal(checkRateLimit("key:a", 1, 60_000), false);
  assert.equal(checkRateLimit("key:b", 1, 60_000), true);
});

console.log("All tests passed.");
