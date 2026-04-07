# SentientWeb Agent

Phase 1 B2B inbound agent for turning website traffic into qualified leads and booked demos.

## What ships in this repo

- Multi-tenant B2B website adapter and agent runtime.
- Public site-key widget bootstrap with origin allowlisting.
- Text-first chat loop with AI tool orchestration.
- Knowledge ingestion from site crawl plus uploaded PDF, markdown, and text documents.
- Lead qualification, Calendly booking, CRM webhook, and human handoff webhook flows.
- Operator dashboard for onboarding, activity review, settings, and knowledge management.
- Behavior event ingestion and proactive pricing/docs trigger support.

## Engineering docs

- Phase 1 implementation plan: `PHASE1_DEV_PLAN.md`
- Phase 3 Shopify expansion guide: `PHASE3_SHOPIFY_ENGINEERING_GUIDE.md`
- Backend-owned widget platform handoff: `docs/BACKEND_OWNED_WIDGET_PLATFORM.md`
- Detailed backend architecture handoff: `docs/BACKEND_ARCHITECTURE_HANDOFF.md`

## Stack

- React Router 7
- Prisma + PostgreSQL
- Redis + BullMQ
- OpenAI and Gemini provider adapters

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `pgvector` enabled and Redis.
3. Run `npm install`.
4. Run `npm run prisma migrate deploy`.
5. Run `npm run dev`.

## Required environment

- `APP_URL`
- `DATABASE_URL`
- `REDIS_URL` for public rate-limited APIs, queue-backed workflows, and workers. If Redis is unavailable, those routes fail closed and may return `503`.
- `FIRST_TENANT_BOOTSTRAP_SECRET` when secure bootstrap mode should be active. Bootstrap requires the secret in production, and it also requires the secret in non-production if this env var is set. Store it in your platform secret manager rather than in committed env files.
- `TRUST_PROXY_HEADERS=true` only when the app is behind a trusted proxy that overwrites `X-Forwarded-For`, `X-Real-IP`, or `CF-Connecting-IP`. Leave it unset locally so audit logs and rate limits do not trust spoofable client headers.
- `START_WORKER`
- `SESSION_SECRET` for admin session signing. Keep it available during the secret re-encryption rollout if legacy tenant secrets were originally encrypted from the session secret.
- `ENCRYPTION_SECRET` for all new tenant secret encryption. This rollout requires it in production.
- `RESEND_API_KEY` for production admin magic-link email delivery
- `MAGIC_LINK_FROM_EMAIL` for production admin magic-link email delivery
- `MAGIC_LINK_FROM_NAME` optional display name for magic-link emails. Defaults to `SentientWeb`.
- `OPENAI_API_KEY` or tenant-level OpenAI API keys for knowledge embeddings
- `GEMINI_API_KEY` when using Gemini as the fallback provider

Production note:

- valid admin magic links are delivered through Resend in production; they are not shown in logs or on-screen previews
- if Resend delivery is unavailable, production `/admin/login` returns `503` and production first-tenant bootstrap refuses to proceed or redirects back to login with a delivery-failure banner after token revocation

## Secret rotation

- New tenant secrets are stored as versioned ciphertext bound to `ENCRYPTION_SECRET`.
- During rollout, legacy unversioned tenant secrets can still be decrypted with the old session-secret-derived key when `SESSION_SECRET` is present.
- Re-encrypt legacy tenant secrets with:
  - `npm run secrets:reencrypt -- --dry-run`
  - `npm run secrets:reencrypt -- --apply`

## Knowledge embeddings

- Knowledge crawl ingestion and retrieval remain OpenAI-backed even when chat uses Gemini.
- Gemini chat tenants still need either the platform `OPENAI_API_KEY` or an OpenAI tenant key when knowledge features are enabled.
- If no usable OpenAI embedding key is available, knowledge retrieval is unavailable rather than silently degraded.

## Key routes

- `/` first-tenant bootstrap
- `/admin/login` magic-link login
- `/admin` operator dashboard
- `/admin/activity` audit trail and booking outcomes
- `/admin/settings` branding, AI, triggers, integrations, crawl, and document upload

## Public APIs

- `GET /api/widget-config?siteKey=...`
- `POST /api/events`
- `POST /api/agent/message`
- `POST /api/onboarding/crawl`
- `GET /api/onboarding/crawl/:jobId`

## Hosting on Render

- Use the included `render.yaml` blueprint to provision the Phase 1 topology.
- Set `FIRST_TENANT_BOOTSTRAP_SECRET` on the web service if production first-tenant bootstrap should stay enabled.
- Keep `FIRST_TENANT_BOOTSTRAP_SECRET` in Render secret storage. If it is set in any environment, secure bootstrap mode is active and `/` requires the secret until the first tenant exists.
- Set `TRUST_PROXY_HEADERS=true` only on deployments that sit behind a trusted proxy layer that rewrites forwarding headers.
- Configure `RESEND_API_KEY` and `MAGIC_LINK_FROM_EMAIL` on the web service before using production admin login or production first-tenant bootstrap.
- `MAGIC_LINK_FROM_NAME` is optional; if omitted, production emails default to `SentientWeb`.
- Run the public app as a web service with `npm run start:web`.
- Run BullMQ consumers as a separate worker service with `npm run start:worker`.
- Keep `START_WORKER=false` on the web service and `START_WORKER=true` on the worker service.
- Keep `REDIS_URL` configured on both the web service and the worker service. Public APIs and BullMQ consumers are fail-closed in this branch.
- Use `/healthz` for liveness and `/readyz` for dependency readiness checks. `/readyz` returns `503` when database or Redis is unavailable.
- Run Prisma migrations from one owner only via `npm run render:predeploy`.
- Use the internal Render Postgres and Key Value connection URLs in production.
- Configure Render Key Value with the `noeviction` maxmemory policy because it backs BullMQ queues.
- Keep Render Key Value internal auth disabled initially for lowest ops. If you enable it later, migrate every service to the authenticated internal URL first.
- Keep `app.sentientweb.com` for the B2B app. Add `shopify.sentientweb.com` later as a separate web service in Phase 3.

## Embed snippet

```html
<script
  src="https://cdn.sentientweb.com/agent.js"
  data-site-key="sw_pub_xxx"
></script>
```

For local development, serve `/agent.js` from this app and point the snippet at your dev host.
