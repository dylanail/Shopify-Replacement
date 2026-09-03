# ORIGINAL_INTENT — what this project is, A to Z

This document exists so a fresh session can rebuild this platform into the
most capable version of what it was specified to be, without inheriting
anything from the unrelated project it was first built beside. It has four
parts:

1. **The direction, distilled** — what the platform is for, in the owner's
   terms, with the intent behind each instruction.
2. **The conversation, in order** — every instruction given, verbatim, what
   it meant, and what was delivered in response (with commit ids).
3. **The platform as it stands** — an A-to-Z inventory of what exists in this
   repository today.
4. **What the next session should do** — the north star, the carry-overs to
   remove (see `docs/DARWIN_INHERITANCE.md`), and the open questions.

The appendices carry the full original blueprint and every message verbatim.

Owner: dylanail. Repository: `dylanail/Shopify-Replacement`. The code was
first developed under `amboras/` in `dylanail/darwin` on branch
`claude/amboras-teardown-rebuild-vm8wqg` (commits `486e91b`, `5309e90`,
`e1eedb1`, `90cc312`, `0ac62ef`) and moved here with history intact.

---

## Part 1 — The direction, distilled

### What it is

A self-hosted, AI-native **store builder with the commerce backend
underneath**, built for one person's own dropshipping stores. The seed of it
was a full teardown of Amboras (amboras.com, an AI-native e-commerce SaaS)
compiled on 2 September 2026, with the instruction "One shot this
platform." Every later instruction pulled it toward the owner's real job:
dropshipping through advertorial funnels and Shopify-style stores, with paid
traffic, where the work is research → pages → offers → ads → domains, and
the platform should do as much of that as a good operator would.

The repository is called Shopify-Replacement. That is the plainest statement
of intent: **replace Shopify plus the thirty apps a dropshipper bolts onto
it, for the owner's own stores, driven by AI.**

### The requirements, in the owner's words, with the intent behind each

**From the blueprint ("One shot this platform"):**
- Multi-store control plane; draft/live store environments; publish button
  that knows what the store needs next; unguessable preview slugs.
- An AI assistant docked on every admin page that *executes tool calls*
  (the target had ~74), page-aware, with a to-do punch list, activity dots,
  prompt library, image attachments, voice input, one chat across the admin.
- Onboarding: type one sentence (optionally with a reference image or an
  existing site URL) → parallel agent branches name the brand, write three
  products with images and 150–200 words of copy, build the brand kit,
  create promotions, build the storefront → live preview appears the
  moment the URL exists. Crash-safe, resumable runs.
- Commerce core: products/options/variants/inventory by location,
  collections, customers, carts, orders, fulfilments, refunds, returns,
  promotions (codes, automatic, BOGO, tiers, variant targeting, region
  rules, scheduling, stacking), regions/currencies/shipping zones, gift
  cards, subscriptions, digital products, B2B price lists.
- Storefront generated per brand (fonts, palette, section set), mobile
  first, Lighthouse > 95, plugin slot system, exportable.
- Store Designer: chat left, live preview right; the AI edits real
  storefront source, lints, builds in a sandbox, screenshots, shows a diff,
  publishes; rollback; theme gallery.
- Reviews (7 components, moderation, media, AI summary, fake filter, Q&A,
  request emails), bundles (tiers, 6 components), upsells and cross-sells
  (affinity mining, 3 placements incl. post-purchase one-click), A/B testing
  (Bayesian, auto-promote), autonomous CRO engine, analytics (cookieless
  sessions, funnel, live map, ticker, benchmarks), SEO (meta, JSON-LD,
  sitemap, redirects, GSC keyword tracker), GEO (knowledge card, prompt
  tracking across engines), 10 transactional emails (Resend, MJML +
  Handlebars), newsletter with 5 flows, blog CMS, workflow automation,
  migration importers (Shopify/BigCommerce/WooCommerce/Magento/Squarespace).
- Payments: Stripe Connect, Payment Element with Apple/Google Pay and Link,
  regional providers as plugins.
- Plugin system: manifest schema (settings schema, AI tools, storefront
  components by slot, capabilities, `disableInPreview`), 40 first-party
  plugins, 366 directory listings.
- Domains: paste a domain → DNS, SSL, CDN automatic.
- Design: warm editorial admin (cream canvas, serif greeting, 44px icon
  rail, 300px AI panel); generated storefront themes; Inter/Manrope + a
  serif display.
- Plans/billing/credits/team/SCIM: the SaaS layer (later made irrelevant by
  "this is just for me").
- Recommended stack (§11.1): Medusa v2 on Postgres; NestJS/Hono control
  plane with Postgres + Redis + BullMQ; Next.js 15 + Tailwind + shadcn +
  TanStack Query admin (PWA); a Next.js project per store on Vercel or
  Cloudflare with wildcard subdomains; a build sandbox; Claude tool use with
  Temporal/Inngest for durable runs and Zod schemas; Stripe Connect and
  Billing; Resend + MJML; gpt-image + S3/R2 + sharp; Postgres events then
  ClickHouse; Cloudflare for SaaS for custom hostnames.

**Message 2 — "Is this like a storebuilder? That's what I wanted. Needs
backend and you need to be able to see diff stores on customer backend and
start new stores. Give image and it needs to be able to generate good
product images and do customer research and build good shopify style
product pages."**
- Intent: confirm the product category (a store builder with its own
  backend, not a chat toy); a **stores hub** to see every store and start a
  new one; **image in → good product images out**; **customer research
  before copy**; **Shopify-quality product pages** (benefits, comparison,
  specs, FAQ, guarantee, sticky mobile buy bar).

**Message 3 — fonts, speed, builder, advertorials, HTML, cloning, checkout,
bundles, Stripe.**
- "Use more modern fonts. Use Google fonts for built sites. Make sure sites
  load fast." → generated stores must look current and be fast; Google
  Fonts pairings per brand mood; compression; minimal external requests.
- "Make sure there's a drag and drop kinda pagebuilder and page editor. Like
  funnelish or Shopify. Do research to know what I mean. Use same kind of
  blocks they have." → a real DnD builder whose block set matches
  Shopify sections and Funnelish elements; research expected, not guessing.
- "We need to build advertorials." → advertorial page type with the
  advertorial-specific blocks (publication bar, byline, numbered reasons,
  pull quotes, comments, FTC label).
- "Also have the option to just input raw html." → HTML mode for any page.
- "Use reference pages / sites to replicate. I should be able to link
  reference page and have it just literally pull html and dupe it perfectly,
  then I can edit myself or use it as template for my own product." →
  **clone a URL into a pixel-faithful page** (inline CSS, absolute URLs,
  copied images), then edit as HTML or read into blocks as a template.
- "High converting checkout like Shopify. Do research on that too. Should be
  super simple buy - checkout process." → one-page checkout, express pay row,
  buy-it-now, minimal steps, trust copy.
- "Need bundles also etc. like Kaching app for Shopify." → tiered bundle
  widget (badges, savings, per-unit price, free shipping and gift tiers)
  enforced by real promotions.
- "Need to be able to integrate stripe and all relevant features." →
  Stripe end to end: Payment Element, Express Checkout, saved cards for
  one-click post-purchase, refunds, webhooks; keys per store.

**Message 4 — mobile, personal, versions with direction, dropshipping
research.**
- "Product page etc. needs to be mobile optimized." → a 390px pass on PDP,
  checkout, advertorial.
- "I'm building this for just me for now so don't worry about selling the
  product to customers for now this is just for me." → **no plans, no
  billing, no marketing site, no gates**; the admin is the product.
- "Generate different versions of pdp and advertorials or get direction
  when generating like freeform direction or suggested format." →
  **versions**: pick named formats or type free-form direction (tone,
  audience, angle, must-say phrases); split-test versions by session with
  per-version numbers.
- "Take some time and think about how people build these advertorial or
  funnelish funnels and shopify stores - specifically for dropshipping,
  research common apps and what they do and include all features from those
  too. Consider what dropshippers would want." → the platform must cover
  the Funnelish funnel (ad → advertorial → offer → checkout + bump → upsell
  → downsell → thank-you) and the Shopify dropshipping app stack (DSers /
  AutoDS sourcing and fulfilment, Vitals widgets, Loox / Judge.me reviews
  and imports, ReConvert post-purchase, Parcel Panel tracking, Klaviyo,
  pixels, profit trackers).

**Message 5 — ads, domains, image regeneration, avatars, competitor sites.**
- "Create another tab for ad creation. Make it able to research competitors
  on ad library or get ad inspo and draft copy and be editable like if
  people want xyz - maybe make this Freeform also." → an **Ads tab**:
  competitor research via the Meta Ad Library or other inspiration sources,
  drafted ad copy in the formats paid-traffic dropshippers use, every field
  editable, free-form direction.
- "We need domain connection like forwarding from namecheap etc. to each
  individual store setup." → **per-store domains** with real registrar
  instructions, including plain URL forwarding from Namecheap-style
  registrars, not just "add a CNAME".
- "Product images need to be regeneratable with Freeform suggestion. Use
  options of ChatGPT images 2.0 or whatever is newest and whatever newest
  Google model is available for image generation." → **re-shoot from a
  sentence**, choice of the newest OpenAI (GPT Image 2) and Google (Gemini
  3 Pro Image) models, using the owner's photo as the reference.
- "For page content we need to be able to suggest avatars and customers we
  are targeting." → **avatars**: suggested target customers that drive page
  and ad generation, editable and selectable.
- "This is primarily focusing on dropshipping. We are going to sometimes be
  uploading example sites selling same product as us and this needs to pull
  info angle etc. but we need option to change to what we need if
  necessary." → **competitor-site angle extraction** into editable fields
  (headline, hooks, offer, proof, audience, angle) that can be folded into
  research or used as direction.
- The message ended with "Also" — cut off. Whatever followed is unknown and
  unbuilt.

**Messages 6–8 — housekeeping.** Clone `dylanail/Shopify-Replacement` into
the session; then "I meant to commit this to Shopify-replacement repo, not
Darwin" (done: history moved here); then the request for the Darwin audit
(`docs/DARWIN_INHERITANCE.md`) and this document.

### Standing principles that follow from all of the above

- **Dropshipping first.** Paid traffic, advertorials, offers, bundles,
  bumps, upsells, supplier costs, margins, ROAS. Not a general SaaS.
- **Research-backed.** "Do research" was said three times. Decisions about
  builders, checkouts, funnels and apps were expected to come from looking
  at what Funnelish, Shopify, Kaching, Vitals, DSers, Loox, ReConvert and
  Parcel Panel actually do.
- **Everything generated is editable.** Direction boxes everywhere, and a
  form behind every generated thing: pages, versions, avatars, angles, ads.
- **Newest models.** The owner said "whatever is newest" for images; the
  same spirit applies to text models. Model ids belong in configuration.
- **Personal.** One operator, many stores. No plan gates, no billing, no
  marketing site to sell it.
- **Mobile is the storefront.** Paid traffic is mostly phones.

---

## Part 2 — The conversation, in order

Verbatim text for every message is in Appendix B; the blueprint is Appendix
A; the delivery replies are Appendix C. This is the annotated timeline.

| # | Owner said | Intent | Delivered | Commit |
|---|---|---|---|---|
| 1 | "One shot this platform" + the Amboras teardown blueprint (§0–12) | Build the whole thing in one pass | Control plane, commerce core, agent with 74 tools, generated storefronts, plugins, analytics, 10 emails, SEO, seed with a demo store, 56 tests | `486e91b` |
| 2 | "Is this like a storebuilder? … see diff stores … start new stores. Give image … generate good product images … customer research … shopify style product pages" | Confirm category; stores hub; image → imagery; research → pages | Stores hub + "New store"; multipart uploads; photo staged into six scenes or re-shot by the image model; customer research record (personas, triggers, objections, competitors, price anchor, keywords, proof); Shopify-grade PDP sections; 68 tests | `5309e90` |
| 3 | Fonts, speed, DnD builder like Funnelish/Shopify, advertorials, raw HTML, perfect clone of a reference URL, Shopify-like simple checkout, Kaching bundles, Stripe | The page-building and selling surface | 50+ block DnD editor with live preview; advertorial and landing templates from research; HTML mode; URL cloner; one-page checkout with express row, buy-it-now, one-click post-purchase offer; Stripe client (PaymentIntents, saved cards, Express Checkout, refunds, webhooks); tiered bundles enforced by promotions; Google Fonts pairings; Brotli; 81 tests | `e1eedb1` |
| 4 | Mobile; "just for me"; versions with free-form direction or formats; research Funnelish funnels and dropshipping apps and include their features | The dropshipper's stack | Funnels (bump/upsell/downsell/thank-you); versions per format with direction, split-tested; product import from Shopify URLs; supplier cost and margin; supplier fulfilment with carrier detection; branded tracking page; delivery estimates; ad spend and profit report; Vitals-style widgets on real data; CSV review import; abandoned-cart email; pixels; mobile pass; personal mode; 93 tests | `90cc312` |
| 5 | Ads tab with ad-library research; domains with Namecheap forwarding per store; regeneratable images with newest OpenAI and Google models; avatars; competitor-site angle extraction | Growth surfaces | Ads tab (10 formats × 4 platforms, editable, revisable, exportable; swipe file with Ad Library, links, paste, patterns); per-store domains with registrar steps and real DNS/redirect checks; GPT Image 2 and Gemini 3 Pro Image re-shoots from direction; avatars; competitor angles; 115 tests | `0ac62ef` |
| 6 | Clone Shopify-Replacement | Bring the target repo in | Cloned (README only) | — |
| 7 | "I meant to commit this to Shopify-replacement repo, not Darwin" | Move the project | Subtree split, merged with history, pushed to `main` | `4645a3e`, `a024970` |
| 8 | List decisions inherited from Darwin | Prepare the cleanup | `docs/DARWIN_INHERITANCE.md` | `301ba41` |
| 9 | This document | Prepare the rebuild | `ORIGINAL_INTENT.md` | — |

