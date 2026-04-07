import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  SECRET_VERSION_PREFIX,
  assertEncryptionSecretConfigured,
  decryptSecret,
  encryptSecret,
} from "~/lib/crypto.server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveLegacyKey(seed: string) {
  return crypto.createHash("sha256").update(seed).digest();
}

function createLegacyCiphertext(value: string, seed: string) {
  const key = deriveLegacyKey(seed);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return iv.toString("hex") + authTag.toString("hex") + encrypted;
}

describe("secret encryption rollout", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEncryptionSecret = process.env.ENCRYPTION_SECRET;
  const originalSessionSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalEncryptionSecret === undefined) {
      delete process.env.ENCRYPTION_SECRET;
    } else {
      process.env.ENCRYPTION_SECRET = originalEncryptionSecret;
    }

    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it("writes versioned ciphertext with ENCRYPTION_SECRET", () => {
    process.env.ENCRYPTION_SECRET = "encryption-secret";

    const encrypted = encryptSecret("super-secret");

    expect(encrypted.startsWith(SECRET_VERSION_PREFIX)).toBe(true);
    expect(decryptSecret(encrypted)).toBe("super-secret");
  });

  it("decrypts legacy ciphertext via SESSION_SECRET fallback during rollout", () => {
    delete process.env.ENCRYPTION_SECRET;
    process.env.SESSION_SECRET = "legacy-session-secret";

    const legacyCiphertext = createLegacyCiphertext(
      "legacy-secret",
      "legacy-session-secret",
    );

    expect(decryptSecret(legacyCiphertext)).toBe("legacy-secret");
  });

  it("tries ENCRYPTION_SECRET first and then falls back to SESSION_SECRET for legacy ciphertext", () => {
    process.env.ENCRYPTION_SECRET = "new-encryption-secret";
    process.env.SESSION_SECRET = "legacy-session-secret";

    const legacyCiphertext = createLegacyCiphertext(
      "legacy-secret",
      "legacy-session-secret",
    );

    expect(decryptSecret(legacyCiphertext)).toBe("legacy-secret");
  });

  it("does not decrypt versioned ciphertext via SESSION_SECRET fallback", () => {
    process.env.ENCRYPTION_SECRET = "encryption-secret";
    const encrypted = encryptSecret("super-secret");

    delete process.env.ENCRYPTION_SECRET;
    process.env.SESSION_SECRET = "legacy-session-secret";

    expect(() => decryptSecret(encrypted)).toThrow(
      "ENCRYPTION_SECRET must be configured",
    );
  });

  it("fails fast in production when ENCRYPTION_SECRET is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENCRYPTION_SECRET;

    expect(() => assertEncryptionSecretConfigured()).toThrow(
      "ENCRYPTION_SECRET must be configured in production",
    );
    expect(() => encryptSecret("super-secret")).toThrow(
      "ENCRYPTION_SECRET must be configured in production",
    );
  });
});
