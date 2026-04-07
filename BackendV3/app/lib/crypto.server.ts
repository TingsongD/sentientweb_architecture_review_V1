import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
export const SECRET_VERSION_PREFIX = "enc:v2:";
export const INSTALL_KEY_PREFIX = "sw_inst_";
export const INSTALL_LINK_CODE_PREFIX = "sw_link_";
export const INSTALL_MANAGEMENT_TOKEN_PREFIX = "sw_mgmt_";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function deriveEncryptionKey(seed: string) {
  return crypto.createHash("sha256").update(seed).digest();
}

function getPrimaryEncryptionSecret() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      isProduction()
        ? "ENCRYPTION_SECRET must be configured in production"
        : "ENCRYPTION_SECRET must be configured",
    );
  }

  return secret;
}

function getLegacyEncryptionSecret() {
  return process.env.SESSION_SECRET ?? null;
}

function encryptWithKey(value: string, key: Buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return iv.toString("hex") + authTag.toString("hex") + encrypted;
}

function decryptWithKey(value: string, key: Buffer) {
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

function tryDecryptWithSecret(value: string, secret: string | null) {
  if (!secret) return null;

  try {
    return decryptWithKey(value, deriveEncryptionKey(secret));
  } catch {
    return null;
  }
}

export function isVersionedEncryptedSecret(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(SECRET_VERSION_PREFIX);
}

export function assertEncryptionSecretConfigured() {
  if (isProduction() && !process.env.ENCRYPTION_SECRET) {
    throw new Error("ENCRYPTION_SECRET must be configured in production");
  }
}

export function encryptSecret(value: string) {
  const secret = getPrimaryEncryptionSecret();
  return (
    SECRET_VERSION_PREFIX + encryptWithKey(value, deriveEncryptionKey(secret))
  );
}

export function decryptSecret(value: string) {
  if (isVersionedEncryptedSecret(value)) {
    const secret = getPrimaryEncryptionSecret();
    return decryptWithKey(
      value.slice(SECRET_VERSION_PREFIX.length),
      deriveEncryptionKey(secret),
    );
  }

  const primarySecret = process.env.ENCRYPTION_SECRET;
  const primaryDecrypted = tryDecryptWithSecret(value, primarySecret ?? null);
  if (primaryDecrypted !== null) {
    return primaryDecrypted;
  }

  const legacyDecrypted = tryDecryptWithSecret(value, getLegacyEncryptionSecret());
  if (legacyDecrypted !== null) {
    return legacyDecrypted;
  }

  if (!primarySecret && isProduction()) {
    throw new Error("ENCRYPTION_SECRET must be configured in production");
  }

  throw new Error("Unable to decrypt secret with the configured encryption keys");
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}

export function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateToken(size = 32) {
  return crypto.randomBytes(size).toString("hex");
}

export function createPublicSiteKey() {
  return `sw_pub_${generateToken(12)}`;
}

export function createPublicInstallKey() {
  return `${INSTALL_KEY_PREFIX}${generateToken(12)}`;
}

export function createInstallLinkCode() {
  return `${INSTALL_LINK_CODE_PREFIX}${generateToken(16)}`;
}

export function createInstallManagementToken() {
  return `${INSTALL_MANAGEMENT_TOKEN_PREFIX}${generateToken(24)}`;
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;

  if (isProduction()) {
    throw new Error("SESSION_SECRET must be configured in production");
  }

  return "development-session-secret";
}

function getWidgetSessionSecret() {
  const secret = process.env.WIDGET_SESSION_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;

  if (isProduction()) {
    throw new Error(
      "WIDGET_SESSION_SECRET or SESSION_SECRET must be configured in production",
    );
  }

  return "development-widget-session-secret";
}

function signPayloadToken(payload: unknown, secret: string) {
  const base = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(base)
    .digest("base64url");
  return `${base}.${sig}`;
}

function verifyPayloadToken<T>(
  token: string | null,
  secret: string,
): T | null {
  if (!token) return null;

  const [base, sig] = token.split(".");
  if (!base || !sig) return null;

  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(base)
      .digest("base64url");
    const actualBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

    return JSON.parse(Buffer.from(base, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export interface VisitorSessionPayload {
  tenantId: string;
  installId: string;
  sessionId: string;
  origin: string;
  issuedAt: number;
  expiresAt: number;
}

export function signVisitorSession(payload: VisitorSessionPayload) {
  return signPayloadToken(payload, getWidgetSessionSecret());
}

export function verifyVisitorSession(token: string | null) {
  const payload = verifyPayloadToken<VisitorSessionPayload>(
    token,
    getWidgetSessionSecret(),
  );
  if (!payload) return null;

  if (
    typeof payload.tenantId !== "string" ||
    typeof payload.installId !== "string" ||
    typeof payload.sessionId !== "string" ||
    typeof payload.origin !== "string" ||
    typeof payload.issuedAt !== "number" ||
    typeof payload.expiresAt !== "number"
  ) {
    return null;
  }

  if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) {
    return null;
  }

  if (Date.now() > payload.expiresAt) return null;
  return payload;
}

export function signAdminSession(payload: {
  tenantId: string;
  adminId: string;
  email: string;
  expiresAt: number;
}) {
  return signPayloadToken(payload, getSessionSecret());
}

export function verifyAdminSession(token: string | null) {
  const payload = verifyPayloadToken<{
    tenantId?: unknown;
    adminId?: unknown;
    email?: unknown;
    expiresAt?: unknown;
  }>(token, getSessionSecret());
  if (!payload) {
    return null;
  }

  if (
    typeof payload.tenantId !== "string" ||
    typeof payload.adminId !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.expiresAt !== "number" ||
    !Number.isFinite(payload.expiresAt)
  ) {
    return null;
  }

  if (Date.now() > payload.expiresAt) return null;
  return {
    tenantId: payload.tenantId,
    adminId: payload.adminId,
    email: payload.email,
    expiresAt: payload.expiresAt,
  };
}
