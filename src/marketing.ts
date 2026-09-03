import { escapeHtml } from './lib/http.ts'
import { format } from './lib/money.ts'
import { PLANS, yearlySavingsPercent } from './control/plans.ts'
import { allPlugins } from './control/catalog-plugins.ts'
import { listTools, toolCountsByArea } from './agent/registry.ts'
import { TEMPLATES } from './email/templates.ts'

/** The public page. It only quotes numbers this build can actually prove. */
export function marketingHome(): string {
  const counts = toolCountsByArea()
  const plugins = allPlugins()
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amboras — the AI-native shop system</title>
<meta name="description" content="Domain, storefront, commerce backend, payments and email in one platform, driven by an assistant that executes tools instead of answering questions.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Playfair+Display:wght@400&display=swap">
<style>
:root{--paper:#faf6f2;--ink:#1a1a1a;--muted:#7d746a;--line:#e6ded3;--accent:#7a4a2b}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 'Inter',ui-sans-serif,system-ui,sans-serif}
.wrap{width:min(1080px,92vw);margin-inline:auto}
header{border-bottom:1px solid var(--line);position:sticky;top:0;background:color-mix(in srgb,var(--paper) 90%,transparent);backdrop-filter:blur(12px);z-index:9}
header .wrap{display:flex;align-items:center;gap:1rem;padding:1rem 0}
.mark{font-family:'Playfair Display',Georgia,serif;font-size:1.25rem;letter-spacing:.05em}
nav{margin-left:auto;display:flex;gap:1rem;font-size:13px}
nav a{color:inherit;text-decoration:none}
h1{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:clamp(2.4rem,6vw,4.2rem);line-height:1.03;margin:0 0 1rem;letter-spacing:-.015em}
h2{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:clamp(1.6rem,3vw,2.3rem);margin:0 0 .8rem}
.eyebrow{font:500 11px/1 'Inter';letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
section{padding-block:4.5rem;border-bottom:1px solid var(--line)}
p{max-width:64ch}
.btn{display:inline-block;background:var(--ink);color:var(--paper);text-decoration:none;padding:.9rem 1.6rem;border-radius:2px;
  font:500 13px/1 'Inter';letter-spacing:.08em;text-transform:uppercase}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--ink)}
.cards{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-top:2rem}
.card{border:1px solid var(--line);background:#fff;border-radius:2px;padding:1.2rem}
.card h3{margin:0 0 .4rem;font-size:1rem;font-weight:500}
.card p{font-size:14px;color:var(--muted);margin:0}
.stats{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));margin-top:2rem}
.stat .n{font-family:'Playfair Display',Georgia,serif;font-size:2.4rem}
.stat .l{font-size:13px;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin-top:1.6rem;font-size:14px}
th,td{text-align:left;padding:.7rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
th{font:500 11px/1 'Inter';letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.plans{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));margin-top:2rem}
.plan{border:1px solid var(--line);background:#fff;padding:1.2rem;border-radius:2px}
.plan.pop{border-color:var(--ink)}
.plan .price{font-family:'Playfair Display',Georgia,serif;font-size:2rem}
.plan ul{padding-left:1rem;margin:.7rem 0 0;font-size:13px;color:var(--muted)}
footer{padding-block:3rem;color:var(--muted);font-size:13px}
code{background:#fff;border:1px solid var(--line);padding:.1rem .35rem;border-radius:3px;font-size:13px}
</style></head><body>
<header><div class="wrap"><span class="mark">Amboras</span>
  <nav><a href="#inside">What is inside</a><a href="#pricing">Pricing</a><a href="/login">Log in</a><a href="/register"><strong>Get started</strong></a></nav></div></header>

<section><div class="wrap">
  <div class="eyebrow">What is Amboras</div>
  <h1>The first AI-native<br>shop system.</h1>
  <p>Domain, storefront, commerce backend, payments and email in one platform — with an assistant on every page of the admin that
     executes real tool calls instead of telling you where to click. You type a sentence; the store exists.</p>
  <p style="margin-top:1.8rem"><a class="btn" href="/register">Get started</a>
    <a class="btn ghost" href="#inside" style="margin-left:.5rem">See what is inside</a></p>
  <div class="stats">
    <div class="stat"><div class="n">${listTools().length}</div><div class="l">verified tools the assistant can call</div></div>
    <div class="stat"><div class="n">${Object.keys(counts).length}</div><div class="l">areas of the admin they cover</div></div>
    <div class="stat"><div class="n">${plugins.filter((plugin) => plugin.source === 'first-party').length}</div><div class="l">first-party integrations</div></div>
    <div class="stat"><div class="n">${TEMPLATES.length}</div><div class="l">transactional emails, out of the box</div></div>
  </div>
</div></section>

<section id="inside"><div class="wrap">
  <div class="eyebrow">One platform</div>
  <h2>Six things you do not have to assemble</h2>
  <div class="cards">
    <div class="card"><h3>AI business assistant</h3><p>Docked on every page, one conversation across the admin, page-aware, and every call validated and audited before it runs.</p></div>
    <div class="card"><h3>Storefront</h3><p>Server-rendered per store from a generated theme, with a slot system plugins mount into. Draft and live are separate environments.</p></div>
    <div class="card"><h3>Backend</h3><p>Products, variants, inventory, orders, customers, returns, promotions, regions and shipping — one pricing engine, used everywhere.</p></div>
    <div class="card"><h3>Payments</h3><p>Stripe Connect and per-region providers, registered as capabilities the checkout reads.</p></div>
    <div class="card"><h3>Email</h3><p>${TEMPLATES.length} transactional templates with a real send log, retries, and a Resend adapter.</p></div>
    <div class="card"><h3>Domain</h3><p>Paste a domain you own; DNS records, verification and certificate state live in the admin.</p></div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="eyebrow">Seven things every merchant has to do</div>
  <h2>The job, elsewhere, and here</h2>
  <table><thead><tr><th>The job</th><th>Elsewhere</th><th>On Amboras</th></tr></thead><tbody>
    <tr><td>Open a store</td><td>Pick a theme, fill a wizard, find products</td><td>One sentence; brand, catalog and promotions run in parallel</td></tr>
    <tr><td>Add a product</td><td>30–60 minutes of forms and photo editing</td><td>One tool call: copy, variants, pricing and imagery</td></tr>
    <tr><td>Collect reviews</td><td>A paid app and a script tag</td><td>First-party, with moderation and an extractive summary</td></tr>
    <tr><td>Discount codes</td><td>Another app for BOGO and tiers</td><td>Six promotion types in the same engine as the cart</td></tr>
    <tr><td>Custom domain</td><td>Support ticket, DNS guesswork</td><td>Records shown, verification and certificate tracked</td></tr>
    <tr><td>Redesign a page</td><td>Theme editor, hope, publish</td><td>Ask; it edits the draft and you publish when it looks right</td></tr>
    <tr><td>Monthly app spend</td><td>$500+ across a dozen subscriptions</td><td>Included, at a platform fee that falls as you grow</td></tr>
  </tbody></table>
</div></section>

<section id="pricing"><div class="wrap">
  <div class="eyebrow">Pricing</div>
  <h2>Plans are configuration, not code paths</h2>
  <p>Every limit is a field on the plan record, so a re-cut of the tiers never becomes a migration.</p>
  <div class="plans">${PLANS.map(
    (plan) => `<div class="plan ${plan.isPopular ? 'pop' : ''}">
      <div class="eyebrow">${escapeHtml(plan.name)}${plan.isPopular ? ' · popular' : ''}</div>
      <div class="price">${plan.monthlyPriceCents < 0 ? 'Custom' : plan.monthlyPriceCents === 0 ? 'Free' : format(plan.monthlyPriceCents, 'USD')}</div>
      <div style="font-size:12px;color:var(--muted)">${plan.monthlyPriceCents > 0 ? `per month · save ${yearlySavingsPercent(plan)}% yearly` : '&nbsp;'}</div>
      <ul>${plan.displayFeatures.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul></div>`,
  ).join('')}</div>
</div></section>

<footer><div class="wrap">
  <div class="mark">AMBORAS</div>
  <p style="margin-top:.6rem">Storefronts are served at <code>/s/:slug</code> in this deployment, or at <code>*.yourdomain</code> with
  <code>AMBORAS_STOREFRONT_HOST</code> set. <a href="/register">Get started</a> · <a href="/login">Log in</a></p>
</div></footer>
</body></html>`
}
