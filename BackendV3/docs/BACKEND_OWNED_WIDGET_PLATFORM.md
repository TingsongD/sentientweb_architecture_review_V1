# Backend-Owned Widget Platform

This document explains the architecture change that moved the website widget from a partially frontend-owned flow to a backend-owned platform.

It is written for a new engineer who has not seen the old system.

## TL;DR

Before this change:

- The backend exposed a public `siteKey`.
- The browser generated and controlled the chat `sessionId`.
- The landing site had its own local chat UI and local server action logic.
- Customer websites and the first-party marketing site did not truly share one install/runtime path.

After this change:

- Every website is treated like a third-party client that embeds a backend-served widget.
- The backend owns install provisioning, visitor session issuance, conversation identity, and AI behavior.
- The frontend is now a thin shell: it renders UI, captures events, and calls backend APIs.
- The landing site uses the same embed path as customer websites.
- WordPress has a first-pass one-click install flow.

## Repos And Responsibilities

There are two repos in this workspace.

### `BackendV3`

This repo is now the source of truth for:

- tenant configuration
- widget install management
- signed visitor sessions
- AI orchestration
- conversation state
- qualification logic
- booking logic
- CRM and webhook flows
- proactive triggers
- widget bootstrap and asset delivery
- WordPress connect/exchange/disconnect flow

### `sentientweb-landingV2`

This repo is now only responsible for:

- marketing pages
- SEO metadata
- static CTAs
- loading the backend widget with a script tag

It no longer contains local chat or AI business logic.

## Old Mental Model vs New Mental Model

### Old mental model

- A tenant had one public `siteKey`.
- The browser sent `siteKey` and a client-generated `sessionId`.
- Public APIs trusted too much client-owned state.
- The first-party landing site had its own local chat implementation.

### New mental model

- A tenant can have multiple `SiteInstall` records.
- Each install represents one website origin and one platform, such as `script` or `wordpress`.
- Public embeds use a public `installKey`, not just a tenant-wide key.
- The browser must bootstrap with the backend and receive a signed visitor token.
- The backend authenticates visitor requests using that signed token and state stored in the database.
- The first-party landing site is just another embed host.

## New Core Concepts

### Tenant

The customer account. This already existed.

### SiteInstall

A single website installation of the widget.

Important properties:

- `tenantId`
- `origin`
- `domain`
- `platform`
- `publicInstallKey`
- `managementTokenHash`
- `status`
- `pluginVersion`
- `metadata`
- `lastSeenAt`

One tenant can have multiple installs.

Examples:

- `https://www.acme.com` with platform `script`
- `https://acme.com` with platform `wordpress`

### SiteInstallLinkCode

A short-lived, one-time code used during the WordPress connect flow.

It exists so the plugin does not receive long-lived install credentials before the admin approves the connection in the backend.

### SiteInstallSession

A server-tracked visitor session for a specific install.

This is what replaces the old trust model around browser-generated session IDs.

### `siteKey`

This still exists for backward compatibility, but it is now legacy.

New integrations should use `installKey`.

### `installKey`

The public key for a single install.

This is what new embed snippets and the WordPress plugin use.

### Visitor token

A signed token returned by widget bootstrap.

It binds together:

- `tenantId`
- `installId`
- `sessionId`
- `origin`
- expiry

The backend verifies both the signature and the database-backed session record.

### Management token

A secret returned to the WordPress plugin after exchange.

It is used only for management operations such as heartbeat and disconnect.

## Data Model Changes

The Prisma schema now adds three models:

- `SiteInstall`
- `SiteInstallLinkCode`
- `SiteInstallSession`

Relevant files:

- `prisma/schema.prisma`
- `prisma/migrations/20260406193500_backend_widget_platform/migration.sql`

Tenant creation also now creates a default `script` install for the tenant’s primary domain.

Relevant file:

- `app/lib/tenants.server.ts`

## Runtime Request Flow

This is the most important flow to understand.

### 1. Website loads `/agent.js`

The host website includes:

