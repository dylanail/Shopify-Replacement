import { escapeHtml } from '../lib/http.ts'
import { format } from '../lib/money.ts'
import type { Db } from '../lib/db.ts'
import { environment, type Store } from '../control/stores.ts'
import { domainsFor } from '../control/domains.ts'
import { salesSummary } from '../domain/orders.ts'
import { adminCss } from './shell.ts'

/**
 * The account level: everything above a single store.
 *
 * The store shell (rail, assistant panel, publish button) belongs to one
 * store and cannot render without one, so the hub that lists *all* of them —
 * and the empty state of an account with none — needs its own frame. Signing
 * in lands here whenever there is no store to open, which is the difference
 * between "here is your account" and being marched into onboarding with no
 * way back.
 */
export function accountShell(input: { userName: string; title: string; body: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)} — Amboras</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@400;500&display=swap">
<style>${adminCss('#7a4a2b')}
.account{max-width:1120px;margin:0 auto;padding:2rem 1.5rem 4rem}
.account .grid3{grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
.storecard{display:flex;flex-direction:column;gap:.6rem}
.storecard .top-row{flex-wrap:nowrap;align-items:flex-start;justify-content:space-between;gap:.6rem}
.storecard h2{font-size:1.05rem;line-height:1.2}
.storecard .addr{font-size:11.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.storecard .addr:hover{color:var(--ink)}
.storecard .nums{display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;font-size:11px}
.storecard .nums b{display:block;font-size:1.1rem;font-weight:500;font-variant-numeric:tabular-nums;color:var(--ink)}
.storecard .actions{flex-wrap:nowrap;margin-top:auto;padding-top:.2rem}
.storecard .actions .btn{flex:1;justify-content:center;padding:.5rem .5rem}
.mark{width:38px;height:38px;border-radius:9px;object-fit:cover;background:var(--paper);border:1px solid var(--line)}
.mark.letter{display:grid;place-items:center;font:500 16px/1 'Playfair Display',Georgia,serif;color:var(--accent)}
.blank{background:#fff;border:1px solid var(--line);border-radius:14px;padding:2.4rem 2rem;text-align:center;max-width:640px;margin:2rem auto}
.blank h2{font-family:'Playfair Display',Georgia,serif;font-size:1.5rem;font-weight:400;margin-bottom:.4rem}
.blank ol{text-align:left;max-width:420px;margin:1.2rem auto 1.6rem;padding-left:1.1rem;color:var(--muted);font-size:12.5px;line-height:1.9}
</style></head><body>
<div class="top">
  <div class="logo">◮ <strong>Amboras</strong></div>
  <a class="chip" href="/admin/stores">Your stores</a>
  <a class="chip" href="/onboarding">+ New store</a>
  <div class="spacer"></div>
  <span class="muted" style="font-size:12px">${escapeHtml(input.userName)}</span>
  <form method="post" action="/logout"><button class="chip" type="submit">Sign out</button></form>
</div>
<div class="account">${input.body}</div>
</body></html>`
}

/** Where each store actually answers: a verified custom domain wins over the subdomain. */
function addressOf(db: Db, store: Store, origin: string): string {
  const hosted = domainsFor(db, store.id).find((domain) => domain.status === 'verified' && domain.mode === 'host')
  if (hosted) return `https://${hosted.hostname}`
  const root = process.env.AMBORAS_STOREFRONT_HOST
  if (root) return `https://${store.slug}.${root}`
  return `${origin}/s/${store.slug}`
}

/**
 * Every store on the account, with the numbers that say whether it is a
 * business yet, and one button to start another.
 */
export function storesHub(input: { db: Db; stores: Store[]; userName: string; origin: string; flash?: string }): string {
  const { db, stores } = input
  const flash = input.flash
    ? `<div class="notice flash${input.flash.startsWith('!') ? ' bad' : ''}" style="margin-bottom:1.2rem">${escapeHtml(input.flash.replace(/^!/, ''))}</div>`
    : ''
  if (!stores.length) {
    return `${flash}<div class="blank">
      <h2>No stores yet, ${escapeHtml(input.userName)}.</h2>
      <p class="muted">This is where every store you run will live — its address, its orders, its numbers — and where you start the next one.</p>
      <ol>
        <li>Say what you sell, in one sentence.</li>
        <li>Research runs first: who buys it, what stops them, what they pay.</li>
        <li>Brand, three products with full pages, a code, a bundle — at an address you can open.</li>
      </ol>
      <a class="btn primary" href="/onboarding">Build your first store</a>
    </div>`
  }
  const live = stores.filter((store) => store.status === 'live').length
  return `${flash}<div class="head">
    <div><h1 class="serif">Your stores</h1>
      <p class="muted" style="margin:.25rem 0 0">${stores.length} store${stores.length === 1 ? '' : 's'}, ${live} live. Each one is its own catalog, customers, orders, brand and address.</p></div>
    <a class="btn primary" href="/onboarding">+ New store</a></div>
  <div class="grid3">${stores
    .map((store) => {
      const products = db.one<{ c: number }>("SELECT COUNT(*) c FROM products WHERE store_id = ? AND status = 'published'", store.id)?.c ?? 0
      const sales = salesSummary(db, store.id, 30)
      const published = environment(db, store.id, 'live').publishedAt
      const address = addressOf(db, store, input.origin)
      const state = store.status === 'live' ? 'ok' : store.status === 'paused' ? 'bad' : 'warn'
      return `<div class="card storecard">
      <div class="row top-row">
        <div class="row" style="flex-wrap:nowrap;min-width:0">
          ${store.brand.logoSvg ? `<img class="mark" src="${escapeHtml(store.brand.logoSvg)}" alt="">` : `<span class="mark letter">${escapeHtml((store.name[0] ?? '?').toUpperCase())}</span>`}
          <div><h2>${escapeHtml(store.name)}</h2>
            <div class="muted" style="font-size:11.5px">${escapeHtml(store.brand.slogan ?? store.prompt.slice(0, 60))}</div></div>
        </div>
        <span class="tag ${state}">${escapeHtml(store.status)}</span>
      </div>
      <a class="addr muted" href="${escapeHtml(address)}" target="_blank" rel="noopener">${escapeHtml(address.replace(/^https?:\/\//, ''))} ↗</a>
      <div class="nums">
        <div><b>${products}</b><span class="muted">products</span></div>
        <div><b>${sales.orders}</b><span class="muted">orders&nbsp;/&nbsp;30d</span></div>
        <div><b>${escapeHtml(format(sales.revenueCents, store.currency))}</b><span class="muted">sales&nbsp;/&nbsp;30d</span></div>
      </div>
      <div class="muted" style="font-size:11.5px">${published ? `Published ${escapeHtml(published.slice(0, 10))}` : 'Never published — the storefront is draft only'}</div>
      <div class="row actions">
        <a class="btn primary" href="/admin/switch?storeId=${escapeHtml(store.id)}">Open</a>
        <a class="btn" href="/admin/switch?storeId=${escapeHtml(store.id)}&amp;to=${encodeURIComponent('/admin/build')}">Build</a>
        <a class="btn" href="${escapeHtml(address)}" target="_blank" rel="noopener">Storefront ↗</a>
      </div>
    </div>`
    })
    .join('')}</div>`
}
