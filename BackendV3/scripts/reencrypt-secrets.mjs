import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  runTenantSecretReencryption,
  SECRET_VERSION_PREFIX,
} from "./reencrypt-secrets.lib.mjs";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveEncryptionKey(seed) {
  return crypto.createHash("sha256").update(seed).digest();
}

function decryptWithKey(value, key) {
  const ivHex = value.slice(0, IV_LENGTH * 2);
  const authTagHex = value.slice(
    IV_LENGTH * 2,
    (IV_LENGTH + AUTH_TAG_LENGTH) * 2,
  );
  const encryptedHex = value.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptWithKey(value, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return iv.toString("hex") + authTag.toString("hex") + encrypted;
}

function tryDecryptWithSecret(value, secret) {
  if (!secret) return null;

  try {
    return decryptWithKey(value, deriveEncryptionKey(secret));
  } catch {
    return null;
  }
}

const encryptionSecret = process.env.ENCRYPTION_SECRET ?? null;
const legacySessionSecret = process.env.SESSION_SECRET ?? null;

function requireEncryptionSecret() {
  if (!encryptionSecret) {
    throw new Error(
      "ENCRYPTION_SECRET must be configured to re-encrypt tenant secrets.",
    );
  }

  return encryptionSecret;
}

function decryptLegacyValue(value) {
  const primaryDecrypted = tryDecryptWithSecret(value, requireEncryptionSecret());
  if (primaryDecrypted !== null) {
    return primaryDecrypted;
  }

  const legacyDecrypted = tryDecryptWithSecret(value, legacySessionSecret);
  if (legacyDecrypted !== null) {
    return legacyDecrypted;
  }

  throw new Error(
    "Unable to decrypt the legacy secret with ENCRYPTION_SECRET or SESSION_SECRET.",
  );
}

function encryptVersionedValue(value) {
  return (
    SECRET_VERSION_PREFIX +
    encryptWithKey(value, deriveEncryptionKey(requireEncryptionSecret()))
  );
}

const dryRun = !process.argv.includes("--apply");
const prisma = new PrismaClient();

try {
  requireEncryptionSecret();
  await runTenantSecretReencryption({
    prisma,
    dryRun,
    decryptValue: decryptLegacyValue,
    encryptValue: encryptVersionedValue,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
