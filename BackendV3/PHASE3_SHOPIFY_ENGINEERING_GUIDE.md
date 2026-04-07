# Phase 3 Shopify Engineering Guide

This document is the implementation handoff for engineers who will expand `sentientweb-agent` from a B2B-only product into a Shopify-enabled product during Phase 3.

Read this document before writing any Shopify code.

## Purpose

By the end of Phase 3, we want:

- the existing B2B product to keep working without a rewrite
- a new Shopify app surface at `shopify.sentientweb.com`
- the same agent core to support both B2B and Shopify tenants
- Shopify-specific commerce tools to plug into the existing tool-calling engine
- Shopify traffic, webhooks, and app proxy requests to stay isolated from the B2B runtime

This guide is intentionally detailed and procedural. Follow it in order.

## Read This First

Do not start Phase 3 by adding Shopify routes directly to the current B2B adapter.

Do not start Phase 3 by writing UI first.

Do not hand-roll legacy OAuth unless there is a specific blocker with Shopify's current embedded-app flow.

Do not deploy Shopify on `app.sentientweb.com`.

Do not assume the old Shopify code is already in this repo. It is not.

Do not trust any customer identifier that comes from a storefront request until you validate the request source and confirm the app proxy/session context.

If you are unsure where to begin, begin with the checklist in the `Execution Order` section below. Do not skip ahead.

## Current Repo State

The current repo is a Phase 1 B2B app. Important files:

- `app/lib/adapter.types.ts`
- `app/lib/agent.server.ts`
- `app/lib/b2b-adapter.server.ts`
- `app/lib/knowledge-base.server.ts`
- `app/lib/queue.server.ts`
- `app/routes/api.agent.message.tsx`
- `app/routes/api.events.tsx`
- `prisma/schema.prisma`
- `render.yaml`

Important facts about the current state:

- `PlatformAdapter` is still B2B-shaped. It has methods like `qualifyLead`, `bookDemo`, and `createCrmContact`.
- The agent runtime in `app/lib/agent.server.ts` hardcodes B2B tool definitions.
- The Prisma schema has no Shopify store/session/install tables yet.
- Render is already set up for a separate web service and worker service.
- The repo does not currently contain the old V0.1 Shopify modules referenced in `Phase3.md`.

This means Phase 3 is not "wire up the missing route". It is a controlled architecture expansion.

## Target Architecture

We are keeping one universal core and adding a second platform surface.

### Services

- `app.sentientweb.com`
  - existing B2B dashboard
  - existing widget config/events/agent APIs
- `shopify.sentientweb.com`
  - Shopify install entrypoint
  - embedded admin app
  - Shopify webhooks
  - Shopify app proxy endpoints
- `worker`
  - shared BullMQ background processing for crawl jobs and later Shopify async jobs

### Platform model

- B2B stays a website-visitor product
- Shopify becomes a second tenant platform
- both platforms share:
  - conversation storage
  - tool execution logging
  - AI provider registry
  - encryption
  - Redis-backed queues and rate limits
  - the core agent orchestration loop

### What must remain isolated

- Shopify auth logic
- Shopify webhook ingestion
- Shopify app proxy handling
- Shopify Admin API and Storefront API client code
- Shopify merchant UI

Do not mix these concerns into the existing B2B public APIs.

## Non-Negotiable Rules

1. B2B behavior must keep working while Shopify is being built.
2. One database migration owner only. Do not let every service run migrations.
3. Webhooks must acknowledge quickly and offload non-trivial work to the queue.
4. App proxy handlers must not depend on cookies. Shopify strips them.
5. Embedded app auth should use Shopify-managed installation plus token exchange.
6. The new architecture must be capability-driven, not "if platform == shopify" scattered everywhere.
7. If the archived V0.1 Shopify code cannot be recovered, document the missing modules before replacing them.

## Official Shopify Rules That Matter Here

These are current platform rules that directly affect implementation:

- Embedded apps should use Shopify-managed installation and token exchange. This is the recommended path, not legacy authorization-code OAuth.
- App proxy requests add signed query parameters such as `shop`, `path_prefix`, `timestamp`, `signature`, and optionally `logged_in_customer_id`.
- App proxies do not support cookies. Shopify strips `Cookie` and `Set-Cookie`.
- Shopify webhook HTTPS delivery requires:
  - connection acceptance within 1 second
  - full response within 5 seconds
  - quick `200 OK` acknowledgment
  - queueing if work cannot finish immediately

Sources:

- Shopify authentication and authorization: `https://shopify.dev/docs/apps/build/authentication-authorization`
- Shopify managed installation: `https://shopify.dev/docs/apps/build/authentication-authorization/app-installation`
- Shopify app proxies: `https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies`
- Shopify HTTPS webhooks: `https://shopify.dev/docs/apps/build/webhooks/subscribe/https`

## Prerequisites Before Coding

Do all of this before opening your first Phase 3 feature PR:

1. Read `Phase3.md` fully.
2. Read this guide fully.
3. Confirm you can run the current Phase 1 app locally.
4. Confirm you understand the current B2B adapter and agent runtime.
5. Get access to:
   - Shopify Partner Dashboard
   - a Shopify development store
   - Render dashboard
   - production/staging environment variable management
6. Recover or locate the archived V0.1 Shopify modules if they exist.
7. Decide whether the Shopify surface will live:
   - in the same repo as a new route namespace, which is the recommended default
   - or as a separate package/app inside the same repository if the embedded admin UI becomes too large

## Recover The Archived Shopify Modules First

`Phase3.md` assumes we can reuse code from the old Shopify version. That code is not in this repo right now.

Before rebuilding anything from scratch, try to recover these modules from the archive:

- `product-search.server.ts`
- `context.server.ts`
- `cart.server.ts`
- `discounts.server.ts`
- `policies.server.ts`
- `reviews.server.ts`
- `shopify-customer.server.ts`
- any HMAC verification helpers for app proxy requests
- any Shopify Admin API client setup
- any Storefront API client setup

Recommended landing directory after recovery:

```text
app/lib/shopify/
  admin-client.server.ts
  storefront-client.server.ts
  auth.server.ts
  hmac.server.ts
  product-search.server.ts
  product-context.server.ts
  cart.server.ts
  discounts.server.ts
  policies.server.ts
  reviews.server.ts
  customer.server.ts
  orders.server.ts
  refunds.server.ts
  proxy.server.ts
  webhooks.server.ts
```

If the archive is missing, do not panic. Write a short note in the PR description that the module had to be rebuilt from scratch, and keep the same file boundaries so the architecture stays understandable.

## Execution Order

Follow this exact order.

### Step 1: Refactor the adapter interface before adding Shopify code

The current `PlatformAdapter` is too B2B-specific. Do not bolt Shopify methods onto it in an ad hoc way.

Refactor it into capability groups.

Recommended direction:

```ts
export interface KnowledgeCapability {
  searchKnowledgeBase(query: string, topK?: number): Promise<KnowledgeSearchResult[]>;
}

export interface LeadCapability {
  qualifyLead(input: QualificationInput): Promise<Lead>;
  createCrmContact?(input: CrmContactInput): Promise<unknown>;
  routeToHuman(input: HandoffInput): Promise<unknown>;
}

export interface BookingCapability {
  checkCalendarAvailability?(input: AvailabilityInput): Promise<unknown>;
  bookDemo?(input: BookingInput): Promise<unknown>;
}

export interface CommerceCapability {
  searchProducts?(query: string): Promise<unknown[]>;
  getProductDetails?(productId: string): Promise<unknown>;
  getCart?(sessionId: string): Promise<unknown>;
  addToCart?(input: unknown): Promise<unknown>;
  applyDiscount?(input: unknown): Promise<unknown>;
  getOrderStatus?(input: unknown): Promise<unknown>;
  issueRefund?(input: unknown): Promise<unknown>;
  getPolicies?(): Promise<unknown>;
}

export interface BehaviorCapability {
  getVisitorContext(sessionId: string): Promise<BehaviorEvent[]>;
}

export interface PlatformAdapter {
  name: string;
  platform: "b2b" | "shopify";
  knowledge?: KnowledgeCapability;
  lead?: LeadCapability;
  booking?: BookingCapability;
  commerce?: CommerceCapability;
  behavior?: BehaviorCapability;
}
```