```html
<script src="https://backend.example.com/agent.js" data-install-key="sw_inst_xxx"></script>
```

Legacy snippets using `data-site-key` still work during migration.

Relevant file:

- `public/agent.js`

### 2. `agent.js` calls `POST /api/widget/bootstrap`

The script sends:

- `installKey` or legacy `siteKey`
- previous `visitorToken` if one was cached
- current `pageUrl`
- platform

The backend validates:

- the request origin
- the install
- the legacy site-key allowlist, if the request is still using `siteKey`
- the raw request body stays under the widget-bootstrap cap

Then it issues or rotates a visitor session token.

Relevant files:

- `app/routes/api.widget.bootstrap.tsx`
- `app/lib/site-install.server.ts`
- `app/lib/widget-config.server.ts`

### 3. Backend returns widget config plus visitor session

The response includes:

- tenant branding
- install identity
- proactive/qualification settings
- asset manifest
- visitor session info:
  - `sessionId`
  - `visitorToken`
  - `expiresAt`

### 4. `agent.js` loads widget runtime assets

The script then loads:

- `/widget/mouse-tracker.js`
- `/widget/observer.js`
- `/widget/widget.js`

### 5. `widget.js` mounts UI inside a Shadow DOM

The widget runtime:

- creates a Shadow DOM host
- loads the widget CSS inside that shadow root
- renders the launcher and chat panel
- keeps only UI state locally
- calls backend APIs for events and messages

Relevant files:

- `public/widget/widget.js`
- `public/widget/widget.css`

### 6. Widget APIs require the visitor token

The widget now sends:

- `Authorization: Bearer <visitorToken>`

to:

- `POST /api/events`
- `POST /api/agent/message`

The backend authenticates the visitor token and no longer trusts raw client session IDs as the source of truth. That includes observer-driven proactive events: the observer must reuse the bootstrapped `sessionId` and `visitorToken` instead of inventing its own session identity.

Relevant files:

- `app/routes/api.events.tsx`
- `app/routes/api.agent.message.tsx`
- `app/lib/site-install.server.ts`

## Security Changes

This architecture change was driven partly by security hardening.

### What improved

- Missing `Origin` no longer silently bypasses widget auth for legacy site-key requests.
- Public runtime requests are tied to install, origin, and signed visitor session.
- Rate limiting is keyed by install plus authenticated visitor session instead of arbitrary client-owned session strings.
- Event ingestion now checks that submitted `conversationId` values belong to the authenticated tenant and session before writing them.
- Reflected CORS is explicit on widget and WordPress routes instead of being helper-default behavior.
- Public JSON routes reject malformed JSON with `INVALID_JSON` and oversized bodies with `REQUEST_TOO_LARGE` before auth or business logic runs.
- Event payloads are capped per item, so one nested payload cannot silently bloat storage.
- Tenant AI misconfiguration is surfaced to public widget callers as a generic `503 AGENT_UNAVAILABLE` instead of provider-specific detail.
- Mid-stream SSE failures now collapse to a terminal `STREAM_FAILED` event with generic copy instead of surfacing provider details.
- Operator login is throttled before magic-link issuance and still keeps the same generic success copy for unknown or duplicate-admin emails.
- In production, valid operator magic links are delivered through Resend plus a configured public base URL instead of being exposed through preview URLs or logs; non-production still shows previews for local workflow speed.
- Operator-managed `allowedOrigins` are now restricted to canonical bare HTTPS origins, which keeps bootstrap origin matching predictable.
- The first-party landing site no longer has a separate local chat flow that can drift from production widget behavior.

### What is still intentionally true

- Browser code still exists. The widget must render in the browser and capture page events.
- “Backend-owned” means the backend owns identity and business logic, not that the browser runs zero JavaScript.

## WordPress Install Flow

WordPress is the first one-click installation target.

### Goal

A WordPress admin should be able to connect the site without manually copying install keys.

### Flow

