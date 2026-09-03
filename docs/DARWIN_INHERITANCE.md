# Decisions inherited from Darwin, not from the Amboras direction

## Resolution (September 2026)

Each item below was reconsidered against the original direction in
`ORIGINAL_INTENT.md` and resolved in the branch that carries this section.
The measure was capability for one operator running dropshipping stores,
not self-containment. What changed, and what was deliberately kept:

| # | Item | Verdict | What happened |
|---|---|---|---|
| 1 | Zero runtime dependencies | **Replaced** | Ordinary dependencies where they raise capability: `@anthropic-ai/sdk` and `openai` for the writers (structured outputs, typed errors, retries, refusal fallbacks), `typescript` and `@types/node` as dev dependencies. A lockfile is committed. The rest of the hand-rolled library stays because it works and nothing in the spec needs replacing it. |
| 2 | `node:sqlite`, one file | **Kept, as a decision** | One person, a handful of stores, tens of orders a day: sqlite is the right database, and backup is copying a file. Nothing in the feature list needs Postgres. Revisit only if a second machine has to write. |
| 3 | One process, three surfaces | **Kept, and given a home** | The blueprint's separate apps served a SaaS with a team. For one operator, one process behind Caddy is simpler to run. `docker-compose.yml`, `Caddyfile` and `docs/DEPLOY.md` make it deployable; `/s/:slug` and `/preview/:slug` stay for localhost; subdomains and custom domains work with `AMBORAS_STOREFRONT_HOST`. |
| 4 | Template-string admin, no React | **Deferred** | Every owner-facing feature is reachable in the current admin, and a Next.js rewrite of ~3,000 lines adds no capability the owner asked for. It stays on the list; the data layer underneath is already an API. |
| 5 | Storefront rendered here, not a per-store Next.js build | **Deferred** | The sandboxed compile loop was Amboras's centre for its SaaS; the owner's page-building happens in the block builder and the cloner, which have a real render target already. Export is the useful half and stays on the list. |
| 6 | Rules writers with the model rewriting inside them | **Replaced: model-first** | `agent/models.ts` routes six tasks (assistant, research, brand, pages, ads, reading pages) to Claude or GPT, defaults to the newest Claude, and is selectable per store in Settings. Research, the brand kit and product copy, product pages, PDP and advertorial versions, ads, avatars and competitor readings are now *authored* by the model through structured outputs; the rules writers are scaffolding for a keyless boot and the admin says when it is looking at them. The hardcoded `claude-sonnet-4-5` is gone; ids live in configuration. |
| 7 | The executor's per-turn "Allow risky actions" gate | **Replaced** | Tools execute. The executor still validates every argument against the tool's schema and audits every call, with `risk: confirm` recorded in the audit row. The safety surface is the one the blueprint has: the assistant edits the draft, publishing is a deliberate step with rollback. The checkbox is gone from the panel. |
| 8 | Personal mode as a flag over dormant SaaS tables | **Replaced: personal is the only mode** | `control/plans.ts`, the marketing page, `AMBORAS_PERSONAL`, the plan picker and every plan gate are deleted. The `plan_slug` and `credits_used` columns remain in the schema (sqlite migrations are additive) but nothing reads them. Team invites stay: harmless, and the audit log needs actors. |
| 9 | Raw Stripe client, no Connect or Billing | **Kept** | Connect and Billing are the SaaS's needs (payouts to merchants, plan subscriptions). One owner with their own Stripe account wants exactly per-store keys, which is what exists. |
| 10 | Resend without MJML | **Kept** | Ten templates render and send. MJML is a nicety. |
| 11 | Images on local disk | **Kept** | One VPS, one volume. Object storage is a change to `lib/uploads.ts` when a CDN matters. |
| 12 | Domains with no TLS | **Replaced** | Caddy issues certificates on demand for names the app clears at `/_edge/tls-ask`: the admin host, storefront subdomains, and custom domains that verified as hosted. "ssl: issued" now means something. |
| 13 | Durable runs in-process | **Kept** | Steps are rows, recovery on boot works, branches run concurrently. Temporal is for a fleet. |
| 14 | Hand-rolled auth | **Kept** | One user, cookie sessions, scrypt. Fine. |
| 15 | Hand-rolled validation instead of Zod | **Kept** | It already emits the strict JSON schema the models need. A Zod port is mechanical and buys nothing today. |
| 16 | One hardcoded text model | **Replaced** | See 6. |
| 17 | Analytics in sqlite | **Kept** | See 2. |
| 18 | HTML plugin slots | **Kept** | See 5. |
| 19 | No deployment story | **Replaced** | See 3 and 12. |
| 20 | Test shape | **Kept** | `node --test` against in-memory sqlite, and the whole product over HTTP with no mocks. The model path is now tested too, against a fake network in `test/models.test.ts`. |
| 21 | `tsconfig.json` | **Kept** | Strict is strict. |
| 22 | `AMBORAS_*` environment prefix, logger | **Kept** | Cosmetic; renaming would churn every doc. |
| 23 | README voice | **Replaced** | Rewritten around what the platform is for. |

