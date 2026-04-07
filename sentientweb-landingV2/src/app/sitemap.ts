import type { MetadataRoute } from "next";
import { productPages } from "@/config/products";
import { getSiteUrl } from "@/config/site";
import { solutions } from "@/config/solutions";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();
  
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    ...productPages
      .filter((page) => page.includeInSitemap)
      .map((page) => ({
        url: `${base}${page.href}`,
        lastModified,
        changeFrequency: page.sitemap.changeFrequency,
        priority: page.sitemap.priority,
      })),
  ];

  const solutionPages: MetadataRoute.Sitemap = solutions.map((s) => ({
    url: `${base}/solutions/${s.slug}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticPages, ...solutionPages];
}
