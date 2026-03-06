import assert from "node:assert/strict";
import test from "node:test";
import { addReportCommentSchema } from "../../src/modules/reports/validators/report.validators.js";

test("addReportCommentSchema accepts comment payload", () => {
  const parsed = addReportCommentSchema.parse({ comment: "  Needs manual review  " });
  assert.equal(parsed.text, "Needs manual review");
});

test("addReportCommentSchema accepts text payload for backward compatibility", () => {
  const parsed = addReportCommentSchema.parse({ text: "Looks suspicious" });
  assert.equal(parsed.text, "Looks suspicious");
});

test("addReportCommentSchema rejects empty payload", () => {
  assert.throws(() => addReportCommentSchema.parse({}), {
    name: "ZodError",
  });
});
