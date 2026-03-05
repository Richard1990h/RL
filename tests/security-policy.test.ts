import test from "node:test";
import assert from "node:assert/strict";
import { getRequestIp, isAccountRestricted, isOwnerDeviceGateEnforced } from "../src/lib/security-policy";

test("isOwnerDeviceGateEnforced defaults to true", () => {
  assert.equal(isOwnerDeviceGateEnforced({}), true);
});

test("isOwnerDeviceGateEnforced disables only on explicit false", () => {
  assert.equal(isOwnerDeviceGateEnforced({ ENFORCE_OWNER_DEVICE_GATE: "false" }), false);
  assert.equal(isOwnerDeviceGateEnforced({ ENFORCE_OWNER_DEVICE_GATE: "FALSE" }), false);
  assert.equal(isOwnerDeviceGateEnforced({ ENFORCE_OWNER_DEVICE_GATE: "true" }), true);
});

test("isAccountRestricted when banned or deactivated", () => {
  assert.equal(isAccountRestricted({ isBanned: true, isDeactivated: false }), true);
  assert.equal(isAccountRestricted({ isBanned: false, isDeactivated: true }), true);
  assert.equal(isAccountRestricted({ isBanned: false, isDeactivated: false }), false);
});

test("getRequestIp prefers first x-forwarded-for", () => {
  assert.equal(getRequestIp("1.1.1.1, 2.2.2.2", null), "1.1.1.1");
  assert.equal(getRequestIp(null, "3.3.3.3"), "3.3.3.3");
  assert.equal(getRequestIp(null, null), "unknown");
});