1. The WordPress plugin calls `POST /api/wordpress/connect`.
2. The backend returns a `connectUrl` pointing at `/admin/installs`.
3. The operator signs in to the backend if needed.
4. The operator approves the WordPress install on the backend installs page.
5. The backend creates a one-time link code and redirects back to the WordPress admin page.
6. The plugin calls `POST /api/wordpress/exchange` with the link code.
7. The backend returns:
   - `installKey`
   - `managementToken`
   - `agentScriptUrl`
   - management endpoints
8. The plugin stores that state and injects `/agent.js` on the public site.
9. The plugin periodically calls `POST /api/wordpress/heartbeat`.
10. The plugin can disconnect through `POST /api/wordpress/disconnect`.
11. Disconnect revokes the stored management token hash.
12. Any later heartbeat using the old token fails with `401 INSTALL_AUTH_FAILED` until a fresh exchange happens.

Relevant backend files:

- `app/routes/api.wordpress.connect.tsx`
- `app/routes/api.wordpress.exchange.tsx`
- `app/routes/api.wordpress.heartbeat.tsx`
- `app/routes/api.wordpress.disconnect.tsx`
- `app/routes/admin.installs.tsx`

Relevant plugin files:

- `integrations/wordpress/sentientweb-widget/sentientweb-widget.php`
- `integrations/wordpress/sentientweb-widget/README.md`

## Admin UI Changes

There is now an installs page in the backend operator UI.

### `/admin/installs`

This page lets operators:

- provision a new `script` install
- approve a pending WordPress connect flow
- view active installs
- copy the new embed snippet using `data-install-key`

The admin shell also shows the primary install key so operators can quickly see the current public install identity.

### `/admin/settings`

This page now has two important invariants for widget operators:

- `allowedOrigins` must be entered as bare HTTPS origins such as `https://www.acme.com`
- existing secrets are represented by boolean configured state in loader data, not by decrypting values just to render masked placeholders

Relevant files:

- `app/routes/admin.installs.tsx`
- `app/routes/admin.tsx`
- `app/routes/admin.settings.tsx`
- `app/lib/origin.server.ts`

## Landing Site Changes

The landing site is no longer a special-case chat client.

### Removed

- local chat component
- local server action that handled SDR qualification

Deleted files:

- `sentientweb-landingV2/src/components/ChatBox.tsx`
- `sentientweb-landingV2/src/app/actions/chat.ts`

### Added

- a small embed component that loads the backend widget
- env-based config for backend widget origin and install key

Relevant files:

- `sentientweb-landingV2/src/components/SentientWidgetEmbed.tsx`
- `sentientweb-landingV2/src/config/site.ts`
- `sentientweb-landingV2/src/app/layout.tsx`

### New landing env vars

- `NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN`
- `NEXT_PUBLIC_SENTIENT_INSTALL_KEY`

`NEXT_PUBLIC_SENTIENT_INSTALL_KEY` is intentionally public. The real runtime trust boundary is:

- install origin matching during bootstrap
- signed visitor tokens returned by bootstrap
- backend-side install/session validation on every runtime API

The landing site still uses `NEXT_PUBLIC_SITE_URL` for SEO and can still use `NEXT_PUBLIC_CALENDLY_EVENT_URL` for non-widget CTAs.

## Backward Compatibility

This rollout intentionally keeps the old path alive while the new path becomes canonical.

### Still supported

- `data-site-key` in old embed snippets
- `GET /api/widget-config`

### Canonical going forward

- `data-install-key`
- `POST /api/widget/bootstrap`
- signed visitor token auth for runtime APIs

### Why this matters

You can roll out the new architecture without immediately breaking every existing embed.

## File Map For New Engineers

If you only have a few minutes, start here.

### Backend entry points

- `app/lib/site-install.server.ts`
- `app/lib/widget-config.server.ts`
- `app/routes/api.widget.bootstrap.tsx`
- `app/routes/api.agent.message.tsx`
- `app/routes/api.events.tsx`
- `app/routes/admin.installs.tsx`

### Backend runtime assets

