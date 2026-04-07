# Phase 1 Dev Plan

## Goal

Ship a new B2B inbound agent repo, `sentientweb-agent`, that handles the full Phase 1 loop:

`install snippet -> answer from KB -> qualify lead -> book demo -> push CRM or handoff webhook -> review audit trail`

## Phase 1 feature inventory

### Universal core

- Multi-tenant tenant model, public site keys, and origin allowlisting
- Capability-based `PlatformAdapter` contract
- Dynamic tool registration for knowledge, qualification, booking, CRM, handoff, and visitor context
- Shared runtime utilities for AI providers, secret encryption, Redis-backed rate limiting, and validation

### Visitor experience

- Embeddable script loader and widget shell
- Text-first chat experience with session continuity
- Behavior event observer for page, timing, and trigger signals
- Reactive-first rollout with pricing/docs proactive triggers behind tenant settings

### Knowledge base

- Website crawl ingestion with robots.txt respect, bounded crawl depth, chunking, and embeddings
- Uploaded knowledge ingestion for PDF, markdown, and text content
- Semantic retrieval and KB context building for the agent loop
- Admin settings actions for crawl start and manual document upload

### Lead conversion

- Lead qualification capture for company, role, use case, timeline, and notes
- Calendly availability lookup and booking creation
- CRM webhook push and handoff webhook fallback
- Tool execution audit logging

### Dashboard

- First-tenant bootstrap flow
- Passwordless magic-link admin access
- Dashboard summary metrics
- Activity feed for conversations, tools, and bookings
- Settings for branding, AI config, triggers, knowledge sources, and integrations

### Safety and ops

- Public site key authentication on widget and event APIs
- Origin checks on public endpoints
- Tool loop cap in the agent orchestrator
- Redis-backed queue hooks for crawl jobs
- Transcript and behavior data stored server-side only

## Delivery status in this repo

- Week 1 foundation: implemented
- Week 2 crawl and retrieval: implemented
- Week 3 agent loop and booking flow: implemented
- Week 4 behavior events and proactive triggers: implemented at MVP level
- Week 5 pilot hardening: not fully implemented

## Remaining work after this scaffold

- Add formal test coverage for crawl, trigger, booking, and webhook flows
- Add stronger retry policies and circuit breakers around external integrations
- Add richer weekly summary reporting instead of dashboard snapshots only
- Add production observability, alerting, and retention jobs
- Add native CRM adapters if pilots require them

## Phase 1 non-goals

- Voice storage
- Guided page generation
- Billing and self-serve multi-user account management
- Generic rule DSL for triggers