Still missing from the blueprint, and not touched here because neither the
owner nor Darwin decided them: subscriptions, a Bayesian A/B engine, CRO
detection, Search Console keyword tracking, GEO prompt tracking, newsletter
flows, workflow automation, migration importers beyond product import,
supplier API push, ad placement APIs. `ORIGINAL_INTENT.md` Part 4 lists them
in order.

---

### Second iteration (September 2026)

The course material and the owner's notes turned into: a knowledge base the
writers read by topic (`docs/knowledge/`, `src/agent/knowledge.ts`); three
build modes with an order of work whose statuses come from the store; a
Market tab (analysis, product overview, sub-avatars, ad plan, feedback
loops); a funnel rip that keeps structure and never copy or images; a
Creative tab (photo briefs, vetted creator-content concepts, GIFs, layout
suggestions); generated legal pages, a popup, a quiz block, behaviour
tracking, funnel split tests and a site health report. Nothing already
defined changed shape: the tables, pages, funnels, versions, ads and avatars
gained columns and fields, none were renamed or removed.

## The original audit

This codebase was built inside the `dylanail/darwin` repository, under
`amboras/`, before it was moved here. Darwin is a different product: a
persistent, single-principal autonomous operator (Fastify gateway, Postgres
with drizzle, a pnpm monorepo, a frozen spec whose principles include "the
model proposes, the executor disposes" and "everything is an event"). A
number of choices in this code were made to fit *beside* Darwin, or borrowed
Darwin's philosophy, rather than following the Amboras teardown blueprint
that was the original brief.

This file lists every such decision so a fresh session can reconsider each
one against the original direction. For each: what was done, why it was
done (reconstructed where the original reasoning is no longer in context),
what the blueprint asked for, and how much code would move if it changed.

The blueprint's recommended stack (§11.1) for reference: Medusa v2 on
Postgres for commerce; NestJS or Hono + Postgres + Redis + BullMQ for the
control plane; Next.js 15 + Tailwind + shadcn/ui + TanStack Query + PostHog
for the admin (PWA); a Next.js project per store deployed to Vercel or
Cloudflare with wildcard subdomains; a build sandbox running tsc, eslint,
`next build` and Playwright screenshots; Claude tool use with Temporal or
Inngest for durable runs and Zod schemas; Stripe Connect + Stripe Billing;
Resend + MJML + Handlebars; gpt-image + S3/R2 + sharp; Postgres events with
ClickHouse later; Cloudflare for SaaS for custom hostnames.

---

## A. Load-bearing: these shaped everything else

### 1. Zero runtime dependencies, Node's native TypeScript

**What:** No npm dependencies at all. Code runs as
`node --disable-warning=ExperimentalWarning src/main.ts` on Node ≥ 22.18 in
type-stripping mode, which is why the code avoids TypeScript parameter
properties and enums. `typescript` is installed `--no-save` only for
`typecheck`.

**Why (Darwin):** Darwin is a pnpm workspace with its own toolchain (tsx,
drizzle, Fastify, better-auth, esbuild builds). Keeping Amboras free of a
lockfile and outside the workspace meant it could not collide with or be
pulled into Darwin's build. It was a co-tenancy decision.

**Blueprint:** ordinary dependencies everywhere (Medusa, Next, Zod, Stripe
SDK, MJML, sharp, ClickHouse client).

**Blast radius:** total. Every item below with "hand-rolled" is a
consequence of this one. Reconsidering this first makes most of the rest
moot.

### 2. `node:sqlite`, one file, migrations as SQL strings in `src/lib/db.ts`

**What:** `DatabaseSync` on `data/amboras.db`; seven migrations written as
raw SQL in an array; a tiny `Db` class (`all/one/run/tx/insert/update`);
JSON columns parsed by hand.

**Why (Darwin):** Darwin already runs Postgres in docker-compose; adding a
second Postgres consumer or sharing Darwin's was avoided by not needing a
server at all.

**Blueprint:** Postgres (via Medusa and the control plane), Redis, ClickHouse
for analytics later. Also drizzle or an ORM with generated migrations.

**Blast radius:** every `domain/`, `control/`, `agent/`, `analytics/` module
issues SQL through `Db`. A Postgres move is mechanical (the SQL is plain)
but touches ~40 files.

### 3. One process, three surfaces, no framework

**What:** A hand-written router and context in `src/lib/http.ts` (multipart
parser, SSE, brotli/gzip, cookies). Admin, storefront and control plane are
one `createServer` in `src/main.ts`, switched by host or by the path
prefixes `/s/:slug` (live) and `/preview/:slug` (draft).

**Why (Darwin):** Darwin's gateway runs in a `DARWIN_MODE=monolith` shape
on localhost; the "works on one port with no DNS" habit came from there, and
Fastify was avoided under item 1.

**Blueprint:** separate apps: `core.amboras.com` API, `admin.amboras.com`
(Next.js), a storefront deployment per store, and a marketing site. Wildcard
subdomains always, not path prefixes.

**Blast radius:** `main.ts`, `lib/http.ts`, `admin/routes.ts`,
`storefront/routes.ts`. The `/s/` and `/preview/` prefixes are referenced in
tests, the seed, the admin's "View store" links and email links.

### 4. Server-rendered HTML strings for the admin; no React, no Tailwind

**What:** Every admin page is a template-literal function in
`src/admin/pages.ts`, `growth-pages.ts`, `editor.ts`, `auth-pages.ts`; the
page builder is vanilla-JS drag and drop; the assistant panel is a form plus
an SSE stream. Styling is a hand-written stylesheet in `admin/shell.ts`.

**Why (Darwin):** consequence of item 1. Darwin's dash is React, but reusing
it was out of scope and adding React meant dependencies.

**Blueprint:** Next.js 15, Tailwind, shadcn tokens, TanStack Query, PostHog,
PWA manifest with "Add to home screen", page-scoped mini-chats, voice input.

**Blast radius:** all of `src/admin/` (~3,000 lines). The data layer
underneath is reusable as an API.

### 5. Storefront rendered by this process, not a Next.js project per store

**What:** `src/storefront/render.ts` renders every store from one set of
functions; themes are token sets; plugin "slots" are server-side HTML
insertion (`control/plugins.ts#renderSlot`); there is no per-store source
tree, no build step, no sandbox, no screenshot verification, no export.

**Why (Darwin):** consequence of items 1 and 3.

**Blueprint:** this is the centre of the product: the agent edits real
storefront source files, builds in a sandbox with tsc/eslint/`next build`,
screenshots with Playwright, then publishes; stores are "exportable as a
Next.js project"; plugins inject JSX into that source.

**Blast radius:** `storefront/`, `pages/blocks.ts`, `pages/store.ts`,
`pages/clone.ts`, `control/plugins.ts` slots, the Store Designer, the
draft/live environment build log (which currently logs but builds nothing).

### 6. "Works with no API keys": rules fallbacks for everything a model would do

**What:** Every model-backed step has a deterministic rules path that runs
when no key is set: brand naming and copy (`agent/copy.ts`), customer
research with hand-written knowledge for three categories and a generic
record for the rest (`agent/research.ts`), page writers per format
(`agent/directions.ts`), ad writers per format (`agent/ads.ts`), competitor
extraction by regex (`agent/angles.ts`), avatar suggestion
(`agent/avatars.ts`), the rules planner (`agent/llm.ts` RULES), and vector
imagery (`agent/images.ts#renderSvg`). With a key, the model *rewrites text
values inside* the rules output rather than authoring.

**Why (Darwin):** Darwin's spec treats models as "replaceable cognitive
resources rented by the call" and insists the system degrade without them.
That principle was carried over wholesale.

**Blueprint:** Amboras is AI-native; Claude and GPT are routed per task and
user-selectable; there is no offline mode. Copy for a category the rules do
not know is generic here, which is exactly the "looks generated" failure the
research step was meant to prevent.

**Blast radius:** large in lines (the rules writers are most of `agent/`)
but contained in interface: `runResearch`, `writePdp`, `writeAdvertorial`,
`writeAd`, `extractAngle`, `generate` are the seams. A model-first rewrite
keeps their signatures.

### 7. The executor and the "Allow risky actions" checkbox

**What:** `agent/registry.ts#execute` validates arguments, refuses tools
marked `risk: 'confirm'` unless the turn carries `confirmed`, and audits
every call. The README states it in Darwin's words: "the model proposes, the
executor disposes; no prompt is load-bearing for safety."

**Why (Darwin):** this is DARWIN_SPEC principle 2, its autonomy model,
including the per-turn confirmation.

**Blueprint:** tools execute; the safety surface is the draft/live split and
the publish state machine, plus an audit log with the AI as an actor. There
is no per-turn "allow risky" gate in the target product.

**Blast radius:** small in code (`registry.ts`, the checkbox in
`admin/shell.ts`, tool `risk` flags), but it decides what the assistant can
do unprompted.

### 8. Personal mode as a single-principal system

**What:** `AMBORAS_PERSONAL` (default on) makes every store `OWNER` plan,
removes plan gates, sends `/` to `/admin`, and moves the marketing page to
`/about-this-platform`. Plans, credits and billing exist as tables and
`control/plans.ts` but are inert.

**Why (mixed):** you asked for "just me for now"; the *shape* of the answer
(one principal, everything else dormant, a mode flag) is Darwin's.

**Blueprint:** multi-tenant SaaS: organisations, plans (§9), Stripe Billing,
AI credits, team RBAC, support conversations, feature requests.

**Blast radius:** decide whether to delete the SaaS scaffolding (plans,
invites, credits column, `/onboarding` plan picker remnants) or keep it
dormant. Either is fine; carrying both is the confusing option.

---

## B. Consequences of A that are worth naming on their own

### 9. Stripe as a raw REST client, no Connect, no Billing, no charge in demo checkout

`payments/stripe.ts` is form-encoded `fetch` with an injectable transport;
the demo checkout marks orders captured without charging. Blueprint: Stripe
Connect OAuth, Payment Element with Apple/Google Pay and Link, Stripe
Billing for plans. Source: item 1.

### 10. Email as a raw Resend call and a Handlebars subset; no MJML

`email/templates.ts`, `email/send.ts`. Blueprint: MJML + Handlebars, domain
verification API. Source: item 1.

### 11. Images on local disk; no S3/R2, no sharp

`lib/uploads.ts` writes under `data/uploads`; generated model output is
saved there too. Blueprint: S3/R2 with sharp for derivatives. Source: item 1.

### 12. Domains served by "the edge" of this process; no TLS, no Cloudflare for SaaS

`control/domains.ts` writes registrar records pointing at
`edge.<AMBORAS_STOREFRONT_HOST>` and verifies by DNS lookup; `ssl: issued`
is a flag. Behind Darwin, Caddy terminates TLS, which is why nothing here
does. Blueprint: Cloudflare for SaaS custom hostnames (DNS, SSL, CDN
automatic). Source: items 1 and 3.

### 13. Durable runs implemented in-process on sqlite

`agent/runtime.ts` persists steps and `recoverRuns` re-queues on boot;
branches run with `Promise.all`. Mirrors Darwin's executive/missions
pattern. Blueprint: Temporal or Inngest. Fine at one-merchant scale; not
what was asked.

### 14. Hand-rolled auth and credential sealing

`control/auth.ts` (scrypt, cookie sessions, roles, invites) and
`lib/crypto.ts` (AES-GCM sealing under one `AMBORAS_SECRET`, HMAC visitor
fingerprints). Darwin uses better-auth and its own `shared/crypto.ts`
sealing; the single-master-secret shape is Darwin's. Blueprint: JWT with
refresh tokens, 2FA later. Source: item 1.

### 15. Hand-rolled validation instead of Zod

`lib/validate.ts` defines its own `Schema`/`Field` and `toJsonSchema`.
Blueprint: Zod schemas on tools. Source: item 1.

### 16. One text model, hardcoded default, no routing, no user choice

Only `ANTHROPIC_API_KEY` is read for text; the default model string is
`claude-sonnet-4-5` in four places (`agent/llm.ts`, `research.ts`,
`directions.ts`, `ads.ts`). Blueprint: Claude and OpenAI routed per task,
user-selectable in the admin. Darwin has a model router
(`packages/model-provider`) that was neither reused nor reimplemented.

### 17. Analytics in sqlite with no ticker and no ClickHouse path

`analytics/events.ts` computes KPIs, funnel and affinity by SQL. Blueprint:
Postgres events with materialised rollups, live ticker over SSE/websockets,
ClickHouse for the CRO detection engine. The SSE stream that exists is the
admin activity feed, not analytics.

### 18. Plugin slots are HTML, and most of the catalog refuses to install

Consequence of item 5. The manifest schema follows the blueprint (§7); the
injection target does not exist. Ten first-party plugins are real; the rest
are directory entries.

### 19. No deployment story

No Dockerfile, no compose, no Caddyfile, no `.env.example` in this repo.
Darwin had all of those at its root, so Amboras never needed its own. The
blueprint's deployment is Vercel/Cloudflare with wildcard subdomains.

### 20. Test shape: `node --test`, in-memory sqlite, one end-to-end HTTP test with no mocks

`test/helpers.ts#fresh` and `test/http.test.ts`. Darwin's suite is
`node --test` against live Postgres; the "no mocks, walk the whole product"
style is Darwin's. Not wrong, but a Next.js/Medusa build would test
differently.

### 21. `tsconfig.json` copied from Darwin's base

ES2023, NodeNext, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, plus
`allowImportingTsExtensions` and `noEmit` for native TS. The
`noUncheckedIndexedAccess` flag is why the code is full of `as string` and
`!` at array reads.

### 22. Environment and logging conventions

`AMBORAS_*` prefix on every variable, `AMBORAS_LOG_LEVEL`, a scoped logger
with padded columns (`lib/log.ts`), port 4100, `data/` as the state
directory. All mirror Darwin's `DARWIN_*`, `shared/logger.ts` and layout.

### 23. README voice and structure

"What is deliberately not built" and the honest-status framing are
DARWIN_SPEC's conventions (its BUILT/PARTIAL/SCHEMA/PLANNED table, its
"a change that violates one is wrong even if it works"). Long prose
comments in the same voice appear across `src/`. Cosmetic, but it sets a
tone the next session may not want.