- `public/agent.js`
- `public/widget/widget.js`
- `public/widget/widget.css`

### Backend schema and migration

- `prisma/schema.prisma`
- `prisma/migrations/20260406193500_backend_widget_platform/migration.sql`

### WordPress

- `integrations/wordpress/sentientweb-widget/sentientweb-widget.php`

### Landing frontend

- `sentientweb-landingV2/src/components/SentientWidgetEmbed.tsx`
- `sentientweb-landingV2/src/config/site.ts`
- `sentientweb-landingV2/src/app/layout.tsx`

## Local Development Checklist

### Backend

1. Set up the normal backend env vars from `.env.example`.
2. Make sure database and Redis are running.
3. Apply migrations.
4. Generate Prisma client.
5. Start the app.

If you want to exercise production-style first-tenant bootstrap locally, also set:

```bash
FIRST_TENANT_BOOTSTRAP_SECRET=change-me
RESEND_API_KEY=re_xxx
MAGIC_LINK_FROM_EMAIL=ops@example.com
```

If you also want request audit logs and login throttles to trust forwarded IPs during local reverse-proxy testing, set:

```bash
TRUST_PROXY_HEADERS=true
```

Only enable that when the proxy in front of the app rewrites those headers.

That same Resend configuration, plus a valid public `MAGIC_LINK_BASE_URL` or `APP_URL`, is required for production-style admin login, because valid magic links are emailed instead of shown on screen.

Typical commands:

```bash
npm run migrate:deploy
npm run prisma:generate
npm run dev
```

### Landing site

Set:

```bash
NEXT_PUBLIC_SITE_URL=https://sentientweb.com
NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SENTIENT_INSTALL_KEY=sw_inst_xxx
```

Then run:

```bash
npm run dev
```

Backend runtime checks:

- `GET /healthz` stays a liveness probe.
- `GET /readyz` verifies database readiness, Redis connectivity, and production magic-link delivery configuration for the web runtime.

## Verification Commands

These were the main checks used during implementation.

### Backend

```bash
npm run prisma:generate
npm test
npm run typecheck
npm run lint
npm run build:web
node --check public/agent.js
node --check public/widget/widget.js
```

### Landing site

```bash
NEXT_PUBLIC_SITE_URL=https://sentientweb.com \
NEXT_PUBLIC_SENTIENT_WIDGET_ORIGIN=https://backend.sentientweb.com \
NEXT_PUBLIC_SENTIENT_INSTALL_KEY=sw_inst_demo \
npm run check
```

## Things To Watch During Future Work

### If you touch auth

Read:

- `app/lib/site-install.server.ts`
- `app/lib/crypto.server.ts`
- `app/lib/origin.server.ts`

Do not accidentally reintroduce trust in client-generated session identifiers.

### If you touch the widget runtime

Read:

- `public/agent.js`
- `public/widget/widget.js`

Preserve:

- bootstrap-first flow
- signed visitor token usage
- Shadow DOM isolation
- terminal `STREAM_FAILED` handling as the generic fallback path for broken SSE streams

### If you touch installs

Remember:

- one tenant can have many installs
- installs are origin-specific
- WordPress has a management-token lifecycle that is different from normal visitor traffic
- disconnect now revokes the management token; reconnect means a fresh exchange, not a heartbeat
- operator-edited `allowedOrigins` must stay canonical bare HTTPS origins or install/origin matching will drift

### If you touch public request parsing

Preserve:

- shared `readJsonBody()` usage for public JSON routes
- `64 KiB` cap for chat/events
- `16 KiB` cap for widget bootstrap and WordPress public routes
- stable `INVALID_JSON` and `REQUEST_TOO_LARGE` responses
- explicit per-route CORS enablement for only the cross-origin public endpoints

### If you touch the landing site

Do not reintroduce local chat or AI business logic there unless you are explicitly undoing this architecture decision.

## One Sentence Summary

The product is now a backend-owned embedded widget platform, and every website, including our own, is just a client that loads that platform.
