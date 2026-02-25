import assert from "node:assert/strict";
import test from "node:test";
import { resolveAgreementAcceptance } from "../../src/modules/agreement/services/agreement.service.js";

test("resolveAgreementAcceptance rejects when acceptance is required but checkbox is false", () => {
  assert.throws(
    () =>
      resolveAgreementAcceptance({
        activeAgreement: {
          version: "1.0.0",
          isActive: true,
        },
        agreementAccepted: false,
        agreementVersion: "1.0.0",
        registrationRequireAgreement: true,
      }),
    (error) => error?.code === "AGREEMENT_REQUIRED"
  );
});

test("resolveAgreementAcceptance rejects outdated version", () => {
  assert.throws(
    () =>
      resolveAgreementAcceptance({
        activeAgreement: {
          version: "1.0.1",
          isActive: true,
        },
        agreementAccepted: true,
        agreementVersion: "1.0.0",
        registrationRequireAgreement: true,
      }),
    (error) => error?.code === "AGREEMENT_VERSION_MISMATCH"
  );
});

test("resolveAgreementAcceptance returns payload for valid acceptance", () => {
  const now = new Date("2026-02-24T14:00:00.000Z");
  const result = resolveAgreementAcceptance({
    activeAgreement: {
      version: "1.0.2",
      isActive: true,
    },
    agreementAccepted: true,
    agreementVersion: "1.0.2",
    registrationRequireAgreement: true,
    now,
  });

  assert.equal(result.version, "1.0.2");
  assert.equal(result.acceptedAt.toISOString(), now.toISOString());
});

test("resolveAgreementAcceptance allows skip when requirement disabled", () => {
  const result = resolveAgreementAcceptance({
    activeAgreement: {
      version: "1.0.2",
      isActive: true,
    },
    agreementAccepted: false,
    agreementVersion: undefined,
    registrationRequireAgreement: false,
  });

  assert.equal(result, null);
});
