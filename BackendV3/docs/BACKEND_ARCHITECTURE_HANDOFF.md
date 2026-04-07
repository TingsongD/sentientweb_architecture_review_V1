# Backend Architecture Handoff

This document is the detailed backend architecture handoff for a new engineer.

If you want the shorter summary of the recent platform shift, read:

- `docs/BACKEND_OWNED_WIDGET_PLATFORM.md`

This document is about the whole backend system, not just the widget migration.

## What This Repo Is

`BackendV3` is the operational product backend for SentientWeb.

It currently serves four roles:

1. Public widget platform for websites.
2. Multi-tenant application backend.
3. Operator/admin application.
4. Background-job worker host.

The repo is built around a React Router app for HTTP routes and a separate Node worker entry point for BullMQ consumers.

## High-Level Topology

```text
Browser / Host Website
        |
        v
   React Router App
   - public widget bootstrap
   - public runtime APIs
   - admin routes
   - onboarding / test APIs
        |
        +----------------------+
        |                      |
        v                      v
    PostgreSQL               Redis
    - tenants                - rate limits
    - installs               - BullMQ queues
    - conversations          - trigger state
    - leads
    - bookings
    - knowledge
        |
        v
 External Services
 - OpenAI / Gemini
 - Calendly
 - CRM webhooks
 - human handoff webhooks
 - customer websites/docs during crawl
```

There is also a separate worker process:

```text
BullMQ Worker Process
 - knowledge ingestion jobs
 - CRM sync jobs
```

Relevant entry points:

- `app/routes/*`
- `app/worker.ts`

## Top-Level Code Layout

### `app/routes`

HTTP surface area.

Current route groups:

- marketing/bootstrap route: `_index.tsx`
- admin shell and admin pages
- public APIs for widget/runtime
- onboarding and integration test APIs
- WordPress install management APIs
- health check

### `app/lib`

Domain and infrastructure code.

Important categories:

- auth and cookies
- crypto and token handling
- request validation
- site/install auth
- AI orchestration
- qualification
- knowledge ingestion/search
- behavior events and triggers
- Calendly integration
- CRM sync and webhook delivery
- Redis and queue helpers
- outbound URL safety

### `app/lib/ai`

AI provider abstraction.

- provider registry
- prompt builder
- shared AI message/tool types

### `app/utils`

Utility helpers such as logging.

### `prisma`

Schema and migrations.

### `public`

Static assets served directly by the backend.

Important here:

- `agent.js`
- `widget/*`

### `app/worker.ts`

Background worker startup and graceful shutdown.

## System Boundaries

A useful way to think about the backend is as five layers.

### Layer 1: HTTP and route handlers

Files:

- `app/routes/*.tsx`

Responsibilities:

- parse request
- enforce method
- call validation schema
- call auth/install helpers
- invoke domain services
- convert errors to HTTP responses

Routes should stay thin.

### Layer 2: request/auth infrastructure

Files:

- `app/lib/validation.server.ts`
- `app/lib/http.server.ts`
- `app/lib/origin.server.ts`
- `app/lib/auth.server.ts`
- `app/lib/site-install.server.ts`
- `app/lib/cookies.server.ts`
- `app/lib/crypto.server.ts`

Responsibilities:

- input validation
- JSON/CORS response helpers
- admin session auth
- legacy site-key origin auth
- install resolution
- signed visitor session auth
- token hashing/signing
- secret encryption/decryption

### Layer 3: domain services

Files:

- `app/lib/agent.server.ts`
- `app/lib/b2b-adapter.server.ts`
- `app/lib/qualification.server.ts`
- `app/lib/triggers.server.ts`
- `app/lib/behavior-events.server.ts`
- `app/lib/calendly.server.ts`
- `app/lib/webhook-crm.server.ts`
- `app/lib/widget-config.server.ts`
- `app/lib/tenants.server.ts`

Responsibilities:

- AI message handling
- tool orchestration
- lead qualification
- booking
- event storage
- proactive trigger evaluation
- widget config assembly
- tenant bootstrap defaults

### Layer 4: background processing and queueing

Files:

- `app/lib/knowledge-base.server.ts`
- `app/lib/crm-sync.server.ts`
- `app/lib/queue.server.ts`
- `app/worker.ts`