Note on the images in the transcript: the "[Image: …]" user turns are
screenshots I took of the running product with Playwright and read back;
they are not files the owner uploaded.

---

## Part 3 — The platform as it stands (A to Z)

Runs with `npm run seed && npm start` on Node ≥ 22.18, no dependencies,
SQLite in `data/`. Sign in with `you@example.com / change-me-please` for the
seeded demo store "Ironjaw & Co" (boxing gear). 115 tests, typecheck clean.

**Admin (20 rail entries):** Dashboard · Assistant · Orders · Products ·
Research & avatars · Ads · Collections · Customers · Promotions · Analytics ·
Reviews · Pages & funnels · Funnels · Bundles · Profit · Store designer ·
Email & SEO · Integrations · Domains · Settings (+ Stores hub, Payments,
Onboarding, login/register). Every page carries the docked assistant panel
with suggestions, a risky-action checkbox, an SSE activity stream and the
to-do punch list.

**Agent:** 114 tools in 15 areas (products 28, store 15, plugins 12,
reviews 8, analytics 7, orders 7, ads 7, promotions 5, organization 4,
domains 4, seo 4, emails 4, setup 3, customers 3, content 3). Executor
validates against each tool's schema, refuses `confirm`-risk tools without
confirmation, audits every call. Durable runs persisted as rows with
concurrent branches and recovery on boot. Rules planner always; Anthropic
model planner with `ANTHROPIC_API_KEY`. One chat session per store; prompt
library.

**Onboarding:** one sentence (+ photo upload, + existing site URL) →
research → brand (name with syllable guards, palette, fonts by mood, logo,
slogan, voice) → three products with variants, copy, imagery → collections →
promotions (welcome code, free-shipping threshold, bundle) → theme →
punch list. Stores hub lists every store with 30-day numbers; "+ New store"
re-runs onboarding.

**Research & avatars:** research record (positioning, personas with share,
triggers, objections with answers, competitors with price band and
weakness, price anchor low/mid/high, keywords, proof points, comparison
rows, source notes) from category knowledge (boxing gear, skincare, coffee
hand-written; generic otherwise), a model when configured, and a pasted
site. Avatars suggested from personas (who, wants, fears, buys when, share,
angle, five hooks, tone, first objection and answer), editable, selectable,
addable by hand. Competitor pages read from URL or pasted HTML into
brand/headline/subheadline/hooks/benefits/offer (price, compare-at,
discount, shipping, guarantee, bundle)/proof (reviews, rating,
badges)/CTAs/audience/angle/images, every field editable; fold into
research, generate PDP versions with it, draft ads with it.

**Products:** options, variants (SKU, price, compare-at, inventory,
weight, swatches for colour options), media, SEO, metadata, hidden
products, structured page content (benefits, comparison, specs, FAQ,
guarantee, shipping, trust, audience), supplier (name, URL, cost,
shipping, SKU, processing and shipping days) with margin calculator, size
chart, import from any Shopify `/products/x.json` or Open Graph page with
markup, low-stock report, inventory reserve/release.

**Imagery:** upload sniffed by bytes, stored under a random id; staged into
six scenes (white seamless, lifestyle, dark luxury, flat lay, golden hour,
studio 3-point) around the actual photo; four-lane enhance; hero and logo
generation; **re-shoot from a free-form direction** with OpenAI GPT Image 2
(`gpt-image-2`, edits endpoint with the reference) or Google Gemini 3 Pro
Image (`gemini-3-pro-image-preview`, generateContent with inline reference),
per render, as a contact sheet; a lane becomes hero or gallery; model output
saved as an upload.

**Pages & builder:** flat block list, 52 block types: layout (announcement
bar, header, footer, section, spacer, divider), text and media (headline,
rich text, image, image with text, video, carousel, multicolumn, collapsible,
custom HTML, custom code), commerce (featured products, buy box, bundle
offer, product grid, collection list), social proof (review wall, star
badge, testimonial, as seen on, customer photos, recent purchases), conversion
(countdown fixed or evergreen, progress bar, sticky CTA, offer box,
guarantee, comparison table, trust badges, before/after slider, free-shipping
bar, delivery estimate, payment icons, size chart, stock scarcity, live
viewers, Q&A, back in stock), advertorial (publication bar with FTC label,
byline, numbered reason, pull quote, comments, share bar, disclaimer),
forms (email signup, contact form). Drag-and-drop editor with palette,
sortable canvas, schema-driven settings, undo, desktop/phone live preview,
HTML mode, "read into blocks". Templates: advertorial listicle, product
landing page, blank. **Clone**: fetch a URL, inline stylesheets, absolutise
URLs, strip base/CSP, copy images into uploads, drop scripts by default.

**Versions:** per product, kind pdp or advertorial, formats (advertorial:
listicle, first-person story, problem-agitate-solve, expert take, "we tested
five", mistakes; PDP: benefit, story, UGC, comparison, premium minimal,
offer, urgency), free-form direction read into tone (plain, urgent,
premium, warm, clinical, playful, blunt), audience, angle, must-say phrases,
urgency, price-led; avatar fills blanks; count; publish. Weighted versions
split by session hash; per-version views, carts, sales, revenue, CVR. The
model, when configured, rewrites text values only.

**Funnels:** ad → advertorial → offer page → checkout with order bump
(shipping protection as a real hidden product by default) → one-click
upsell (off-session charge) → downsell only on decline → thank-you with
tracking and related products. Funnels page to compose them.

**Bundles:** Kaching-style tiers (quantity, discount, label, badge, free
shipping, gift) rendered on the PDP and as a block; a tiered promotion the
cart enforces; gifts re-derived on every cart change; quantity discounts do
not stack.

**Cart & checkout:** one pricing engine (`totals`); percentage, fixed,
free-shipping, BOGO, bundle, tiered promotions; first-order rules; regions
and shipping options; one-page checkout (express row, contact, delivery,
shipping method live-updating, payment, Pay now, collapsed summary on
phones); buy-it-now; guest checkout; Stripe PaymentIntents with
`setup_future_usage=off_session`, Express Checkout Element, Payment
Element, webhook signature verification, refunds via Stripe; demo order
path without keys.

**Orders & ops:** list/detail, fulfil with carrier detection from tracking
number (USPS, UPS, FedEx, DHL, Royal Mail, YunExpress, 4PX, Cainiao…),
supplier order recording, mark delivered, refund, cancel, returns; branded
`/track` page (order + email → timeline); delivery estimates from lead
times; abandoned-cart sweep every 10 minutes with one email after 4 hours;
ad-spend log; profit report (revenue − refunds − COGS − supplier shipping −
fees − ad spend, ROAS).

**Storefront:** server-rendered per brand: home, collections, PDP (gallery,
options, tiers, signals, conversion sections, Q&A, sticky mobile buy bar),
cart, checkout, order, offer, downsell, track, blog, pages, contact,
subscribe, robots, sitemap, JSON-LD, `llms.txt`, `/store/integrations/active`.
Live at `/s/:slug` (tracked) and draft at `/preview/:slug` (untracked,
pixels suppressed); subdomains with `AMBORAS_STOREFRONT_HOST`; verified
custom domains. Google Fonts pairings by mood, preconnect + swap, Brotli.

**Ads:** platforms Meta, TikTok, Google search, YouTube with character
limits; formats static, UGC video script (timed beats: hook, problem,
reveal, demo, proof, offer), problem-agitate-solve, testimonial (approved
reviews only), us-vs-them, founder, ten hooks, offer/bundle, retargeting,
search headlines. Drafted from research + avatar + direction + swipe file;
editable per field including script beats; revise under a new direction;
duplicate; status draft/ready/archived; limit warnings; preview card; text
export. Swipe file: Meta Ad Library search (`META_AD_LIBRARY_TOKEN`, EU/UK
reach), competitor links, pasted text, ten hook patterns filled with the
product.

**Domains:** per store; host (ALIAS/A/CNAME + TXT) or forward (registrar
redirect); registrar guides with menu paths for Namecheap, GoDaddy,
Cloudflare, Squarespace/Google Domains, Porkbun, other; apex handling per
registrar; real checks via DNS TXT + CNAME/A or by following the redirect,
with the result recorded; manual override; `www`/apex equivalence.

**Reviews:** create, moderate, reply, flags, verified, media, extractive
summary, CSV import in Loox/Judge.me shapes, request emails, Q&A moderation,
stock alerts.

**Promotions, collections, customers, regions, team, audit, todos:** as in
the blueprint's control plane and commerce core; personal mode makes every
store `OWNER` plan with nothing gated.

**Plugins:** manifest schema; installable first-party: stripe,
product-reviews, shippo, ga4, meta-pixel, tiktok-pixel, exit-intent,
upsells, contact-form, klaviyo, engraving; directory entries for the rest;
storefront slots rendered server-side; plugin-contributed tools.

**Analytics:** cookieless HMAC-fingerprinted sessions, events (view,
cart.add, checkout.start, checkout.complete, signup…), KPIs with deltas,
funnel with benchmarks, live visitors, affinity mining, version stats.

**Email:** 10 transactional templates, Handlebars subset, Resend adapter
with retries, send log, abandoned cart.

**SEO/GEO:** meta and JSON-LD written on save, schema validator, redirects,
sitemap, `llms.txt` knowledge card.

**Data:** 43 tables (users, sessions, stores, store_environments,
team_members, domains, todos, audit_log, store_plugins,
store_plugin_credentials, regions, shipping_options, products, variants,
collections, collection_products, customers, carts, orders, promotions,
reviews, agent_runs, agent_steps, chat_sessions, chat_messages,
email_sends, blogs, articles, sessions_analytics, analytics_events,
experiments, seo_pages, geo_prompts, redirects, store_research, pages,
bundles, funnels, questions, stock_alerts, ad_spend, avatars,
competitor_sites, ads, ad_inspiration).

**Configuration:** `PORT`, `AMBORAS_DB`, `AMBORAS_SECRET`,
`AMBORAS_STOREFRONT_HOST`, `AMBORAS_PUBLIC_ORIGIN`, `AMBORAS_PERSONAL`,
`ANTHROPIC_API_KEY` + `AMBORAS_MODEL`, `OPENAI_API_KEY` +
`AMBORAS_IMAGE_MODEL` (default `gpt-image-2`), `GEMINI_API_KEY` +
`AMBORAS_GOOGLE_IMAGE_MODEL` (default `gemini-3-pro-image-preview`),
`AMBORAS_IMAGE_PROVIDER`, `META_AD_LIBRARY_TOKEN` +
`AMBORAS_AD_LIBRARY_COUNTRY`, `AMBORAS_EDGE_HOST` + `AMBORAS_EDGE_IP`,
`RESEND_API_KEY` + `AMBORAS_EMAIL_DOMAIN`, `AMBORAS_LOG_LEVEL`.

**Known limits (documented in README):** Stripe tested against a stand-in
transport; supplier fulfilment records but does not push to supplier APIs;
without keys research/copy/ads are rules-based and generic outside three
categories; cloning is a copy not a conversion; certificates are not
issued; ads are written not placed; Ad Library returns commercial ads only
for EU/UK reach; competitor pages that block fetching must be pasted;
storefronts are server-rendered, not exported Next.js projects; no A/B
engine beyond version weights; no CRO detection; no subscriptions, gift
cards, B2B, workflow automation, GSC, GEO tracking, migration importers
beyond product import.

---

## Part 4 — What the next session should do

> **Status.** The carry-overs were reconsidered and resolved; the verdict per
> item is at the top of `docs/DARWIN_INHERITANCE.md`. Steps 1, 2 and the
> deployment half of step 3 below are done; "storefront as a real build" and
> the admin rewrite are deferred with reasons; step 5 is untouched.
>
> **Second iteration (3 September 2026).** The course material and the
> owner's notes are in: a knowledge base the writers read by topic, three
> build modes with an order of work, a Market tab (analysis, product
> overview, sub-avatars, ad plan, feedback loops), a funnel rip that keeps
> structure only, a Creative tab with a vetting queue and a GIF maker,
> generated legal pages, a popup, a quiz block, behaviour tracking, funnel
> split tests and a site health report. See `README.md` and
> `docs/DARWIN_INHERITANCE.md`.

### North star

Make this the most capable version of what Part 1 describes: **one
person's AI-native replacement for Shopify and its app stack, for
dropshipping through funnels and paid traffic.** Capability, not
self-containment, is the measure. The owner did not ask for zero
dependencies, a single process, an offline mode, or a per-turn safety gate;
those came from the neighbouring project. See `docs/DARWIN_INHERITANCE.md`
for the full list with blast radius.

### Order of work

