import { beforeEach, describe, expect, it } from "vitest";

// Set before the first encrypt/decrypt call - getKey() reads the env
// lazily, so this doesn't need to beat the import.
process.env.BUSINESS_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");

import { encryptSecret, decryptSecret } from "@/lib/secrets";
import {
  redactKnownSecrets,
  __resetKnownSecretsForTests,
} from "@/lib/secret-registry";

const context = {
  provider: "aade_mydata",
  credentialKey: "subscription_key",
  environment: "sandbox",
};

describe("encryptSecret / decryptSecret", () => {
  beforeEach(() => {
    __resetKnownSecretsForTests();
  });

  it("round-trips a value", () => {
    const secret = "aade-subscription-key-abc123";
    expect(decryptSecret(encryptSecret(secret, context), context)).toBe(secret);
  });

  it("produces different ciphertext each time for the same plaintext", () => {
    const secret = "aade-subscription-key-abc123";
    const first = encryptSecret(secret, context);
    const second = encryptSecret(secret, context);

    // A fresh IV per call - identical ciphertext would leak that two
    // credentials are the same value.
    expect(first).not.toBe(second);
    expect(decryptSecret(first, context)).toBe(secret);
    expect(decryptSecret(second, context)).toBe(secret);
  });

  it("throws on a value with no version prefix instead of returning it as plaintext", () => {
    // The dangerous fallback would be "unrecognised, so assume legacy
    // plaintext and hand it back" - that turns the column into a
    // passthrough and skips tag verification entirely.
    expect(() => decryptSecret("plain-text-value", context)).toThrow(
      /not in a recognised encrypted format/i,
    );
  });

  it("throws on an unknown version prefix", () => {
    const stored = encryptSecret("value", context).replace(/^v1:/, "v2:");
    expect(() => decryptSecret(stored, context)).toThrow(
      /not in a recognised encrypted format/i,
    );
  });

  it("throws when the ciphertext has been tampered with", () => {
    const stored = encryptSecret("aade-subscription-key", context);
    const parts = stored.split(":");
    const ciphertext = Buffer.from(parts[3], "base64");
    ciphertext[0] ^= 0xff;
    parts[3] = ciphertext.toString("base64");

    expect(() => decryptSecret(parts.join(":"), context)).toThrow();
  });

  it("throws on a malformed authentication tag", () => {
    const parts = encryptSecret("value", context).split(":");
    parts[2] = Buffer.from("short").toString("base64");

    expect(() => decryptSecret(parts.join(":"), context)).toThrow(
      /malformed IV or authentication tag/i,
    );
  });

  it("refuses to decrypt a blob promoted from another environment's row", () => {
    // Without AAD binding, a sandbox ciphertext could be pasted into the
    // production row and would decrypt cleanly.
    const stored = encryptSecret("sandbox-key", context);

    expect(() =>
      decryptSecret(stored, { ...context, environment: "production" }),
    ).toThrow();
  });

  it("refuses to decrypt a blob promoted to a different credential key", () => {
    const stored = encryptSecret("some-key", context);

    expect(() =>
      decryptSecret(stored, { ...context, credentialKey: "user_id" }),
    ).toThrow();
  });
});

describe("secret registry", () => {
  beforeEach(() => {
    __resetKnownSecretsForTests();
  });

  it("redacts a decrypted secret that leaked into a message", () => {
    const secret = "aade-subscription-key-abc123";
    decryptSecret(encryptSecret(secret, context), context);

    expect(
      redactKnownSecrets(`myDATA call failed with key ${secret} - 401`),
    ).toBe("myDATA call failed with key [redacted-secret] - 401");
  });

  it("leaves unrelated text alone", () => {
    expect(redactKnownSecrets("nothing sensitive here")).toBe(
      "nothing sensitive here",
    );
  });
});