Responsibilities:

- async crawl and ingest
- embedding generation
- CRM retries
- BullMQ queue lifecycle
- worker startup/shutdown

### Layer 5: persistence and external IO

Files:

- `prisma/schema.prisma`
- `app/db.server` (imported as `~/db.server`)
- `app/lib/redis.server.ts`
- `app/lib/outbound-url.server.ts`
- `app/lib/site-crawler.server.ts`
- `app/lib/embeddings.server.ts`
- `app/lib/ai/registry.ts`

Responsibilities:

- Prisma reads/writes
- Redis connection
- queue connection
- network safety checks
- crawling customer websites
- embeddings and provider API calls

## Runtime Modes

There are two runtime modes you need to keep in your head.

### 1. Web app mode

This is the React Router server.

It serves:

- admin UI
- public widget bootstrap
- public chat/event APIs
- onboarding APIs
- integration test APIs

### 2. Worker mode

This is `app/worker.ts`.

It starts:

- knowledge ingestion worker
- CRM sync worker

The worker does not serve HTTP.

## Main User Flows

## Flow A: First tenant bootstrap

Relevant route:

- `app/routes/_index.tsx`

Relevant service:

- `app/lib/tenants.server.ts`

What happens:

1. The first operator lands on `/`.
2. Secure bootstrap mode is active whenever `NODE_ENV === "production"` or `FIRST_TENANT_BOOTSTRAP_SECRET` is set.
3. In secure bootstrap mode, the operator must supply `FIRST_TENANT_BOOTSTRAP_SECRET`.
4. In production, the backend also requires working Resend config plus a valid public magic-link base URL before it will create the first tenant, because the first sign-in link is emailed instead of shown on screen.
5. The backend fails closed with generic copy if the secret is missing, wrong, required-but-unset, or production email delivery is unavailable.
6. The tenant, first admin, first script install, and bootstrap login token are created inside one transaction.
7. Default branding and triggers are created.
8. In non-production, the bootstrap page returns an on-screen preview link.
9. In production, the backend sends the first sign-in link by email and redirects to `/admin/login?bootstrap=email-sent`.
10. If production email delivery fails after commit, the backend revokes the just-created token and redirects to `/admin/login?bootstrap=email-failed`.

This is how a brand-new tenant gets its first public install identity.

## Flow B: Admin login

Relevant files:

- `app/routes/admin.login.tsx`
- `app/routes/admin.auth.magic.tsx`
- `app/lib/auth.server.ts`
- `app/lib/cookies.server.ts`
- `app/lib/crypto.server.ts`

What happens:

1. Operator submits email.
2. Backend only trusts forwarded IP headers when `TRUST_PROXY_HEADERS=true`; otherwise audit and throttling use `"unknown"` for client IP.
3. Backend rate-limits by client IP and by IP plus normalized email before token issuance.
4. Unknown and duplicate-admin emails still return the same generic confirmation copy; only a unique admin match gets a token record.
5. In production, login issuance requires working Resend config and a valid public magic-link base URL, and the sign-in link is emailed instead of being surfaced in logs or UI previews.
6. The issuance path invalidates every unused token for the same `(tenantId, email)` before inserting the new token, matching the partial unique index managed in migration `20260407140000_active_token_unique`.
7. Successful auth logs record `emailHash`, IP, and user agent rather than raw email or full magic-link URLs.
8. If Redis-backed rate limiting is unavailable, `POST /admin/login` fails closed with `503`.
9. If production email delivery is unavailable for a real admin, `POST /admin/login` still returns the same generic success copy; the failure is only visible through logs and readiness checks.
10. Operator opens the link.
11. Backend consumes the token and records auth audit context such as IP and user agent.
12. Backend signs an admin session cookie.
13. Operator is redirected into `/admin` or a preserved target route.

## Flow C: Widget bootstrap

Relevant files:

- `public/agent.js`
- `app/routes/api.widget.bootstrap.tsx`
- `app/lib/site-install.server.ts`
- `app/lib/widget-config.server.ts`

What happens:

1. A host website loads `/agent.js` with `data-install-key`.
2. `agent.js` calls `POST /api/widget/bootstrap`.
3. Backend validates origin and install identity.
4. Backend issues or rotates a signed visitor token backed by `SiteInstallSession`.
5. Backend returns widget config plus asset manifest plus visitor session info.
6. `agent.js` loads the runtime assets.

This is now the canonical public entry point.

## Flow D: Widget event ingestion

Relevant files:

- `app/routes/api.events.tsx`
- `app/lib/site-install.server.ts`
- `app/lib/behavior-events.server.ts`
- `app/lib/triggers.server.ts`
- `app/lib/rate-limit.server.ts`

What happens:

1. Widget sends an event batch with bearer token auth.
2. Backend reads JSON through the shared capped-body parser.
3. Backend authenticates the visitor token and origin.
4. Backend checks that session IDs match the authenticated visitor session.
5. Backend rate-limits by install plus session.
6. Backend verifies any provided `conversationId` belongs to the tenant and session.
7. Backend rejects any event whose serialized `payload` exceeds `4 KiB`.
8. Backend stores `BehaviorEvent` rows.
9. Backend evaluates proactive triggers.
10. Backend returns the first trigger, if any.

## Flow E: Widget chat

Relevant files:

- `app/routes/api.agent.message.tsx`
- `app/lib/site-install.server.ts`
- `app/lib/agent.server.ts`
- `app/lib/b2b-adapter.server.ts`
- `app/lib/knowledge-base.server.ts`
- `app/lib/calendly.server.ts`
- `app/lib/crm-sync.server.ts`

What happens:

1. Widget sends a message to `POST /api/agent/message`.
2. Backend reads JSON through the shared capped-body parser.
3. Backend authenticates visitor token and origin.
4. Backend rate-limits by install plus authenticated session.
5. Backend resolves or creates a conversation.
6. Backend loads tenant AI config.
7. If tenant/platform AI config is unavailable, the public response is a generic `503 AGENT_UNAVAILABLE`.
8. Backend builds a provider request with tools.
9. AI tool calls execute through the B2B adapter.
10. Conversation, tool executions, lead updates, bookings, and CRM events are persisted.
11. Backend returns either a normal JSON reply or an SSE stream.
12. If the SSE path fails after it has started, the backend emits one final generic `{ type: "error", code: "STREAM_FAILED" }` event and closes the stream instead of surfacing provider details.

## Flow F: Knowledge crawl and ingestion

Relevant files:

- `app/routes/api.onboarding.crawl.tsx`
- `app/routes/api.onboarding.crawl.$jobId.tsx`
- `app/lib/knowledge-base.server.ts`
- `app/lib/site-crawler.server.ts`
- `app/lib/chunking.server.ts`
- `app/lib/embeddings.server.ts`
- `app/lib/queue.server.ts`
- `app/worker.ts`

What happens:

1. Admin requests crawl enqueue.
2. Backend validates outbound URL safety.
3. Backend creates a `KnowledgeSource`.
4. Backend enqueues a BullMQ crawl job.
5. Worker consumes the job.
6. Worker crawls pages or processes uploaded text.
7. Worker chunks content.
8. Worker creates embeddings.
9. Worker writes `KnowledgeChunk` rows, including vector data.
10. Source status is updated to `ready` or `failed`.

## Flow G: CRM sync

Relevant files:

- `app/lib/crm-sync.server.ts`
- `app/lib/webhook-crm.server.ts`
- `app/lib/queue.server.ts`
- `app/worker.ts`

What happens:

1. A domain action decides CRM sync is needed.
2. Backend creates a `CrmSyncEvent`.
3. Backend enqueues a BullMQ CRM sync job.
4. Worker sends the webhook.
5. Worker retries on failure.
6. Status is reflected both on the event row and, where relevant, on `ToolExecution`.

## Core Backend Domains

## 1. Tenant and install management

Files:

- `app/lib/tenants.server.ts`
- `app/lib/site-install.server.ts`
- `app/routes/admin.installs.tsx`
- `app/routes/api.wordpress.*`

This domain owns:

- tenant bootstrap defaults
- script installs
- WordPress installs
- install origin binding
- visitor session issuance
- management token auth

When working on public embed behavior, start here first.

## 2. AI orchestration

Files:

- `app/lib/agent.server.ts`
- `app/lib/ai/registry.ts`
- `app/lib/ai/prompt-builder.ts`
- `app/lib/ai/types.ts`

This domain owns:

- provider selection
- tenant AI credentials
- system prompt generation
- tool definitions
- tool execution planning
- conversation persistence
- streaming and non-streaming responses

The important mental model is:

- routes do HTTP
- `agent.server.ts` does orchestration
- the B2B adapter executes domain actions the model is allowed to take

## 3. B2B website adapter

File:

- `app/lib/b2b-adapter.server.ts`

This is the application-specific tool layer sitting under AI orchestration.

It is where the model’s tool calls are translated into product actions such as:

- searching the knowledge base
- reading visitor context
- qualifying a lead
- booking a meeting
- routing to a human

If a product capability should be callable by the AI, it probably ends up here.

Knowledge-search guardrail:

- AI tool inputs do not get to pick arbitrary retrieval fan-out
- invalid, negative, zero, or oversized `topK` values are normalized before search
- direct knowledge retrieval still clamps to the supported range before SQL runs

## 4. Knowledge system

Files:

- `app/lib/knowledge-base.server.ts`
- `app/lib/chunking.server.ts`
- `app/lib/site-crawler.server.ts`
- `app/lib/embeddings.server.ts`

This domain owns:

- document ingestion
- crawl processing
- chunking
- embedding generation
- hybrid knowledge retrieval
- knowledge context assembly for the agent

The key architectural choice here is that knowledge ingestion and retrieval stay OpenAI-embedding-backed even if chat uses Gemini.

## 5. Qualification, bookings, and CRM

Files:

- `app/lib/qualification.server.ts`
- `app/lib/calendly.server.ts`
- `app/lib/crm-sync.server.ts`
- `app/lib/webhook-crm.server.ts`

This domain owns:

- lead qualification state computation
- booking creation
- outbound webhook routing
- CRM retry semantics

These are product outcome systems, not just widget concerns.

## 6. Behavior events and triggers

Files:

- `app/lib/behavior-events.server.ts`
- `app/lib/triggers.server.ts`

This domain owns:

- event persistence
- trigger rule parsing
- trigger evaluation
- proactive engagement state

## Infrastructure Modules

## Prisma / PostgreSQL

The database is the source of truth for:

- tenants
- admins
- installs
- sessions
- conversations
- leads
- tool executions
- behavior events
- demo bookings
- CRM sync events
- knowledge sources and chunks

Important schema file:

- `prisma/schema.prisma`

## Redis

Redis is used for:

- rate limiting
- BullMQ queues
- short-lived trigger tracking

Files:

- `app/lib/redis.server.ts`
- `app/lib/rate-limit.server.ts`
- `app/lib/queue.server.ts`

If Redis is unavailable, large parts of the public runtime fail closed on purpose.

## Crypto and secret handling

File:

- `app/lib/crypto.server.ts`

This module owns:

- tenant secret encryption/decryption
- admin session signing
- visitor session signing
- install key generation
- WordPress link code generation
- WordPress management token generation

This file is security-sensitive. Changes here have broad blast radius.

Operator settings note:

- admin settings no longer decrypt tenant secrets just to render masked placeholders
- loader data exposes boolean `configured` flags instead
- blank secret fields preserve existing encrypted values on save

## Validation

File:

- `app/lib/validation.server.ts`

All route payloads should be normalized here instead of inventing ad hoc parsing inside routes.

Public JSON routes now also use `readJsonBody()` from `app/lib/http.server.ts` so raw request size limits stay centralized:

- `64 KiB` for `POST /api/events` and `POST /api/agent/message`
- `16 KiB` for widget bootstrap and WordPress management routes
- oversized bodies return `413 REQUEST_TOO_LARGE`
- malformed JSON returns `400 INVALID_JSON`

Admin settings input is also normalized centrally:

- `allowedOrigins` must be bare HTTPS origins
- usernames, passwords, paths, query strings, and fragments are rejected
- saved values are canonicalized to `protocol//host` and deduped

The same HTTP helper layer also owns two public trust boundaries:

- reflected CORS is now opt-in per route instead of helper-default behavior
- proxy headers are ignored unless `TRUST_PROXY_HEADERS=true`

