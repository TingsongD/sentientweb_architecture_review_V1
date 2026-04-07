import type { Metadata } from "next";

/**
 * Site-wide SEO and brand copy. Keep in sync with `pitch_deck_content.md` (SEO section).
 */
export const siteConfig = {
  name: "SentientWeb",
  legalName: "SentientWeb",
  /** Default <title> when no route-specific title is set */
  defaultTitle: "SentientWeb — The Autonomous Website Agent",
  titleTemplate: "%s | SentientWeb",
  /** Primary meta description (~155–160 chars for SERP) */
  description:
    "Platform-agnostic AI that qualifies inbound leads, books demos, answers product questions from your docs, and takes action on your website — 24/7. Phase 1: lead qualification & demo booking.",
  keywords: [
    "autonomous website agent",
    "AI sales assistant",
    "lead qualification",
    "B2B SaaS",
    "demo booking",
    "Calendly integration",
    "knowledge base AI",
    "hybrid RAG",
    "inbound conversion",
    "SentientWeb",
  ],
  locale: "en_US",
  twitterSite: "@SentientWeb",
  /** Shown in mailto links for demo / contact CTAs */
  contactEmail: "hello@sentientweb.com",
  calendlyEventUrlFallback: "https://calendly.com/sentientweb",
  defaultSocialImagePath: "/seo/og-default.png",
  defaultSocialImageAlt: "SentientWeb social preview",
} as const;

interface PageMetadataOptions {
  path: string;
  title: string;
  description: string;
  socialTitle?: string;
}

function normalizeMetadataPath(path: string): string {
  if (path === "/") return "/";

  const trimmedPath = path.replace(/^\/+|\/+$/g, "");
  return `/${trimmedPath}`;
}

export function buildPageMetadata({
  path,
  title,
  description,
  socialTitle,
}: PageMetadataOptions): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  const metadataPath = normalizeMetadataPath(path);
  const resolvedSocialTitle = socialTitle ?? title;
  const socialImage = {
    url: siteConfig.defaultSocialImagePath,
    width: 1200,
    height: 630,
    alt: siteConfig.defaultSocialImageAlt,
  };

  return {
    alternates: {
      canonical: metadataPath,
    },
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: metadataPath,
      siteName: siteConfig.name,
      title: resolvedSocialTitle,
      description,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      site: siteConfig.twitterSite,
      title: resolvedSocialTitle,
      description,
      images: [siteConfig.defaultSocialImagePath],
    },
  };
}

function normalizeAbsoluteUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
      try {
        return new URL(`https://${trimmed}`).toString().replace(/\/$/, "");
      } catch {
        return null;
      }
    }

    return null;
  }
}

export function getSiteUrl(): string {
  const explicit = normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (explicit) return explicit;

  const renderExternal = normalizeAbsoluteUrl(process.env.RENDER_EXTERNAL_URL ?? "");
  const vercelUrl = normalizeAbsoluteUrl(process.env.VERCEL_URL ?? "");
  const previewFallback = renderExternal ?? vercelUrl;
  const isPreviewDeployment =
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERCEL_ENV === "development" ||
    (process.env.IS_PULL_REQUEST !== undefined &&
      process.env.IS_PULL_REQUEST !== "false" &&
      process.env.IS_PULL_REQUEST !== "0");

  if (process.env.NODE_ENV === "production" && !isPreviewDeployment) {
    throw new Error(
      "[SentientWeb] NEXT_PUBLIC_SITE_URL must be set in production so canonicals, sitemaps, and JSON-LD use the primary domain.",
    );
  }

  if (previewFallback) return previewFallback;

  return "http://localhost:3000";
}

export function getCalendlyEventUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CALENDLY_EVENT_URL?.trim();

  if (explicit) {
    try {
      return new URL(explicit).toString();
    } catch {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[SentientWeb] NEXT_PUBLIC_CALENDLY_EVENT_URL is invalid, using fallback");
      }
      return siteConfig.calendlyEventUrlFallback;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("[SentientWeb] NEXT_PUBLIC_CALENDLY_EVENT_URL is not set, using fallback");
  }
  return siteConfig.calendlyEventUrlFallback;
}

export function getSentientWidgetEmbedConfig(): {
  agentScriptUrl: string;
  backendOrigin: string;
  installKey: string;
} | null {
  const backendOrigin = normalizeAbsoluteUrl(
    process.env.NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN ?? "",
  );
  const installKey = process.env.NEXT_PUBLIC_SENTIENT_INSTALL_KEY?.trim() ?? "";

  if (!backendOrigin || !installKey) {
    if (
      process.env.NODE_ENV !== "production" &&
      (process.env.NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN ||
        process.env.NEXT_PUBLIC_SENTIENT_INSTALL_KEY)
    ) {
      console.warn(
        "[SentientWeb] Widget embed config is incomplete. Set both NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN and NEXT_PUBLIC_SENTIENT_INSTALL_KEY.",
      );
    }

    return null;
  }

  return {
    backendOrigin,
    agentScriptUrl: `${backendOrigin}/agent.js`,
    installKey,
  };
}