1. **Decide the stack against the blueprint's §11.1**, biased toward
   capability and toward what the owner will actually run alone: a real
   framework for the admin (the blueprint says Next.js + Tailwind + shadcn),
   Postgres, ordinary dependencies (Stripe SDK, Zod, sharp, MJML), a proper
   job runner for durable runs, object storage for images, and a deployment
   story with TLS for custom domains (Cloudflare for SaaS or equivalent).
   Medusa is the blueprint's commerce core; the current hand-written core
   already covers the dropshipping subset well, so weigh the migration cost
   honestly rather than assuming either answer.
2. **Go model-first.** Research, copy, page writers, ad writers, avatar
   suggestion and competitor extraction should be authored by the newest
   Claude and GPT models routed per task and selectable in the admin, with
   the rules writers demoted to scaffolding or removed. Model ids in config.
   This is the largest quality jump available.
3. **Storefront as a real build.** The blueprint's centre: a per-store
   project the agent edits, builds, screenshots and publishes, exportable.
   Keep the block model and the cloner; give them a real render target.
4. **Keep every owner-facing feature from Parts 1–3.** The stores hub,
   research → avatars → pages → versions → ads chain, the builder and
   cloner, funnels with bump/upsell/downsell, Kaching bundles, one-page
   checkout, supplier costs and profit, tracking, widgets on real data,
   image re-shoots with GPT Image 2 and Gemini 3 Pro Image, per-store
   domains with registrar guides. These are the spec, not the carry-overs.
5. **Then the blueprint features still missing:** Stripe Connect and
   Payment Element for real, subscriptions, A/B engine with Bayesian
   promotion, CRO detection, GSC keyword tracking, GEO prompt tracking,
   newsletter flows, workflow automation, full migration importers,
   supplier API push (DSers/CJ/AutoDS-style), ad placement APIs (Meta,
   TikTok) if the owner wants ads published from here.

### Open questions for the owner

- What followed "Also" at the end of message 5?
- Medusa or keep the hand-written commerce core?
- Where will this run (a VPS with Caddy, Vercel + a database, Cloudflare)?
  The domains feature and TLS depend on it.
- Which suppliers (AliExpress/DSers, CJ, Zendrop, AutoDS) should fulfilment
  push to?
- Should ads be published to Meta/TikTok from the admin, or only exported?

---

## Appendix A — The original blueprint, verbatim

The first message of the session, exactly as given.

One shot this platform

### Amboras — Full Product Teardown & Rebuild Blueprint

*Compiled Sept 2, 2026 from amboras.com/what-is-amboras, all 27 linked marketing pages, the 4 page images (transcribed below), the public plugin catalog API (406 entries with manifests), the public plans API, and the site's JS bundle (nav config, route names, API base URL).*

---

### 0. TL;DR — what Amboras actually is

Amboras is a **multi-tenant, AI-native e-commerce platform** (YC S26, founders Amin & Imad Mokadem, ex-DTC operators). It is *not* a site builder — it hosts domain + storefront + commerce backend (products, variants, inventory, orders, customers, returns, promotions, shipping) + payments + transactional/marketing email, and puts an **agentic AI assistant on every admin page** that executes real tool calls (~74 verified tools) rather than answering questions.

Positioning: "Shopify + the 30 paid apps you'd bolt on, collapsed into one platform, driven by chat."

Evidence-backed stack (from plugin manifests, marketing copy, JS bundle):

| Layer | What they use |
|---|---|
| Commerce engine | **Medusa** (headless, Node/Postgres) — referenced ~40× in manifests ("push to Medusa", "Medusa promos", "Medusa fulfillment", `store.metadata.plugins.*`) |
| Control plane / orchestrator | `https://core.amboras.com/api/v1` — own API: auth (JWT + refresh), stores, store-environments (draft/live), plans, subscriptions, plugins, integrations, support conversations, `/orchestrator/*` internal routes with `X-Orchestrator-Secret` |
| Admin app | `admin.amboras.com` — Next.js (Turbopack), React Query, Tailwind + shadcn-style tokens, PostHog, PWA manifest ("Add to home screen") |
| Storefront | Next.js project per store (FAQ: "exportable as a Next.js project"), server-rendered, plugin slot system, Liquid/React/web-component review widgets |
| Marketing site | Next.js on Vercel (`dpl_` deploy IDs), fonts Inter + Manrope + a serif display |
| Analytics DB | **Postgres** for live funnel ("sub-50ms queries against the same Postgres your store runs on") + **ClickHouse** for the CRO detection engine |
| Payments | **Stripe Connect** (OAuth, KYC sync, direct payouts) + per-region plugin providers (Razorpay, Airwallex, Adyen, Mollie, Paystack, iyzico, VNPay, MoMo, Payoo) |
| Email | **Resend** (DKIM/SPF/DMARC), MJML + Handlebars templates, 3× retry, audit log |
| AI models | Anthropic Claude + OpenAI GPT routed per task; user-selectable ("Opus 5, Sonnet 4.6, GPT-5 & more"); images via OpenAI image-edit / "gpt-image-2" |
| Storage | S3 (review media uploads return S3 URLs); Supabase storage seen for marketing preview images |
| Credentials | `store_plugin_credentials` table, encrypted at rest, per-tenant resolvers with token caches |

---

### 1. The /what-is-amboras page — section-by-section