## Outbound URL safety

File:

- `app/lib/outbound-url.server.ts`

This is the guardrail for any customer-provided outbound URL such as:

- documentation crawl roots
- CRM webhooks
- integration test URLs

If you introduce new outbound requests, run them through this safety layer.

## Public Route Map

### Widget/public runtime

- `GET /api/widget-config`
- `POST /api/widget/bootstrap`
- `POST /api/events`
- `POST /api/agent/message`
- `GET /healthz`
- `GET /readyz`
- `GET /agent.js`
- `GET /widget/*`

Runtime notes:

- `GET /healthz` is liveness only
- `GET /readyz` checks database readiness, Redis readiness, and production magic-link delivery configuration for the web runtime
- reflected CORS is enabled explicitly on widget and WordPress cross-origin routes, not globally

### Onboarding / public-ish operator setup

- `GET /`
- `POST /`
- `POST /api/onboarding/crawl`
- `GET /api/onboarding/crawl/:jobId`

Bootstrap note:

- first-tenant bootstrap on `/` is gated whenever secure bootstrap mode is active
- secure bootstrap mode is enabled in production and also in any environment where `FIRST_TENANT_BOOTSTRAP_SECRET` is set

### Admin

- `GET/POST /admin/login`
- `GET /admin/auth/magic`
- `POST /admin/logout`
- `GET /admin`
- `GET /admin/activity`
- `GET/POST /admin/settings`
- `GET/POST /admin/installs`

Admin auth contract:

- `POST /admin/login` may return `429` when IP or IP-plus-email throttles trip
- `POST /admin/login` may return `503` when Redis-backed rate limiting is unavailable
- successful responses stay intentionally generic even for unknown or duplicate-admin emails
- non-production login requests still expose a preview link for valid unique admins; production uses Resend delivery instead
- production delivery outages do not change the login response shape for real admin emails; they surface only in logs and `/readyz`

### Admin integration tests

- `POST /api/admin/integrations/calendly-test`
- `POST /api/admin/integrations/crm-webhook-test`

### WordPress management

- `POST /api/wordpress/connect`
- `POST /api/wordpress/exchange`
- `POST /api/wordpress/heartbeat`
- `POST /api/wordpress/disconnect`

Public error contract:

- `POST /api/wordpress/exchange` collapses invalid/expired/mismatched exchange failures to `400 WORDPRESS_EXCHANGE_FAILED`
- `POST /api/wordpress/heartbeat` and `POST /api/wordpress/disconnect` collapse invalid management credentials to `401 INSTALL_AUTH_FAILED`
- disconnect revokes `managementTokenHash`; the old token cannot revive the install via heartbeat

## Data Model Mental Model

This is the most useful way to think about the important tables.

### Tenant-centered data

- `Tenant`
- `TenantAdmin`
- `TenantAdminLoginToken`

`TenantAdminLoginToken` has one extra rule worth remembering:

- the app invalidates all unused tokens before issuing a new one
- a migration-managed partial unique index enforces at most one unused token per `(tenantId, email)`
- expired unused tokens are normalized during the migration so they do not block future issuance

### Install and public-runtime data

- `SiteInstall`
- `SiteInstallLinkCode`
- `SiteInstallSession`

### Conversation and product outcome data

- `Conversation`
- `Message`
- `Lead`
- `DemoBooking`
- `ToolExecution`
- `BehaviorEvent`
- `CrmSyncEvent`

### Knowledge data

- `KnowledgeSource`
- `KnowledgeChunk`

When debugging, first identify which group you are in. That usually tells you which module family to inspect.

## How The Agent Is Structured

The AI layer is not “model in, model out”.

It is structured more like this:

```text
route
  -> validate/auth
  -> resolve conversation
  -> build tenant AI config
  -> build system prompt
  -> call provider
  -> inspect tool calls
  -> execute allowed product tools
  -> persist tool executions and domain state
  -> continue model loop
  -> persist final assistant message
```

Important code paths:

- `getTenantAiConfig`
- `buildToolExecutionPlan`
- `handleAgentMessageGenerator`
- `handleAgentMessage`
- `handleAgentMessageStream`

