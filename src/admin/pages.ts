import { escapeHtml } from '../lib/http.ts'
import { format } from '../lib/money.ts'
import type { Db } from '../lib/db.ts'
import { listCollections, listProducts, lowStock } from '../domain/catalog.ts'
import { listCustomers, segment } from '../domain/customers.ts'
import { listOrders, getOrder } from '../domain/orders.ts'
import { listPromotions } from '../domain/promotions.ts'
import { listReviews, statsFor } from '../domain/reviews.ts'
import { listRegions } from '../domain/regions.ts'
import { environment, listDomains, type Store } from '../control/stores.ts'
import { listTeam } from '../control/auth.ts'
import { listAudit } from '../control/todos.ts'
import { allPlugins, pluginCategories } from '../control/catalog-plugins.ts'
import { listInstalled } from '../control/plugins.ts'
import { PLANS, planBySlug, yearlySavingsPercent } from '../control/plans.ts'
import { BENCHMARK, funnel, kpis, liveVisitors, recentEvents, revenueSeries } from '../analytics/events.ts'
import { listSends } from '../email/send.ts'
import { TEMPLATES } from '../email/templates.ts'
import { listSeoPages } from '../seo/schema.ts'
import { PROMPT_LIBRARY } from '../agent/chat.ts'
import { listRuns } from '../agent/runtime.ts'
import { latestResearch } from '../agent/research.ts'
import { salesSummary } from '../domain/orders.ts'
import { listTools, toolCountsByArea } from '../agent/registry.ts'
import { renderArtifact } from './shell.ts'
import type { ChatMessage } from '../agent/chat.ts'

type Ctx = { db: Db; store: Store; userName: string; storeUrl: string; flash?: string }

const pct = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`

function kpiRow(ctx: Ctx, range: '24h' | '7d' | '30d' | '90d') {
  const stats = kpis(ctx.db, ctx.store.id, range)
  const currency = ctx.store.currency
  const tiles: Array<[string, string, number]> = [
    ['Sessions', String(stats.sessions), stats.deltas.sessions ?? 0],
    ['Total sales', format(stats.revenueCents, currency), stats.deltas.revenueCents ?? 0],
    ['Orders', String(stats.orders), stats.deltas.orders ?? 0],
    ['Conversion rate', `${(stats.conversionRate * 100).toFixed(2)}%`, stats.deltas.conversionRate ?? 0],
    ['AOV', format(stats.aovCents, currency), stats.deltas.aovCents ?? 0],
  ]
  return `<div class="kpis">${tiles
    .map(
      ([label, value, delta]) => `<div class="kpi"><div class="label">${label}</div><div class="value">${escapeHtml(value)}</div>
        <div class="delta ${delta < 0 ? 'neg' : ''}">${pct(delta)}</div></div>`,
    )
    .join('')}</div>`
}

function flash(ctx: Ctx): string {
  return ctx.flash ? `<div class="notice flash${ctx.flash.startsWith('!') ? ' bad' : ''}" style="margin-bottom:1rem">${escapeHtml(ctx.flash.replace(/^!/, ''))}</div>` : ''
}

/* ------------------------------------------------------------------ dashboard */

export function dashboard(ctx: Ctx, range: '24h' | '7d' | '30d' | '90d'): string {
  const series = revenueSeries(ctx.db, ctx.store.id, 14)
  const peak = Math.max(1, ...series.map((point) => point.revenue))
  const orders = listOrders(ctx.db, ctx.store.id, { limit: 6 })
  const low = lowStock(ctx.db, ctx.store.id, 5) as Array<{ product_title: string; title: string; inventory: number }>
  return `${flash(ctx)}
  <div class="head">
    <div><h1 class="serif">Hello ${escapeHtml(ctx.userName)}, <em>welcome back.</em></h1>
      <p class="muted" style="margin:.3rem 0 0">${escapeHtml(ctx.store.brand.slogan ?? ctx.store.name)}</p></div>
    <form method="get" class="row"><select name="range" onchange="this.form.submit()">
      ${(['24h', '7d', '30d', '90d'] as const).map((option) => `<option value="${option}" ${option === range ? 'selected' : ''}>Last ${option}</option>`).join('')}
    </select></form>
  </div>
  ${kpiRow(ctx, range)}
  <div class="grid2">
    <div>
      <div class="preview">
        <div class="chrome"><i></i><i></i><i></i><span class="url">${escapeHtml(ctx.storeUrl)}</span></div>
        <iframe src="${escapeHtml(ctx.storeUrl)}" title="Live storefront preview" loading="lazy"></iframe>
      </div>
    </div>
    <div>
      <div class="card"><h2>Revenue, 14 days</h2>
        <div class="spark" style="margin-top:.7rem">${series.map((point) => `<i style="height:${Math.max(2, (point.revenue / peak) * 44)}px" title="${point.day}: ${format(point.revenue, ctx.store.currency)}"></i>`).join('')}</div>
        <p class="muted" style="font-size:11.5px;margin:.5rem 0 0">${series[0]?.day} → ${series.at(-1)?.day}</p>
      </div>
      <div class="card"><h2>Recent orders</h2>
        <table class="data" style="margin-top:.5rem">${orders.length ? orders
          .map((order) => `<tr><td><a href="/admin/orders/${escapeHtml(order.id)}">#${order.displayId}</a></td>
            <td class="muted">${escapeHtml(order.email)}</td><td>${format(order.totalCents, order.currency)}</td>
            <td><span class="tag ${order.fulfillmentStatus === 'unfulfilled' ? 'warn' : 'ok'}">${order.fulfillmentStatus}</span></td></tr>`)
          .join('') : '<tr><td class="muted">No orders yet.</td></tr>'}</table>
      </div>
      ${low.length ? `<div class="card"><h2>Running low</h2>
        <table class="data" style="margin-top:.5rem">${low.slice(0, 5).map((row) => `<tr><td>${escapeHtml(row.product_title)}</td><td class="muted">${escapeHtml(row.title)}</td><td>${row.inventory}</td></tr>`).join('')}</table></div>` : ''}
    </div>
  </div>`
}

/* ------------------------------------------------------------------- products */

export function productsPage(ctx: Ctx, status: string, search: string): string {
  const products = listProducts(ctx.db, ctx.store.id, { status, ...(search ? { search } : {}), limit: 200 })
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Products</h1>
    <p class="muted" style="margin:.25rem 0 0">${products.length} shown</p></div>
    <form method="get" class="row"><input name="search" value="${escapeHtml(search)}" placeholder="Search" style="width:200px">
      <input type="hidden" name="status" value="${escapeHtml(status)}"><button class="btn" type="submit">Search</button></form></div>
  <div class="tabs">${['all', 'published', 'draft', 'archived']
    .map((option) => `<a class="${option === status ? 'on' : ''}" href="/admin/products?status=${option}">${option[0]?.toUpperCase()}${option.slice(1)}</a>`)
    .join('')}</div>
  <div class="card" style="padding:0">
  <table class="data"><thead><tr><th></th><th>Product</th><th>Status</th><th>Inventory</th><th>Price</th><th></th></tr></thead><tbody>
  ${products.length ? products
      .map((product) => {
        const stock = product.variants.reduce((sum, variant) => sum + variant.inventory, 0)
        const from = Math.min(...product.variants.map((variant) => variant.priceCents))
        return `<tr><td style="width:52px">${product.heroImage ? `<img src="${escapeHtml(product.heroImage)}" alt="">` : ''}</td>
          <td><a href="/admin/products/${escapeHtml(product.id)}" style="text-decoration:none">${escapeHtml(product.title)}</a>
            <div class="muted" style="font-size:11.5px">${product.variants.length} variants</div></td>
          <td><span class="tag ${product.status === 'published' ? 'ok' : ''}">${product.status}</span></td>
          <td>${stock}</td><td>${format(from, ctx.store.currency)}</td>
          <td style="text-align:right"><a class="btn" href="/admin/products/${escapeHtml(product.id)}">Open</a></td></tr>`
      })
      .join('') : '<tr><td colspan="6" class="muted" style="padding:1.4rem">Nothing here. Ask the assistant to add a product.</td></tr>'}
  </tbody></table></div>`
}

