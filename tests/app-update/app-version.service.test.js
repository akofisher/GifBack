import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions } from "../../src/modules/app-update/services/app-version.service.js";

test("compareVersions returns -1 when left is older", () => {
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
  assert.equal(compareVersions("1.2", "1.2.1"), -1);
});

test("compareVersions returns 1 when left is newer", () => {
  assert.equal(compareVersions("1.0.10", "1.0.2"), 1);
  assert.equal(compareVersions("2.0", "1.9.9"), 1);
});

test("compareVersions normalizes segment length", () => {
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("1.2.0.0", "1.2"), 0);
});

test("compareVersions throws for invalid format", () => {
  assert.throws(
    () => compareVersions("1.a.0", "1.0.1"),
    (error) => error?.code === "VALIDATION_ERROR"
  );
});
