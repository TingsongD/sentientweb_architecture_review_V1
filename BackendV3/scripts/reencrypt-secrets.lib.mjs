export const SECRET_VERSION_PREFIX = "enc:v2:";

export const TENANT_SECRET_FIELDS = [
  "aiApiKeyEncrypted",
  "calendlyAccessTokenEncrypted",
  "crmWebhookSecretEncrypted",
  "handoffWebhookSecretEncrypted",
];

function formatFailureLine(failure) {
  const tenantLabel = failure.tenantName
    ? `${failure.tenantName} (${failure.tenantId})`
    : failure.tenantId;
  return `Unable to re-encrypt ${failure.field} for ${tenantLabel}: ${failure.error}`;
}

export async function runTenantSecretReencryption({
  prisma,
  dryRun = true,
  log = console.log,
  decryptValue,
  encryptValue,
}) {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      aiApiKeyEncrypted: true,
      calendlyAccessTokenEncrypted: true,
      crmWebhookSecretEncrypted: true,
      handoffWebhookSecretEncrypted: true,
    },
  });

  const summary = {
    tenantsScanned: tenants.length,
    totalFieldSlots: tenants.length * TENANT_SECRET_FIELDS.length,
    emptyFields: 0,
    versionedFields: 0,
    legacyFields: 0,
    reencryptedFields: 0,
    failedFields: 0,
    updatedTenants: 0,
  };

  const failures = [];
  const updates = [];

  for (const tenant of tenants) {
    const data = {};

    for (const field of TENANT_SECRET_FIELDS) {
      const value = tenant[field];
      if (!value) {
        summary.emptyFields += 1;
        continue;
      }

      if (value.startsWith(SECRET_VERSION_PREFIX)) {
        summary.versionedFields += 1;
        continue;
      }

      summary.legacyFields += 1;

      try {
        data[field] = encryptValue(decryptValue(value));
        summary.reencryptedFields += 1;
      } catch (error) {
        summary.failedFields += 1;
        failures.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          field,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (Object.keys(data).length > 0) {
      updates.push({
        tenantId: tenant.id,
        data,
      });
    }
  }

  log(
    `Scanned ${summary.tenantsScanned} tenants across ${summary.totalFieldSlots} secret field slots.`,
  );
  log(
    `Legacy fields: ${summary.legacyFields}. Already versioned: ${summary.versionedFields}. Empty: ${summary.emptyFields}.`,
  );

  for (const failure of failures) {
    log(formatFailureLine(failure));
  }

  if (failures.length > 0) {
    if (!dryRun) {
      log("Aborting apply because some legacy secret values could not be decrypted.");
    }

    const error = new Error(
      `Unable to re-encrypt ${failures.length} legacy secret value(s).`,
    );
    error.summary = summary;
    error.failures = failures;
    throw error;
  }

  if (dryRun) {
    log(
      `Dry run complete. ${updates.length} tenant(s) would be updated and ${summary.reencryptedFields} field(s) would be re-encrypted.`,
    );
    return { summary, updates, failures };
  }

  for (const update of updates) {
    await prisma.tenant.update({
      where: { id: update.tenantId },
      data: update.data,
    });
    summary.updatedTenants += 1;
  }

  log(
    `Apply complete. Updated ${summary.updatedTenants} tenant(s) and re-encrypted ${summary.reencryptedFields} field(s).`,
  );
  return { summary, updates, failures };
}