---

## C. Decisions that came from you, not from Darwin

Listed so the next session does not undo them while reconsidering the rest.

- Building for yourself only, no selling to customers, no plan picker.
- Dropshipping as the primary use: supplier costs and margins, funnels with
  bump/upsell/downsell, advertorials, versions with direction, product
  import from other stores, profit report with ad spend.
- Modern Google Fonts per brand mood; fast, compressed pages.
- A drag-and-drop page builder with Funnelish/Shopify-style blocks, raw HTML
  input, and cloning a reference page's HTML to edit or use as a template.
- Shopify-style one-page checkout; Kaching-style bundle tiers.
- Freeform direction plus suggested formats for PDP and advertorial versions.
- The fifth iteration: Ads tab with swipe file and Ad Library search,
  per-store domain connection with registrar instructions, image re-shoots
  with OpenAI GPT Image 2 and Google Gemini 3 Pro Image chosen per render,
  avatars, competitor-site angle extraction with every field editable.

What the blueprint wanted that neither you nor Darwin overrode, and is still
missing: Stripe Connect and Billing, a real build/verify/publish loop,
exportable storefronts, subscriptions, marketing campaigns and flows, GSC
integration, GEO tracking, native A/B testing engine, CRO detection,
migration importers beyond product import.

---

## D. A prompt for the next session

> Read `docs/DARWIN_INHERITANCE.md`. Items 1 through 8 are the decisions
> to reconsider against the Amboras blueprint's stack (§11.1) and the
> personal, dropshipping-first direction in section C. For each, say whether
> to keep, replace, or defer, and why. Then re-plan the codebase around
> those answers before changing anything. Items 9 through 23 follow from
> the answers to 1 through 8; do not decide them separately.