Global chrome (shared by every marketing page):
- **Header:** logo "Amboras" · mega-menu **Product / Solutions / Resources** · direct links **Examples**, **Pricing** · right side **Log in**, **Get started**. Mobile: hamburger sheet with same menus + "Add to home screen" PWA button.
- **Footer (dark #0d0d0d):** wordmark AMBORAS, serif tagline "E-commerce, version two.", link "What is Amboras?", 6 columns (Product, Solutions, Resources, Support, Company, Follow), legal row (Terms, Privacy, Your Privacy Choices).

Page sections in order:

1. **Hero** — eyebrow "What is Amboras", H1 "The first AI-native shop system." (link to /what-is-agentic-ecommerce), paragraph, CTAs `Get started` → /register and `See what's inside ↓` anchor. Hero image = 3 ceramic vases on black plinths (decorative). Second image = **the admin screenshot** (transcribed in §2).
2. **"One platform, six things you don't have to assemble"** — 6 feature cards: AI Business Assistant · Storefront · Backend · Payments (125+ methods, links /checkout-and-payment) · Emails · Domain.
3. **"Why this exists"** — narrative + 6-stat grid: 21,000+ apps · $500+/mo app spend · 30–60 min per product (old) · <2 min (Amboras) · ~2 weeks per new offer (old) · <15 min (Amboras).
4. **Comparison table** "Seven things every merchant has to do" — columns *The job / Elsewhere / On Amboras*, 7 rows (open a store, add a product, reviews, discount codes, custom domain, redesign a page, monthly app cost). Footnote: sourced from 5,000+ merchant complaints.
5. **"AI in every page of the admin"** — copy about a dedicated AI page at top of sidebar + page-scoped mini-chats; voice or type. Image = merchant at MacBook showing the same admin (transcribed §2).
6. **Onboarding & migration** — two columns:
   - *Starting fresh · two minutes* — 6 numbered steps (You type → Amboras names it → Three products → Brand built → Promotions live → You see it).
   - *Migrating · 48 hours* — 4 cards (Products, Customers, Orders, SEO & redirects) + supported sources (Shopify, BigCommerce, WooCommerce, Magento, Squarespace) + `Migrate store →`.
7. **"Your store, live"** — checklist animation (Store created → Storefront live → Products generated → Brand applied → Promotions live) + Ironjaw & Co hero image (transcribed §2).
8. **Founders block** — "Built by people who lived this", three trust chips (Backed by leading accelerators · Conversion-first, AI-native · Founders are former DTC operators).
9. **FAQ** — 5 accordions.
10. **Final CTA** — "Type one sentence. See your store." + Get started / Contact Us.

---

### 2. Image transcriptions → layouts

#### 2.1 `admin-dashboard.webp` (1672×941) — THE key screenshot: the admin shell

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◮ Amboras   [ 🎙 Request a Feature ]                                 [ ⧉ Publish store ]│  ← 40px top bar, white
├───┬──────────────────────────────────────────────────────────┬───────────────────────┤
│ ▦ │ Hello Franz, welcome back.          Questions?  [Live chat]│ ≡                  ⤢ │
│ ▤ │ [📅 Apr 24–30, 2026 ▾]                                    │                       │
│ ⌂ │ ┌──────────┬───────────┬────────┬────────────────┬───────┐│                       │
│ ◇ │ │Sessions  │Total Sales│Orders  │Conversion Rate │AOV    ││        ◮ (Beta)       │
│ ▣ │ │2,489     │$7,842.19  │156     │2.27%           │$50.27 ││ Amboras Business      │
│ ◈ │ │+12.5%    │+18.3%     │+14.7%  │+9.2%           │+3.1%  ││ Assistant             │
│ ▥ │ └──────────┴───────────┴────────┴────────────────┴───────┘│ ┌───────────────────┐ │
│ ◔ │ ┌ ● ● ●  (browser-chrome framed live storefront preview) ┐│ │Ask a question...  │ │
│ ⚌ │ │ HAND-STITCHED IN MEXICO CITY · 14-DAY BUILD · FREE...  ││ │[+Add image]    (▶)│ │
│   │ │ IRONJAW & CO.  GLOVES WRAPS BAGS THE WORKSHOP CUSTOM… ││ └───────────────────┘ │
│   │ │ [PDP: gallery 2/4 + 4 thumbs | title, price, variants,││  ◔ Add a new product   │
│   │ │  build option radios, ORDER YOUR PAIR – $340]          ││  ◔ Update homepage     │
│   │ │                                                        ││  ◔ Create a discount   │
│   │ └────────────────────────────────────────────────────────┘│  ◔ Review analytics    │
│ ? │                                                           │                       │
│ ⚙ │                                                           │ next steps            │
│ F │                                                           │ · Want to add your own│
│   │                                                           │   products · Set up   │
│   │                                                           │   payments · Connect  │
│   │                                                           │   domain              │
└───┴──────────────────────────────────────────────────────────┴───────────────────────┘
   44px icon rail          ~1110px main content                  ~300px AI panel
```

Detail:
- **Top bar:** logo + product name left; pill button "Request a Feature" (mic icon → voice); right: black "Publish store" button (the "unified state-aware publish CTA" from changelog).
- **Left rail (icons only, ~44px):** in order — Dashboard (grid, active), Orders (table icon), Products (bag), Collections/Categories (cube), Customers (database), Promotions (tag), Analytics (bar chart), Store/Theme (shop), Settings-ish sliders (Integrations). Bottom: Help (?), Settings (gear), avatar "F". Reading the changelog and route names this maps to: `/dashboard`, `/orders`, `/products`, `/collections`, `/customers`, `/promotions`, `/analytics`, `/store`, `/plugins` (+ `/seo`, `/geo`, `/discover`, `/reviews`, `/emails` appear as tabs elsewhere).
- **Main:** greeting in serif ("Hello Franz, *welcome back.*"), "Questions? [Live chat]" top-right, date-range picker, 5 KPI tiles in one bordered row (Sessions, Total Sales, Orders, Conversion Rate, AOV; each value + green delta), then a **browser-chrome-framed iframe of the live storefront** (the mac traffic-light dots are drawn).
- **Right panel (AI Business Assistant, Beta):** collapse (≡) and expand (⤢) controls, centered logo + title, input box with "Ask a question…", "+ Add image" attachment, send button; four suggested-prompt rows with icons (Add a new product / Update homepage / Create a discount / Review analytics); footer "next steps" = onboarding punch-list chips (Want to add your own products · Set up payments · Connect domain).
- Palette: white/cream canvas, warm greys, near-black text, serif display (Playfair-like) for greetings, sans (Inter/Manrope) for UI, green deltas.

#### 2.2 `talk-to-your-store.webp` (1254²) — lifestyle shot
Man at a MacBook, same admin as 2.1 but the AI panel shows a greeting bubble "Hi Franz! How can I help you grow Ironjaw & Co. today?" with input pinned bottom. Confirms: the AI panel is a persistent right-docked chat, input at the bottom when a conversation exists, suggestions only in empty state.

#### 2.3 `hero.webp` (1536×1024) — decorative product still (three vases). No UI.

#### 2.4 `ironjaw-hero.webp` (1024²) — AI-generated storefront hero: wordmark "IRONJAW & CO." serif, subhead "Hand Stitched in Mexico City", two brown leather gloves on cream. Demonstrates the brand-image generator output (logo/wordmark + hero art from one prompt).

#### 2.5 Generated storefront PDP (from `/examples` v2/ironjaw, 3172×1984) — the storefront template anatomy

```
┌────────────────────────────────────────────────────────────────────────┐
│ ▓ HAND-STITCHED IN MEXICO CITY · 14-DAY BUILD TIME · FREE FREIGHT >$200 │ announcement bar (burgundy)
├────────────────────────────────────────────────────────────────────────┤
│ (logo) IRONJAW & CO.   GLOVES WRAPS BAGS THE WORKSHOP CUSTOM ORDERS     │ header: logo+tagline,
│        MEXICO CITY · SINCE 2014                     ES/EN  👤  🛒(1)     │ nav, lang switch, account, cart
├───────────────────────────────────┬────────────────────────────────────┤
│ Home / Gloves / The Sparring 16oz │ ★★★★★ 4.9  892 fighters reviewed   │ ← reviews badge component
│ ┌───────────────────────────────┐ │ ◆ HAND-STITCHED IN CDMX · 14-DAY   │ ← trust eyebrow
│ │        main image  (2/4)      │ │ THE SPARRING 16OZ                  │ ← display serif
│ │                               │ │ For real rounds. For real partners.│ ← italic subtitle
│ └───────────────────────────────┘ │ $340                               │
│ [thumb][thumb*][thumb][thumb]     │ WEIGHT  (12oz)(14oz)(16oz●)(18oz)  │ ← option pills
│                                   │ LEATHER ● ● ●  (swatches + labels) │ ← color swatches
│                                   │ CLOSURE (Lace-up●)(Velcro)         │
│                                   │ ◉ Stock Build · Ships in 14 days $340│ ← "build option" radio
│                                   │ ○ Custom Stitched · initials · $385│    cards (variant/upsell)
│                                   │ [ ORDER YOUR PAIR – $340 ]         │ ← full-width CTA
│                                   │ Built to order. Hand-stitched by…  │ ← microcopy
│                                   │ Hand-stitched · Full-grain · Lifetime│ ← trust strip
└───────────────────────────────────┴────────────────────────────────────┘
```
All of this — announcement bar, 3 option axes, swatches, build-option radio cards, trust strip, review badge — is generated from **one prompt + one reference image** ("Create me a high-converting hand-stitched boxing-gear store in the style of a 1920s heritage leather atelier — sepia parchment tones, deep burgundy accents, vintage serif typography — with this image").

#### 2.6 Home-page "everything" card mockups (6 portrait cards)
- **AI Store Editing:** PDP with a chat bubble "Bundle & Save — Select 3 candles and save 20%" pointing at a section → the AI edits sections in place.
- **AI Shop System (admin products page):** left nav text version (Dashboard, Products, Orders, Analytics, Collections, Settings), header "Welcome back, Amboras." + "+ Add Product", 4 KPI tiles (Total Products 128 / Total Orders 842 / Revenue $24,680 / Out of Stock 5), "Your Products" table with tabs (All / Published / Drafts / Archived), Search, Filter; columns Product (thumb+name+variant) / Status (Published·Draft dot) / Inventory / Price / ⋮. Right-docked "AI business assistant BETA" with a conversation that updated a product description and shows a product card + "View Product".
- **Generative A/B Testing:** two PDP variants stacked.
- **AI Image Enhancing:** raw sneaker photo → enhanced studio image with arrow.
- **One-Click Checkout:** 4-step stepper (Cart → Shipping → Payment → Review), "Credit or debit card" with Visa/MC/Amex logos, Apple Pay / Google Pay / Link buttons, PayPal, order summary card, "Order confirmed" toast.
- **First-Party Analytics:** "Last 7 Days" revenue $24,680 (+22%) area chart, Sessions 18.2k / Conversion 3.4% / AOV $58 tiles, funnel bars (View 100% · Add to Cart 28% · Checkout 9.2% · Purchase 3.4%), "First-party" chip.

#### 2.7 `how-it-works/1.webp` — the Store Designer layout (older "Siter" branding)
```
┌ Siter  [Skincare Store ▾]                         [Preview] [Publish] ┐
├────────────────┬───────────────────────────────────────────────────────┤
│ You            │                                                       │
│ Build me a     │        LIVE STOREFRONT PREVIEW (full-bleed iframe)    │
│ skincare store │                                                       │
│ ────────────── │                                                       │
│ Siter AI       │                                                       │
│ Building your  │                                                       │
│ store…  ● ● ●  │                                                       │
│                │                                                       │
│ [Ask anything…▶]│                                                      │
└────────────────┴───────────────────────────────────────────────────────┘
   ~30% chat            ~70% preview
```
This is the **Store Designer** (changelog: "Store Designer remembers your work", "Free-tier guardrails on the Designer") — a v0/Lovable-style split view: chat left, live preview right, store switcher in header, Preview/Publish actions.

---

### 3. Every public page (marketing site) — what it contains

| Route | Purpose | Notable sections / components |
|---|---|---|
| `/` | Home | 5 rotating hero backgrounds (example stores), H1 "World's first AI-native ecommerce platform", CTAs Try for Free / Contact Us; example carousel with **prompt reveal on hover** (shows the exact prompt + input image that generated the store); stat counters (Stores made, Shop apps replaced, "Backed by YC, A*"); 6-step "How it works" list synced to an image; "Everything you need" 6-card infinite marquee; "Grow your e-commerce" tabs (Bundles / Upsells / Design / Subscription) with visuals; Generative A/B testing block ("+80% CVR on first live version"). |
| `/what-is-amboras` | Product overview | see §1 |
| `/what-is-agentic-ecommerce` | "A-commerce" manifesto | 3-era timeline with **animated fake UIs** (theme-editor drag UI 2010–2023 → prompt-to-store 2026 → "Evolution map" 1→36 candidates with generational lift +2.1/+4.6/+8.4%); **8-surface tabbed demo** (Catalog, Organize, Promotions, Emails, Storefront, Launch, SEO, Brand) each showing prompt → tools fired → artifact; "Anatomy of an action" (one sentence → `enhance-image`, `create-product`, `manage-collection-products`, `create-promotion`); 6 admin areas with **real tool counts**; 4-stage autonomous CRO engine (Detection → Synthesis → Cross-store learning → Ship winners); FAQ. |
| `/ai-seo` | AI SEO feature | Fake SERP card, schema validator (Product/Offer/AggregateRating/BreadcrumbList), keyword tracker with sparklines, Search Console loop, code blocks (`<head>` meta, JSON-LD, alt text). Page still contains **unreplaced image-prompt placeholders** describing the real admin: route `/admin/seo`, left rail with SEO item highlighted teal, 3 stacked widgets (keyword tracker table w/ position, weekly delta, 28-day click sparkline; pages-needing-attention list with R/A/G dots; recent-rewrites timeline), a 90-day impressions-vs-clicks stacked area chart with "Amboras took over" marker, single-keyword detail view. |
| `/ai-geo` | Generative Engine Optimization | Per-model mention cards (ChatGPT, Claude, Perplexity, Gemini) with 30-day counts and quoted answers; prompt/answer feed; placeholders describe `/admin/geo`: tracked-prompts table (prompt, model, placement Recommended/Cited/Mentioned/Not cited, sparkline), per-engine bar chart, answer-snippet feed, **knowledge-card editor** (Brand name, Categories, Differentiators, Locations, Founders → live preview of how ChatGPT ingests it). |
| `/reviews` | Reviews product | Live PDP mock with AI summary bullets; masonry wall of review cards; **7 shipped review components** (grid, horizontal cards, video reviews, star badge, happy-customers banner, quote card, bubbles grid) each with preview image; "Compose your own component" prompt box; AI summary / fake-review filter / auto-Q&A from reviews; conversion lift chart. Placeholders describe: photo wall 4×3, sticky rating badge, AI summary card, Q&A widget w/ founder replies + auto-answers, rating-distribution sidebar bars (click-to-filter), full review feed with filter chips (rating, with-photo, verified-only) + pagination. |
| `/ab-testing` | Agentic A/B testing | Scrolling status ticker (RUNNING/WINNER/KILLED/STARTED/PROMOTED · experiment · confidence/lift); "Lab notebook" experiment cards (EXP-0341…, variant A/B rates, confidence %, verdict); Bayesian confidence ladder (50/80/95/99); Draft → Run → Promote; 8 test surfaces (headlines, CTAs, images, pricing, bundles, free-ship thresholds, email subjects, send times); outcome stats. |
| `/analytics` | Real-time analytics | Live KPI ticker (Sessions today, Conv rate, AOV, Visitors now, geo split US/DE/FR); 4-stage funnel with drop-offs (Sessions → Add to cart → Checkout → Purchase) + industry comparison bar (you vs median vs top decile); world map with live visits list (city, path, seconds ago); realtime event ticker table (event type · what · amount · from · when: `cart.add`, `view.product`, `checkout.complete`, `checkout.start`, `view.collection`, `signup`); "no cookies, IP-fingerprinted sessions". |
| `/ai-emails` | Transactional email | Postal-stamp themed; **10 templates** enumerated (Order confirmation, Shipped & delivered ×2, Cancelled, Refund, Welcome, Password reset, Abandoned cart @4h, Review request @7d, Trial ending @-3d, Payment failed ×3 retries); event→email map; MJML+Handlebars code editor with live inbox preview; DKIM/SPF/DMARC via Resend; audit (sent/bounced/opened/clicked) + 3× retry. |
| `/newsletter` | Marketing email | Newspaper-themed; AI "editor" that drafts an issue from a brief (pulls product, inventory, last 4 issues for tone) → 3 subject candidates → rendered email; inbox-simulation; per-recipient send-time optimization; **5 flows** (welcome, browse abandon, cart abandon, post-purchase, win-back); subject A/B. |
| `/upsells` | Upsells | Cart-aware AI-ranked; **6 React components** (FBT, FBT-grid, Bundle offer, Complete your routine, Complete your set, Buy more get free); ranking inputs (90-day co-purchase mining, customer history, cart context); **3 placements** (PDP below ATC, cart drawer free-ship-gap closer, post-checkout one-click charged to same card). |
| `/bundles` | Bundles | Tiered pricing (1×/2×/3× with % off), **6 components** (Bundle Pack Triple/Duo, Horizontal Triple Tier, Choose Your Deal Duo, BOGO horizontal/vertical); 3-step builder (pick products → preview → discount rules) that auto-creates Medusa promos + bundle inventory. |
| `/cross-sells` | Cross-sells | Nightly-rebuilt affinity model from 90 days of orders; 6 pairing components incl. free-gift selector; 3 placements (goes-with widget, cart drawer "complete the look", thank-you "we saved one for you"). |
| `/checkout` (nav) / `/checkout-and-payment` (client-rendered) | Payments | Stripe Connect OAuth 2-click flow (charges/payouts/pending status), payment method grid, payout timeline (Day 0 charge → Day 1 transit → Day 2 settled), PCI/3DS/SCA; "flat platform fee, never a cut". |
| `/subscriptions` | Subscriptions | Weekly/Monthly/Quarterly/Annual cadences per product or variant, free trials, returning-customer trial skip, dunning (3 retries over 3 days + card-update email), customer portal (pause/cancel/change cadence), MRR/subscribers/churn dashboard. |
| `/ai-images` | AI image enhancement | Upload → optional brief → **4 parallel render lanes** (~32s) → auto-attach to Medusa product media; **6 versioned presets** (white seamless, lifestyle, dark luxury, flat-lay, golden hour, studio 3-point); contact sheet with pick/crop marks; quality low/med/high; 1024² sRGB. |
| `/examples` | Gallery | Hero gallery image; category filter chips (All, Apparel, Art, Beauty & Wellness, Food & Drink, Home, Jewelry, Pet, Reading, Sports, Watches); **18 example stores**, each card shows generated storefront + the input image + the exact prompt; migrate CTA. |
| `/pricing` | Plans | Monthly/Yearly toggle (save 20%); 4 plan cards with art (Basic $49, Grow $105 *Popular*, Advanced $399, Enterprise custom); feature bullets; trust row "Stripe secure checkout · Cancel anytime · 30-day launch guarantee"; FAQ. |
| `/apps-and-integrations` | Integrations directory | Client-rendered from `GET core.amboras.com/api/v1/public/plugins`; search box, category chips with counts, 3-col card grid, "Show more (n)" pagination of 18, first-party sorted first. |
| `/migrate` | Migration | 4 cards (Products & variants, Design & content, SEO preserved, Integrations & inventory); "Start a new store instead". |
| `/changelog` | Weekly changelog | Grouped by week, dated entries (transcribed in §6 — this is the single best source of real shipped features). |
| `/faq` | 100-question FAQ | 10 jump-to sections; contact form at bottom. |
| `/contact` | Multi-step lead form | Name, Email, Store name, Store URL, Monthly revenue (5 buckets) → Next. Also a "book a 20-min call with a founder" widget (changelog). |
| `/about`, `/team` | Company | Origin, mission, YC, founder photos; team page with 3 people + LinkedIn/X. |
| `/register`, `/login` | Auth (client-rendered) | Register → onboarding; changelog: paid-ads quiz-style onboarding with UTM routing, "paste your old site at signup", trial vs. pick-a-plan. |
| `/terms`, `/privacy`, `/privacy/do-not-sell`, `/backed` | Legal / investors | — |


---

### 4. The admin app (admin.amboras.com) — full page/feature inventory

Route names found in the bundle: `/dashboard`, `/dashboard/stores`, `/dashboard/settings`, `/onboarding`, `/analytics`, `/reviews`, `/login`, `/register`, `/migrate`. Everything else below is reconstructed from the screenshot rail, changelog, FAQ, plugin manifests and image-prompt placeholders (`/admin/seo`, `/admin/geo`).

#### 4.1 Shell
- **Top bar:** logo, store switcher (multi-store on Grow+), "Request a Feature" (voice-capable, lands in roadmap), "Book a Call" (founder Calendly), "Publish store" (state-aware CTA: knows what the store needs next), platform-status banner ("Always know when we're down").
- **Icon rail** (desktop) / **bottom nav + floating chat** (mobile, "Mobile admin shell" Apr 18).
- **AI panel** docked right, collapsible/expandable, persists across pages ("One chat across the admin"), page-aware context ("The AI knows which page you're on"), pinned to-do plan above input, message queueing while agent runs (auto-pauses when AI asks a question), endless history with lazy load, image attachments, voice input, prompt library (31 curated prompts), **activity dots** on rail items when AI tools touch that area (color-coded by status).
- **Mobile chat** = draggable sheet with half/full snap points, opened from any to-do tile.

#### 4.2 Pages

| Page | Contents / capabilities |
|---|---|
| **Dashboard** | Greeting, date range, 5 KPIs (Sessions, Total Sales, Orders, CVR, AOV + deltas), embedded live storefront preview, **color-coded to-do punch list** (done / in progress / waiting on you) that doubles as onboarding (add products, set up payments, connect domain), sales charts (revenue/orders/conversion), deployment banner when a build is live, AI image before/after cards. |
| **AI (dedicated page)** | "A dedicated AI page sits at the top of your sidebar — it can do anything across the platform." Full-screen chat with same agent, all 74 tools. |
| **Store Designer** | Split chat/preview (§2.7). Draft vs live themes ("store-environments"), theme gallery with 3 preview screenshots per template + animated carousel in create-theme dialog, start-from-template registry, drafts that persist across refresh, previews kept warm, plugin sets per theme, AI edits actual storefront source files → lints → compiles in sandbox → screenshots → shows diff → publish; rollback. Free-tier upgrade gate. |
| **Products** | Table (thumb, name, variant summary, status dot, inventory, price, ⋮), tabs All/Published/Drafts/Archived, search, filter. Product editor: up to 3 options / unlimited variants each with SKU, price, inventory, image; drag-drop media reorder (first = hero); backorders toggle per variant; custom key/value metadata; digital products (tokenized downloads); subscription cadence per product/variant; engraving template assignment; SEO title/description/alt; AI: generate copy (150–200 words), images (6 presets, 4 lanes), variants, categories, pricing in cents. **Import:** Shopify / BigCommerce / WooCommerce / Magento / standard CSV with mapping+validation+AI tidy-up; post-onboarding "swap sample catalog". Bulk import by chat. |
| **Collections / Categories** | 12 organization tools; group by season/style/use-case; move product into collection by name; re-merchandise via prompt. |
| **Inventory** | Real-time by location and variant, low-stock alerts, oversell protection, AI re-order points, backorders. |
| **Orders** | List + detail; refund, re-fulfill, cancel; fulfillments via connected carriers/3PLs (Shippo labels in-admin, ShipStation/ShipBob/Skydropx/Shiprocket/Royal Mail push, pixi VDI); tracking webhooks flow back; returns portal (self-service, refund/exchange, auto labels, returns analytics). AI on this page: refund/re-fulfill, summarize. |
| **Customers** | Table with sticky filters, fast for thousands of rows; profiles, addresses, order history, marketing flags; segments; B2B: customer-specific price lists, gated catalogs, net terms, bulk-order forms; wholesale. |
| **Promotions** | Codes, automatic discounts, BOGO, free-shipping thresholds (per region), bundle deals, variant-level targeting, eligibility rules, scheduling windows, stacking logic, min/max rules currency-aware. "3 promotions with 1 prompt." Gift cards + store credit (migrated). |
| **Analytics** | Live KPIs, funnel (Sessions→ATC→Checkout→Purchase) with drop-offs and industry median/top-decile comparison, world map + live visits, realtime event ticker, 24H/7D/30D/90D ranges, cohort reporting (Grow+), advanced analytics gate. IP-fingerprinted sessions, no cookies/SDK/pixel. Subscription metrics (subscribers, MRR, churn, trial→paid). |
| **A/B Testing (Experiments)** | Native storefront experiments (first pass May 14): variant creation (AI-generated or manual), traffic split, Bayesian sequential posterior, auto-promote at 95%, auto-rollback loser, changelog of results; test surfaces: headlines, CTAs, images, pricing, bundles, free-ship threshold, email subjects, send times. Advanced/Enterprise: fully autonomous loop, sandbox clone of production for testing. |
| **Reviews** | Moderation queue (approve/reject/restore/soft-delete, filters, pagination), install gallery of 7 storefront components, fake-review filter flags, AI summary regeneration, Q&A with founder replies + auto-answers from review corpus, review-request email automation w/ optional discount code, photo/video upload to S3, per-product stats (avg, count, distribution). AI tool: `list_reviews`. |
| **SEO** | Keyword tracker (query, position, weekly Δ, 28-day click sparkline), pages-needing-attention (R/A/G), recent-rewrites timeline, Search Console connection + 90-day impressions/clicks chart, single-keyword detail, schema validator (Product/Offer/AggregateRating/BreadcrumbList on save), auto meta/alt/JSON-LD on product create, sitemap/robots/301s auto, bulk redirect import. |
| **GEO** | Tracked prompts × models (ChatGPT/Claude/Perplexity/Gemini) with placement status + sparkline, per-engine mention bars, answer-snippet feed, knowledge-card editor with ingestion preview, entity descriptors + comparison tables + citations shipped to storefront. |
| **Emails** | 10 transactional templates (editable HTML/MJML + Handlebars, preview-to-inbox), marketing campaigns + 5 automations, list management, sending-domain verification (DKIM/SPF/DMARC), send log with sent/bounced/opened/clicked, 3× retry. AI: rewrite tone/layout, draft campaign from brief, 3 subject variants, per-recipient send time. |
| **Blog** | Multi-blog CMS: blogs → articles (rich text, images, tables, excerpt, featured image, tags, SEO fields, draft/scheduled/published), RSS/Atom, `/blogs` routes SSR. AI tools: `create_blog`, `create_article`, `list_blogs`. |
| **Store / Domains** | Settings → Domains: paste owned domain → DNS verify, SSL, CDN automatic; domain purchase via AI wizard; Apple Pay domain registration in 2 clicks; unguessable crypto-random slug for preview URLs. |
| **Settings → Payments** | Stripe Connect onboarding (OAuth, KYC status: charges/payouts/pending), plus per-plugin tabs (Airwallex, Adyen, Mollie, Paystack, Razorpay, iyzico, VNPay, MoMo, Payoo) that appear once installed; manual vs auto capture; refunds from admin. |
| **Settings → Regions & shipping** | Multi-region: add region (curated country catalog), currency lock once multi-region, payment providers mirrored to new regions automatically, automatic currency conversion; shipping zones/rates (flat, free-above-threshold per region, weight, price, live-rated), guided "show me how" tour; local delivery (radius, slots), in-store pickup (multi-location), DDP/DAP duties. |
| **Settings → Integrations / Plugins / Discover** | Discover section with live previews + one-click install dialogs; plugin tabs; per-theme plugin sets; AI can install/uninstall; 150 → 406-entry marketplace; each first-party plugin has settings page (schema-driven forms: text/boolean/pattern) and AI tools (`connect_shippo`, `connect_shipstation`, …). |
| **Settings → Team** | Invite by email, Admin/Member roles, per-store permissions, token-based onboarding; RBAC, 2FA (TOTP + WebAuthn), audit log (actor, timestamp, diff — includes AI actions), SCIM on Enterprise. |
| **Settings → Billing** | Plan picker (drawer on mobile), monthly/yearly, trial-aware CTAs, AI credit pool + pay-as-you-go top-ups, "earn up to $X in credits", cancel → 90-day retention → export CSV/JSON/archive. |
| **Support** | Live chat with founders (support-conversations query keys), SMS drip post-signup, feature requests, book a call. |
| **Migration** | `/migrate`: Shopify/BigCommerce/WooCommerce/Magento/Squarespace → products, variants, customers (one-time password reset), orders, fulfillments, refunds, gift cards, discount codes, 301s, sitemaps, schema; DNS flip with no downtime; free on paid plans; 48h SLA. |
| **Workflow Automation ("Flow")** | Shopify-Flow-style builder: When [trigger] → If [conditions] → Then [actions]; actions: replyable emails, order tags, CSV capture, Google Sheets append (service-account creds encrypted); run history; enable/disable; CSV export. |
| **Contact Form / Exit Intent / Engraving** | First-party ux_module plugins with their own admin sub-pages (submissions inbox; exit-intent responses + stats + CSV export; engraving template designer with per-currency FX fee). |

#### 4.3 Onboarding flow (register → live store)
1. Register (email/password; social? unknown) — or paid-ads quiz funnel with UTM routing.
2. "Type one sentence" (+ optional reference images, or paste existing store URL to scrape brand/copy/imagery).
3. **AI onboarding agent** asks only what it needs.
4. Parallel agent branches (visible progress): brand-naming agent → name (short, brandable, domain-available; no "Shop"/"Online") · 3 products (hero + 2 complements, image each, 150–200 word copy, variants, cents pricing, published) · brand (primary/secondary color, slogan, description, generated logo) · promotions (bundle discount, free-ship threshold, WELCOME10) · storefront build.
5. Live preview iframe appears the moment the URL exists; "View Your Store" → share.
6. Dashboard to-dos: swap sample catalog, set up payments, connect domain, shipping tour.
7. Pick plan (no trial, since May 26) or 30-day trial w/ card (May 17 → removed).
8. Crash-safe builds: runs survive deploys/restarts/SIGTERM; pause/resume/cancel.

---

### 5. The AI agent layer — how it's built (as disclosed)

- **Tool registry:** ~74 verified actions with strict input validation, added weekly. Named tools seen: `enhance-image`, `create-product`, `manage-collection-products`, `create-promotion`, `list_reviews`, `create_blog`, `create_article`, `list_blogs`, `connect_shippo`, `disconnect_shippo`, `connect_skydropx`, `connect_shiprocket`, `connect_shipstation`, `connect_shipbob`, `connect_goaffpro`, `connect_sevdesk`, `connect_facebook_instagram_shop`. Counts per area: 6 product tools, 11 image tools, 2 generators · 12 organization tools · 6 promotion tools · 5 email tools · 6 file tools + 2 verification + 1 visual (storefront source) · 5 setup tools, 3 plugin tools, 14 wizards (launch).
- **Plugins contribute tools:** manifest `admin.aiTools[]` = `{name, description, example}` → merged into the agent's tool list at install time ("adding a tool means giving the AI a new capability").
- **Context:** current page injected; live storefront screenshots referenced; DB-grounded (cites records, links to admin); plugin `disableInPreview` flags.
- **Safety:** risky actions require confirmation; builds run in verified sandbox; static lint between edits; screenshots + diff before publish; rollback; scoped autonomy grants ("refund any order under $30 with a damage complaint"); AI hideable per role.
- **Runtime:** durable agent runs (state persisted, resumable), message queue, streaming activity events → rail dots, one persistent session per store.
- **Models:** router across Claude + GPT per task; merchant-selectable on Basic; custom fine-tune on brand voice (Advanced); zero-data-retention provider configs.
- **Autonomous CRO engine (beta):** ClickHouse detectors (funnels, anomalies, friction scores, segment discovery, correlations, cross-store percentiles) → ranked structured signal queue → LLM synthesizer (RAG over session replays, reviews, tickets) writes hypothesis + test + expected lift + confidence → A/B/n with significance gates → auto-promote; bandits planned; cross-store test library.

---

### 6. Changelog-verified feature timeline (Apr 16 – Jun 1, 2026)

Use this as the real, shipped scope (newest first):
- **Jun 1:** Razorpay native; GoAffPro affiliates.
- **May 31:** per-region free-shipping thresholds; Customers tab polish.
- **May 30:** page-aware AI context.
- **May 28:** team invites (Admin/Member, per-store perms); Apple Pay domain in 2 clicks; Stripe Connect onboarding redesign.
- **May 26:** Skydropx (MX); trial removed (pick plan up front).
- **May 25:** founder call widget.
- **May 24:** checkout rebuilt (+~20% paid CVR: real card logos, phone country auto-detect, trust copy above fold, non-dead-end errors); custom product metadata; backorders; add-region dialog with currency lock.
- **May 23:** multi-region mgmt with provider mirroring; unguessable store slugs.
- **May 22:** message queueing while AI works.
- **May 21:** BigCommerce/WooCommerce CSV import; variant-level discounts; guided shipping tour; image attachments in first chat message.
- **May 20:** paid-ads quiz onboarding w/ UTM routing.
- **May 19:** mobile plan drawer; Designer free-tier gate.
- **May 18:** Discover section; mockup generator; Book-a-call in header; theme gallery + carousel; drag-drop media; automatic currency conversion.
- **May 17:** TikTok Ads CAPI; start theme from template; color-coded to-dos; 30-day trial w/ card.
- **May 16:** mobile chat sheet; live activity dots everywhere.
- **May 15:** image before/after (gpt-image-2); pause/resume/cancel builds; founder SMS drip.
- **May 14:** native A/B testing v1; per-theme plugins; AI self-lint.
- **May 13:** activity dots (products/store).
- **May 11:** status banner. **May 9:** pricing change. **May 8:** Shippo native; Designer persistence; password reset fix. **May 7:** endless chat history; AI uninstalls plugins; theme drafts persist.
- **May 3:** predictable plugin placement. **May 2:** sales analytics. **May 1:** onboarding redesign; paste old site at signup. **Apr 30:** logo generation. **Apr 29:** image enhancement. **Apr 28:** Klaviyo; Meta Pixel+CAPI; sample-catalog swap.
- **Apr 27:** unified publish button; crash-safe builds. **Apr 26:** Shopify CSV import. **Apr 25:** 150-plugin marketplace; CJ Dropshipping phase 2; AI sees storefront screenshots. **Apr 24:** live build status. **Apr 23:** reviews moderation + `list_reviews` tool.
- **Apr 20:** request-a-feature; pinned to-do panel in chat. **Apr 19:** prompt library (31). **Apr 18:** custom domains in Settings; one chat across admin; mobile shell. **Apr 17:** warm earthy redesign; plugins redesign. **Apr 16:** AI onboarding agent.

---

### 7. Plugin / integration system (from live manifests)

**Catalog:** 406 entries; 40 first-party (actually installable), 366 third-party directory listings (name, description, category, website — many are just "we know this exists"). Categories: Shipping & Fulfillment 233, Inventory & Ops 15, Analytics 13, Marketing & Email 12, Accounting & Tax 12, Customer Support 11, Loyalty 9, Subscriptions 9, Conversion & Upsell 9, SMS 8, Sales Channels 8, Payments 8, SEO 8, Page Builders 8, Fraud 8, Translation 8, Brand & Reputation 8, +misc. Regions gating: `[]`, `["US"]`, `["EU"]`, `["MX"]`, `["IN"]`, `["GB"]`, `["VN"]`, `["TR"]`, `["DE","AT","CH"]`.

**Manifest schema (reverse-engineered):**
```jsonc
{
  "id": "shippo", "name": "…", "version": "0.1.0", "npmPackage": "@amboras-dev/shippo",
  "category": "…", "source": "first-party|third-party", "regions": ["US"],
  "iconUrl": "…", "mockupImageUrl": "…", "screenshots": [], "website": "…",
  "planGated": false, "allowedPlanIds": null, "visibility": "public", "featured": false, "sortOrder": 0,
  "description": "…", "longDescription": "markdown…",
  "manifest": {
    "kind": "integration | ux_module | hybrid",
    "api": { "admin": ["GET /admin/…", "…"], "store": ["POST /store/…"] },   // documented routes
    "admin": {
      "hasSettings": true,
      "settingsRoute": "/plugins/google-ads/settings",
      "settingsSchema": { "conversion_id": { "type": "text", "label": "…", "pattern": "^AW-…", "required": true } },
      "requiresEmailDomain": false,
      "aiTools": [{ "name": "connect_shippo", "description": "…", "example": "connect_shippo({ apiToken })" }]
    },
    "storefront": {
      "components": [
        { "slot": "rootProviders|pdpAnalytics|cartUpdate|checkoutStart|bodyEnd", "export": "MetaPixelProvider",
          "package": "@amboras-dev/meta-ads/slot-components", "propsFromConfig": {…}, "propsFromContext": ["productId", "price", "currency"] },
        { "id": "EngravingButton", "placement": "merchant_choice", "importPath": "@/components/plugins/engraving/EngravingButton",
          "validSlots": ["pdpBelowAddToCart"], "defaultSlot": "pdpBelowAddToCart", "jsxTemplates": { "pdpBelowAddToCart": "<EngravingButton productId={product.id} />" } },
        { "id": "airwallex", "placement": "payment_registry", "exportName": "airwallexProvider", "importPath": "./airwallex" }
      ],
      "hooks": [{ "name": "useProductReviews", "signature": "…", "returns": "…" }],
      "npmDependencies": [{ "name": "@adyen/adyen-web", "version": "^6.0.0" }],
      "scripts": []
    },
    "capabilities": [{ "id": "shippo_shippo", "type": "fulfillment_provider" }],
    "disableInPreview": true
  }
}
```

**Storefront slot names observed:** `rootProviders`, `pdpAnalytics`, `cartUpdate`, `checkoutStart`, `bodyEnd`, `pdpBelowAddToCart`, `accountOverview`, plus `payment_registry` placement and `merchant_choice` (AI/merchant picks slot, JSX template injected into storefront source).

**Backend integration pattern (repeated across all shipping/marketing plugins):**
1. `POST /api/v1/stores/:storeId/integrations/<id>/connect` — validate creds against vendor API, encrypt into `store_plugin_credentials`.
2. Push config to Medusa `store.metadata.plugins.<id>` via `/orchestrator/plugin-settings` (internal secret) or `/orchestrator/<id>/sync-credentials`.
3. Register a `fulfillment_provider` / `payment_provider` capability in Medusa; per-tenant credential resolver + token cache.
4. Webhook ingress `POST /webhooks/<id>/:storeEnvironmentId` with per-tenant token; creates real Medusa fulfillments/shipments.
5. Outbox + cron drainer for outbound event sync (Klaviyo, Omnisend, Meta catalog, ProfitMetrics) — durable, retry-safe.
6. `GET /store/integrations/active` — 60s-cached public config for the storefront (public keys only).

**First-party plugins (40):** Contact Form, Klaviyo, Meta Pixel+CAPI, Product Reviews, Razorpay, TikTok Ads, Omnisend, Printful, Pinterest Tag, ProfitMetrics, Tidio, GA4, Shippo, Mailchimp, Skydropx, Shiprocket, GoAffPro, sevDesk, Facebook & Instagram Shop, Royal Mail, AhaMove, pixi VDI, ShipStation, ShipBob, Workflow Automation, Blog, Engraving, Exit Intent, Airwallex, Google Ads, Paystack, Google Shopping Feed, VNPay, Adyen, Google Merchant Center, MoMo, Mollie, iyzico, Payoo, AliExpress Dropshipping (+ CJ Dropshipping per changelog).

---

### 8. Data model (minimum viable, inferred)

**Control plane (core):** `users`, `organizations`, `stores` (slug w/ random suffix, plan, region defaults), `store_environments` (draft/live theme + build state), `team_members` (role, per-store perms, invite tokens), `plans`, `subscriptions` (Stripe billing), `ai_credits` (pool, usage, top-ups), `agent_runs` (durable state, status, queue, tool-call log), `chat_sessions/messages` (per store, page context), `todos` (punch list, status color), `plugins` (catalog), `store_plugins` (installed per env), `store_plugin_credentials` (encrypted), `plugin_settings`, `domains` (verification, SSL, CDN state), `feature_requests`, `support_conversations`, `audit_log` (actor incl. AI, diff), `experiments` (variants, traffic, posterior, status), `experiment_events`, `migrations` (source, mapping, status).

**Commerce (Medusa):** products, variants, options, prices (per currency), inventory (by location), collections/categories, customers, addresses, carts, orders, fulfillments, shipments, returns, refunds, promotions (codes, automatic, BOGO, tiers, variant targeting, region rules), gift cards, regions, currencies, shipping zones/options, payment providers, fulfillment providers, metadata (custom KV, plugin config), subscriptions (Stripe subscription id, cadence, trial), digital assets.

**Content/marketing:** reviews (+media, status, AI summary, flags), qa_threads, blogs/articles, email_templates (MJML/HBS), email_sends (status log), campaigns, flows, seo_pages (meta, schema, keyword positions, GSC data), geo_prompts (model, placement, snippets), knowledge_cards, upsell/bundle/cross-sell configs, affinity_pairs (nightly), exit_intent_responses, contact_submissions, workflows/runs.

**Analytics:** `sessions` (IP-fingerprint, geo), `events` (view.product, view.collection, cart.add, checkout.start, checkout.complete, signup), rollups; ClickHouse mirror for detectors.

---

### 9. Pricing & plan model (live API `GET /api/v1/plans`)

| slug | name | mo / yr | platform fee | stores | team | credits | flags |
|---|---|---|---|---|---|---|---|
| free | Free | $0 | 3% | 1 | 1 | 200/mo | no custom domain, no adv. analytics |
| launch | Basic | $49 / $468 | 1% | 1 | 1 | unlimited | custom domain, adv. analytics |
| starter | Grow (popular) | $105 / $1,140 | 1% | 5 | 10 | unlimited | + priority support, agentic CRO, Klaviyo+Meta CAPI |
| scale | Advanced | $399 / $4,320 | 0.5% | 5 (marketing says 20) | 10 (marketing 20) | unlimited | autonomous CRO, multi-region, live rates |
| — | Enterprise | custom | custom | ∞ | ∞ | — | SOC 2, SCIM, audit export, B2B/net terms, white-label, sandbox clone |

Plan record fields: `id, slug, name, description, tagline, monthlyPriceCents, yearlyPriceCents, yearlySavings, platformFeePercent, baseCreditsPerMonth, dailyAiCredits, isPopular, ctaLabel, maxStores, maxTeamMembers, aiChat, customDomain, advancedAnalytics, prioritySupport, displayFeatures[]`. Card rates 2.9%→2.7%→2.5% + 30¢ by tier. "Earn up to $5k/7.5k/10k in credits" (referral/usage program). 30-day launch guarantee (live in 24h or refund if no sale in 30 days).

---

### 10. Design system notes

- **Marketing:** warm, editorial. Cream/ivory backgrounds (#faf6f2-ish), near-black text (#1a1a1a), dark footer (#0d0d0d). Display serif (light weight, tight leading, italic emphasis words) + Inter/Manrope for body/UI. 11px uppercase tracked eyebrows. Bordered, square-ish cards (radius via `--radius-button` token). Big stat counters that count up from 0. Thematic page skins (postal/stamp for emails, newspaper for newsletter, film-contact-sheet for images, lab notebook for A/B, ledger for checkout).
- **Admin:** "warm, earthy" (Apr 17 redesign) — cream canvas, taupe/brown accents, green positive deltas, serif greeting, 44px icon rail, 300px AI panel, bordered KPI row, embedded browser-chrome preview. Terracotta/teal highlight colors for GEO/SEO nav states per placeholders.
- **Storefront themes:** fully generated per brand (fonts, palette, section set), mobile-first, Lighthouse >95, 3 preview screenshots per template.


---

### 11. What it would take to rebuild it — build plan

#### 11.1 Recommended stack (mirror what's proven, swap where cheaper)

| Concern | Choice | Why |
|---|---|---|
| Commerce core | **Medusa v2** (Node, Postgres) | This is literally what Amboras runs on. Gives products/variants/inventory/orders/customers/promotions/regions/fulfillment+payment provider abstractions for free. |
| Control plane API | NestJS or Hono (TS) + Postgres + Redis + BullMQ | Multi-tenancy, auth, billing, agent runs, plugin registry, orchestrator endpoints. |
| Admin app | Next.js 15 + Tailwind + shadcn/ui + TanStack Query + PostHog | Same as target. PWA manifest for mobile. |
| Storefront | Next.js template repo per store (monorepo "themes/"), deployed to Vercel/Cloudflare with wildcard subdomains + custom-domain API | Needed for "AI edits source files → build → preview → publish". |
| Build sandbox | Firecracker/E2B/Daytona-style micro-VM or container per build; run `tsc`/eslint, `next build`, Playwright screenshot | The "verified sandbox + self-lint + screenshot" loop. |
| Agent runtime | Claude (tool use) via Anthropic API + OpenAI for images; Temporal or Inngest for durable, resumable runs; tool registry in code w/ Zod schemas | Durable runs surviving deploys, queueing, pause/resume. |
| Payments | Stripe Connect (Standard/Express accounts, OAuth) + Stripe Billing for plans; provider plugins later | 2-click connect, direct payouts, subscriptions & dunning. |
| Email | Resend + MJML + Handlebars; domain verification API | Exactly as target. |
| Images | OpenAI `gpt-image-1`/edit endpoint (or Flux/Ideogram) + S3/R2 + sharp | 6 presets = 6 prompt templates; 4 parallel jobs. |
| Analytics | Postgres events table + materialized rollups initially; ClickHouse when >~50M events | Live funnel/ticker via websockets or SSE. |
| Domains/SSL | Cloudflare for SaaS (custom hostnames) or Vercel Domains API | "Paste domain → DNS/SSL/CDN automatic". |
| Search/GSC | Google Search Console API, Merchant API | For SEO tab. |
| GEO tracking | Scheduled prompt runs against OpenAI/Anthropic/Perplexity/Gemini APIs, parse for brand mention | Cheap to implement; the "knowledge card" is just structured JSON-LD + an `/llms.txt`-style page. |

#### 11.2 Phased scope

**Phase 0 — Foundation (4–6 wks, 2–3 eng)**
- Medusa deployment (multi-tenant via one Medusa instance per store *or* shared with sales-channel/store scoping — Amboras appears to run store-scoped Medusa with `store.metadata`); control-plane API; auth (JWT+refresh, 2FA later); orgs/stores/environments; Stripe Billing plans (copy §9 model); admin shell (top bar, rail, AI panel placeholder, mobile shell); storefront template #1 with slot system; wildcard subdomain deploys; unguessable slugs.

**Phase 1 — "One sentence → live store" (6–8 wks)**
- Onboarding agent + parallel branch orchestration (naming, 3 products, brand kit, promos, build).
- Tool registry v1 (~25 tools): create/update/delete product, variants, images (enhance, generate, mockup), collections, promotions (code, auto, free-ship, bundle), brand (colors, logo gen), theme edits (file read/write/patch), build/verify/screenshot/publish, wizards (payments, domain, shipping).
- Store Designer split view; draft/live envs; publish button state machine; activity events → rail dots; to-do punch list.
- Dashboard KPIs + embedded preview; Products/Orders/Customers/Collections/Promotions CRUD screens (Medusa admin API behind your own UI).
- Stripe Connect OAuth + checkout (Elements/Payment Element with Apple/Google Pay, Link, PayPal), guest checkout, trust copy.
- Resend + 6 core transactional templates.
- Custom domain flow.

**Phase 2 — Retention & growth surfaces (8–10 wks)**
- Reviews module (7 components, moderation, media upload, AI summary, request emails).
- Bundles/Upsells/Cross-sells (6+6+6 components, tier pricing → Medusa promotions, nightly affinity job, 3 placements incl. post-purchase one-click charge).
- Subscriptions (Stripe Subscriptions ↔ Medusa carts, cadence per variant, trials, dunning, portal).
- Marketing email: campaigns, 5 flows, AI editor, subject A/B, send-time optimization.
- Analytics: sessions/events pipeline, funnel, geo map, realtime ticker, industry benchmarks.
- SEO: auto meta/JSON-LD/alt/sitemap/redirects; GSC integration; keyword tracker.
- Plugin framework: manifest schema (§7), install/uninstall, settings-schema forms, slot injection into theme source, per-theme plugin sets, AI tools contributed by plugins; first 8 plugins (GA4, Meta, TikTok, Klaviyo, Shippo, ShipStation, Mailchimp, Contact Form).
- Team invites/RBAC/audit log; multi-region + currency conversion; shipping zones tour; returns portal.
- CSV importers (Shopify/Woo/BigCommerce/generic) + migration service runbook.

**Phase 3 — Autonomy (10+ wks, ongoing)**
- Native A/B testing (variant envs, traffic split at edge, Bayesian sequential engine, auto-promote/rollback).
- CRO detection engine (ClickHouse, detectors, hypothesis synthesizer, cross-store benchmarks).
- GEO tab; Blog CMS; Workflow Automation builder; Exit Intent; Engraving; B2B (price lists, net terms, gated catalogs); digital products; local delivery/pickup; regional payment plugins; 3PL pushes; SOC 2/SCIM/EU residency.

#### 11.3 Rough sizing
- **Team:** 4–6 senior full-stack (TS), 1 designer, 1 AI/agent engineer, 1 infra/devops. Amboras did it with ~3 people + heavy AI-assisted coding over ~5 months of visible changelog.
- **Critical-path risks:** (1) AI editing real storefront source reliably (needs sandbox + lint + screenshot loop, not just prompts); (2) multi-tenant Medusa scaling and isolation; (3) custom-domain + SSL automation at scale; (4) Stripe Connect compliance/KYC edge cases; (5) durable agent runs (use a workflow engine, don't hand-roll); (6) migration accuracy (handles/301s/customers).

---

### 12. Gaps & unknowns (what the public surface does *not* reveal)

- Exact admin route list beyond `/dashboard`, `/analytics`, `/reviews`, `/onboarding`, `/dashboard/stores|settings`; SEO/GEO tabs are described in unreplaced image prompts and may be roadmap rather than shipped.
- Whether it's one Medusa per tenant or shared; how store-environments map to deployments (Vercel projects vs. own edge).
- Real customer volume (counters are animated from 0; "18 brands" in examples are AI-generated demos, not customers).
- Several marketing pages (ai-geo, reviews component placeholders, subscriptions, upsells "0%" stats) are templated with placeholder metrics — treat the *feature descriptions* as target scope, not the numbers.
- Login/register/checkout-and-payment pages are client-rendered; internals unseen.
- Pricing page names (Basic/Grow/Advanced) ≠ FAQ names (Starter/Studio/Team/Plus) ≠ API slugs (free/launch/starter/scale) — pricing has been re-cut at least 3 times in 2 months; build the plan model to be config-driven.

---

### Appendix A — Source list
- https://www.amboras.com/what-is-amboras (+ 4 images: hero.webp, admin-dashboard.webp, talk-to-your-store.webp, ironjaw-hero.webp)
- /, /what-is-agentic-ecommerce, /ai-seo, /ai-geo, /reviews, /newsletter, /ab-testing, /upsells, /bundles, /cross-sells, /analytics, /checkout, /checkout-and-payment, /subscriptions, /ai-images, /ai-emails, /examples, /pricing, /apps-and-integrations, /migrate, /changelog, /faq, /contact, /about, /team, /register
- `GET https://core.amboras.com/api/v1/public/plugins` (406 entries, manifests)
- `GET https://core.amboras.com/api/v1/plans`
- Bundle `_next/static/chunks/5ea41565f25c88bb.js` (nav MENUS, footer, integrations page, API_BASE_URL, QUERY_KEYS)

---

## Appendix B — Every subsequent instruction, verbatim

### Message 2

> Is this like a storebuilder? That’s what I wanted. Needs backend and you need to be able to see diff stores on customer backend and start new stores. Give image and it needs to be able to generate good product images and do customer research and build good shopify style product pages

### Message 3

> Use more modern fonts. Use Google fonts for built sites. Make sure sites load fast. Make sure there’s a drag and drop kinda pagebuilder and page editor. Like funnelish or Shopify. Do research to know what I mean. Use same kind of blocks they have. We need to build advertorials. Also have the option to just input raw html. And use reference pages / sites to replicate. I should be able to link reference page and have it just literally pull html and dupe it perfectly, then I can edit myself or use it as template for my own product. Also we need high converting checkout like Shopify. Do research on that too. Should be super simple buy - checkout process. Need bundles also etc. like
> Kaching app for Shopify. Need to be able to integrate stripe and all relevant features.

### Message 4

> Also product page etc. needs to be mobile optimized. Also I’m building this for just me for now so don’t worry about selling the product to customers for now this is just for me. Also should be able to generate different versions of pdp and advertorials or get direction when generating like freeform direction or suggested format.
> 
> Also take some time and think about how people build these advertorial or funnelish funnels and shopify stores - specifically for dropshipping, research common apps and what they do and include all features from those too. Consider what dropshippers would want from this platform and make sure the functionality and features include all this

### Message 5

> Also create another tab for ad creation. Make it able to research competitors on ad library or get ad inspo and draft copy and be editable like if people want xyz - maybe make this Freeform also. And we need domain connection like forwarding from namecheap etc. to each individual store setup. And product images need to be regeneratable with Freeform suggestion. Use options of ChatGPT images 2.0 or whatever is newest and whatever newest Google model is available for image generation. Also for page content we need to be able to suggest avatars and customers we are targeting.
> 
> I want you to also understand this is primarily focusing on dropshipping. We are going to sometimes be uploading example sites selling same product as us and this needs to pull info angle etc. but we need option to change to what we need if necessary. Also

### Message 6

> Clone the repository dylanail/Shopify-Replacement into this session.

### Message 7 (after the request to clone Shopify-Replacement)

> Ok so I kinda messed up, I meant to commit this to Shopify-replacement repo, not Darwin

### Message 8

> Can you also think really hard about decisions you made building this based on previous decisions for unrelated DARWIN project, then list all of them so I can open this in another session and give it instructions to reconsider based on the original direction instead of what we were doing with Darwin

### Message 9

> Give me a recap of what this new project is that we built in this chat and everything about it. Like A to Z. Consider all direct instructions I gave you in this chat and intent behind them. Creat ORIGINAL_INTENT.md. This will be used in another session to remove Darwin carry overs and make it the most capable platform based on what I specced it as. Include initial instructions and all subsequent requests / replies in this chat.


---

## Appendix C — The delivery replies, verbatim

Each is the final reply that closed an iteration, as written at the time.

### Iteration 1 — the one-shot build (`486e91b`)

Built and pushed to `claude/amboras-teardown-rebuild-vm8wqg` — 11,033 lines in `amboras/`, 59 files, zero runtime dependencies (Node 22's own TypeScript + `node:sqlite`).

```
cd amboras && npm run seed && npm start    # http://localhost:4100
```

**What runs.** Register → type one sentence → ~100ms later there's a named, branded store with three products (variants, 197-word copy, generated imagery), a welcome code, a free-shipping threshold and a bundle, at an address you can open and buy from. Then: 13 admin pages, a docked assistant with 74 validated tools, a server-rendered storefront with cart/checkout/orders, a plugin framework, cookieless analytics, 10 transactional emails, structured data and `llms.txt`.

**Four decisions carry it.**
- `domain/cart.ts#totals` is the *only* place a total is computed — drawer, checkout, written order and the free-shipping-gap upsell all call it.
- Every tool call from anywhere passes `agent/registry.ts#execute`: schema-validated before the handler exists in the call stack, risky tools refused without a confirmation, audit row written on success *and* failure. No prompt is load-bearing for safety.
- Agent runs are rows, not closures — a deploy mid-onboarding is survivable, and branches run concurrently (that's why onboarding reads as four things at once).
- Draft and live are separate environments; the assistant only ever edits the draft.

**It works with no API keys.** With `ANTHROPIC_API_KEY` a model plans from the real tool schemas; with none, a rules planner maps what merchants actually type onto the same tools and a deterministic writer derives brand, palette, copy and imagery from the sentence. Same for images — `OPENAI_API_KEY` or a seeded vector composition served from `/_media/render.svg`. The offline path is the floor under every test, not a stub.

**56 tests, all passing**, typecheck clean. `test/http.test.ts` walks the whole product over HTTP with no mocks — register, onboard, every admin page, drive the assistant, buy from the storefront, watch the order land in the admin. It caught a real crash: the SSE activity stream had the router writing headers after the stream owned the response, which took the whole server down.

**What I deliberately didn't build,** named in the README so nobody discovers it by clicking: payments don't move money (Stripe is modelled end-to-end, the checkout marks captured without charging), domains verify optimistically, storefronts are server-rendered rather than exported as Next.js projects edited in a sandbox, GEO ships the half a store controls and says so instead of drawing a fabricated placement chart, most of the plugin directory refuses to install rather than pretending, and there's no A/B engine.

One caveat on the demo numbers: everything in the seed goes through the real paths (real onboarding agent, real checkout, real moderation) — the single liberty is backdating six orders across a fortnight so the revenue chart has a shape, and the code says so at the line.

No PR opened — say the word if you want one.

### Reply to message 2 — before building

Yes — that's exactly what this is: a store builder with the commerce backend underneath. But you've named four real gaps, so let me build them rather than argue the point:

1. **Stores hub** — see every store you own, switch, and start a new one from the admin
2. **Image in → product images out** — upload a photo (or paste a site URL), and product imagery is derived from it
3. **Customer research** — audience, objections, competitors, price anchoring, keywords — run before the catalog is written and fed into every page
4. **Shopify-grade product pages** — benefits, comparison, specs, FAQ, guarantee, shipping strip, sticky mobile buy bar

Starting with uploads, since research and images both hang off them.

### Iteration 2 — stores hub, uploads, research, product pages (`5309e90`)

Yes, it's a store builder — and now it's the one you described. Pushed as `5309e90` on the same branch.

**What changed**

- **Stores hub** — `/admin/stores` lists every store you own (status, products, 30-day orders and revenue, plan) with an *Open* per store and a **+ Start a new store** button that runs onboarding again. The top bar now shows `Stores (n)` and `+ New store` on every page.
- **Give it an image** — onboarding and the product page take a photo upload. The parser is dependency-free; uploads are typed by sniffing bytes (not the filename), stored under a random id, served with `nosniff`. Product imagery is *derived from your photo*: with `OPENAI_API_KEY` set it's re-shot via the image-edit endpoint so the product in the output is the one you sell; without a key, your photo is staged as-is into six scenes (white seamless, lifestyle, dark luxury, flat lay, golden hour, studio) with a ground, contact shadow and the brand's light. The original is always kept in the gallery.
- **Customer research** — runs *before* the catalog is written: who buys (personas with share), purchase triggers, objections with answers, named competitors with price bands and weaknesses, a price anchor (mass / us / bespoke), keywords, proof points. Hand-written knowledge for boxing gear, skincare and coffee; a complete generic record for anything else; the model writes it when a key is configured; a pasted site URL is read for positioning either way. Own admin page, two tools, and it says which source it is.
- **Shopify-grade product pages** — benefits (answers to the triggers), comparison table against the named competitor, specs, FAQ (the objections), guarantee + shipping + repairs strip, and a sticky mobile buy bar. `agent/pages.ts` is a pure mapping from research → page, so a page can't carry a claim the research didn't put there. `write_product_page` regenerates any product; a rewrite button is on the product screen.

**Bugs the new tests caught along the way:** a signed shift on a 32-bit seed produced the brand name "Marrowjaw undefined"; "called Marrow Lab with three products" was captured whole as the name; a compound name could double its own syllable ("Marrowrow"). All fixed and pinned by tests.

**Verification:** 68 tests, typecheck clean. The HTTP suite now also starts a second store with a real multipart upload, checks both appear in the hub, stages a product photo (and rejects a fake PNG), and reads the benefits/comparison/FAQ/sticky-bar off the live storefront.

**Honest limits, in the README:** research without a key is category rules (deep for three categories, generic elsewhere); staging without a key is composition around your photo, not generation; payments still don't move money.

One thing I couldn't do here: the sandbox has no real product photo, so the staged-image path is proven by test (a PNG is embedded and shadowed inside the scene SVG) rather than by a screenshot you'd judge with your eye. Drop any product JPEG into the onboarding form and you'll see it.

### Iteration 3 — builder, cloning, checkout, Stripe, bundles (`e1eedb1`)

All three of those pieces are built, tested and pushed as `e1eedb1`. The screenshots above are from the seeded demo.

**Page builder** (`/admin/pages`) — a real drag-and-drop editor: palette on the left, sortable canvas in the middle (drag to reorder, drag from the palette to insert, click to select, ↑↓⧉✕, Delete key, Cmd-Z undo), a settings panel drawn from each block's schema on the right, and a live preview of the actual storefront render underneath (desktop/phone toggle, reloads on save, Cmd-S). The block set is what the research pointed at:
- *Shopify sections*: announcement bar, header, image banner, image with text, rich text, image, video (lazy-loads on click), media carousel, multicolumn, collapsible content, featured products, email signup, contact form, custom HTML, footer
- *Funnelish elements*: before/after slider, countdown (fixed or evergreen per visitor), progress bar, sticky button, offer box, buy box (buy-now by default), bundle offer, guarantee, comparison table, trust badges, "as seen on"
- *Advertorial*: publication bar with the FTC "Advertisement" label, byline, numbered reasons, pull quote, comments, share bar, disclaimer

Two templates — **advertorial listicle** and **product landing page** — are written from the customer research on file (reasons = triggers, FAQ = objections, comparison = competitor rows), so a new page starts full, not blank.

**Raw HTML and cloning.** Any page can be switched to HTML mode. **Clone a reference page** takes a URL and gives you that page as your own document: stylesheets fetched and inlined, every `href`/`src`/`srcset`/CSS `url()` made absolute, `<base>` and CSP tags removed, images copied into your uploads so it survives the source going down. Scripts are dropped by default (a competitor's pixel on your store is not a feature) with a "keep scripts" option. From there you edit it as HTML, or **"Read into blocks"** pulls headings, paragraphs, images and quotes in order as a template — labelled as a starting point, because that's what it honestly is.

**Checkout** — Shopify's one-page order: express row → contact → delivery → shipping method (changes the total live) → payment → one "Pay now" button, summary right, one collapsed line on a phone. **Buy it now** on every PDP and buy box skips the cart. After payment there's a **one-click post-purchase offer** (best companion from the affinity data, 20% off) — shown exactly once, then the confirmation.

**Stripe** — a dependency-free client: PaymentIntents with `setup_future_usage=off_session` so the upsell can charge the saved card without a form, Express Checkout Element (Apple Pay / Google Pay / Link appear where the device supports them), Payment Element, refunds routed back through Stripe from the order page, and webhook signature verification. Keys are per store on the new Payments page, sealed at rest. **Honest limit:** it's tested against a stand-in transport, not live Stripe — I couldn't call Stripe from here. Without keys the same page places a demo order so the whole flow walks.

**Bundles** (`/admin/bundles`) — the Kaching pattern: tier cards with badge, savings, per-unit price, free shipping and a free gift on higher tiers, on the PDP and as a block anywhere. The widget is cosmetic; a **tiered promotion is the truth** the cart enforces, so editing quantities later still prices correctly, the gift line is re-derived on every cart change (drops to one glove → wraps disappear), and quantity discounts don't stack — a store-wide "buy two" and a product's own tiers resolve to the better one. Caught that last one from the checkout screenshot, where both had applied.

**Fonts and speed** — modern Google Fonts pairings per mood (Fraunces/Manrope, Instrument Serif/DM Sans, Bricolage/Plus Jakarta, Space Grotesk/Inter Tight…), loaded so they can't block paint; every text response Brotli/gzip; storefront pages make exactly one external request.

81 tests, typecheck clean. The HTTP suite now buys through the new checkout to the offer and back; the pages suite clones a fake site end to end and checks every block renders, escapes, and survives a bad setting.

### Iteration 4 — dropshipping stack, funnels, versions, personal mode (`90cc312`)

Pushed as `90cc312`. Everything you asked for is in, plus the dropshipping set the research pointed at.

**What I researched, and what it became.** Funnelish's canonical funnel is *ad → advertorial → offer → checkout (+order bump) → upsell → downsell → thank-you*, and a Shopify dropshipping store is Shopify plus DSers/AutoDS (sourcing, fulfilment), Vitals (40 widgets), Loox/Judge.me (photo reviews, imports), ReConvert (post-purchase), Parcel Panel (tracking), Klaviyo (email), pixels, and a profit tracker. All of that now exists as one thing:

- **Funnels** (`/admin/funnels`): the seven steps as a record. Bump defaults to shipping protection, a real hidden product. Upsell then downsell only on decline, charged off-session on Stripe. Thank-you page with tracking link and related products.
- **Versions with direction** — on every product page in the admin: pick formats (listicle / first-person "30 days" / problem-agitate-solve / expert take / "we tested five" / mistakes; PDP: benefit-, story-, UGC-, comparison-, offer-, urgency-led, premium minimal), type free-form direction (*"premium, for people who train seriously, focus on the repair guarantee, say 'built in Mexico City'"* → tone, audience, angle, must-say), generate N. Versions with a weight are split-tested by session, with views/carts/sales/CVR per version. The model, when configured, rewrites words inside the layout the format chose — never the layout.
- **DSers/AutoDS side**: import from any Shopify store URL (their `/products/x.json`) or an OG-tagged supplier page with a markup; supplier + cost per product → margin calculator; "fulfil via supplier" with carrier detected from the tracking number; **Profit** page (revenue − refunds − COGS − supplier shipping − fees − logged ad spend, with ROAS).
- **Parcel Panel**: branded `/track` (order # + email → timeline + carrier link); delivery estimate ("order today for delivery by Sep 12–17") from lead times.
- **Vitals' widgets** — all real-data, each renders nothing when it has nothing honest: recent-sales popups (real orders), live viewers (real sessions), stock scarcity (real inventory), free-shipping bar, size chart, product Q&A with moderation, back-in-stock capture, customer-photo gallery, payment icons, announcement rotator, compare-at badges, abandoned-cart email swept every 10 minutes, GA4/Meta/TikTok purchase + add-to-cart events.
- **Loox/Judge.me**: CSV review import in their export shapes, photo URLs kept, imported reviews never marked verified.
- **Mobile**: a full pass at 390px — captures above.
- **Personal mode**: owner plan, nothing gated, no pricing, `/` → admin. Tiers kept as config (`AMBORAS_PERSONAL=false` restores them).

93 tests, typecheck clean. 

**Honest limits:** supplier fulfilment records the order, it doesn't place it (no DSers-style API push — that needs each supplier's API keys); the mobile PDP tier cards stack the price on its own line rather than beside the label, which reads fine but isn't Kaching-tight; and the model-rewrite path is exercised only through the rules path here, as before.

### Iteration 5 — ads, domains, avatars, angles, re-shoots (`0ac62ef`)

Pushed as commit `0ac62ef` on `claude/amboras-teardown-rebuild-vm8wqg`. Typecheck is clean and the suite is at 115 passing tests, up from 93.

**What is new in Amboras**

- **Ads tab.** Drafts per product and platform (Meta, TikTok, Google search, YouTube) in ten formats: static, UGC video script with timed beats, problem-agitate-solve, testimonial, us-vs-them, founder, ten hooks, offer, retargeting, and search headlines in Google's limits. Drafts come from the same research, avatar and free-form direction as the pages. Every field is a form, an ad can be revised under a new direction, duplicated, and exported as text for the ad manager. Testimonial ads only ever use approved reviews on file.
- **Swipe file.** Meta Ad Library search when a token is set, competitor links read for their hook and angle, pasted ad text, plus ten built-in hook patterns filled with your product. Drafts read the file for hooks.
- **Domains per store.** Host it here or forward it from the registrar, with the exact records and the menu path for Namecheap, GoDaddy, Cloudflare, Squarespace/Google Domains and Porkbun. Verification is a real DNS lookup for TXT plus CNAME or A, or follows the redirect for forwarding, and the page shows exactly what the check found.
- **Avatars.** Research personas become editable avatars with angle, hooks, tone and first objection. Every generator (versions, advertorials, ads) has an avatar picker next to its direction box. Typed words always win over the avatar.
- **Competitor angles.** Paste a URL or the page's HTML on the research page. It pulls headline, hooks, benefits, price and compare-at, discount, shipping, guarantee, bundle, review count, rating, badges, buttons, audience, and classifies the angle. Every field is editable, then fold it into the research, generate PDP versions with it, or draft ads with it.
- **Image re-shoots.** A direction box on the product page renders a contact sheet with OpenAI GPT Image 2 or Google Gemini 3 Pro Image (Nano Banana Pro), chosen per render, using your photo as the reference. Model output is saved as an upload. Without keys the vector stage still works.

**Config added:** `GEMINI_API_KEY`, `AMBORAS_GOOGLE_IMAGE_MODEL`, `AMBORAS_IMAGE_PROVIDER`, `META_AD_LIBRARY_TOKEN`, `AMBORAS_AD_LIBRARY_COUNTRY`, `AMBORAS_EDGE_HOST`, `AMBORAS_EDGE_IP`. The OpenAI default is now `gpt-image-2`.

**Honest limits, documented in the README:** ads are written, not placed on any platform. The Meta Ad Library API only returns commercial ads for EU or UK reach, so the default country is GB. Certificates are not issued here; TLS for custom hostnames belongs to whatever fronts the process. Competitor pages that block fetching are pasted in.

**Two things to flag.** Your last message ended mid-sentence with "Also", so anything after that is not built yet. The `dylanail/Shopify-Replacement` repo you asked me to clone is in the session at `/home/user/dylanail/shopify-replacement`, but it holds only a README from its initial commit, so there was nothing to port. It is read-only from here; say if you want Amboras pushed there.

### Move to Shopify-Replacement

Amboras now lives at the root of `dylanail/Shopify-Replacement` on `main`, with its full five-commit history preserved rather than a single squashed dump.

**What I did**

- Split the `amboras/` subtree out of the darwin branch so each of the five commits carries over with its message and diff intact.
- Merged that history into Shopify-Replacement's `main` on top of your initial README commit. The stub README was replaced by the Amboras README.
- Added a `.gitignore` for `node_modules/`, `data/` (the SQLite file and uploads) and journal files, which darwin's root ignore file had been covering before.
- Verified from the new root: typecheck clean, 115 tests passing.

The repo layout is now `package.json`, `src/`, `test/`, `tsconfig.json`, `README.md` at the top level, so `npm run seed` and `npm start` work straight from a clone.

**One thing left for you to decide.** The darwin branch `claude/amboras-teardown-rebuild-vm8wqg` still has the same code under `amboras/`. I left it alone since deleting work is your call. If you want it gone, say so and I'll remove the folder from that branch, or you can just not merge that branch. Future Amboras work will go to Shopify-Replacement `main` unless you tell me otherwise.

### Darwin inheritance audit

The audit is at `docs/DARWIN_INHERITANCE.md` on Shopify-Replacement `main` (commit `301ba41`), with a ready-to-paste prompt at the end. Here is the list, ranked by how much they shaped everything else.

**The eight that carry the weight**

1. **Zero runtime dependencies, native Node TypeScript.** Chosen so Amboras could sit inside Darwin's pnpm monorepo without joining its toolchain. The blueprint assumed ordinary deps (Medusa, Next, Zod, Stripe SDK, MJML, sharp). Almost everything below follows from this.
2. **`node:sqlite` single file with SQL-string migrations.** Avoided needing Darwin's Postgres. Blueprint: Postgres, Redis, ClickHouse later.
3. **One process, three surfaces, hand-rolled router, `/s/` and `/preview/` path prefixes.** Darwin's monolith-on-localhost habit. Blueprint: separate core API, admin app, per-store storefront deployment, wildcard subdomains.
4. **Server-rendered template-string admin, no React or Tailwind.** Blueprint: Next.js 15, Tailwind, shadcn, TanStack Query, PWA, page-scoped mini-chats, voice.
5. **Storefront rendered by this process, no per-store Next.js project, no build sandbox, no export.** This is the centre of the real Amboras product and it is absent here.
6. **"Works with no API keys": rules fallbacks for research, copy, pages, ads, extraction, imagery.** Darwin's "models are replaceable, rented by the call" principle. Blueprint is AI-native with routed, user-selectable models. This produced most of the code in `src/agent/` and is why unknown categories get generic copy.
7. **The executor and the "Allow risky actions" checkbox.** Lifted verbatim from Darwin's spec principle 2. The target product has no per-turn gate; its safety surface is draft/live plus publish.
8. **Personal mode shaped as a single-principal system with dormant SaaS tables.** You asked for "just me", but the mode-flag shape is Darwin's. Decide whether to delete or keep the plans and billing scaffolding.

**Consequences of the above** (items 9 to 23 in the file): raw Stripe client with no Connect or Billing, Resend without MJML, images on local disk, domains with no TLS because Caddy did that for Darwin, in-process durable runs instead of Temporal, hand-rolled auth and sealing under one master secret, homemade validation instead of Zod, one hardcoded text model with no routing, sqlite analytics with no ticker, HTML plugin slots, no deployment files, Darwin's test shape, its tsconfig, its env and logger conventions, and its README voice.

**Section C** lists what came from you rather than Darwin, so the next session does not undo it: personal use, dropshipping focus, fonts and speed, the block builder and cloning, one-page checkout and bundles, direction-driven versions, and the ads, domains, re-shoot, avatar and competitor-angle work.

One caveat on accuracy. The reasoning from the first build turn was compacted out of my context, so the "why" for items 1 to 3 is reconstructed from the evidence rather than quoted. The file says so.

