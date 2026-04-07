import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SECRET_VERSION_PREFIX,
  runTenantSecretReencryption,
} from "../scripts/reencrypt-secrets.lib.mjs";

describe("tenant secret re-encryption utility", () => {
  const prismaMock = {
    tenant: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const logMock = vi.fn();

  afterEach(() => {
    prismaMock.tenant.findMany.mockReset();
    prismaMock.tenant.update.mockReset();
    logMock.mockReset();
  });

  it("reports dry-run counts without persisting updates", async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      {
        id: "tenant_1",
        name: "Acme",
        aiApiKeyEncrypted: "legacy-ai",
        calendlyAccessTokenEncrypted: null,
        crmWebhookSecretEncrypted: `${SECRET_VERSION_PREFIX}already-new`,
        handoffWebhookSecretEncrypted: "legacy-handoff",
      },
    ]);

    const result = await runTenantSecretReencryption({
      prisma: prismaMock,
      dryRun: true,
      log: logMock,
      decryptValue: (value: string) => `plain:${value}`,
      encryptValue: (value: string) => `${SECRET_VERSION_PREFIX}${value}`,
    });

    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      tenantsScanned: 1,
      legacyFields: 2,
      versionedFields: 1,
      emptyFields: 1,
      reencryptedFields: 2,
      updatedTenants: 0,
    });
    expect(logMock).toHaveBeenCalledWith(
      "Dry run complete. 1 tenant(s) would be updated and 2 field(s) would be re-encrypted.",
    );
  });

  it("updates only legacy fields on apply", async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      {
        id: "tenant_1",
        name: "Acme",
        aiApiKeyEncrypted: "legacy-ai",
        calendlyAccessTokenEncrypted: `${SECRET_VERSION_PREFIX}already-new`,
        crmWebhookSecretEncrypted: null,
        handoffWebhookSecretEncrypted: null,
      },
    ]);

    const result = await runTenantSecretReencryption({
      prisma: prismaMock,
      dryRun: false,
      log: logMock,
      decryptValue: (value: string) => `plain:${value}`,
      encryptValue: (value: string) => `${SECRET_VERSION_PREFIX}${value}`,
    });

    expect(prismaMock.tenant.update).toHaveBeenCalledWith({
      where: { id: "tenant_1" },
      data: {
        aiApiKeyEncrypted: `${SECRET_VERSION_PREFIX}plain:legacy-ai`,
      },
    });
    expect(result.summary).toMatchObject({
      updatedTenants: 1,
      reencryptedFields: 1,
      failedFields: 0,
    });
  });

  it("aborts apply when a legacy value cannot be decrypted", async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      {
        id: "tenant_1",
        name: "Acme",
        aiApiKeyEncrypted: "legacy-ai",
        calendlyAccessTokenEncrypted: null,
        crmWebhookSecretEncrypted: null,
        handoffWebhookSecretEncrypted: null,
      },
    ]);

    await expect(
      runTenantSecretReencryption({
        prisma: prismaMock,
        dryRun: false,
        log: logMock,
        decryptValue: () => {
          throw new Error("bad ciphertext");
        },
        encryptValue: (value: string) => `${SECRET_VERSION_PREFIX}${value}`,
      }),
    ).rejects.toThrow("Unable to re-encrypt 1 legacy secret value(s).");

    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      "Aborting apply because some legacy secret values could not be decrypted.",
    );
  });
});