Why this must happen first:

- the current agent runtime hardcodes B2B tools
- Shopify will need commerce tools that do not make sense for B2B
- B2B still needs its current lead and booking tools
- capability-based registration keeps the core clean

Do not remove working B2B behavior in the same PR that introduces capability types. First refactor, then keep B2B passing, then add Shopify.

### Step 2: Refactor the agent tool registry

After capability refactor, update `app/lib/agent.server.ts` so tools are registered dynamically from adapter capabilities.

Target behavior:

- B2B tenants get:
  - `search_knowledge_base`
  - `qualify_lead`
  - `check_calendar_availability`
  - `book_demo`
  - `create_crm_contact`
  - `route_to_human`
  - `get_visitor_context`
- Shopify tenants get:
  - `search_knowledge_base`
  - `search_products`
  - `get_product_details`
  - `get_cart`
  - `add_to_cart`
  - `apply_discount`
  - `check_order_status`
  - `issue_refund`
  - `get_policies`
  - `route_to_human`
  - `get_visitor_context`

Do not register tools by platform name alone. Register them by whether the adapter exposes the capability method.

### Step 3: Extend the data model

Current Prisma models are B2B-oriented. Add Shopify-specific persistence before writing install/auth logic.

Recommended additions:

#### Extend `Tenant`

Add fields similar to:

- `platform String @default("b2b")`
- `shopifyShopDomain String? @unique`
- `shopifyStorefrontAccessTokenEncrypted String?`
- `shopifyScopes String?`
- `shopifyAppInstalledAt DateTime?`
- `shopifyUninstalledAt DateTime?`
- `shopifyDefaultRefundLimit Decimal?`
- `shopifySettings Json @default("{}")`

Do not overload `primaryDomain` to mean a Shopify shop domain. Keep B2B site domains and Shopify shop domains conceptually separate.

#### Add a session table for Shopify

You need persistent Shopify sessions or tokens. Recommended model:

```prisma
model ShopifySession {
  id           String   @id
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  shopDomain    String
  state         String?
  isOnline      Boolean
  scope         String?
  accessTokenEncrypted String @db.Text
  expiresAt     DateTime?
  userId        String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tenantId, shopDomain])
}
```

If you use Shopify's official session storage contract, adapt the exact columns to the library requirements.

#### Add webhook audit storage

Recommended model:

```prisma
model ShopifyWebhookReceipt {
  id          String   @id @default(uuid())
  tenantId     String?
  shopDomain   String
  topic        String
  deliveryId   String?
  status       String   @default("received")
  payload      Json
  errorMessage String?  @db.Text
  receivedAt   DateTime @default(now())
  processedAt  DateTime?

  @@index([shopDomain, topic, receivedAt])
  @@index([deliveryId])
}
```

This makes debugging much easier for new engineers.

#### Extend conversation context

You will also likely need:

- `Conversation.platform`
- `Conversation.externalSessionId`
- `Conversation.shopifyCustomerId`
- `Conversation.shopifyCartId`

Keep these nullable so B2B rows do not break.

### Step 4: Add Shopify dependencies

Before writing auth and API logic, add the Shopify packages you will actually use.

Expected additions:

- `@shopify/shopify-api`
- `@shopify/shopify-app-react-router`
- `@shopify/app-bridge-react`

You may also add Polaris-related packages for the embedded admin UI if needed.

Do not add random third-party Shopify wrappers unless there is a clear gap in the official libraries.

### Step 5: Add the Shopify service layer

Create a clean `app/lib/shopify/` directory and keep Shopify code there.

Recommended file structure:

```text
app/lib/shopify/
  admin-client.server.ts
  storefront-client.server.ts
  auth.server.ts
  session-storage.server.ts
  hmac.server.ts
  adapter.server.ts
  products.server.ts
  cart.server.ts
  discounts.server.ts
  orders.server.ts
  refunds.server.ts
  policies.server.ts
  reviews.server.ts
  customers.server.ts
  proxy.server.ts
  webhooks.server.ts
```

Rules:

- `admin-client.server.ts` should only deal with authenticated Admin API clients
- `storefront-client.server.ts` should only deal with Storefront API clients
- `adapter.server.ts` should translate Shopify services into the universal adapter capabilities
- route files should stay thin and call service functions

Do not write GraphQL query strings inline in route files unless it is a temporary spike.

### Step 6: Build the Shopify adapter

Create `app/lib/shopify/adapter.server.ts`.

This file should:

- implement the new capability-based `PlatformAdapter`
- normalize Shopify types into universal agent-friendly shapes
- hide Admin API vs Storefront API differences from the core agent runtime

Recommended Shopify capability map:

- `knowledge.searchKnowledgeBase`
  - search store policies
  - search FAQ/static content
  - optionally combine store docs from Phase 1 knowledge engine
- `commerce.searchProducts`
  - product lookup by natural language
- `commerce.getProductDetails`
  - variants, price, inventory, description, maybe reviews
- `commerce.getCart`
  - current cart contents
- `commerce.addToCart`
  - storefront cart mutation
- `commerce.applyDiscount`
  - storefront discount-code mutation
- `commerce.getOrderStatus`
  - admin order lookup with proper guardrails
- `commerce.issueRefund`
  - admin refund mutation with merchant-configured limits
- `lead.routeToHuman`
  - notify merchant or support inbox
- `behavior.getVisitorContext`
  - recent storefront behavior events for that conversation/session

Do not implement `qualifyLead` or `bookDemo` on Shopify just to satisfy an old interface. That is exactly why we are refactoring the interface first.

### Step 7: Build auth the correct way

For the embedded admin app, use Shopify-managed installation and token exchange.

This is the recommended path from Shopify for embedded apps.

What this means in practice:

- use Shopify CLI to define scopes in app config
- let Shopify manage installation/scope updates
- use session tokens and token exchange for the embedded admin surface
- store the offline access token for server-side Admin API calls

Do not choose the manual authorization-code flow unless there is a proven blocker with the official embedded flow.

Recommended auth files:

```text
app/lib/shopify/auth.server.ts
app/lib/shopify/session-storage.server.ts
app/routes/shopify.auth.$.tsx
```

Recommended route responsibilities:

- `shopify.auth.$.tsx`
  - start or resume auth
  - let Shopify library handle install/callback behavior
- `shopify.app.tsx`
  - authenticate the embedded admin request
  - render the embedded app shell
- `shopify.app._index.tsx`
  - merchant home/settings page

If you cannot use the official package for some reason, stop and document why in a design note before falling back to manual HMAC/OAuth.

### Step 8: Add app proxy handlers

The storefront-facing widget for Shopify should come through an app proxy route, not the existing B2B widget endpoint.

Recommended route:

```text
app/routes/shopify.proxy.$.tsx
```

What this route must do:

1. verify the app proxy signature
2. extract the `shop` value safely
3. read `path_prefix`, `timestamp`, and any customer context
4. load the correct tenant by Shopify shop domain
5. create or reuse a storefront conversation/session
6. call the shared agent runtime with the Shopify adapter

Critical app proxy rules:

- do not rely on cookies
- do not assume `logged_in_customer_id` is enough by itself
- do not hardcode the path prefix, because merchants can customize it
- preserve the raw query string needed for signature verification

### Step 9: Add webhook handlers

Recommended route:

```text
app/routes/shopify.webhooks.tsx
```

The route must:

1. read the raw body before JSON parsing
2. verify webhook authenticity
3. respond quickly with `200 OK`
4. enqueue slow work
5. process webhook side effects asynchronously

Suggested topics for initial Phase 3 support:

