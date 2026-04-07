import type { Prisma } from "@prisma/client";
import { createPublicInstallKey, createPublicSiteKey } from "./crypto.server";

type TxClient = Prisma.TransactionClient;

export function defaultBranding() {
  return {
    agentName: "Sentient",
    accentColor: "#0d7a5f",
    launcherLabel: "Ask Sentient",
    tone: "calm, clear, consultative"
  };
}

export function defaultTriggers() {
  return {
    enabled: false,
    rules: [
      {
        id: "pricing-intent",
        name: "Pricing page intent",
        enabled: false,
        pageType: "pricing",
        minTimeOnPageMs: 30000,
        cooldownSeconds: 600,
        message:
          "Questions about pricing? I can help you find the right plan or book a quick walkthrough."
      },
      {
        id: "docs-deep-dive",
        name: "Docs deep dive",
        enabled: false,
        pageType: "docs",
        minTimeOnPageMs: 45000,
        minPagesViewed: 3,
        cooldownSeconds: 900,
        message:
          "Looks like you're deep in the docs. Want a quick answer or a live demo with the team?"
      }
    ]
  };
}

export async function bootstrapTenant(
  input: {
    companyName: string;
    primaryDomain: string;
    adminEmail: string;
    adminName?: string;
  },
  tx: TxClient,
) {
  const defaultOrigin = `https://${input.primaryDomain}`;

  return tx.tenant.create({
    data: {
      name: input.companyName,
      primaryDomain: input.primaryDomain,
      domains: [input.primaryDomain],
      allowedOrigins: [defaultOrigin],
      publicSiteKey: createPublicSiteKey(),
      branding: defaultBranding(),
      triggerConfig: defaultTriggers(),
      admins: {
        create: {
          email: input.adminEmail.toLowerCase().trim(),
          fullName: input.adminName ?? null
        }
      },
      siteInstalls: {
        create: {
          platform: "script",
          label: `${input.primaryDomain} embed`,
          origin: defaultOrigin,
          domain: input.primaryDomain,
          publicInstallKey: createPublicInstallKey(),
          metadata: {
            createdBy: "bootstrap",
          },
        },
      }
    },
    include: {
      admins: true,
      siteInstalls: true,
    }
  });
}
