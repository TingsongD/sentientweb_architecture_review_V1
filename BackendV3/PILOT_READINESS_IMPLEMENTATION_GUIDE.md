# Pilot Readiness Implementation Guide

This guide describes how to implement and test the short Phase 1 pilot-readiness sprint before starting Phase 2.

The goal is not a broad product redesign. The goal is to make the existing Phase 1 app safe to pilot with real B2B leads.

## Objective

Implement four focused improvements:

1. Qualification enforcement and booking gate
2. Async CRM sync with retry/audit trail
3. Sales acceptance tracking for booked demos
4. Token-aware chunking for lower-risk retrieval accuracy

After these are complete, the app should be ready for pilot-style end-to-end testing:

- visitor chats
- lead gets qualified
- demo booking is gated correctly
- CRM sync happens asynchronously
- sales rep can mark the booking accepted or rejected

## Scope

In scope:

- qualification score and booking eligibility
- server-side booking enforcement
- CRM queueing and retry
- CRM audit records
- sales disposition fields and admin controls
- tokenizer-backed chunking

Out of scope:

- guided interactive pages
- voice routing
- onboarding wizard
- broad tool parallelization
- Phase 2 content engine work

## Files To Touch

These are the main files for this sprint:

- `prisma/schema.prisma`
- `prisma/migrations/<new_migration>/migration.sql`
- `app/lib/adapter.types.ts`
- `app/lib/b2b-adapter.server.ts`
- `app/lib/agent.server.ts`
- `app/lib/ai/prompt-builder.ts`
- `app/lib/queue.server.ts`
- `app/lib/webhook-crm.server.ts`
- `app/worker.ts`
- `app/routes/admin._index.tsx`
- `app/routes/admin.activity.tsx`
- `app/lib/chunking.server.ts`
- `package.json`

You will also add two new service modules:

- `app/lib/qualification.server.ts`
- `app/lib/crm-sync.server.ts`

## Implementation Order

Do the work in this order. Do not start with the UI.

### Step 1: Extend the Prisma schema

Update `Lead` with pilot-readiness qualification state:

- `companyDomain String?`
- `authorityConfirmed Boolean @default(false)`
- `icpFit String @default("unknown")`
- `qualificationScore Float @default(0)`
- `bookingEligible Boolean @default(false)`

Update `DemoBooking` with sales review state:

- `salesDisposition String @default("pending")`
- `salesDispositionReason String?`
- `reviewedAt DateTime?`

Add a new `CrmSyncEvent` model for async CRM delivery tracking:

- `tenantId`
- `conversationId`
- `leadId`
- `toolExecutionId`
- `webhookUrl`
- `status`
- `attempts`
- `responseStatus`
- `payload`
- `errorMessage`
- `processedAt`
- timestamps

Add the needed back-relations on:

- `Tenant`
- `Conversation`
- `Lead`
- `ToolExecution`

Add indexes for:

- `Lead.bookingEligible`
- `DemoBooking.salesDisposition`
- `CrmSyncEvent (tenantId, status, createdAt)`

After editing the schema:

1. Create a migration directory under `prisma/migrations/`
2. Write the SQL migration
3. Run `npm run prisma:generate`

## Step 2: Add deterministic qualification logic

Create `app/lib/qualification.server.ts`.

This module should:

1. normalize business email domains
2. reject free-email domains as company-domain evidence
3. normalize ICP fit into one of:
   - `match`
   - `no_match`
   - `unknown`
4. infer authority from senior roles when possible
5. compute:
   - `qualificationScore`
   - `bookingEligible`
   - `missingFields`

Use this exact scoring model:

- company domain = `0.25`
- use case = `0.25`
- ICP match = `0.25`
- authority = `0.25`

Rules:

- score values should be one of `0`, `0.25`, `0.5`, `0.75`, `1.0`
- `bookingEligible` is `true` only if all four are satisfied
- missing fields must use these keys:
  - `companyDomain`
  - `useCase`
  - `icpMatch`
  - `authority`

Recommended authority role matches:

- founder
- co-founder
- owner
- chief
- ceo
- cmo
- cto
- cro
- coo
- president
- vp
- vice president
- head
- director
- gm
- general manager

Recommended free-email denylist:

- gmail.com
- googlemail.com
- yahoo.com
- hotmail.com
- outlook.com
- icloud.com
- me.com
- aol.com
- proton.me
- protonmail.com
- live.com
- msn.com

## Step 3: Update the adapter contract

In `app/lib/adapter.types.ts`:

- extend `QualificationInput` with:
  - `companyDomain`
  - `authorityConfirmed`
  - `icpFit`
- extend `CrmContactInput` with:
  - `conversationId`
  - `companyDomain`
- change `qualifyLead()` so it returns an object, not just a `Lead`

Expected return shape:

```ts
{
  lead: Lead;
  qualificationScore: number;
  bookingEligible: boolean;
  missingFields: string[];
}
```

Also allow `createCrmContact()` to accept an optional `toolExecutionId` so queue/audit records can link back to the tool call.

## Step 4: Update the B2B adapter

In `app/lib/b2b-adapter.server.ts`:

1. import the qualification helper
2. compute qualification state on every `qualifyLead()` call
3. persist the following on `Lead`:
   - `companyDomain`
   - `authorityConfirmed`
   - `icpFit`
   - `qualificationScore`
   - `bookingEligible`
4. update `Conversation.qualification` with the same data plus `missingFields`
5. return the richer qualification result object

For `createCrmContact()`:

- stop posting the webhook inline
- enqueue a CRM sync event instead
- return a queued result immediately

Expected immediate tool result:

```ts
{
  ok: true,
  status: "queued",
  crmSyncEventId: "..."
}
```

## Step 5: Add CRM queue processing

Extend `app/lib/queue.server.ts`:

- keep the existing crawl queue
- add a new queue name for CRM sync
- add:
  - `getCrmSyncQueue()`
  - `createCrmSyncWorker()`

Create `app/lib/crm-sync.server.ts`.

This module should do four things:

1. `enqueueCrmSyncEvent()`
2. `processCrmSyncEvent()`
3. `startCrmSyncWorker()`
4. `stopCrmSyncWorker()`

### CRM sync behavior

When enqueuing:

- create a `CrmSyncEvent` row first
- enqueue a BullMQ job containing `crmSyncEventId`

When processing:

- mark status as `processing`
- call the existing CRM webhook helper
- on success:
  - mark CRM event `success`
  - store `responseStatus`
  - set `processedAt`
  - update linked `ToolExecution` output to success
- on failure:
  - set status to `retrying` or `failed`
  - increment `attempts`
  - persist `errorMessage`
  - update linked `ToolExecution` output to reflect retry/failure

Recommended queue policy:

- attempts: `4`
- backoff: exponential
- initial delay: `5000ms`

Do not move `route_to_human` into the queue in this sprint.

## Step 6: Start the CRM worker from the worker process

In `app/worker.ts`:

- keep starting the knowledge worker
- also start the CRM sync worker
- only fail the process if neither worker can start
- stop both workers during shutdown

The worker process should now own:

- crawl jobs
- CRM sync jobs

The web process should still not own background consumers.

## Step 7: Gate booking inside the agent runtime

In `app/lib/agent.server.ts`, make the booking gate enforceable in two places:

### 1. Tool exposure

Create a helper that builds the tool list dynamically from current lead state.

Always expose:

- `search_knowledge_base`
- `qualify_lead`
- `route_to_human`
- `get_visitor_context`

Only expose these when `activeLead?.bookingEligible === true`:

- `check_calendar_availability`
- `book_demo`
- `create_crm_contact`

### 2. Server-side tool execution guard

Even if the model somehow calls booking tools too early, reject them at execution time.

For `check_calendar_availability` and `book_demo`:

- return a structured error object if the lead is not eligible
- include `missingFields`

For `create_crm_contact`:

- reject it if the lead is not fully qualified

This server-side gate matters more than the prompt.

## Step 8: Improve the prompt, but do not rely on it

In `app/lib/ai/prompt-builder.ts`:

- explicitly instruct the agent to collect:
  - company domain
  - use case
  - ICP match
  - authority
- explicitly state that free-email domains do not satisfy the company-domain requirement
- explicitly say not to offer demo booking until the tool result says booking is eligible
- include tenant qualification prompts if they exist
- instruct the model to ask for missing fields directly when the tool returns them

Important:

- the prompt helps
- the real protection is still the server gate

## Step 9: Add sales review controls to the admin UI

In `app/routes/admin.activity.tsx`:

- add an `action()` handler for booking review updates
- support a single form intent such as `review-booking`
- allow operators to set:
  - `salesDisposition`
  - `salesDispositionReason`
- when disposition is `accepted` or `rejected`, set `reviewedAt`
- when disposition is reset to `pending`, clear `reviewedAt`

Also extend the loader to fetch recent `CrmSyncEvent` rows.

Update the page so it shows:

1. booking outcomes with editable sales review controls
2. CRM sync audit table with:
   - created time
   - status
   - attempts

Keep this UI minimal. A simple form per booking row is enough.

## Step 10: Add pilot metrics to the dashboard

In `app/routes/admin._index.tsx`:

- count only booking-eligible leads as “Qualified leads”
- compute:
  - `acceptedCount`
  - `reviewedCount`
  - `acceptanceRate`

Acceptance rate formula:

```ts
acceptedCount / reviewedCount
```

If `reviewedCount === 0`, display a pending state instead of `0%`.

Also show recent bookings with `salesDisposition` visible.

