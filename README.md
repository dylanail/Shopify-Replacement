# Amboras

An AI-native commerce platform, built as one runnable system: a control plane, a
commerce core, a durable agent runtime with a validated tool registry, generated
per-brand storefronts, a plugin framework, first-party analytics, transactional
email, and an admin that is driven by conversation.

You type one sentence. About a hundred milliseconds later there is a store —
named, branded, three products deep with copy, variants, pricing and imagery,
with a welcome code, a free-shipping threshold and a bundle already live — at an
address you can open and buy from.

```
node --version                     # needs 22.18+ (native TypeScript, node:sqlite)
npm run seed                       # builds the Ironjaw & Co demo store
npm start                          # http://localhost:4100
```

The seed prints the sign-in details and the storefront address. There are no
dependencies to install: the whole platform runs on the Node standard library.

```
npm test          # 56 tests, ~3s
npm run typecheck # needs typescript; the source is otherwise dependency-free
npm run reset     # throw the database away and re-seed
```

---

## What is actually here

| | |
|---|---|
| **Control plane** | users, sessions, stores, draft/live environments, teams and RBAC, invites, plans, domains, audit log, to-do punch list |
| **Commerce core** | products, options, variants, inventory, collections, customers, carts, orders, fulfilments, refunds, returns, six promotion types, regions, shipping rates |
| **Agent** | 74 tools with per-tool schemas, an executor that validates and refuses, durable resumable runs with parallel branches, a model planner and a rules planner |
| **Storefront** | server-rendered per brand: home, collections, PDP, cart, checkout, order, blog, pages, sitemap, robots, JSON-LD, `llms.txt` |
| **Plugins** | manifest schema, install with settings validation, sealed credentials, storefront slots, capabilities, and AI tools contributed by plugins |
| **Analytics** | cookieless sessions, event pipeline, KPIs with deltas, funnel with benchmarks, live visitors, order affinity mining |
| **Email** | 10 transactional templates, a small Handlebars subset, a Resend adapter, retries, and a send log |
| **SEO / GEO** | meta and structured data written on save, a schema validator, redirects, sitemap, and a knowledge card at `/llms.txt` |

Everything above is exercised by the test suite, and `test/http.test.ts` walks
the whole product over HTTP with no mocks: register → onboard from a sentence →
every admin page → drive the assistant → buy something from the storefront →
watch the order land in the admin.

---

## The shape of it

```
src/
  lib/          db (sqlite + migrations), http (router, ctx, sse), validate,
                crypto (scrypt, aes-gcm, visitor fingerprints), money, ids, log
  domain/       the commerce core — catalog, cart, orders, promotions, regions,
                customers, reviews, content
  control/      the control plane — auth, stores and environments, plans,
                plugins and the catalog, todos and audit
  agent/        registry (tools + executor), runtime (durable runs), llm
                (model planner + rules planner), chat, onboarding, copy, images
  storefront/   theme (brand tokens to CSS), render (the pages), routes
  admin/        shell (rail, page, assistant panel), pages, routes
  analytics/    sessions and events, KPIs, funnel, affinity
  email/        templates and sending
  seo/          structured data, sitemap, redirects, llms.txt
```

Four decisions carry most of the weight.

**One pricing engine.** `domain/cart.ts#totals` is the only place a total is
computed. The cart drawer, the checkout, the order that gets written and the
free-shipping-gap upsell all call it. There is no second implementation to drift.

**The model proposes, the executor disposes.** Every tool call — from the chat
panel, from onboarding, from a plugin, from a model — goes through
`agent/registry.ts#execute`. It validates arguments against the tool's own
schema before the handler exists in the call stack, refuses risky tools without
a human confirmation for the turn, and writes an audit row whether the call
succeeded or not. No prompt is load-bearing for safety.

