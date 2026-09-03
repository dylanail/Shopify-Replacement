# Amboras

An AI-native commerce platform, built as one runnable system: a control plane, a
commerce core, a durable agent runtime with a validated tool registry, generated
per-brand storefronts, a plugin framework, first-party analytics, transactional
email, and an admin that is driven by conversation.

You type one sentence — and optionally hand it a product photo and your old
site. It researches who buys this and what stops them, then a store exists:
named, branded, three products deep with full pages (benefits, comparison,
specs, FAQ, guarantee), variants, pricing and imagery derived from your photo,
with a welcome code, a free-shipping threshold and a bundle already live — at an
address you can open and buy from. Run it again and you have a second store;
the hub shows them all.

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
| **Research** | who buys, what stops them, competitors, price anchor, keywords and proof points — per category rules offline, a model when configured, and it reads a pasted site either way |
| **Product pages** | benefits answering the triggers, a comparison table against the named competitor, specs, FAQ from the objections, guarantee and shipping strip, sticky mobile buy bar — written from the research, never from thin air |
| **Imagery** | a merchant photo is staged into six scenes (white seamless, lifestyle, dark luxury, flat lay, golden hour, studio) around the *actual* product; with an image model configured it is re-shot rather than staged |
| **Funnels** | ad → advertorial → offer → checkout with an order bump (shipping protection by default, a real hidden product) → one-click upsell → downsell only if the upsell is declined → thank-you page with tracking and related products |
| **Versions & direction** | product-page versions and advertorials in named formats (listicle, first-person story, problem-agitate-solve, expert take, "we tested five", mistakes; benefit-, story-, UGC-, comparison-, offer-, urgency-led, premium minimal) with free-form direction read into tone, audience, angle and must-say phrases; pdp versions split-tested by session with per-version views, carts, sales and conversion |
| **Dropshipping ops** | import a product from any Shopify store URL (`/products/x.json`) or an Open Graph page with a markup; supplier and cost per product with a margin calculator; fulfil via supplier with carrier detection from the tracking number; a branded `/track` page; delivery estimates from lead times; ad-spend log; a profit report that subtracts COGS, supplier shipping, fees, refunds and ads |
| **Conversion widgets** | recent-sales popups and live-viewer counts from real orders and sessions, stock scarcity from real inventory, free-shipping bar, delivery estimate, payment icons, size chart, customer photos, product Q&A, back-in-stock capture, announcement rotator, compare-at badges, abandoned-cart email on a schedule, purchase and add-to-cart events for GA4, Meta and TikTok |
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
watch the order land in the admin → start a second store with a photo upload →
see both in the hub → stage a product photo → read the conversion sections off
the live product page.

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

**Research comes first, and pages can only say what it found.** Onboarding runs
`agent/research.ts` before a product is written; `agent/pages.ts` is the mapping
from that record to a page's shape. A benefit is an answer to a purchase
trigger, a FAQ entry is an objection, a comparison row is a competitor angle.
There is no path by which a page contains a claim the research did not put
there.

**Your photo stays your photo.** An upload is embedded into the scene as-is,
with a ground, a contact shadow and the brand's light around it — never redrawn.
With `OPENAI_API_KEY` set, the image model *edits* that photo into the scene
(`images/edits`, not `generations`), so the product in the output is the one
you sell and not a plausible stranger.

**Social proof is never invented.** The recent-sales popup reads real orders
(first name and city), the viewer count reads real sessions, scarcity reads
real inventory, customer photos come from real reviews. Each widget renders
nothing at all when it has nothing honest to say, and an imported review is
never marked verified.

**A direction is read, not pasted.** "Premium, for people who train
seriously, focus on the repair guarantee" becomes a tone, an audience and an
angle that drive which sections lead and what the headline pattern is; with
a model configured the same decisions become the prompt, so a format means
the same thing either way.

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

## Personal mode

This deployment is one person's. Every store is on the owner plan (no
limits, no platform fee, nothing gated), there is no pricing page, and `/`
is the admin. The plan tiers still exist as configuration for the day that
changes; set `AMBORAS_PERSONAL=false` to bring the gates back.

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
- **Research without a key is category rules.** Boxing gear, skincare and
  coffee have hand-written knowledge; other categories get a complete but
  generic record. Set `ANTHROPIC_API_KEY` and the model writes it from the
  brief and the pasted site. The admin says which one it is looking at.
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
