import type { SiteInstall, Tenant } from "@prisma/client";
import { getTenantTriggerRules } from "./triggers.server";

export function buildWidgetClientConfig(input: {
  tenant: Tenant;
  install: SiteInstall;
  visitor?: {
    sessionId: string;
    visitorToken: string;
    expiresAt: string;
  };
}) {
  const branding = input.tenant.branding as {
    agentName?: string;
    accentColor?: string;
    launcherLabel?: string;
  };

  return {
    tenant: {
      id: input.tenant.id,
      name: input.tenant.name,
      primaryDomain: input.tenant.primaryDomain,
    },
    install: {
      id: input.install.id,
      key: input.install.publicInstallKey,
      platform: input.install.platform,
      origin: input.install.origin,
      label: input.install.label,
      pluginVersion: input.install.pluginVersion,
    },
    siteKey: input.tenant.publicSiteKey,
    installKey: input.install.publicInstallKey,
    branding,
    proactiveMode: input.tenant.proactiveMode,
    qualificationPrompts: Array.isArray(input.tenant.qualificationPrompts)
      ? input.tenant.qualificationPrompts
      : [],
    triggerRules: getTenantTriggerRules(input.tenant),
    visitor: input.visitor ?? null,
    endpoints: {
      bootstrap: "/api/widget/bootstrap",
      widgetConfig: "/api/widget-config",
      events: "/api/events",
      agentMessage: "/api/agent/message",
    },
    assets: {
      agent: "/agent.js",
      observer: "/widget/observer.js",
      widget: "/widget/widget.js",
      css: "/widget/widget.css",
      mouseTracker: "/widget/mouse-tracker.js",
    },
  };
}