export function productDetail(ctx: Ctx, productId: string): string {
  const product = listProducts(ctx.db, ctx.store.id, { limit: 300 }).find((entry) => entry.id === productId)
  if (!product) return '<p class="muted">No such product.</p>'
  const stats = statsFor(ctx.db, ctx.store.id, product.id)
  return `${flash(ctx)}<div class="head"><div><div class="eyebrow"><a href="/admin/products" style="text-decoration:none">Products</a> / ${escapeHtml(product.status)}</div>
    <h1 class="serif">${escapeHtml(product.title)}</h1></div>
    <a class="btn" href="${escapeHtml(ctx.storeUrl)}/products/${escapeHtml(product.handle)}" target="_blank" rel="noopener">View on the storefront ↗</a></div>
  <div class="grid2"><div>
    <div class="card"><h2>Details</h2>
      <form method="post" action="/admin/products/${escapeHtml(product.id)}">
        <div class="field"><label>Title</label><input name="title" value="${escapeHtml(product.title)}"></div>
        <div class="field"><label>Subtitle</label><input name="subtitle" value="${escapeHtml(product.subtitle)}"></div>
        <div class="field"><label>Description</label><textarea name="description" rows="8">${escapeHtml(product.description)}</textarea></div>
        <div class="field"><label>Status</label><select name="status">${['draft', 'published', 'archived']
          .map((option) => `<option ${option === product.status ? 'selected' : ''}>${option}</option>`)
          .join('')}</select></div>
        <button class="btn primary" type="submit">Save</button></form></div>
    <div class="card" style="padding:0"><div style="padding:1rem 1.1rem"><h2>Variants</h2></div>
      <table class="data"><thead><tr><th>Variant</th><th>SKU</th><th>Price</th><th>Stock</th><th></th></tr></thead><tbody>
      ${product.variants
        .map(
          (variant) => `<tr><td>${escapeHtml(variant.title)}</td><td class="muted">${escapeHtml(variant.sku)}</td>
        <td><form method="post" action="/admin/variants/${escapeHtml(variant.id)}" class="row">
          <input name="priceCents" value="${variant.priceCents}" style="width:96px">
          <input name="inventory" value="${variant.inventory}" style="width:72px">
          <button class="btn" type="submit">Set</button></form></td>
        <td>${variant.inventory}</td><td class="muted" style="font-size:11.5px">${escapeHtml(Object.values(variant.optionValues).join(' / '))}</td></tr>`,
        )
        .join('')}</tbody></table></div>
  </div>
  <div>
    <div class="card"><h2>Media</h2><div class="grid3" style="grid-template-columns:repeat(2,1fr);margin-top:.6rem">
      ${[product.heroImage, ...product.media.map((entry) => entry.url)]
        .filter(Boolean)
        .slice(0, 4)
        .map((url) => `<img src="${escapeHtml(url)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:1px solid var(--line)">`)
        .join('')}</div>
      <form method="post" action="/admin/products/${escapeHtml(product.id)}/photo" enctype="multipart/form-data" style="margin-top:.8rem">
        <div class="field"><label>Upload a product photo</label><input type="file" name="photo" accept="image/*" required></div>
        <div class="field"><label>Stage it as</label><select name="preset">${['white-seamless', 'lifestyle', 'dark-luxury', 'flat-lay', 'golden-hour', 'studio-3-point']
          .map((preset) => `<option value="${preset}">${preset.replace(/-/g, ' ')}</option>`).join('')}</select></div>
        <button class="btn primary" type="submit">Upload and stage</button></form>
      <p class="muted" style="font-size:11.5px;margin:.6rem 0 0">Your photo stays your photo: it is staged into the scene, and the original is kept in the gallery. Ask the assistant to enhance it and it renders four lanes to pick from.</p></div>
    <div class="card"><h2>The page</h2>
      <p class="muted" style="font-size:12px;margin:.3rem 0">${product.content.benefits?.length ?? 0} benefits · ${product.content.comparison?.rows.length ?? 0}-row comparison · ${product.content.specs?.length ?? 0} specs · ${product.content.faq?.length ?? 0} questions${product.content.guarantee ? ' · guarantee' : ''}</p>
      ${product.content.benefits?.slice(0, 3).map((benefit) => `<p style="font-size:12.5px;margin:.25rem 0">— ${escapeHtml(benefit.title)}</p>`).join('') ?? ''}
      <form method="post" action="/admin/products/${escapeHtml(product.id)}/rewrite" style="margin-top:.6rem"><button class="btn" type="submit">Rewrite the page from research</button></form></div>
    <div class="card"><h2>Reviews</h2><p style="margin:.3rem 0 0">${stats.count ? `${stats.average} / 5 from ${stats.count}` : 'None yet'}</p>
      ${stats.summary.map((line) => `<p class="muted" style="font-size:12px;margin:.5rem 0 0">${escapeHtml(line)}</p>`).join('')}</div>
    <div class="card"><h2>SEO</h2>
      <p class="muted" style="font-size:12px">${escapeHtml(product.seo.title ?? product.title)}</p>
      <p class="muted" style="font-size:12px">${escapeHtml(product.seo.description ?? '')}</p></div>
  </div></div>`
}