## Step 11: Replace rough token estimation

Install `js-tiktoken`.

Update `app/lib/chunking.server.ts` so:

- `estimateTokens()` uses a real tokenizer
- fallback stays `length / 4` only if tokenizer initialization fails
- chunk assembly is based on estimated token count, not `maxTokens * 3` word heuristics alone

Recommended approach:

1. normalize whitespace
2. build chunks word by word
3. stop growing the chunk when token count would exceed `maxTokens`
4. keep overlap in words for now

Do not refactor retrieval ranking in this sprint.

## Step 12: Keep the existing CRM webhook transport

Do not rewrite `app/lib/webhook-crm.server.ts` into a new protocol.

Reuse the existing `pushCrmContactWebhook()` function.

Only change when it is called:

- before: directly inside the chat turn
- after: inside the worker-backed CRM sync processor

This keeps the sprint small.

## Database Migration Checklist

After code changes:

1. run `npm run prisma:generate`
2. apply the new migration to your local database
3. verify new columns and the `CrmSyncEvent` table exist

Suggested commands:

```bash
npm run prisma:generate
npm run migrate:deploy
```

If you use a local dev database with manual resets, make sure the migration order is correct.

## Local Verification Checklist

Run these commands after implementation:

```bash
npm run prisma:generate
npm run typecheck
npm run build
```

Note:

- `npm run lint` may already fail on `public/widget/mouse-tracker.js` due to a pre-existing parser issue unrelated to this sprint

## Manual Test Plan

Run the tests in this order.

### Test 1: Incomplete lead cannot book

Scenario:

- start a conversation
- ask pricing questions
- provide only name and a Gmail address

Expected:

- `qualify_lead` result includes missing fields
- `qualificationScore` is below `1.0`
- `bookingEligible` is `false`
- booking tools are not exposed on later turns
- if the model tries anyway, `book_demo` returns a blocked result

### Test 2: Fully qualified lead can book

Scenario:

- provide business email with real company domain
- provide clear use case
- confirm ICP match
- provide authority signal such as Founder or VP Sales

Expected:

- `qualificationScore === 1.0`
- `bookingEligible === true`
- booking tools become available
- booking succeeds if Calendly is configured

### Test 3: CRM sync no longer blocks the visitor response

Scenario:

- trigger `create_crm_contact`
- intentionally point CRM webhook at a slow or test endpoint

Expected:

- agent response returns quickly
- tool result is `queued`
- `CrmSyncEvent` row exists
- worker processes the webhook later

### Test 4: CRM retry behavior works

Scenario:

- configure CRM webhook to fail

Expected:

- CRM sync event status moves through `queued` -> `processing` -> `retrying` -> `failed`
- attempts increment
- linked tool execution output updates

### Test 5: Sales review updates persist

Scenario:

- mark a booked demo as `accepted`
- add a reason
- then change it to `rejected`

Expected:

- `salesDisposition` changes persist
- `salesDispositionReason` persists
- `reviewedAt` is set when accepted/rejected
- dashboard acceptance rate changes accordingly

### Test 6: Token-aware chunking stays within target

Scenario:

- ingest a long document

Expected:

- chunk sizes are materially closer to configured token targets
- no retrieval or embedding regression in build/typecheck

## Expected Data Shapes

### `qualify_lead` result

```json
{
  "lead": {
    "id": "lead-id",
    "email": "founder@acme.com",
    "companyDomain": "acme.com",
    "useCase": "Automating inbound SDR qualification",
    "icpFit": "match",
    "authorityConfirmed": true,
    "qualificationScore": 1,
    "bookingEligible": true
  },
  "qualificationScore": 1,
  "bookingEligible": true,
  "missingFields": []
}
```

### blocked `book_demo` result

```json
{
  "ok": false,
  "message": "Booking is blocked until the visitor has company domain, use case, ICP match, and authority confirmed.",
  "missingFields": ["companyDomain", "authority"]
}
```

### queued CRM result

```json
{
  "ok": true,
  "status": "queued",
  "crmSyncEventId": "..."
}
```

## Definition Of Done

This sprint is complete when all of the following are true:

1. `qualify_lead` returns score, eligibility, and missing fields
2. demo booking is blocked server-side until qualification is complete
3. CRM sync runs through BullMQ instead of inline fetch
4. CRM success/failure is auditable in the database and admin UI
5. booked demos can be marked accepted/rejected by operators
6. dashboard shows SQL acceptance
7. chunking uses a real tokenizer
8. `npm run typecheck` passes
9. `npm run build` passes

## After This Sprint

Once this guide is fully implemented and tested, you are in a much safer position to begin Phase 2.

Do not start Phase 2 if any of these remain incomplete:

- qualification gate
- CRM queue
- SQL acceptance tracking
- tokenizer update

Those are the pilot-readiness gate.
