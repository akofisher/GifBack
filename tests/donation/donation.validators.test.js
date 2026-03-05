import assert from "node:assert/strict";
import test from "node:test";
import {
  DONATION_METHOD_CONTACT_CONFLICT,
  DONATION_METHOD_CONTACT_REQUIRED,
  parseUpsertDonationConfigPayload,
} from "../../src/modules/donation/validators/donation.validators.js";

test("PATCH donations payload accepts accountNumber-only method", () => {
  const payload = parseUpsertDonationConfigPayload({
    methods: [
      {
        label: "Bank Transfer",
        accountNumber: " GE00TB000000000000 ",
        isActive: true,
        order: 1,
      },
    ],
  });

  assert.equal(payload.methods[0].label, "Bank Transfer");
  assert.equal(payload.methods[0].accountNumber, "GE00TB000000000000");
  assert.equal(payload.methods[0].link, undefined);
});

test("PATCH donations payload accepts link-only method", () => {
  const payload = parseUpsertDonationConfigPayload({
    methods: [
      {
        label: "Donate via URL",
        link: "https://example.com/donate",
        isActive: true,
        order: 1,
      },
    ],
  });

  assert.equal(payload.methods[0].label, "Donate via URL");
  assert.equal(payload.methods[0].accountNumber, undefined);
  assert.equal(payload.methods[0].link, "https://example.com/donate");
});

test("PATCH donations payload rejects both accountNumber and link", () => {
  assert.throws(
    () =>
      parseUpsertDonationConfigPayload({
        methods: [
          {
            label: "Conflicting Method",
            accountNumber: "GE00TB000000000000",
            link: "https://example.com/donate",
          },
        ],
      }),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.code, DONATION_METHOD_CONTACT_CONFLICT);
      return true;
    }
  );
});

test("PATCH donations payload rejects when both accountNumber and link are missing", () => {
  assert.throws(
    () =>
      parseUpsertDonationConfigPayload({
        methods: [
          {
            label: "Missing Contact Method",
          },
        ],
      }),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.code, DONATION_METHOD_CONTACT_REQUIRED);
      return true;
    }
  );
});
