# Frontend Architecture Handoff

This document is the detailed frontend architecture handoff for a new engineer.

If you want the short summary of the role change for this repo, read:

- `docs/FRONTEND_EMBED_HANDOFF.md`

This document explains the actual structure of the landing application.

## What SentientWeb Is

SentientWeb is an AI-powered B2B sales agent that embeds in customer websites. It qualifies visitors in real time, books demos on Calendly, and pushes lead data to CRM systems. The backend (`BackendV3`) owns all of that logic. This repo is the marketing site that describes the product and loads the backend widget.

## What This Repo Is

`sentientweb-landingV2` is a Next.js App Router marketing site.

It is intentionally thin.

Its primary jobs are:

- render marketing pages
- publish SEO metadata
- expose sitemap and robots
- organize product and solutions content
- load the backend-owned widget embed

It does not own product runtime logic anymore.

## Day 1 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set required env vars (copy .env.example if it exists)
export NEXT_PUBLIC_SITE_URL=https://sentientweb.com
export NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN=http://localhost:3000   # point at local BackendV3
export NEXT_PUBLIC_SENTIENT_INSTALL_KEY=sw_inst_xxx               # from BackendV3 /admin/installs

# 3. Run dev server
npm run dev
```

The widget will not load without a running BackendV3 instance. For pure marketing-copy work you can ignore the widget entirely — the pages render fine without it.

Full verification (runs lint + typecheck + build):

```bash
NEXT_PUBLIC_SITE_URL=https://sentientweb.com \
NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN=https://backend.sentientweb.com \
NEXT_PUBLIC_SENTIENT_INSTALL_KEY=sw_inst_demo \
npm run check
```

## High-Level Topology

```text
Visitor
  |
  v
Next.js App Router Site
  - layouts
  - static pages
  - config-driven content
  - metadata
  - widget embed script tag
  |
  +--------------------------+
  |                          |
  v                          v
Rendered HTML/CSS         Backend Widget Script
                          - /agent.js
                          - visitor auth
                          - chat runtime
```

The frontend is mostly static content plus one shared backend widget embed.

## Core Architectural Decision

The most important architecture rule in this repo is:

> The site is treated like a third-party client website, even though it is first-party.

That means:

- this repo should not implement local chat orchestration
- this repo should not own widget auth
- this repo should not fork or duplicate backend qualification/booking logic
- the backend embed contract is the canonical runtime path

It also means multi-client customization and data separation are backend concerns:

- one client should map to one backend tenant
- this repo does not separate customer data
- client-specific prompts, secrets, and AI behavior belong in the backend tenant settings, not in frontend page code

## Top-Level Code Layout

### `src/app`

App Router routes, layouts, global CSS, metadata routes, and page entry points.

Key files:

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/product/layout.tsx`
- `src/app/robots.ts`
- `src/app/sitemap.ts`

### `src/components`

Reusable page sections and shared UI components.

Key files:

- `Header.tsx`
- `Footer.tsx`
- `HeroSection.tsx`
- `FeaturesSection.tsx`
- `CTASection.tsx`
- `SolutionTemplate.tsx`
- `SentientWidgetEmbed.tsx`

### `src/config`

Site-wide structured content and metadata helpers.

Key files:

- `site.ts`
- `products.ts`
- `solutions.ts`

### `src/lib`

Small frontend utilities only.

Key files:

- `utils.ts`
- `errors.ts`

## Rendering Model

This app is mostly static.

You can think about it as a content-driven site with these page families:

### 1. Home page

File:

- `src/app/page.tsx`

Composes:

- `Header`
- `HeroSection`
- `FeaturesSection`
- `CTASection`
- `Footer`

### 2. Product pages

Files:

- `src/app/product/layout.tsx`
- `src/app/product/*/page.tsx`

These are content pages under `/product/*`.

They share header/footer through the product layout.

### 3. Solutions pages

File:

- `src/app/solutions/[slug]/page.tsx`

These are config-driven pages built from `src/config/solutions.ts` and rendered through `SolutionTemplate.tsx`.

This is the most reusable page-generation path in the repo.

### 4. Legal/SEO utility routes

Files:

- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`
- `src/app/robots.ts`
- `src/app/sitemap.ts`

## Route And Layout Structure

## Root layout

File:

- `src/app/layout.tsx`

Responsibilities:

- global font setup
- global metadata shell
- viewport config
- site-wide JSON-LD
- skip link
- mount the shared widget embed

This is the application shell.

Because the widget embed is mounted here, every page gets the same backend widget behavior.

## Product layout

File:

- `src/app/product/layout.tsx`

Responsibilities:

- shared header
- shared footer
- shared `main` structure for product pages

## Dynamic solutions page

Files:

- `src/app/solutions/[slug]/page.tsx`
- `src/config/solutions.ts`
- `src/components/SolutionTemplate.tsx`

Responsibilities:

- read the config entry by slug
- generate metadata
- render a templated industry page

This is the clearest example of config-driven page generation in the repo.

## Content Architecture

This repo is intentionally content-first.

Most page behavior is driven from config rather than fetched from a CMS or backend.

## `src/config/site.ts`

This file owns:

- site identity
- default titles
- metadata helpers
- canonical URL resolution
- social metadata defaults
- Calendly CTA URL resolution
- backend widget embed env resolution

Important functions:

- `buildPageMetadata`
- `getSiteUrl`
- `getCalendlyEventUrl`
- `getSentientWidgetEmbedConfig`

If metadata or host URLs are wrong, start here.

## `src/config/products.ts`

This file is the source of truth for product navigation and sitemap metadata for product pages.

It defines:

- product slugs
- labels
- descriptions
- footer/header visibility
- sitemap priorities

If product nav or sitemap behavior changes, start here.

## `src/config/solutions.ts`

This file is the structured data source for solution pages.

It defines:

- slug
- industry
- hero copy
- problem statements
- feature blocks
- metrics
- CTA copy

If a new industry page needs to be added quickly, this is usually the first place to edit.

## UI Component Architecture

The component layer is simple and mostly presentational.

## Shared structural components

- `Header.tsx`
- `Footer.tsx`

These provide nav and footer structure and consume config-driven page lists.

## Homepage sections

- `HeroSection.tsx`
- `FeaturesSection.tsx`
- `CTASection.tsx`

These are mostly self-contained presentational sections.

## Templated industry pages

- `SolutionTemplate.tsx`

This is the largest reusable marketing template in the repo.

It renders:

- hero
- stats
- problem section
- solution features
- results section
- final CTA

The data comes from `solutions.ts`, not from remote APIs.

## Widget Boundary

The widget boundary is extremely important.

## What lives in this repo

- a small embed component
- environment-driven script URL and install key resolution
- mounting that embed in the layout

## What does not live in this repo

- widget identity logic
- visitor session auth
- chat state
- qualification logic
- booking logic
- CRM logic
- event tracking rules

This repo never handles the signed `visitorToken` directly. It only loads backend `/agent.js`; the backend bootstrap flow owns install/origin validation and visitor-session rotation.

It also does not interpret backend SSE protocol details directly. The backend widget runtime handles stream recovery, including the terminal generic `STREAM_FAILED` event used when a chat stream breaks after it starts.

## Embed implementation

Files:

- `src/components/SentientWidgetEmbed.tsx`
- `src/config/site.ts`
- `src/app/layout.tsx`

Flow:

1. `getSentientWidgetEmbedConfig()` reads env vars.
2. `SentientWidgetEmbed` renders a Next.js `Script`.
3. That script loads backend `/agent.js`.
4. The backend widget platform takes over from there.

This is intentionally very thin.

## What Was Removed

The old local widget implementation was removed.

Deleted files:

- `src/components/ChatBox.tsx`
- `src/app/actions/chat.ts`

That old design made the frontend special and duplicated product logic.

That should not be reintroduced accidentally.

## Metadata And SEO Architecture

SEO is a first-class concern in this repo.

## Metadata generation

Most pages use:

- `buildPageMetadata()` from `src/config/site.ts`

This centralizes:

- canonical paths
- Open Graph
- Twitter card defaults

## Root metadata

`src/app/layout.tsx` sets:

- `metadataBase`
- app-wide title template
- description
- keywords
- robots
- JSON-LD

## Sitemap

`src/app/sitemap.ts` builds the sitemap from:

- base site URL
- static pages
- `productPages`
- `solutions`

This means the sitemap is partly config-driven.

## Robots

`src/app/robots.ts` publishes:

- allow-all rules
- sitemap location
- canonical host

If canonical URL bugs show up, inspect:

- `src/config/site.ts`
- `src/app/sitemap.ts`
- `src/app/robots.ts`

## Environment Model

There are three important environment areas.

## 1. Canonical site URL

- `NEXT_PUBLIC_SITE_URL`

This is required in production-style builds so metadata and sitemap values are correct.

## 2. Backend widget embed

- `NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN`
- `NEXT_PUBLIC_SENTIENT_INSTALL_KEY`

`NEXT_PUBLIC_SENTIENT_INSTALL_KEY` is intentionally public. It is an install identifier, not a shared secret. The backend still enforces:

- origin matching during bootstrap
- signed visitor-token auth for runtime APIs
- install/session checks on every event and chat request

The matching backend operator config expects bare HTTPS origins only. If this site changes domains, the backend `allowedOrigins` entry should look like `https://www.sentientweb.com`, not a path-scoped URL.

