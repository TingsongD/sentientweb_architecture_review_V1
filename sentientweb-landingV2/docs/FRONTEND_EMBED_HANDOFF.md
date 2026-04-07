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

If the widget needs new behavior, the default place to add it is the backend widget platform, not this repo.

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

The standard verification command is:

```bash
NEXT_PUBLIC_SITE_URL=https://sentientweb.com \
NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN=https://backend.sentientweb.com \
NEXT_PUBLIC_SENTIENT_INSTALL_KEY=sw_inst_demo \
npm run check
```

## One Sentence Summary

This repo is now a marketing shell that embeds the backend-owned widget instead of implementing its own chat stack.
