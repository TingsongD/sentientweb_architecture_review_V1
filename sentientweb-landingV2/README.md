# SentientWeb

The SentientWeb marketing site. Product logic and the website agent now live in the backend service and are loaded here through the same script-based install path used by client websites.

## Vision
Platform-agnostic AI that qualifies inbound leads, books demos, answers product questions from your docs, and takes action on your website — 24/7.

## Key Features
- **Plain marketing frontend**: Content, SEO, and conversion pages only.
- **Backend-owned widget embed**: Loads `/agent.js` from the backend with a provisioned install key.
- **Shared install contract**: The same runtime contract works on first-party and third-party websites.

## Engineering Docs

- Frontend embed handoff: `docs/FRONTEND_EMBED_HANDOFF.md`
- Detailed frontend architecture handoff: `docs/FRONTEND_ARCHITECTURE_HANDOFF.md`

## Tech Stack
- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS v4 (oklch design tokens)
- **UI Components**: shadcn/ui + Framer Motion
- **Architecture**: Modular sections for high-performance sub-1.2s TTFT.

## Getting Started

### Prerequisites
- Node.js 20+ (CI runs on Node.js 24)
- npm or pnpm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/TingsongD/sentientweblanding2.git
   cd sentientweblanding2
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example environment file for production-style checks:
   ```bash
   cp .env.example .env.local
   ```
   Configure `NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN` and `NEXT_PUBLIC_SENTIENT_INSTALL_KEY`
   if you want the backend-owned widget to render locally.
4. Start the development server:
   ```bash
   npm run dev
   ```

## Development
- `npm run dev` — Start dev server
- `npm run smoke:dev` — Dev-server smoke check (Turbopack validation)
- `npm run build` — Production build. Requires `NEXT_PUBLIC_SITE_URL`.
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript check
- `npm run check` — Full verification suite (lint + type + build + smoke). Requires `NEXT_PUBLIC_SITE_URL`.

## Deployment
SentientWeb is optimized for deployment on Vercel or as a standalone Docker container.

Set `NEXT_PUBLIC_SITE_URL` in every production deployment so metadata, sitemap entries, and JSON-LD use your primary domain instead of a preview or localhost fallback. Local production-style commands such as `npm run build` and `npm run check` also expect this variable to be set.

Set `NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN` and `NEXT_PUBLIC_SENTIENT_INSTALL_KEY` when this marketing site should load the embedded backend widget. The frontend no longer contains local chat or AI business logic.

For Docker builds, `NEXT_PUBLIC_SITE_URL` must be available at build time, not just at container runtime:

```bash
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://sentientweb.com .
NEXT_PUBLIC_SITE_URL=https://sentientweb.com docker compose up app --build
```

On Render Docker services, configure `NEXT_PUBLIC_SITE_URL` as a service environment variable before deploying so the Docker build can consume it through the Dockerfile build arg.

```bash
docker compose up app --build
```

## License
MIT
