import type { MetadataRoute } from "next";

export interface ProductPage {
  slug: string;
  href: `/product/${string}`;
  label: string;
  description: string;
  icon: string;
  includeInFooter: boolean;
  includeInSitemap: boolean;
  featuredInHeader: boolean;
  sitemap: {
    changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
    priority: number;
  };
}

export const productPages: ProductPage[] = [
  {
    slug: "lead-qualification",
    href: "/product/lead-qualification",
    label: "Lead Qualification",
    description: "BANT-lite scoring for SDRs",
    icon: "👤",
    includeInFooter: true,
    includeInSitemap: true,
    featuredInHeader: true,
    sitemap: {
      changeFrequency: "monthly",
      priority: 0.9,
    },
  },
  {
    slug: "demo-booking",
    href: "/product/demo-booking",
    label: "Demo Booking",
    description: "Native Calendly integration",
    icon: "📅",
    includeInFooter: true,
    includeInSitemap: true,
    featuredInHeader: true,
    sitemap: {
      changeFrequency: "monthly",
      priority: 0.9,
    },
  },
  {
    slug: "knowledge-base",
    href: "/product/knowledge-base",
    label: "Knowledge Base",
    description: "Hybrid RAG with high precision",
    icon: "📚",
    includeInFooter: true,
    includeInSitemap: true,
    featuredInHeader: true,
    sitemap: {
      changeFrequency: "monthly",
      priority: 0.9,
    },
  },
  {
    slug: "api-sdks",
    href: "/product/api-sdks",
    label: "APIs & SDKs",
    description: "Build with Python, TS, and Go",
    icon: "⚙️",
    includeInFooter: true,
    includeInSitemap: true,
    featuredInHeader: true,
    sitemap: {
      changeFrequency: "monthly",
      priority: 0.8,
    },
  },
  {
    slug: "documentation",
    href: "/product/documentation",
    label: "Documentation",
    description: "Comprehensive integration guides",
    icon: "📄",
    includeInFooter: true,
    includeInSitemap: true,
    featuredInHeader: true,
    sitemap: {
      changeFrequency: "monthly",
      priority: 0.8,
    },
  },
  {
    slug: "changelog",
    href: "/product/changelog",
    label: "Changelog",
    description: "Daily shipment & feature logs",
    icon: "🚀",
    includeInFooter: true,
    includeInSitemap: true,
    featuredInHeader: true,
    sitemap: {
      changeFrequency: "monthly",
      priority: 0.8,
    },
  },
];