/* --------------------------------------------------------------------- orders */

export function ordersPage(ctx: Ctx, status: string): string {
  const orders = listOrders(ctx.db, ctx.store.id, { status, limit: 100 })
  return `${flash(ctx)}<div class="head"><h1 class="serif">Orders</h1></div>
  <div class="tabs">${['all', 'completed', 'cancelled'].map((option) => `<a class="${option === status ? 'on' : ''}" href="/admin/orders?status=${option}">${option}</a>`).join('')}</div>
  <div class="card" style="padding:0"><table class="data"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Fulfilment</th><th>Placed</th></tr></thead><tbody>
  ${orders.length ? orders
      .map((order) => `<tr><td><a href="/admin/orders/${escapeHtml(order.id)}">#${order.displayId}</a></td>
        <td class="muted">${escapeHtml(order.email)}</td><td>${format(order.totalCents, order.currency)}</td>
        <td><span class="tag ${order.paymentStatus === 'captured' ? 'ok' : order.paymentStatus.includes('refund') ? 'warn' : ''}">${order.paymentStatus}</span></td>
        <td><span class="tag ${order.fulfillmentStatus === 'unfulfilled' ? 'warn' : 'ok'}">${order.fulfillmentStatus}</span></td>
        <td class="muted">${order.createdAt.slice(0, 16).replace('T', ' ')}</td></tr>`)
      .join('') : '<tr><td colspan="6" class="muted" style="padding:1.4rem">No orders yet.</td></tr>'}
  </tbody></table></div>`
}

export function orderDetail(ctx: Ctx, orderId: string): string {
  const order = getOrder(ctx.db, ctx.store.id, orderId)
  if (!order) return '<p class="muted">No such order.</p>'
  return `${flash(ctx)}<div class="head"><div><div class="eyebrow"><a href="/admin/orders" style="text-decoration:none">Orders</a></div>
    <h1 class="serif">Order #${order.displayId}</h1></div>
    <div class="row">
      <form method="post" action="/admin/orders/${escapeHtml(order.id)}/fulfill" class="row">
        <input name="tracking" placeholder="Tracking number" style="width:170px"><button class="btn" type="submit">Fulfil</button></form>
      <form method="post" action="/admin/orders/${escapeHtml(order.id)}/refund"><button class="btn" type="submit">Refund</button></form>
    </div></div>
  <div class="grid2"><div class="card" style="padding:0"><table class="data"><thead><tr><th></th><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>
    ${order.items.map((item) => `<tr><td style="width:52px"><img src="${escapeHtml(item.image)}" alt=""></td>
      <td>${escapeHtml(item.title)}<div class="muted" style="font-size:11.5px">${escapeHtml(item.variantTitle)}</div></td>
      <td>${item.quantity}</td><td>${format(item.unitCents * item.quantity, order.currency)}</td></tr>`).join('')}
    </tbody></table></div>
  <div>
    <div class="card"><h2>Totals</h2>
      <table class="data" style="margin-top:.4rem"><tr><td>Subtotal</td><td style="text-align:right">${format(order.subtotalCents, order.currency)}</td></tr>
      ${order.discountCents ? `<tr><td>Discount ${escapeHtml(order.discountCode)}</td><td style="text-align:right">-${format(order.discountCents, order.currency)}</td></tr>` : ''}
      <tr><td>Shipping</td><td style="text-align:right">${order.shippingCents ? format(order.shippingCents, order.currency) : 'Free'}</td></tr>
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${format(order.totalCents, order.currency)}</strong></td></tr></table></div>
    <div class="card"><h2>Customer</h2><p style="margin:.3rem 0 0">${escapeHtml(order.email)}</p>
      <p class="muted" style="font-size:12px;margin:.3rem 0 0">${escapeHtml([order.address.name, order.address.line1, order.address.city, order.address.postal, order.address.country].filter(Boolean).join(', '))}</p></div>
    ${order.refunds.length ? `<div class="card"><h2>Refunds</h2>${order.refunds.map((refund) => `<p class="muted" style="font-size:12px;margin:.3rem 0 0">${format(refund.amountCents, order.currency)} — ${escapeHtml(refund.reason || 'no reason given')}</p>`).join('')}</div>` : ''}
    ${order.fulfillments.length ? `<div class="card"><h2>Fulfilments</h2>${order.fulfillments.map((fulfillment) => `<p class="muted" style="font-size:12px;margin:.3rem 0 0">${escapeHtml(fulfillment.provider)} ${escapeHtml(fulfillment.tracking)}</p>`).join('')}</div>` : ''}
  </div></div>`
}

/* ------------------------------------------------------- customers, promos, etc */