If either is missing, the site can still render, but the embedded widget will not load.

If the widget loads but a chat stream fails mid-reply, the browser fallback is still fully backend-owned through `widget.js`; this repo should not add its own duplicate stream-error handling around the embed.

## 3. Static demo CTA booking

- `NEXT_PUBLIC_CALENDLY_EVENT_URL`

This is separate from the backend widget booking flow.

Use this only for non-widget marketing CTAs.

## Next.js Runtime Characteristics

## Framework

- Next.js 16
- App Router
- React 19

## Build/deploy

- `output: "standalone"` in `next.config.mjs`
- Turbopack root pinned to project directory

## Rendering style

Most pages are statically generated.

This keeps the site fast and operationally simple.

## Page Creation Patterns

## To add a new product page

1. Add an entry in `src/config/products.ts` if it should appear in nav/footer/sitemap.
2. Add a route file under `src/app/product/<slug>/page.tsx`.
3. Use `buildPageMetadata()` for metadata.

## To add a new solution page

1. Add a new object in `src/config/solutions.ts`.
2. Make sure the slug is unique.
3. The dynamic `[slug]` page and `SolutionTemplate` will render it.

This is the fastest page path in the repo.

## To change the global widget embed

Do not add local chat code.

Instead:

1. Update env/config resolution in `src/config/site.ts` if needed.
2. Update `SentientWidgetEmbed.tsx` only if the embed contract changes.
3. Coordinate backend changes in `BackendV3`.

## Safe Places To Work

This repo is safe for:

- marketing copy
- layout
- navigation
- design system tweaks
- metadata
- sitemap/robots
- config-driven page additions

This repo is not the right place for:

- visitor auth logic
- AI orchestration
- qualification state machine
- CRM delivery logic
- widget runtime protocol changes without backend coordination

## Common Debugging Paths

## Widget not showing up

Check:

- `NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN`
- `NEXT_PUBLIC_SENTIENT_INSTALL_KEY`
- install key belongs to the same backend/origin pair you expect
- install key belongs to the tenant you expect for that client site
- backend tenant/install allowlist contains the deployed site origin as a bare HTTPS origin
- rendered script tag in HTML
- backend `/agent.js` availability
- backend `POST /api/widget/bootstrap` response

Relevant files:

- `src/config/site.ts`
- `src/components/SentientWidgetEmbed.tsx`
- `src/app/layout.tsx`

## Wrong canonical URLs or sitemap entries

Check:

- `NEXT_PUBLIC_SITE_URL`
- `getSiteUrl()`
- `buildPageMetadata()`
- `src/app/sitemap.ts`
- `src/app/robots.ts`

## Product nav/footer item missing

Check:

- `src/config/products.ts`
- `Header.tsx`
- `Footer.tsx`

## Solution page looks wrong

Check:

- `src/config/solutions.ts`
- `src/components/SolutionTemplate.tsx`
- `src/app/solutions/[slug]/page.tsx`

## Frontend File Guide For A New Engineer

If you only have one hour, read these in order:

1. `README.md`
2. `docs/FRONTEND_EMBED_HANDOFF.md`
3. `docs/FRONTEND_ARCHITECTURE_HANDOFF.md`
4. `src/config/site.ts`
5. `src/app/layout.tsx`
6. `src/components/SentientWidgetEmbed.tsx`
7. `src/config/products.ts`
8. `src/config/solutions.ts`
9. `src/components/SolutionTemplate.tsx`

## Recommended Verification

Clean checkout TypeScript verification:

```bash
npm run typecheck
```

Full verification:

```bash
NEXT_PUBLIC_SITE_URL=https://sentientweb.com \
NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN=https://backend.sentientweb.com \
NEXT_PUBLIC_SENTIENT_INSTALL_KEY=sw_inst_demo \
npm run check
```

`npm run typecheck` is designed to regenerate Next route/type artifacts on its own. `npm run build` and `npm run check` still require `NEXT_PUBLIC_SITE_URL`.

## Final Mental Model

This repo is best thought of as:

- a static-ish, config-driven marketing site
- with a strong SEO layer
- and a very small integration seam to the backend-owned widget platform

For multi-client deployments, the frontend stays thin:

- each client site gets its own backend tenant and install
- customization lives in backend tenant config
- this repo just loads the correct backend widget origin and public install key

If you keep that boundary clear, work in this repo stays simple and low-risk.
