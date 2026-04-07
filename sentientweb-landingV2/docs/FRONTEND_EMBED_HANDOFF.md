# Frontend Embed Handoff

This document explains what changed in the landing-site repo after the move to a backend-owned widget platform.

If you need the full system architecture, read the backend handoff document in the sibling repo:

- `../BackendV3/docs/BACKEND_OWNED_WIDGET_PLATFORM.md`

## What This Repo Is Now

This repo is now a plain marketing frontend.

It is responsible for:

- page content
- SEO metadata
- layout and brand presentation
- static CTAs
- loading the backend widget

It is not responsible for:

- chat orchestration
- qualification state
- booking logic
- AI message handling
- visitor session identity

## What Was Removed

The old local chat stack was deleted:

- `src/components/ChatBox.tsx`
- `src/app/actions/chat.ts`

That code used to make the landing site a special-case runtime.

That is no longer the model.

## What Replaced It

The site now loads the backend widget using a shared embed path.

Relevant files:

- `src/components/SentientWidgetEmbed.tsx`
- `src/config/site.ts`
- `src/app/layout.tsx`

The embed component simply loads:

```html
<script src="https://backend.example.com/agent.js" data-install-key="sw_inst_xxx"></script>
```

through Next.js `Script`.

That install key is intentionally public. The backend still owns:

- origin validation during widget bootstrap
- signed visitor-token issuance and rotation
- authenticated event/chat API access

The corresponding backend origin config now expects bare HTTPS origins only. If the marketing site domain changes, the backend allowlist entry should be `https://www.sentientweb.com`, not a URL with a path, query string, or fragment.

## New Environment Variables

### Required for normal production metadata

- `NEXT_PUBLIC_SITE_URL`

### Required if this site should load the embedded widget

- `NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN`
- `NEXT_PUBLIC_SENTIENT_INSTALL_KEY`

### Still optional for non-widget demo CTAs

- `NEXT_PUBLIC_CALENDLY_EVENT_URL`

## Mental Model

Treat this frontend exactly like a customer website.

That means:

- it should not contain local chat business logic
- it should not make up its own widget identity model
- it should not diverge from the runtime contract used by third-party sites

Concretely, this repo should not call backend widget APIs directly or invent its own visitor/session storage. `agent.js` is the boundary.

If the widget needs new behavior, the default place to add it is the backend widget platform, not this repo.

If the widget stops loading after a deploy or domain change, check backend install and `allowedOrigins` configuration before changing frontend code. Most failures there are origin-matching issues, not embed-component issues.

If a chat stream breaks after it starts, the backend widget runtime now handles that through a terminal generic `STREAM_FAILED` SSE event and the same fallback copy used for transport failures. This repo should not special-case that protocol in page code.

## Safe Places To Work In This Repo

Good areas for frontend-only changes:

- page copy
- layout
- styling
- SEO
- navigation
- static conversion sections

Areas that should usually stay backend-owned:

- widget authentication
- chat flow
- qualification logic
- booking state
- CRM behavior
- proactive engagement rules

## Verification

TypeScript on a clean checkout:

```bash
npm run typecheck
```

The standard full verification command is:

```bash
NEXT_PUBLIC_SITE_URL=https://sentientweb.com \
NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN=https://backend.sentientweb.com \
NEXT_PUBLIC_SENTIENT_INSTALL_KEY=sw_inst_demo \
npm run check
```

Repository CI now runs from the combined repo root and calls this same frontend `npm run check` flow from `sentientweb-landingV2/`.

`npm run typecheck` regenerates Next route/type artifacts by itself. `npm run build` and `npm run check` still require `NEXT_PUBLIC_SITE_URL`.

## One Sentence Summary

This repo is now a marketing shell that embeds the backend-owned widget instead of implementing its own chat stack.
