import type { Tenant } from "@prisma/client";

export interface TriggerRule {
  id: string;
  name: string;
  enabled: boolean;
  pageType: "pricing" | "docs";
  minTimeOnPageMs: number;
  minPagesViewed?: number;
  cooldownSeconds: number;
  message: string;
}

export function getTenantTriggerRules(tenant: Tenant): TriggerRule[] {
  const raw = tenant.triggerConfig as { enabled?: boolean; rules?: TriggerRule[] } | null;
  const defaults: TriggerRule[] = [
    {
      id: "pricing-intent",
      name: "Pricing page intent",
      enabled: false,
      pageType: "pricing",
      minTimeOnPageMs: 30_000,
      cooldownSeconds: 600,
      message: "Questions about pricing? I can help you find the right plan or book a short walkthrough."
    },
    {
      id: "docs-deep-dive",
      name: "Docs deep dive",
      enabled: false,
      pageType: "docs",
      minTimeOnPageMs: 45_000,
      minPagesViewed: 3,
      cooldownSeconds: 900,
      message: "Looks like you're deep in the docs. Want a quick answer or a live demo with the team?"
    }
  ];

  if (!raw?.rules?.length) {
    return defaults;
  }

  return raw.rules;
}

export function evaluateTriggers(input: {
  tenant: Tenant;
  sessionId: string;
  event: {
    eventType: string;
    pageUrl?: string;
    payload: Record<string, unknown>;
  };
  recentlyTriggered: Set<string>;
}) {
  const rules = getTenantTriggerRules(input.tenant).filter((rule) => rule.enabled);
  if (input.tenant.proactiveMode === "reactive_only") return null;
  if (input.event.eventType !== "intent_snapshot") return null;

  const pageType = String(input.event.payload.pageType ?? "");
  const timeOnPageMs = Number(input.event.payload.timeOnPageMs ?? 0);
  const pagesViewed = Number(input.event.payload.pagesViewed ?? 0);

  for (const rule of rules) {
    if (input.recentlyTriggered.has(rule.id)) continue;
    if (rule.pageType !== pageType) continue;
    if (timeOnPageMs < rule.minTimeOnPageMs) continue;
    if (rule.minPagesViewed && pagesViewed < rule.minPagesViewed) continue;

    return {
      id: rule.id,
      message: rule.message,
      cooldownSeconds: rule.cooldownSeconds
    };
  }

  return null;
}