export function customersPage(ctx: Ctx, search: string): string {
  const customers = listCustomers(ctx.db, ctx.store.id, { ...(search ? { search } : {}), limit: 200 })
  const stats = segment(ctx.db, ctx.store.id)
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Customers</h1>
    <p class="muted" style="margin:.25rem 0 0">${stats.total} total · ${Math.round(stats.repeatRate * 100)}% repeat · ${format(stats.lifetimeValueCents, ctx.store.currency)} average lifetime value</p></div>
    <form method="get" class="row"><input name="search" value="${escapeHtml(search)}" placeholder="Search" style="width:200px"><button class="btn">Search</button></form></div>
  <div class="card" style="padding:0"><table class="data"><thead><tr><th>Customer</th><th>Email</th><th>Orders</th><th>Spend</th><th>Marketing</th></tr></thead><tbody>
  ${customers.length ? customers.map((customer) => `<tr><td>${escapeHtml(customer.name || '—')}</td><td class="muted">${escapeHtml(customer.email)}</td>
    <td>${customer.ordersCount}</td><td>${format(customer.spendCents, ctx.store.currency)}</td>
    <td>${customer.marketing ? '<span class="tag ok">opted in</span>' : '<span class="tag">no</span>'}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted" style="padding:1.4rem">No customers yet.</td></tr>'}
  </tbody></table></div>`
}

export function collectionsPage(ctx: Ctx): string {
  const collections = listCollections(ctx.db, ctx.store.id)
  return `${flash(ctx)}<div class="head"><h1 class="serif">Collections</h1>
    <form method="post" action="/admin/collections" class="row"><input name="title" placeholder="New collection" style="width:200px" required><button class="btn primary">Create</button></form></div>
  <div class="grid3">${collections.map((collection) => `<div class="card"><h2>${escapeHtml(collection.title)}</h2>
    <p class="muted" style="font-size:12px;margin:.3rem 0">${escapeHtml(collection.description || '—')}</p>
    <p class="muted" style="font-size:12px">${collection.productIds.length} products · /collections/${escapeHtml(collection.handle)}</p></div>`).join('')
    || '<p class="muted">No collections. Ask the assistant to organise the catalog.</p>'}</div>`
}

export function promotionsPage(ctx: Ctx): string {
  const promotions = listPromotions(ctx.db, ctx.store.id)
  return `${flash(ctx)}<div class="head"><h1 class="serif">Promotions</h1></div>
  <div class="card" style="padding:0"><table class="data"><thead><tr><th>Promotion</th><th>Code</th><th>Type</th><th>Value</th><th>Status</th><th>Used</th><th></th></tr></thead><tbody>
  ${promotions.length ? promotions.map((promotion) => `<tr><td>${escapeHtml(promotion.title)}</td>
    <td class="muted">${escapeHtml(promotion.code || 'automatic')}</td><td>${promotion.kind}</td>
    <td>${promotion.kind === 'fixed' ? format(promotion.value, ctx.store.currency) : promotion.kind === 'free_shipping' ? '—' : `${promotion.value}%`}</td>
    <td><span class="tag ${promotion.status === 'active' ? 'ok' : ''}">${promotion.status}</span></td><td>${promotion.usageCount}</td>
    <td style="text-align:right">${promotion.status === 'active' ? `<form method="post" action="/admin/promotions/${escapeHtml(promotion.id)}/disable"><button class="btn">Disable</button></form>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted" style="padding:1.4rem">No promotions. Ask for "a 10% welcome code" and one appears.</td></tr>'}
  </tbody></table></div>`
}

/* ------------------------------------------------------------------ analytics */

export function analyticsPage(ctx: Ctx, range: '24h' | '7d' | '30d' | '90d'): string {
  const stages = funnel(ctx.db, ctx.store.id, range)
  const visitors = liveVisitors(ctx.db, ctx.store.id) as Array<{ city: string; country: string; path: string; last_seen: string }>
  const events = recentEvents(ctx.db, ctx.store.id, 14) as Array<{ type: string; path: string; amount_cents: number; city: string; created_at: string }>
  const purchase = stages.at(-1)?.share ?? 0
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Analytics</h1>
    <p class="muted" style="margin:.25rem 0 0">First-party. No cookie, no pixel, no third party — sessions are an HMAC of address and agent that rotates daily.</p></div>
    <form method="get"><select name="range" onchange="this.form.submit()">${(['24h', '7d', '30d', '90d'] as const)
      .map((option) => `<option ${option === range ? 'selected' : ''}>${option}</option>`)
      .join('')}</select></form></div>
  ${kpiRow(ctx, range)}
  <div class="grid2"><div class="card"><h2>Funnel</h2><div class="bars" style="margin-top:.8rem">
    ${stages.map((stage) => `<div class="barrow"><span>${stage.stage}</span>
      <span class="track"><span class="fill" style="width:${(stage.share * 100).toFixed(1)}%"></span></span>
      <span>${stage.count} <span class="muted">${stage.dropOff ? `−${(stage.dropOff * 100).toFixed(0)}%` : ''}</span></span></div>`).join('')}
    </div>
    <div class="notice" style="margin-top:1rem">Purchase rate ${(purchase * 100).toFixed(2)}% against a ${(BENCHMARK.purchase * 100).toFixed(1)}% DTC median and ${(BENCHMARK.topDecilePurchase * 100).toFixed(1)}% top decile.</div>
  </div>
  <div class="card"><h2>Right now</h2>
    <table class="data" style="margin-top:.4rem">${visitors.length ? visitors.map((visitor) => `<tr><td>${escapeHtml([visitor.city, visitor.country].filter(Boolean).join(', '))}</td>
      <td class="muted">${escapeHtml(visitor.path || '/')}</td><td class="muted">${visitor.last_seen.slice(11, 19)}</td></tr>`).join('')
      : '<tr><td class="muted">Nobody on the store right now.</td></tr>'}</table></div></div>
  <div class="card" style="padding:0"><div style="padding:1rem 1.1rem"><h2>Event ticker</h2></div>
    <table class="data"><thead><tr><th>Event</th><th>Where</th><th>Amount</th><th>From</th><th>When</th></tr></thead><tbody>
    ${events.map((event) => `<tr><td><span class="tag">${escapeHtml(event.type)}</span></td><td class="muted">${escapeHtml(event.path || '—')}</td>
      <td>${event.amount_cents ? format(event.amount_cents, ctx.store.currency) : '—'}</td><td class="muted">${escapeHtml(event.city || '—')}</td>
      <td class="muted">${event.created_at.slice(11, 19)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="padding:1.2rem">No traffic recorded yet.</td></tr>'}
    </tbody></table></div>`
}

/* -------------------------------------------------------------------- reviews */

export function reviewsPage(ctx: Ctx, status: string): string {
  const reviews = listReviews(ctx.db, ctx.store.id, { status, limit: 100 })
  const products = new Map(listProducts(ctx.db, ctx.store.id, { limit: 300 }).map((product) => [product.id, product.title]))
  return `${flash(ctx)}<div class="head"><h1 class="serif">Reviews</h1></div>
  <div class="tabs">${['pending', 'approved', 'rejected', 'all'].map((option) => `<a class="${option === status ? 'on' : ''}" href="/admin/reviews?status=${option}">${option}</a>`).join('')}</div>
  <div class="grid3">${reviews.length ? reviews.map((review) => `<div class="card">
    <div class="row" style="justify-content:space-between"><strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong>
      <span class="tag ${review.status === 'approved' ? 'ok' : review.status === 'rejected' ? 'bad' : 'warn'}">${review.status}</span></div>
    <p class="muted" style="font-size:11.5px;margin:.3rem 0">${escapeHtml(products.get(review.productId) ?? review.productId)}</p>
    <p style="font-size:13px;margin:.3rem 0">${escapeHtml(review.body)}</p>
    <p class="muted" style="font-size:11.5px">${escapeHtml(review.author)} · ${review.createdAt.slice(0, 10)}</p>
    ${review.flags.length ? `<p class="tag warn" style="margin-top:.3rem">flagged: ${escapeHtml(review.flags.join(', '))}</p>` : ''}
    <div class="row" style="margin-top:.6rem">
      <form method="post" action="/admin/reviews/${escapeHtml(review.id)}/approved"><button class="btn">Approve</button></form>
      <form method="post" action="/admin/reviews/${escapeHtml(review.id)}/rejected"><button class="btn">Reject</button></form></div>
    </div>`).join('') : '<p class="muted">Nothing in this queue.</p>'}</div>`
}

/* ------------------------------------------------------------- store designer */

export function storePage(ctx: Ctx, messages: ChatMessage[]): string {
  const draft = environment(ctx.db, ctx.store.id, 'draft')
  const live = environment(ctx.db, ctx.store.id, 'live')
  const dirty = JSON.stringify(draft.theme) !== JSON.stringify(live.theme)
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Store designer</h1>
    <p class="muted" style="margin:.25rem 0 0">Draft v${draft.version}${dirty ? ' — has changes that are not live' : ' — matches what is live'}. Live v${live.version}${live.publishedAt ? `, published ${live.publishedAt.slice(0, 10)}` : ''}.</p></div>
    <div class="row"><form method="post" action="/admin/rollback"><button class="btn">Discard draft</button></form>
      <form method="post" action="/admin/publish"><button class="btn primary">Publish</button></form></div></div>
  <div class="grid2"><div class="preview">
      <div class="chrome"><i></i><i></i><i></i><span class="url">${escapeHtml(ctx.storeUrl)}?draft=1</span></div>
      <iframe src="/preview/${escapeHtml(ctx.store.slug)}" title="Draft preview"></iframe></div>
    <div>
      <div class="card"><h2>Theme</h2>
        <form method="post" action="/admin/theme">
          <div class="field"><label>Template</label><select name="template">${['atelier', 'gallery', 'market']
            .map((option) => `<option ${option === draft.theme.template ? 'selected' : ''}>${option}</option>`).join('')}</select></div>
          <div class="field"><label>Corner radius</label><select name="radius">${['0px', '2px', '8px', '999px']
            .map((option) => `<option ${option === draft.theme.radius ? 'selected' : ''}>${option}</option>`).join('')}</select></div>
          <div class="field"><label>Density</label><select name="density">${['roomy', 'compact']
            .map((option) => `<option ${option === draft.theme.density ? 'selected' : ''}>${option}</option>`).join('')}</select></div>
          <div class="field"><label>Hero headline</label><input name="heroHeadline" value="${escapeHtml(draft.theme.heroHeadline ?? '')}"></div>
          <div class="field"><label>Announcement bar</label><input name="announcement" value="${escapeHtml(ctx.store.brand.announcement ?? '')}"></div>
          <button class="btn primary" type="submit">Save to draft</button></form></div>
      <div class="card"><h2>Sections</h2><p class="muted" style="font-size:12px">${draft.theme.sections.map((section) => `<span class="tag" style="margin:.15rem .15rem 0 0">${escapeHtml(section)}</span>`).join('')}</p>
        <p class="muted" style="font-size:11.5px;margin-top:.6rem">Ask the assistant to reorder or drop sections — it edits the draft, never the live theme.</p></div>
      <div class="card"><h2>Build log</h2>${draft.buildLog.slice(-6).reverse().map((entry) => `<p class="muted" style="font-size:11.5px;margin:.2rem 0">${entry.at.slice(11, 19)} — ${escapeHtml(entry.message)}</p>`).join('') || '<p class="muted" style="font-size:12px">Nothing yet.</p>'}</div>
    </div></div>`
}

/* ------------------------------------------------------------------ marketing */

export function marketingPage(ctx: Ctx): string {
  const sends = listSends(ctx.db, ctx.store.id, 12) as Array<{ id: string; template: string; recipient: string; subject: string; status: string }>
  const pages = listSeoPages(ctx.db, ctx.store.id) as Array<{ path: string; title: string; description: string; keyword: string }>
  return `${flash(ctx)}<div class="head"><h1 class="serif">Email &amp; search</h1></div>
  <div class="grid2"><div>
    <div class="card" style="padding:0"><div style="padding:1rem 1.1rem"><h2>Send log</h2></div>
      <table class="data"><thead><tr><th>Template</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>
      ${sends.length ? sends.map((send) => `<tr><td>${escapeHtml(send.template)}</td><td class="muted">${escapeHtml(send.recipient)}</td>
        <td><a href="/admin/emails/${escapeHtml(send.id)}">${escapeHtml(send.subject)}</a></td>
        <td><span class="tag ${send.status === 'sent' ? 'ok' : 'bad'}">${send.status}</span></td></tr>`).join('')
        : '<tr><td colspan="4" class="muted" style="padding:1.2rem">Nothing sent yet.</td></tr>'}</tbody></table></div>
    <div class="card" style="padding:0"><div style="padding:1rem 1.1rem"><h2>Pages and what they target</h2></div>
      <table class="data"><thead><tr><th>Path</th><th>Title</th><th>Keyword</th><th>Meta</th></tr></thead><tbody>
      ${pages.map((page) => `<tr><td class="muted">${escapeHtml(page.path)}</td><td>${escapeHtml(page.title || '—')}</td>
        <td class="muted">${escapeHtml(page.keyword || '—')}</td>
        <td><span class="tag ${page.description.length > 60 ? 'ok' : 'warn'}">${page.description.length > 60 ? 'written' : 'thin'}</span></td></tr>`).join('')
        || '<tr><td colspan="4" class="muted" style="padding:1.2rem">No pages tracked yet.</td></tr>'}</tbody></table></div>
  </div>
  <div>
    <div class="card"><h2>Transactional templates</h2>
      ${TEMPLATES.map((template) => `<div class="row" style="justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--line)">
        <span style="font-size:12.5px">${escapeHtml(template.name)}</span>
        <span class="muted" style="font-size:11px">${escapeHtml(template.trigger)}${template.delayHours ? ` +${template.delayHours}h` : ''}</span></div>`).join('')}</div>
    <div class="card"><h2>Generative engines</h2>
      <p class="muted" style="font-size:12px">The knowledge card a model can actually read lives at
        <a href="${escapeHtml(ctx.storeUrl)}/llms.txt" target="_blank" rel="noopener">/llms.txt</a>, alongside
        <a href="${escapeHtml(ctx.storeUrl)}/sitemap.xml" target="_blank" rel="noopener">/sitemap.xml</a> and
        <a href="${escapeHtml(ctx.storeUrl)}/robots.txt" target="_blank" rel="noopener">/robots.txt</a>.</p>
      <p class="muted" style="font-size:11.5px">Tracking where a brand gets cited needs live calls to each engine, so this build ships the part a store controls rather than a fabricated placement chart.</p></div>
  </div></div>`
}

/* -------------------------------------------------------------------- plugins */

export function pluginsPage(ctx: Ctx, category: string, search: string): string {
  const installed = new Map(listInstalled(ctx.db, ctx.store.id).map((entry) => [entry.pluginId, entry]))
  const all = allPlugins().filter(
    (plugin) =>
      (category === 'all' || plugin.category === category) &&
      (!search || `${plugin.name} ${plugin.description}`.toLowerCase().includes(search.toLowerCase())),
  )
  const sorted = [...all].sort((a, b) => Number(b.source === 'first-party') - Number(a.source === 'first-party'))
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Integrations</h1>
    <p class="muted" style="margin:.25rem 0 0">${allPlugins().length} in the directory · ${allPlugins().filter((plugin) => plugin.source === 'first-party').length} installable · ${installed.size} installed</p></div>
    <form method="get" class="row"><input name="search" value="${escapeHtml(search)}" placeholder="Search" style="width:200px"><button class="btn">Search</button></form></div>
  <div class="tabs"><a class="${category === 'all' ? 'on' : ''}" href="/admin/plugins">All</a>
    ${pluginCategories().slice(0, 9).map((entry) => `<a class="${category === entry.name ? 'on' : ''}" href="/admin/plugins?category=${encodeURIComponent(entry.name)}">${escapeHtml(entry.name)} ${entry.count}</a>`).join('')}</div>
  <div class="grid3">${sorted.slice(0, 60).map((plugin) => {
    const entry = installed.get(plugin.id)
    const schema = plugin.manifest.admin?.settingsSchema ?? {}
    return `<div class="card"><div class="row" style="justify-content:space-between">
      <h2>${escapeHtml(plugin.name)}</h2>
      <span class="tag ${plugin.source === 'first-party' ? 'ok' : ''}">${plugin.source === 'first-party' ? 'first-party' : 'directory'}</span></div>
    <p class="muted" style="font-size:12px;margin:.4rem 0">${escapeHtml(plugin.description)}</p>
    <p class="muted" style="font-size:11px">${escapeHtml(plugin.category)}${plugin.regions.length ? ` · ${plugin.regions.join(', ')}` : ''}</p>
    ${plugin.source !== 'first-party'
      ? `<p class="muted" style="font-size:11.5px;margin-top:.5rem">Listed so you can find it. There is no integration behind it yet, so it does not pretend to install.</p>`
      : entry
        ? `<form method="post" action="/admin/plugins/${escapeHtml(plugin.id)}/settings" style="margin-top:.6rem">
            ${Object.entries(schema).map(([key, field]) => settingsField(key, field, entry.settings[key])).join('')}
            <div class="row"><button class="btn primary" type="submit">Save</button></div></form>
           <form method="post" action="/admin/plugins/${escapeHtml(plugin.id)}/uninstall" style="margin-top:.4rem"><button class="btn">Uninstall</button></form>`
        : `<form method="post" action="/admin/plugins/${escapeHtml(plugin.id)}/settings" style="margin-top:.6rem">
            ${Object.entries(schema).map(([key, field]) => settingsField(key, field, undefined)).join('')}
            <button class="btn primary" type="submit">Install</button></form>`}
    </div>`
  }).join('')}</div>`
}

function settingsField(key: string, field: { type: string; label?: string; enum?: string[]; default?: unknown; help?: string; multiline?: boolean; required?: boolean }, value: unknown): string {
  const label = escapeHtml(field.label ?? key)
  const current = value ?? field.default ?? ''
  if (field.type === 'boolean') {
    return `<label class="row" style="font-size:12px;margin-bottom:.5rem"><input type="checkbox" name="${escapeHtml(key)}" value="true" ${current ? 'checked' : ''} style="width:auto"> ${label}</label>`
  }
  if (field.enum?.length) {
    return `<div class="field"><label>${label}</label><select name="${escapeHtml(key)}">${field.enum
      .map((option) => `<option ${option === current ? 'selected' : ''}>${escapeHtml(option)}</option>`)
      .join('')}</select></div>`
  }
  const control = field.multiline
    ? `<textarea name="${escapeHtml(key)}" rows="2">${escapeHtml(current)}</textarea>`
    : `<input name="${escapeHtml(key)}" value="${escapeHtml(current)}" ${field.required ? 'required' : ''}>`
  return `<div class="field"><label>${label}${field.help ? ` — <span class="muted">${escapeHtml(field.help)}</span>` : ''}</label>${control}</div>`
}

/* ------------------------------------------------------------------- settings */

export function settingsPage(ctx: Ctx): string {
  const plan = planBySlug(ctx.store.planSlug)
  const domains = listDomains(ctx.db, ctx.store.id) as Array<{ hostname: string; status: string; ssl: string; verification_token: string }>
  const regions = listRegions(ctx.db, ctx.store.id)
  const team = listTeam(ctx.db, ctx.store.id) as Array<{ email: string; role: string; status: string }>
  const audit = listAudit(ctx.db, ctx.store.id, 12) as Array<{ actor_type: string; action: string; created_at: string; target: string }>
  return `${flash(ctx)}<div class="head"><h1 class="serif">Settings</h1></div>
  <div class="grid2"><div>
    <div class="card"><h2>Domains</h2>
      <form method="post" action="/admin/domains" class="row" style="margin:.6rem 0">
        <input name="hostname" placeholder="yourbrand.com" style="flex:1"><button class="btn primary">Attach</button></form>
      ${domains.length ? domains.map((domain) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding:.5rem 0">
        <span>${escapeHtml(domain.hostname)}</span>
        <span class="row"><span class="tag ${domain.status === 'verified' ? 'ok' : 'warn'}">${domain.status}</span>
        ${domain.status === 'verified' ? '' : `<form method="post" action="/admin/domains/verify"><input type="hidden" name="hostname" value="${escapeHtml(domain.hostname)}"><button class="btn">Verify</button></form>`}</span></div>
        ${domain.status === 'verified' ? '' : `<p class="muted" style="font-size:11.5px">CNAME → edge.amboras.app · TXT _amboras.${escapeHtml(domain.hostname)} = amboras-verify=${escapeHtml(domain.verification_token)}</p>`}`).join('')
        : `<p class="muted" style="font-size:12px">On ${escapeHtml(plan.name)}${plan.customDomain ? '' : ', a custom domain needs a paid plan'}. The store is live at its amboras address either way.</p>`}</div>
    <div class="card"><h2>Regions and shipping</h2>
      ${regions.map((region) => `<div style="border-top:1px solid var(--line);padding:.6rem 0">
        <strong>${escapeHtml(region.name)}</strong> <span class="muted">${escapeHtml(region.currency)} · ${escapeHtml(region.countries.join(', '))}</span>
        ${region.shipping.map((option) => `<div class="muted" style="font-size:12px">${escapeHtml(option.name)} — ${format(option.amountCents, region.currency)}${option.freeAboveCents ? `, free over ${format(option.freeAboveCents, region.currency)}` : ''}</div>`).join('')}
      </div>`).join('')}</div>
    <div class="card"><h2>Team</h2>
      <form method="post" action="/admin/team" class="row" style="margin:.6rem 0">
        <input name="email" type="email" placeholder="teammate@example.com" style="flex:1">
        <select name="role" style="width:110px"><option>member</option><option>admin</option></select>
        <button class="btn primary">Invite</button></form>
      ${team.map((member) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding:.4rem 0">
        <span>${escapeHtml(member.email)}</span><span class="tag">${escapeHtml(member.role)} · ${escapeHtml(member.status)}</span></div>`).join('')
        || '<p class="muted" style="font-size:12px">Just you.</p>'}</div>
  </div>
  <div>
    <div class="card"><h2>Plan</h2>
      <p style="margin:.3rem 0"><strong>${escapeHtml(plan.name)}</strong> — ${plan.monthlyPriceCents < 0 ? 'custom' : format(plan.monthlyPriceCents, 'USD')}/mo,
        ${plan.platformFeePercent}% platform fee, ${(plan.cardRate * 100).toFixed(1)}% + 30c cards.</p>
      <p class="muted" style="font-size:12px">${plan.displayFeatures.join(' · ')}</p>
      <form method="post" action="/admin/plan" class="row" style="margin-top:.6rem">
        <select name="planSlug" style="flex:1">${PLANS.map((option) => `<option value="${option.slug}" ${option.slug === plan.slug ? 'selected' : ''}>${escapeHtml(option.name)}${option.monthlyPriceCents > 0 ? ` — ${format(option.monthlyPriceCents, 'USD')}/mo, save ${yearlySavingsPercent(option)}% yearly` : ''}</option>`).join('')}</select>
        <button class="btn">Switch</button></form></div>
    <div class="card"><h2>Audit</h2>
      <p class="muted" style="font-size:11.5px">Every action, including the assistant's.</p>
      ${audit.map((entry) => `<div style="border-top:1px solid var(--line);padding:.35rem 0;font-size:12px">
        <span class="tag ${entry.actor_type === 'agent' ? 'warn' : ''}">${escapeHtml(entry.actor_type)}</span>
        ${escapeHtml(entry.action)} <span class="muted">${entry.created_at.slice(11, 19)}</span></div>`).join('')}</div>
  </div></div>`
}

/* --------------------------------------------------------------- stores hub */

export function storesPage(ctx: Ctx, stores: Store[]): string {
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Your stores</h1>
    <p class="muted" style="margin:.25rem 0 0">${stores.length} store${stores.length === 1 ? '' : 's'}. Each one is its own catalog, customers, orders, brand and address.</p></div>
    <a class="btn primary" href="/onboarding">+ Start a new store</a></div>
  <div class="grid3">${stores.map((store) => {
    const products = ctx.db.one<{ c: number }>("SELECT COUNT(*) c FROM products WHERE store_id = ? AND status = 'published'", store.id)?.c ?? 0
    const sales = salesSummary(ctx.db, store.id, 30)
    const plan = planBySlug(store.planSlug)
    return `<div class="card" style="display:flex;flex-direction:column;gap:.5rem">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div class="row">${store.brand.logoSvg ? `<img src="${escapeHtml(store.brand.logoSvg)}" alt="" style="width:36px;height:36px;border-radius:8px">` : ''}
          <div><h2>${escapeHtml(store.name)}</h2><div class="muted" style="font-size:11.5px">${escapeHtml(store.brand.slogan ?? '')}</div></div></div>
        <span class="tag ${store.status === 'live' ? 'ok' : 'warn'}">${store.status}</span></div>
      <div class="muted" style="font-size:12px">${products} products · ${sales.orders} orders / 30d · ${format(sales.revenueCents, store.currency)} · ${escapeHtml(plan.name)}</div>
      <div class="muted" style="font-size:11.5px">${escapeHtml(store.prompt.slice(0, 110))}${store.prompt.length > 110 ? '…' : ''}</div>
      <div class="row" style="margin-top:.4rem">
        <a class="btn primary" href="/admin/switch?storeId=${escapeHtml(store.id)}">${store.id === ctx.store.id ? 'Open (current)' : 'Open'}</a>
        <a class="btn" href="/s/${escapeHtml(store.slug)}" target="_blank" rel="noopener">Storefront ↗</a></div>
    </div>`
  }).join('')}</div>`
}

/* ------------------------------------------------------------- research page */

export function researchPage(ctx: Ctx): string {
  const research = latestResearch(ctx.db, ctx.store.id)
  const runForm = `<form method="post" action="/admin/research/run" class="card">
    <h2>Run customer research</h2>
    <p class="muted" style="font-size:12px;margin:.3rem 0 .8rem">Who buys this, what stops them, what they compare it against, what they will pay. Product pages are written from it.</p>
    <div class="field"><label>Brief</label><input name="brief" value="${escapeHtml(ctx.store.prompt)}"></div>
    <div class="field"><label>Existing site to read (optional)</label><input name="siteUrl" type="url" value="${escapeHtml(ctx.store.referenceUrl)}" placeholder="https://"></div>
    <label class="row" style="font-size:12px;margin-bottom:.7rem"><input type="checkbox" name="rewritePages" value="true" checked> Rewrite every product page from the result</label>
    <button class="btn primary" type="submit">${research ? 'Run again' : 'Run research'}</button></form>`
  if (!research) {
    return `${flash(ctx)}<div class="head"><h1 class="serif">Customer research</h1></div><div class="grid2">${runForm}<div class="card"><p class="muted">Nothing on file yet. Stores built through onboarding get this automatically; this one was not, or it was reset.</p></div></div>`
  }
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Customer research</h1>
    <p class="muted" style="margin:.25rem 0 0">${research.createdAt.slice(0, 16).replace('T', ' ')} · source: ${escapeHtml(research.source)}${research.source === 'rules' ? ' (category rules — set ANTHROPIC_API_KEY for model research)' : ''}</p></div></div>
  <div class="notice" style="margin-bottom:1rem"><strong>Positioning.</strong> ${escapeHtml(research.positioning)}</div>
  <div class="grid2"><div>
    <div class="card"><h2>Who buys</h2>
      ${research.audience.map((persona) => `<div style="border-top:1px solid var(--line);padding:.7rem 0">
        <div class="row" style="justify-content:space-between"><strong>${escapeHtml(persona.name)}</strong><span class="tag">${Math.round(persona.share * 100)}%</span></div>
        <p class="muted" style="font-size:12.5px;margin:.3rem 0">${escapeHtml(persona.who)}</p>
        <p style="font-size:12.5px;margin:.2rem 0"><span class="muted">Wants</span> ${escapeHtml(persona.wants)}</p>
        <p style="font-size:12.5px;margin:.2rem 0"><span class="muted">Fears</span> ${escapeHtml(persona.fears)}</p>
        <p style="font-size:12.5px;margin:.2rem 0"><span class="muted">Buys when</span> ${escapeHtml(persona.buysWhen)}</p></div>`).join('')}</div>
    <div class="card" style="padding:0"><div style="padding:1rem 1.1rem"><h2>Objections, answered</h2></div>
      <table class="data"><tbody>${research.objections.map((entry) => `<tr><td style="width:40%"><strong>${escapeHtml(entry.objection)}</strong></td><td class="muted">${escapeHtml(entry.answer)}</td></tr>`).join('')}</tbody></table></div>
    <div class="card" style="padding:0"><div style="padding:1rem 1.1rem"><h2>Competitors</h2></div>
      <table class="data"><thead><tr><th>Who</th><th>Angle</th><th>Price</th><th>Weakness</th></tr></thead><tbody>
      ${research.competitors.map((entry) => `<tr><td>${escapeHtml(entry.name)}</td><td class="muted">${escapeHtml(entry.angle)}</td><td>${escapeHtml(entry.priceBand)}</td><td class="muted">${escapeHtml(entry.weakness)}</td></tr>`).join('')}</tbody></table></div>
  </div>
  <div>
    ${runForm}
    <div class="card"><h2>Price anchor</h2>
      <div class="row" style="gap:1.4rem;margin:.5rem 0"><div><div class="eyebrow">Mass</div><div style="font-size:1.2rem">${format(research.priceAnchor.lowCents, ctx.store.currency)}</div></div>
        <div><div class="eyebrow">Us</div><div style="font-size:1.2rem;color:var(--accent)">${format(research.priceAnchor.midCents, ctx.store.currency)}</div></div>
        <div><div class="eyebrow">Bespoke</div><div style="font-size:1.2rem">${format(research.priceAnchor.highCents, ctx.store.currency)}</div></div></div>
      <p class="muted" style="font-size:12px">${escapeHtml(research.priceAnchor.note)}</p></div>
    <div class="card"><h2>Purchase triggers</h2><ul style="margin:.4rem 0 0;padding-left:1.1rem;font-size:12.5px">${research.triggers.map((trigger) => `<li>${escapeHtml(trigger)}</li>`).join('')}</ul></div>
    <div class="card"><h2>Keywords</h2><p style="margin:.4rem 0 0">${research.keywords.map((keyword) => `<span class="tag" style="margin:.15rem .15rem 0 0">${escapeHtml(keyword)}</span>`).join('')}</p></div>
    <div class="card"><h2>Proof points</h2><ul style="margin:.4rem 0 0;padding-left:1.1rem;font-size:12.5px">${research.proofPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul></div>
    ${research.sourceNotes.length ? `<div class="card"><h2>From the source</h2><ul style="margin:.4rem 0 0;padding-left:1.1rem;font-size:12.5px">${research.sourceNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>` : ''}
  </div></div>`
}

/* ------------------------------------------------------------------- ai page */

export function aiPage(ctx: Ctx, messages: ChatMessage[]): string {
  const runs = listRuns(ctx.db, ctx.store.id, 8)
  const counts = toolCountsByArea()
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Assistant</h1>
    <p class="muted" style="margin:.25rem 0 0">${listTools().length} tools across ${Object.keys(counts).length} areas. Every call is validated, audited, and refusable.</p></div></div>
  <div class="grid2"><div>
    <div class="card" style="max-height:56vh;overflow:auto">
      ${messages.length ? messages.map((message) => `<div style="margin-bottom:1rem">
        <div class="eyebrow">${message.role === 'user' ? 'You' : 'Assistant'}${message.page ? ` · ${escapeHtml(message.page)}` : ''}</div>
        <div style="margin-top:.3rem;white-space:pre-wrap">${escapeHtml(message.content)}</div>
        ${message.artifacts.map(renderArtifact).join('')}</div>`).join('')
        : '<p class="muted">Nothing yet. The panel on the right is the same conversation.</p>'}</div>
    <div class="card"><h2>Prompt library</h2>
      <div class="row" style="margin-top:.5rem">${PROMPT_LIBRARY.map((prompt) => `<button class="btn" type="button" onclick="askThis(${escapeHtml(JSON.stringify(prompt))})">${escapeHtml(prompt)}</button>`).join('')}</div></div>
  </div>
  <div>
    <div class="card"><h2>Tools by area</h2>
      <div class="bars" style="margin-top:.6rem">${Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([area, count]) => `<div class="barrow"><span>${escapeHtml(area)}</span>
          <span class="track"><span class="fill" style="width:${(count / Math.max(...Object.values(counts))) * 100}%"></span></span><span>${count}</span></div>`)
        .join('')}</div></div>
    <div class="card"><h2>Recent runs</h2>
      ${runs.map((run) => `<div style="border-top:1px solid var(--line);padding:.5rem 0">
        <div class="row" style="justify-content:space-between"><span style="font-size:12.5px">${escapeHtml(run.prompt.slice(0, 60))}</span>
          <span class="tag ${run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'bad' : 'warn'}">${run.status}</span></div>
        <div class="muted" style="font-size:11.5px">${run.steps.map((step) => `${escapeHtml(step.tool)}${step.status === 'failed' ? ' ✗' : ''}`).join(' · ')}</div></div>`).join('')
        || '<p class="muted" style="font-size:12px">No runs yet.</p>'}</div>
  </div></div>`
}