- `APP_UNINSTALLED`
- `ORDERS_CREATE`
- `ORDERS_UPDATED`
- `CUSTOMERS_DATA_REQUEST`
- `CUSTOMERS_REDACT`
- `SHOP_REDACT`

If privacy topics are enabled, the implementation must actually delete or redact all Shopify-related data we store. Do not repeat the stale-webhook problem from the old codebase.

Webhook implementation rules:

- make handlers idempotent
- log each receipt
- never block on long downstream calls before returning `200`
- if a webhook changes tenant installation state, persist that change immediately

### Step 10: Build the embedded Shopify admin surface

The merchant-facing app UI should live under a Shopify route namespace.

Recommended routes:

```text
app/routes/shopify.app.tsx
app/routes/shopify.app._index.tsx
app/routes/shopify.app.settings.tsx
app/routes/shopify.app.activity.tsx
```

Minimum merchant UI for the first Phase 3 milestone:

- installation success screen
- basic store status
- AI on/off toggle
- refund limit setting
- proactive discount rules
- human handoff destination
- activity log for agent actions

Do not try to clone the full B2B dashboard inside Shopify on day one.

### Step 11: Add Render deployment for the Shopify surface

Extend `render.yaml` with a new web service for `shopify.sentientweb.com`.

It should:

- use the same repository
- use the same database
- use the same Redis/Key Value service
- not own migrations
- have its own domain
- have its own health check
- have its own Shopify env vars

Expected additional environment variables:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL=https://shopify.sentientweb.com`
- `SHOPIFY_SCOPES=...`
- `SHOPIFY_WEBHOOK_SECRET` if required by the chosen library setup

Keep the B2B service and Shopify service operationally separate even if they share the same repo and database.

### Step 12: Add background jobs for Shopify async work

The existing worker and queue model should be reused.

Add queue jobs for:

- webhook follow-up processing
- sync or reconciliation jobs
- large catalog ingestion
- delayed merchant notifications

Do not process bursty Shopify work inside the request/response cycle.

## Recommended File And PR Breakdown

New grads should not try to do Phase 3 in one giant PR.

Recommended PR sequence:

1. `adapter-capabilities-refactor`
   - refactor `PlatformAdapter`
   - refactor B2B adapter
   - refactor tool registration
2. `shopify-schema-and-env`
   - Prisma schema additions
   - env vars
   - base Render changes
3. `shopify-auth-foundation`
   - Shopify library setup
   - session storage
   - install/auth routes
4. `shopify-service-layer`
   - Admin API client
   - Storefront API client
   - product/cart/order/policy services
5. `shopify-adapter-and-agent-tools`
   - Shopify adapter
   - tool mapping
   - conversation plumbing
6. `shopify-proxy-and-widget-flow`
   - app proxy route
   - storefront conversation flow
7. `shopify-webhooks-and-async-jobs`
   - webhook route
   - queue processing
8. `shopify-embedded-admin-ui`
   - merchant app UI
9. `phase3-hardening`
   - observability
   - retries
   - privacy/redaction
   - rollout controls

This order reduces risk and keeps reviews understandable.

## Minimum Acceptance Criteria For Each Major Area

### Adapter refactor is complete when

- B2B still works with no Shopify code path exercised
- tools are capability-driven
- no route imports the B2B adapter by hardcoded name unless that route is B2B-only

### Schema work is complete when

- a Shopify tenant can be stored without corrupting B2B rows
- a Shopify session or token can be stored and reloaded
- a webhook receipt can be logged

### Auth work is complete when

- a development store can install the app
- the embedded admin UI loads
- offline access tokens are stored securely
- reinstall works cleanly

### App proxy work is complete when

- signed app proxy requests are accepted
- invalid signatures are rejected
- no cookies are required
- storefront requests resolve to the correct tenant

### Webhook work is complete when

- invalid HMACs are rejected
- valid webhooks return `200` quickly
- slow follow-up work is queued
- repeated delivery does not cause duplicate destructive actions

### Shopify adapter work is complete when

