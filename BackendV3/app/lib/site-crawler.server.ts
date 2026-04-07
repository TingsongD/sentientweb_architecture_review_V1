import { load } from "cheerio";
import robotsParser from "robots-parser";
import { fetchWithTimeout, safeFetch, assertAllowedOutboundUrl } from "./outbound-url.server";
import { logger } from "~/utils";

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
  depth: number;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
}

function cleanText(html: string) {
  const $ = load(html);
  // Remove common boilerplate and noise including sidebars and navs
  $(
    "script, style, noscript, svg, footer, nav, header, form, iframe, .nav, .footer, .header, .sidebar, .menu, .ad, .advertisement, .social, .sharing, [role='banner'], [role='navigation'], [role='contentinfo'], [role='complementary'], [role='search'], .theme-doc-sidebar-container, .gitbook-navigation, .nextra-sidebar, .mintlify-sidebar"
  ).remove();

  const title = $("title").first().text().trim() || $("h1").first().text().trim();

  // Try to find the main content area with platform-specific selectors
  let contentElement = $(
    "main, [role='main'], article, .content, #content, .theme-doc-markdown, .markdown-section, .gitbook-markdown, .nextra-content, .mintlify-content"
  ).first();
  if (contentElement.length === 0) {
    contentElement = $("body");
  }

  const text = contentElement
    .text()
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();

  return {
    title,
    text
  };
}

export async function crawlSite(rootUrl: string, options: CrawlOptions = {}) {
  const maxPages = options.maxPages ?? 200;
  const maxDepth = options.maxDepth ?? 3;
  const CONCURRENCY = 5;

  const root = await assertAllowedOutboundUrl(rootUrl);
  const origin = root.origin;
  const robotsUrl = `${origin}/robots.txt`;

  let robots = robotsParser(robotsUrl, "");
  try {
    const robotsRes = await fetchWithTimeout(robotsUrl, {}, {
      timeoutMs: 10_000,
      purpose: "robots.txt fetch"
    });
    if (robotsRes.ok) {
      robots = robotsParser(robotsUrl, await robotsRes.text());
    }
  } catch (error) {
    logger.warn("Unable to load robots.txt; continuing with crawl", { rootUrl, error: String(error) });
  }

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: root.toString(), depth: 0 }];
  const pages: CrawledPage[] = [];

  const processPage = async (current: { url: string; depth: number }) => {
    if (visited.has(current.url) || current.depth > maxDepth) return;
    if (!robots.isAllowed(current.url, "SentientWebBot")) return;

    visited.add(current.url);

    try {
      const response = await safeFetch(current.url, {
        headers: { "User-Agent": "SentientWebBot/0.1 (+https://sentientweb.ai)" },
        signal: AbortSignal.timeout(10000) // 10s timeout
      }, {
        allowedOrigin: origin,
        timeoutMs: 10_000,
        purpose: "Site crawl"
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("text/html")) return;

      const html = await response.text();
      const { title, text } = cleanText(html);
      if (text.length > 200) {
        pages.push({
          url: current.url,
          title: title || new URL(current.url).pathname,
          text,
          depth: current.depth
        });
      }

      const $ = load(html);
      $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (!href) return;
        try {
          const next = new URL(href, response.url || current.url);
          if (next.origin !== origin) return;
          if (visited.has(next.toString())) return;
          // Filter out hash links and common non-html links
          if (next.hash) return;
          if (next.pathname.match(/\.(jpg|jpeg|png|gif|pdf|zip|gz|exe)$/i)) return;

          queue.push({ url: next.toString(), depth: current.depth + 1 });
        } catch {
          // Ignore malformed links.
        }
      });
    } catch (error) {
      logger.warn("Failed to crawl page", { url: current.url, error: String(error) });
    }
  };

  while (queue.length > 0 && pages.length < maxPages) {
    const batch = [];
    while (queue.length > 0 && batch.length < CONCURRENCY) {
      const item = queue.shift();
      if (item) batch.push(item);
    }

    await Promise.all(batch.map((item) => processPage(item)));
  }

  return pages;
}