**Runs are rows, not closures.** An agent run persists its steps, so a deploy in
the middle of a merchant's onboarding is survivable: finished steps stay
finished, the in-flight step goes back to pending, and `recoverRuns` re-queues
it on boot. Branches inside a run execute concurrently, which is why onboarding
looks like four things happening at once rather than a queue.

**Draft and live are separate environments.** The assistant only ever edits the
draft. Publishing copies it over live and bumps a version; rollback goes the
other way. `publishState` is what the admin's publish button reads, so the
button says what the store needs next instead of just "Publish".

---

## Two things that are usually faked, and are not

**It works with no API keys.** Configure `ANTHROPIC_API_KEY` and the model plans
the run from the real tool schemas. Configure nothing and a rules planner maps
what merchants actually type onto the same tools, and a deterministic writer
derives the brand, the palette, the product copy and the imagery from the
sentence. Same sentence, same store, every time. The offline path is not a stub
— it is the floor under every test and every demo.

**Generated imagery is real output, not a grey box.** With `OPENAI_API_KEY` set,
`agent/images.ts` calls an image model. Without it, it draws a deterministic
vector composition from the brand palette — seeded from the subject, so a
product keeps its picture across restarts — and serves it from
`/_media/render.svg` with an immutable cache header and no database round trip.

---

## Configuration

Everything is optional. Nothing is required to run.

| Variable | Effect |
|---|---|
| `PORT` | default `4100` |
| `AMBORAS_DB` | sqlite file, default `data/amboras.db` |
| `AMBORAS_SECRET` | master key for password hashing, credential sealing and visitor fingerprints. **Set this in any real deployment.** |
| `AMBORAS_STOREFRONT_HOST` | serve storefronts at `*.thisdomain` instead of `/s/:slug` |
| `ANTHROPIC_API_KEY`, `AMBORAS_MODEL` | let a model plan runs |
| `OPENAI_API_KEY`, `AMBORAS_IMAGE_MODEL` | generate real imagery |
| `RESEND_API_KEY`, `AMBORAS_EMAIL_DOMAIN` | actually deliver email |

Two path prefixes exist and are deliberately different: `/s/:slug` is the live
storefront (tracked, plugins firing — a customer), and `/preview/:slug` is the
draft environment (untracked, pixels suppressed — the merchant looking at their
own unpublished work). Collapsing them would either count the merchant's own
dashboard visits as traffic or leave a host-less deployment with no analytics.

---

## What is deliberately not built

Named so nobody has to discover it by clicking.

- **Payments do not move money.** Stripe is modelled all the way through —
  connect flow, sealed keys, a `payment_provider` capability the checkout reads
  — but the demo checkout marks the order captured without a charge. Swapping in
  the Payment Element is a change to one template and one webhook.
- **Domains verify optimistically.** The records are correct and the state
  machine is real; nothing resolves DNS or issues a certificate.
- **Storefronts are server-rendered here, not exported.** The blueprint's target
  writes a Next.js project per store and edits its source in a sandbox. The slot
  system, the draft/live split and the build log are the parts of that design
  that survive the simplification; the sandboxed compile loop is not here.
- **GEO tracks nothing.** The half a store controls — a knowledge card at
  `/llms.txt`, structured data, entity descriptors — ships. Measuring where a
  brand gets cited needs live calls to four engines on a schedule, so the admin
  says that plainly rather than drawing a fabricated placement chart.
- **The plugin directory is honest about itself.** Ten integrations are real and
  installable. The rest of the catalog is a directory listing with a name, a
  category and a website, and it refuses to install rather than pretending.
- **No A/B testing engine.** The `experiments` table exists; the Bayesian
  sequential loop does not.

---

## Where the numbers come from

The demo store's dashboard is not fixture data. The seed registers a user, runs
the real onboarding agent, installs plugins through the plugin framework, writes
reviews through the moderation path, and places six orders through the actual
checkout — inventory, promotions, customer records and receipts all move the way
they would for a customer. The only liberty it takes is backdating those six
orders across a fortnight so the revenue chart has a shape, and it says so in
the code.