- the AI can search products
- the AI can inspect a cart
- the AI can answer policy questions
- the AI can escalate to a human
- no B2B-only tool is exposed on Shopify by accident

## Common Mistakes To Avoid

### Mistake 1: Adding `if (tenant.platform === "shopify")` everywhere

This creates long-term code rot.

Correct approach:

- centralize platform branching in adapter creation
- centralize tool exposure in capability registration

### Mistake 2: Reusing B2B lead/demo models for Shopify actions

Shopify is commerce/support first, not lead generation first.

Correct approach:

- add Shopify-specific state where needed
- keep lead/demo models available only where they make sense

### Mistake 3: Trusting storefront identity too early

App proxy signatures only prove request integrity. They do not mean every query parameter can be blindly trusted for data access.

Correct approach:

- verify signature
- load tenant by shop domain
- validate customer-specific access before returning sensitive data

### Mistake 4: Parsing webhook JSON before preserving the raw body

That can break HMAC verification.

Correct approach:

- read raw body first
- verify HMAC
- then parse/process

### Mistake 5: Doing heavy webhook work inline

That will eventually fail under load.

Correct approach:

- record receipt
- enqueue
- return `200`

### Mistake 6: Building Shopify UI before auth/session storage

You will waste time on a UI that cannot authenticate correctly.

Correct approach:

- auth first
- data model second
- service layer third
- UI after the backend works

### Mistake 7: Putting Shopify secrets in the browser

Never do this.

Correct approach:

- keep Admin API tokens and secrets server-side only
- only expose safe public identifiers needed by the embedded UI

## Local Development Checklist

Before opening a Phase 3 PR, confirm all of the following locally:

- current B2B flows still load
- Prisma migrate works with the new schema
- Shopify auth route can run in development
- Shopify session storage persists correctly
- webhook verification succeeds against a test payload
- invalid webhook signature is rejected
- app proxy signature verification succeeds with a known-good query string
- at least one Shopify Admin API query works
- at least one Storefront API mutation works
- no queue consumer accidentally starts in the web service when `START_WORKER=false`

## Suggested Testing Matrix

### Unit tests

- HMAC verification for app proxy
- HMAC verification for webhooks
- tenant lookup by shop domain
- adapter capability registration
- refund rule enforcement
- dynamic tool exposure

### Integration tests

- install app on development store
- open embedded app
- trigger app proxy request from storefront
- ask product question and get product data back
- add item to cart
- apply discount
- process uninstall webhook

### Manual QA

- uninstall and reinstall app
- invalid shop domain rejected
- invalid signature rejected
- missing session handled gracefully
- Shopify outage in one store does not break B2B endpoints

## Recommended Rollout Order

Do not ship all Shopify features at once.

Ship in this order:

1. install/auth/session storage
2. product search and policy answers
3. cart read support
4. cart mutation support
5. merchant admin UI
6. webhooks
7. discount automation
8. refund automation

Refund automation should be last because it carries the highest operational risk.

## Definition Of Done For Phase 3

Phase 3 is done when all of the following are true:

- B2B remains stable
- Shopify app can install on a dev store
- Shopify app has a working embedded admin UI
- Shopify storefront requests use app proxy verification
- Shopify webhooks are authenticated and queued appropriately
- the agent can use Shopify-specific tools without breaking B2B tools
- the Shopify surface runs on `shopify.sentientweb.com`
- the worker handles async jobs without the web service consuming them
- privacy and uninstall behavior are implemented, not just stubbed

## Final Advice For New Engineers

If you feel tempted to "just wire one quick Shopify endpoint into the current B2B app", stop.

The easiest-looking shortcut is usually the one that creates the next month's cleanup work.

Phase 3 will go well if you do these three things:

1. refactor the adapter shape first
2. keep Shopify code in its own service layer and route namespace
3. treat auth, app proxy verification, and webhooks as platform-critical infrastructure, not boilerplate

If you get stuck, bring the question back to this rule:

"Does this change keep the core generic and the platform-specific logic isolated?"

If the answer is no, redesign the change before merging it.
