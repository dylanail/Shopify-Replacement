# Kiln architecture

## Shape

```
 admin (Next.js)            storefront (Next.js, multi-tenant)
      │  REST + SSE                │  public REST
      ▼                            ▼
 ┌──────────────────────── core (Hono) ────────────────────────┐
 │ routes → services → Drizzle (PGlite dev / Postgres prod)     │
 │ ai/ ── tool registry ── agent runtime (@kiln/agent)          │
 │ bus (in-process pub/sub → SSE; swap for Redis when scaling)  │
 │ email (@kiln/email) · plugins (@kiln/plugins)                │
 └──────────────────────────────────────────────────────────────┘
```

One Postgres schema serves the control plane (users, orgs, stores, environments, team, billing, runs, plugins, domains, audit), the commerce engine (regions, products, variants, collections, customers, carts, orders, fulfilments, returns, refunds, promotions, shipping, gift cards, subscriptions), content/marketing (reviews, Q&A, blog, email templates + sends, campaigns, flows, SEO, GEO, merch configs, affinity pairs, workflows) and analytics (sessions, events). Every tenant table carries `store_id`.

The blueprint's upstream runs Medusa for commerce; Kiln implements the same surface natively so the pricing engine, checkout and inventory are one codebase and unit-testable (`services/pricing.ts` is pure). Swapping to Medusa would mean re-implementing `services/{products,carts,orders,promotions}.ts` against its API — routes and tools would not change.

## Request flow

- `routes/*` parse + validate (zod) → `services/*` do the work → return JSON. Errors are `HttpError`s.
- Auth: access JWT (2h) + rotating refresh tokens. `requireStore` resolves `:storeId` and checks org ownership or accepted team membership.
- Live updates: `GET /stores/:id/events` is a Server-Sent Events stream fanned out from `EventBus` — channels `agent`, `activity`, `build`, `analytics`, `domain`. The admin's rail dots, AI panel and build log all hang off this one stream.

## The agent loop

`@kiln/agent` is provider-agnostic:

1. `ToolRegistry` holds `defineTool({ name, area, input: zod, risky?, handler })`. `toModelTools()` emits JSON Schema for the model.
2. `runAgent()` runs: model turn → execute tool calls (validated, per-tool credits) → feed results → repeat, up to `maxSteps`. Every step is `persist()`ed to `agent_runs` (+ transcript to `chat_messages`), so a crashed worker resumes from the last state and the admin can lazy-load endless history.
3. **Risky tools** (`refund_order`, `cancel_order`, `delete_product`, `publish_storefront`) pause the run with a `question` event unless an autonomy grant covers them (store setting, or the per-run grant used by `POST /ai/runs/:id/resume {confirm:true}`). `ask_merchant` pauses explicitly; `update_plan` maintains the pinned to-do list.
4. Providers: `anthropicProvider` (Messages API tool use, image inputs) or `offlineProvider` — a rule-based planner that turns sentences into tool calls so demo/test runs are deterministic and free.
5. The system prompt is built per run with live store facts and the current admin page (`pageContext`).

Tools live in `apps/core/src/ai/tools/*` (catalog, commerce, storefront, growth, setup) and call the same services the REST routes use. Installed plugins contribute tools from their manifest (`connect_shippo`, `disconnect_shippo`, …) via `tools/plugins.ts`.

## One sentence → live store

`ai/onboarding.ts` creates the store first (so the preview URL exists immediately), then runs branches: naming (optionally refined by the model) → brand kit ∥ products ∥ promotions → collections → storefront build + publish. Progress is written to `agent_runs.todos`, mirrored to the bus, and streamed over SSE from `POST /stores/onboard`. Generators in `ai/generators.ts` pick a category from the prompt (boxing, skincare, candles, coffee, apparel, jewelry, pet, home, generic) to produce a palette, names, 150–200-word copy, options and pricing; `ai/images.ts` renders four image lanes (OpenAI when keyed, otherwise deterministic branded SVG).

## Draft / live environments and the publish pipeline

Each store has two `store_environments` rows. The Designer edits the **draft** `ThemeConfig` (template, sections, brand tokens, slot placements, custom CSS, theme files). `buildEnvironment()` walks `queued → building → verifying → ready|failed`, writing a build log and streaming `build` events; verification runs `lintTheme()` (schema, hero headline, duplicate ids, CSS braces, server-only code in theme files) and records a screenshot URL. `publish()` re-verifies, copies draft → live, bumps the version and keeps the previous theme for `rollback()`. `publishState()` powers the state-aware **Publish** button.

## Multi-tenancy on the storefront

The storefront resolves the store per request: `/s/<slug>` in local dev, `<slug>.<base-domain>` in production, or a custom hostname (verified via a `_kiln` TXT record). `GET /public/stores/:key` returns the shell — brand, theme, collections, enabled plugins (public settings only), merch configs, region and redirects — in one call. Draft previews (`?env=draft`) skip plugins flagged `disableInPreview`.

## Plugins

A manifest declares: settings schema (secrets are AES-256-GCM encrypted into `store_plugin_credentials` and masked in responses), AI tools, storefront components (fixed slot, `merchant_choice` with valid slots, or `payment_registry`), scripts, capabilities and admin sub-routes. Install checks plan gating; `storefrontPluginConfig()` is what the storefront's slot system consumes. Slot names are enumerated in `@kiln/shared` (`STOREFRONT_SLOTS`).

## Analytics and experiments

Sessions are keyed by a daily-rotating fingerprint (no cookies). `events` power KPIs with period deltas, a four-stage funnel with industry benchmarks, realtime visitors and cohorts. Experiments assign variants deterministically by session hash, record exposures/conversions, and `analyse()` computes Beta-posterior win probabilities by Monte Carlo with auto-promotion at the configured threshold (≥100 exposures per arm).

## Background jobs

`server.ts` runs an in-process scheduler that calls `POST /webhooks/orchestrator/cron/:job` (abandoned carts, subscription dunning, affinity rebuild, review requests, GEO checks) protected by `X-Orchestrator-Secret`. In production point a real scheduler at those endpoints.