Most new AI-facing capabilities should be added as tool-backed domain actions, not as uncontrolled prompt-only behavior.

## Background Jobs

There are currently two queues.

### Crawl queue

Purpose:

- process crawled or uploaded knowledge sources

Files:

- `app/lib/queue.server.ts`
- `app/lib/knowledge-base.server.ts`

### CRM sync queue

Purpose:

- deliver CRM webhook payloads with retry semantics

Files:

- `app/lib/queue.server.ts`
- `app/lib/crm-sync.server.ts`

The worker process starts both if Redis is available.

## Deployment Model

The intended production model is:

### Web service

Runs:

- React Router app

Command:

- `npm run start:web`

### Worker service

Runs:

- BullMQ consumers

Command:

- `npm run start:worker`

### Shared dependencies

- PostgreSQL with `pgvector`
- Redis

The repo README has Render-specific deployment notes.

## How To Safely Change This Repo

## If you are changing a public route

Check:

- validation schema
- auth path
- rate limiting
- explicit CORS behavior
- error mapping
- tests

Do not only change the route file.

## If you are changing widget auth or install behavior

Read first:

- `app/lib/site-install.server.ts`
- `app/lib/crypto.server.ts`
- `app/lib/validation.server.ts`
- `app/lib/http.server.ts`
- `public/agent.js`
- `public/widget/widget.js`

## If you are changing AI behavior

Read first:

- `app/lib/agent.server.ts`
- `app/lib/b2b-adapter.server.ts`
- `app/lib/ai/*`

## If you are changing knowledge behavior

Read first:

- `app/lib/knowledge-base.server.ts`
- `app/lib/site-crawler.server.ts`
- `app/lib/embeddings.server.ts`
- `app/lib/chunking.server.ts`

## If you are changing queues or retries

Read first:

- `app/lib/queue.server.ts`
- `app/lib/redis.server.ts`
- `app/lib/crm-sync.server.ts`
- `app/lib/knowledge-base.server.ts`
- `app/worker.ts`

## Common Debugging Paths

### Widget boot fails

Check:

- script tag has correct backend origin
- install key is valid
- request `Origin` header matches install origin
- `POST /api/widget/bootstrap` response
- cached visitor token in local storage
- request body is under the public bootstrap size cap
- `public/agent.js`

### Chat fails but widget loads

Check:

- visitor token presence
- `POST /api/agent/message`
- whether the response is `AGENT_UNAVAILABLE`
- whether the SSE stream ended with `STREAM_FAILED`
- rate limit Redis availability
- tenant AI config
- provider API keys
- conversation ownership

### Proactive trigger is not firing

Check:

- `BehaviorEvent` rows
- event payload shape and size
- tenant trigger config
- trigger evaluation result
- Redis `triggered:*` cooldown state

### Knowledge search is poor or empty

Check:

- knowledge source status
- chunk count
- embedding key availability
- crawl success
- hybrid retrieval query path

### CRM sync is stuck or retrying

Check:

- `CrmSyncEvent` rows
- worker process health
- Redis/BullMQ
- webhook URL safety and remote endpoint behavior

## Backend File Guide For A New Engineer

If you only have one hour, read these in order:

1. `README.md`
2. `docs/BACKEND_OWNED_WIDGET_PLATFORM.md`
3. `docs/BACKEND_ARCHITECTURE_HANDOFF.md`
4. `prisma/schema.prisma`
5. `app/lib/site-install.server.ts`
6. `app/lib/agent.server.ts`
7. `app/lib/b2b-adapter.server.ts`
8. `app/lib/knowledge-base.server.ts`
9. `app/lib/crm-sync.server.ts`
10. `app/worker.ts`

## Recommended Local Verification

```bash
npm run prisma:generate
npm test
npm run typecheck
npm run lint
npm run build:web
```

For widget runtime sanity:

```bash
node --check public/agent.js
node --check public/widget/widget.js
```

## Final Mental Model

This backend is not just an API server.

It is a multi-tenant product platform that owns:

- public website embed identity
- AI orchestration
- persistent sales workflow state
- admin operations
- asynchronous ingestion and webhook delivery

If you keep those four responsibilities separated in your head, the codebase becomes much easier to navigate.
