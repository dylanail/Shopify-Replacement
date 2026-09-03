import { escapeHtml } from '../lib/http.ts'
import { format } from '../lib/money.ts'
import type { Db } from '../lib/db.ts'
import { listCollections, listProducts, lowStock } from '../domain/catalog.ts'
import { listCustomers, segment } from '../domain/customers.ts'
import { listOrders, getOrder } from '../domain/orders.ts'
import { listPromotions } from '../domain/promotions.ts'
import { listReviews, statsFor } from '../domain/reviews.ts'
import { listRegions } from '../domain/regions.ts'
import { environment, type Store } from '../control/stores.ts'
import { listTeam } from '../control/auth.ts'
import { listAudit } from '../control/todos.ts'
import { allPlugins, pluginCategories } from '../control/catalog-plugins.ts'
import { listInstalled } from '../control/plugins.ts'
import { catalog, resolvedModels } from '../agent/models.ts'
import { BENCHMARK, funnel, kpis, liveVisitors, recentEvents, revenueSeries } from '../analytics/events.ts'
import { listSends } from '../email/send.ts'
import { TEMPLATES } from '../email/templates.ts'
import { listSeoPages } from '../seo/schema.ts'
import { PROMPT_LIBRARY } from '../agent/chat.ts'
import { listRuns } from '../agent/runtime.ts'
import { latestResearch } from '../agent/research.ts'
import { listPages, type Page } from '../pages/store.ts'
import { DEFAULT_TIERS, listBundles } from '../domain/bundles.ts'
import { getInstalled, hasCredentials } from '../control/plugins.ts'
import { listAdSpend, listQuestions, marginFor, pendingStockAlerts, profitReport } from '../domain/ops.ts'
import { listFunnels } from '../domain/funnels.ts'
import { versionStats, versionsFor } from '../pages/versions.ts'
import { ADVERTORIAL_FORMATS, PDP_FORMATS } from '../agent/directions.ts'
import { salesSummary } from '../domain/orders.ts'
import { listTools, toolCountsByArea } from '../agent/registry.ts'
import { renderArtifact } from './shell.ts'
import { avatarOptions, avatarsCard, competitorsCard, regenerateCard } from './growth-pages.ts'
import { behaviourCard, funnelTestCard, healthCard, legalCard, popupCard, ripCard, suggestCard } from './plan-pages.ts'
import { domainsFor } from '../control/domains.ts'
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
  <form method="post" action="/admin/products/import" class="card row" style="align-items:flex-end">
    <div class="field" style="flex:2;margin:0"><label>Import a product from a URL — any Shopify store's product page, or a supplier page with Open Graph tags</label><input name="url" type="url" required placeholder="https://some-store.com/products/the-thing"></div>
    <div class="field" style="width:120px;margin:0"><label>Markup ×</label><input name="markup" value="2.5"></div>
    <label class="row" style="font-size:12px;margin:0 .5rem .6rem"><input type="checkbox" name="asSupplier" value="true" checked> Their price is my cost</label>
    <button class="btn primary" type="submit">Import</button></form>
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
      <p class="muted" style="font-size:11.5px;margin:.6rem 0 0">Your photo stays your photo: it is staged into the scene, and the original is kept in the gallery.</p></div>
    ${regenerateCard(ctx, product)}
    <div class="card"><h2>The page</h2>
      <p class="muted" style="font-size:12px;margin:.3rem 0">${product.content.benefits?.length ?? 0} benefits · ${product.content.comparison?.rows.length ?? 0}-row comparison · ${product.content.specs?.length ?? 0} specs · ${product.content.faq?.length ?? 0} questions${product.content.guarantee ? ' · guarantee' : ''}</p>
      ${product.content.benefits?.slice(0, 3).map((benefit) => `<p style="font-size:12.5px;margin:.25rem 0">— ${escapeHtml(benefit.title)}</p>`).join('') ?? ''}
      <form method="post" action="/admin/products/${escapeHtml(product.id)}/rewrite" style="margin-top:.6rem"><button class="btn" type="submit">Rewrite the page from research</button></form></div>
    <div class="card"><h2>Reviews</h2><p style="margin:.3rem 0 0">${stats.count ? `${stats.average} / 5 from ${stats.count}` : 'None yet'}</p>
      ${stats.summary.map((line) => `<p class="muted" style="font-size:12px;margin:.5rem 0 0">${escapeHtml(line)}</p>`).join('')}</div>
    <div class="card"><h2>SEO</h2>
      <p class="muted" style="font-size:12px">${escapeHtml(product.seo.title ?? product.title)}</p>
      <p class="muted" style="font-size:12px">${escapeHtml(product.seo.description ?? '')}</p></div>
  </div></div>
  <div class="grid2" style="margin-top:1rem">${supplierCard(ctx, product)}${versionsCard(ctx, product)}</div>`
}

function supplierCard(ctx: Ctx, product: ReturnType<typeof listProducts>[number]): string {
  const supplier = product.supplier
  const price = Math.min(...product.variants.map((variant) => variant.priceCents))
  const margin = marginFor(price, supplier)
  const currency = ctx.store.currency
  return `<div class="card"><h2>Supplier &amp; margin</h2>
    <form method="post" action="/admin/products/${escapeHtml(product.id)}/supplier">
      <div class="row"><div class="field" style="flex:1"><label>Supplier</label><input name="name" value="${escapeHtml(supplier.name ?? '')}" placeholder="AliExpress / CJ / Zendrop"></div>
        <div class="field" style="flex:2"><label>Supplier URL</label><input name="url" value="${escapeHtml(supplier.url ?? '')}" placeholder="https://"></div></div>
      <div class="row"><div class="field" style="flex:1"><label>Cost (minor units)</label><input name="costCents" value="${supplier.costCents ?? ''}"></div>
        <div class="field" style="flex:1"><label>Supplier shipping</label><input name="shippingCents" value="${supplier.shippingCents ?? ''}"></div>
        <div class="field" style="flex:1"><label>Supplier SKU</label><input name="sku" value="${escapeHtml(supplier.sku ?? '')}"></div></div>
      <div class="row"><div class="field" style="flex:1"><label>Processing days</label><input name="processingDays" value="${supplier.processingDays ?? ''}"></div>
        <div class="field" style="flex:1"><label>Ship days min</label><input name="shippingDaysMin" value="${supplier.shippingDaysMin ?? ''}"></div>
        <div class="field" style="flex:1"><label>Ship days max</label><input name="shippingDaysMax" value="${supplier.shippingDaysMax ?? ''}"></div></div>
      <div class="field"><label>Size chart (first line header, cells with |) — shown on the page</label><textarea name="sizeChart" rows="2">${escapeHtml(product.metadata.sizeChart ?? '')}</textarea></div>
      <button class="btn primary" type="submit">Save</button></form>
    <table class="data" style="margin-top:.8rem"><tr><td>Price</td><td style="text-align:right">${format(margin.priceCents, currency)}</td></tr>
      <tr><td>Cost</td><td style="text-align:right">−${format(margin.costCents, currency)}</td></tr><tr><td>Supplier shipping</td><td style="text-align:right">−${format(margin.shippingCents, currency)}</td></tr>
      <tr><td>Card fees</td><td style="text-align:right">−${format(margin.feesCents, currency)}</td></tr>
      <tr><td><strong>Profit per unit</strong></td><td style="text-align:right"><strong style="color:${margin.profitCents > 0 ? 'var(--ok)' : 'var(--bad)'}">${format(margin.profitCents, currency)} · ${margin.marginPercent}%</strong></td></tr></table>
    <p class="muted" style="font-size:11.5px;margin:.5rem 0 0">Before ad spend. The Profit page subtracts what you log there.</p></div>`
}

function versionsCard(ctx: Ctx, product: ReturnType<typeof listProducts>[number]): string {
  const stats = versionStats(ctx.db, ctx.store.id, product.id)
  const advertorials = versionsFor(ctx.db, ctx.store.id, product.id).filter((page) => page.role === 'advertorial')
  const currency = ctx.store.currency
  return `<div class="card"><h2>Versions &amp; split test</h2>
    <p class="muted" style="font-size:12px;margin:.3rem 0 .8rem">Product-page versions with a weight are in the test; a visitor is assigned one by their session and sees it every time. Weight 0 keeps it out.</p>
    ${stats.length ? `<table class="data"><thead><tr><th>Version</th><th>Weight</th><th>Views</th><th>Carts</th><th>Sales</th><th>CVR</th><th></th></tr></thead><tbody>
      ${stats.map((row) => `<tr><td><a href="/admin/pages/${escapeHtml(row.pageId)}/edit">${escapeHtml(row.title.replace(`${product.title} — `, ''))}</a><div class="muted" style="font-size:11px">${escapeHtml(row.format)} · ${row.status}</div></td>
        <td><form method="post" action="/admin/versions/${escapeHtml(row.pageId)}/weight" class="row" style="gap:.3rem"><input name="weight" value="${row.weight}" style="width:52px"><button class="btn" type="submit">Set</button></form></td>
        <td>${row.views}</td><td>${row.carts}</td><td>${row.purchases}${row.revenueCents ? `<div class="muted" style="font-size:11px">${format(row.revenueCents, currency)}</div>` : ''}</td><td>${(row.conversion * 100).toFixed(1)}%</td>
        <td><a class="btn" href="${escapeHtml(ctx.storeUrl)}/products/${escapeHtml(product.handle)}?version=${escapeHtml(row.pageId)}" target="_blank" rel="noopener">View</a></td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="font-size:12px">No versions yet — the built-in product page is what visitors see.</p>'}
    ${advertorials.length ? `<p class="muted" style="font-size:12px;margin-top:.6rem">Advertorials: ${advertorials.map((page) => `<a href="/admin/pages/${escapeHtml(page.id)}/edit">${escapeHtml(page.format)}</a>`).join(' · ')}</p>` : ''}
    <form method="post" action="/admin/products/${escapeHtml(product.id)}/versions" style="margin-top:1rem;border-top:1px solid var(--line);padding-top:.8rem">
      <div class="eyebrow" style="margin-bottom:.5rem">Generate versions</div>
      <div class="row"><div class="field" style="flex:1"><label>What</label><select name="kind"><option value="pdp">Product page versions</option><option value="advertorial">Advertorials</option></select></div>
        <div class="field" style="flex:1"><label>How many (if no formats picked)</label><input name="count" value="3"></div></div>
      <div class="field"><label>Formats (leave empty to let the direction choose)</label><div class="row" style="gap:.4rem .8rem;font-size:12px">${[...PDP_FORMATS.map((format) => ({ ...format, group: 'pdp' })), ...ADVERTORIAL_FORMATS.map((format) => ({ ...format, group: 'advertorial' }))].map((format) => `<label class="row" style="gap:.3rem" title="${escapeHtml(format.description)}"><input type="checkbox" name="formats" value="${format.group}:${format.id}"> ${escapeHtml(format.name)} <span class="muted">(${format.group})</span></label>`).join('')}</div></div>
      <div class="field"><label>Avatar — fills audience, angle and tone the direction leaves blank</label><select name="avatarId">${avatarOptions(ctx)}</select></div>
      <div class="field"><label>Direction — free-form. Tone words are read (urgent, premium, warm, clinical, playful, blunt); "quoted phrases" must appear; "for gift buyers" sets the audience; "focus on durability" sets the angle.</label><textarea name="direction" rows="2" placeholder="Premium and understated, for people who train seriously, focus on the repair guarantee"></textarea></div>
      <label class="row" style="font-size:12px;margin-bottom:.6rem"><input type="checkbox" name="publish" value="true"> Publish immediately</label>
      <button class="btn primary" type="submit">Generate</button></form></div>`
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
      <form method="post" action="/admin/orders/${escapeHtml(order.id)}/refund"><button class="btn" type="submit">Refund</button></form>
      ${order.fulfillmentStatus !== 'delivered' ? `<form method="post" action="/admin/orders/${escapeHtml(order.id)}/delivered"><button class="btn" type="submit">Mark delivered</button></form>` : ''}
    </div></div>
  <div class="card"><h2>Fulfil via supplier</h2>
    <form method="post" action="/admin/orders/${escapeHtml(order.id)}/supplier" class="row" style="align-items:flex-end">
      <div class="field" style="flex:1;margin:0"><label>Supplier</label><input name="supplier" value="${escapeHtml(order.supplierOrder.supplier ?? '')}" placeholder="AliExpress / CJ"></div>
      <div class="field" style="flex:1;margin:0"><label>Supplier order id</label><input name="orderId" value="${escapeHtml(order.supplierOrder.orderId ?? '')}"></div>
      <div class="field" style="width:110px;margin:0"><label>Cost paid</label><input name="costCents" value="${order.supplierOrder.costCents ?? ''}" placeholder="cents"></div>
      <div class="field" style="width:110px;margin:0"><label>Shipping paid</label><input name="shippingCents" value="${order.supplierOrder.shippingCents ?? ''}"></div>
      <div class="field" style="flex:1;margin:0"><label>Tracking number</label><input name="tracking" placeholder="LP…, 1Z…, 94…"></div>
      <div class="field" style="width:120px;margin:0"><label>Carrier (auto)</label><input name="carrier" placeholder="auto"></div>
      <button class="btn primary" type="submit">Save</button></form>
    <p class="muted" style="font-size:11.5px;margin:.6rem 0 0">Saving a tracking number marks the order shipped and emails the customer with a link; the carrier is detected from the number. The customer can follow it at ${escapeHtml(ctx.storeUrl)}/track.</p></div>
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
    </tbody></table></div>
  ${behaviourCard(ctx, range)}`
}

/* -------------------------------------------------------------------- reviews */

export function reviewsPage(ctx: Ctx, status: string): string {
  const reviews = listReviews(ctx.db, ctx.store.id, { status, limit: 100 })
  const products = new Map(listProducts(ctx.db, ctx.store.id, { limit: 300 }).map((product) => [product.id, product.title]))
  const questions = listQuestions(ctx.db, ctx.store.id, { status: 'pending' })
  const alerts = pendingStockAlerts(ctx.db, ctx.store.id)
  return `${flash(ctx)}<div class="head"><h1 class="serif">Reviews, questions &amp; alerts</h1></div>
  <div class="grid2" style="margin-bottom:1rem">
    <form method="post" action="/admin/reviews/import" enctype="multipart/form-data" class="card"><h2>Import reviews (CSV)</h2>
      <p class="muted" style="font-size:12px;margin:.3rem 0 .6rem">Loox, Judge.me and AliExpress exports: rating, body/review, author, photo URLs, product handle. Imported reviews are never marked verified.</p>
      <div class="row"><div class="field" style="flex:1"><label>CSV file</label><input type="file" name="csv" accept=".csv,text/csv" required></div>
        <div class="field" style="flex:1"><label>Attach all to</label><select name="productId"><option value="">— match by product column —</option>${[...products.entries()].map(([id, title]) => `<option value="${escapeHtml(id)}">${escapeHtml(title)}</option>`).join('')}</select></div></div>
      <button class="btn primary" type="submit">Import</button></form>
    <div><div class="card"><h2>Questions waiting (${questions.length})</h2>${questions.slice(0, 8).map((entry) => `<form method="post" action="/admin/questions/${escapeHtml(entry.id)}" style="border-top:1px solid var(--line);padding:.6rem 0">
      <div style="font-size:13px"><strong>${escapeHtml(entry.question)}</strong> <span class="muted">— ${escapeHtml(products.get(entry.productId) ?? '')}${entry.asker ? `, ${escapeHtml(entry.asker)}` : ''}</span></div>
      <div class="row" style="margin-top:.4rem"><input name="answer" placeholder="Answer" style="flex:1" required><button class="btn primary" type="submit">Answer</button><button class="btn" type="submit" name="hide" value="true">Hide</button></div></form>`).join('') || '<p class="muted" style="font-size:12px">None.</p>'}</div>
    <div class="card"><h2>Back-in-stock requests (${alerts.length})</h2>${alerts.slice(0, 8).map((alert) => `<div class="muted" style="font-size:12px;border-top:1px solid var(--line);padding:.35rem 0">${escapeHtml(alert.email)} · ${escapeHtml(alert.variant_id)} · ${alert.created_at.slice(0, 10)}</div>`).join('') || '<p class="muted" style="font-size:12px">None.</p>'}${alerts.length ? `<form method="post" action="/admin/stock-alerts/notify" style="margin-top:.6rem"><button class="btn" type="submit">Email everyone whose variant is back in stock</button></form>` : ''}</div></div></div>
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

export function storePage(ctx: Ctx, messages: ChatMessage[], health = false): string {
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
    </div></div>
  <div class="grid2" style="margin-top:1rem"><div>${healthCard(ctx, health)}</div><div>${popupCard(ctx)}${legalCard(ctx)}</div></div>
  ${messages.length ? '' : ''}`
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
  const regions = listRegions(ctx.db, ctx.store.id)
  const team = listTeam(ctx.db, ctx.store.id) as Array<{ email: string; role: string; status: string }>
  const audit = listAudit(ctx.db, ctx.store.id, 12) as Array<{ actor_type: string; action: string; created_at: string; target: string }>
  return `${flash(ctx)}<div class="head"><h1 class="serif">Settings</h1><a class="btn primary" href="/admin/settings/payments">Payments &amp; Stripe</a></div>
  <div class="grid2"><div>
    ${modelsCard(ctx)}
    <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Domains</h2><a class="btn primary" href="/admin/domains">Connect a domain</a></div>
      ${domainsFor(ctx.db, ctx.store.id).map((domain) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding:.5rem 0;margin-top:.5rem"><span>${escapeHtml(domain.hostname)}</span><span class="tag ${domain.status === 'verified' ? 'ok' : 'warn'}">${domain.status} · ${domain.mode}</span></div>`).join('')
        || `<p class="muted" style="font-size:12px;margin:.5rem 0 0">None yet. The store is live at its platform address; the Domains page has the records for Namecheap, GoDaddy, Cloudflare and the rest.</p>`}</div>
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
    <div class="card"><h2>Audit</h2>
      <p class="muted" style="font-size:11.5px">Every action, including the assistant's.</p>
      ${audit.map((entry) => `<div style="border-top:1px solid var(--line);padding:.35rem 0;font-size:12px">
        <span class="tag ${entry.actor_type === 'agent' ? 'warn' : ''}">${escapeHtml(entry.actor_type)}</span>
        ${escapeHtml(entry.action)} <span class="muted">${entry.created_at.slice(11, 19)}</span></div>`).join('')}</div>
  </div></div>`
}

/** Which model writes what for this store. */
function modelsCard(ctx: Ctx): string {
  const entries = catalog()
  const resolved = resolvedModels(ctx.db, ctx.store.id)
  const anyKey = entries.some((entry) => entry.available)
  return `<div class="card" id="models"><h2>Models</h2>
    <p class="muted" style="font-size:12px;margin:.3rem 0 .6rem">Research, the brand kit, product pages, versions, ads and the assistant are each written by a model. Pick one per job for this store, or leave the default from the environment.${anyKey ? '' : ' <strong>No model key is configured</strong>: set ANTHROPIC_API_KEY or OPENAI_API_KEY and everything below switches from the rules writers to a model.'}</p>
    <form method="post" action="/admin/settings/models">
      ${resolved.map((row) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding:.5rem 0">
        <div style="flex:1"><div style="font-size:13px">${escapeHtml(row.name)}</div><div class="muted" style="font-size:11.5px">${escapeHtml(row.note)} Now: ${escapeHtml(row.label)}.</div></div>
        <select name="${row.task}" style="width:220px"><option value="">Default</option>${entries.map((entry) => `<option value="${entry.provider}:${escapeHtml(entry.model)}" ${row.stored === `${entry.provider}:${entry.model}` ? 'selected' : ''} ${entry.available ? '' : 'disabled'}>${escapeHtml(entry.name)}${entry.available ? '' : ' (no key)'}</option>`).join('')}</select></div>`).join('')}
      <div class="row" style="margin-top:.6rem"><button class="btn primary" type="submit">Save</button></div></form>
    <p class="muted" style="font-size:11.5px;margin:.6rem 0 0">${entries.filter((entry) => entry.available).map((entry) => `${escapeHtml(entry.name)}: ${escapeHtml(entry.note)}`).join(' · ') || 'Model ids live in configuration: AMBORAS_MODEL for Claude, AMBORAS_OPENAI_MODEL for GPT.'}</p></div>`
}

/* --------------------------------------------------------------- profit */

export function profitPage(ctx: Ctx, days: number): string {
  const report = profitReport(ctx.db, ctx.store.id, days)
  const spend = listAdSpend(ctx.db, ctx.store.id, days)
  const currency = ctx.store.currency
  const peak = Math.max(1, ...report.perDay.map((day) => Math.abs(day.profit)))
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Profit</h1><p class="muted" style="margin:.25rem 0 0">Revenue less refunds, supplier cost, supplier shipping, card fees and the ad spend you log. Nothing estimated.</p></div>
    <form method="get"><select name="days" onchange="this.form.submit()">${[7, 14, 30, 90].map((option) => `<option value="${option}" ${option === days ? 'selected' : ''}>Last ${option} days</option>`).join('')}</select></form></div>
  <div class="kpis"><div class="kpi"><div class="label">Revenue</div><div class="value">${format(report.revenueCents, currency)}</div><div class="delta">${report.orders} orders</div></div>
    <div class="kpi"><div class="label">COGS + supplier shipping</div><div class="value">−${format(report.cogsCents + report.supplierShippingCents, currency)}</div></div>
    <div class="kpi"><div class="label">Ad spend</div><div class="value">−${format(report.adSpendCents, currency)}</div><div class="delta">${report.roas !== null ? `ROAS ${report.roas}×` : 'log spend below'}</div></div>
    <div class="kpi"><div class="label">Fees + refunds</div><div class="value">−${format(report.feesCents + report.refundsCents, currency)}</div></div>
    <div class="kpi"><div class="label">Net profit</div><div class="value" style="color:${report.profitCents >= 0 ? 'var(--ok)' : 'var(--bad)'}">${format(report.profitCents, currency)}</div><div class="delta ${report.profitCents < 0 ? 'neg' : ''}">${report.revenueCents ? Math.round((report.profitCents / report.revenueCents) * 100) : 0}% margin</div></div></div>
  <div class="grid2"><div class="card"><h2>Profit by day</h2><div class="spark" style="margin-top:.7rem;height:64px">${report.perDay.map((day) => `<i style="height:${Math.max(2, (Math.abs(day.profit) / peak) * 64)}px;background:${day.profit >= 0 ? 'var(--ok)' : 'var(--bad)'}" title="${day.day}: ${format(day.profit, currency)} (rev ${format(day.revenue, currency)}, spend ${format(day.spend, currency)})"></i>`).join('') || '<span class="muted">No orders in the window.</span>'}</div></div>
  <div><form method="post" action="/admin/profit/spend" class="card"><h2>Log ad spend</h2>
    <div class="row" style="margin-top:.6rem"><div class="field" style="flex:1"><label>Day</label><input name="day" type="date" value="${new Date().toISOString().slice(0, 10)}"></div><div class="field" style="flex:1"><label>Platform</label><select name="platform"><option>Meta</option><option>TikTok</option><option>Google</option><option>Other</option></select></div><div class="field" style="flex:1"><label>Amount (minor units)</label><input name="amountCents" required placeholder="15000"></div></div>
    <div class="field"><label>Note</label><input name="note" placeholder="Campaign, creative…"></div><button class="btn primary" type="submit">Log</button></form>
    <div class="card" style="padding:0"><table class="data"><thead><tr><th>Day</th><th>Platform</th><th>Spend</th><th>Note</th></tr></thead><tbody>${spend.slice(0, 20).map((row) => `<tr><td>${row.day}</td><td>${escapeHtml(row.platform)}</td><td>${format(row.amount_cents, currency)}</td><td class="muted">${escapeHtml(row.note)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted" style="padding:1rem">Nothing logged yet.</td></tr>'}</tbody></table></div></div></div>`
}

/* --------------------------------------------------------------- funnels */

export function funnelsPage(ctx: Ctx): string {
  const funnels = listFunnels(ctx.db, ctx.store.id)
  const products = listProducts(ctx.db, ctx.store.id, { status: 'published', limit: 100 })
  const pages = listPages(ctx.db, ctx.store.id)
  const variantOptions = (selected?: string) => `<option value="">— pick automatically —</option>` + products.flatMap((product) => product.variants.map((variant) => `<option value="${escapeHtml(variant.id)}" ${variant.id === selected ? 'selected' : ''}>${escapeHtml(product.title)} — ${escapeHtml(variant.title)} (${format(variant.priceCents, ctx.store.currency)})</option>`)).join('')
  const pageOptions = (role: string, selected?: string) => `<option value="">— none —</option>` + pages.filter((page) => page.role === role || page.kind === role || role === 'any').map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === selected ? 'selected' : ''}>${escapeHtml(page.title)}</option>`).join('')
  const form = (funnel?: ReturnType<typeof listFunnels>[number]) => `<form method="post" action="/admin/funnels" class="card">
    ${funnel ? `<input type="hidden" name="id" value="${escapeHtml(funnel.id)}">` : ''}
    <h2>${funnel ? escapeHtml(funnel.name) : 'New funnel'}</h2>
    <div class="row" style="margin-top:.6rem"><div class="field" style="flex:1"><label>Name</label><input name="name" value="${escapeHtml(funnel?.name ?? '')}" required></div>
      <div class="field" style="flex:1"><label>Product (the checkout finds the funnel through it)</label><select name="productId"><option value="">any</option>${products.map((product) => `<option value="${escapeHtml(product.id)}" ${product.id === funnel?.productId ? 'selected' : ''}>${escapeHtml(product.title)}</option>`).join('')}</select></div></div>
    <div class="row"><div class="field" style="flex:1"><label>1 · Advertorial page</label><select name="advertorialPageId">${pageOptions('advertorial', funnel?.advertorialPageId)}</select></div>
      <div class="field" style="flex:1"><label>2 · Offer page</label><select name="offerPageId">${pageOptions('any', funnel?.offerPageId)}</select></div></div>
    <div class="eyebrow" style="margin:.4rem 0">3 · Checkout order bump</div>
    <div class="row"><div class="field" style="flex:2"><label>Bump product (default: shipping protection)</label><select name="bumpVariantId">${variantOptions(funnel?.bump.variantId)}</select></div>
      <div class="field" style="flex:1"><label>Label</label><input name="bumpLabel" value="${escapeHtml(funnel?.bump.label ?? '')}" placeholder="Protect my order"></div><div class="field" style="width:110px"><label>Price</label><input name="bumpPriceCents" value="${funnel?.bump.priceCents ?? ''}" placeholder="299"></div></div>
    <div class="eyebrow" style="margin:.4rem 0">4 · One-click upsell</div>
    <div class="row"><div class="field" style="flex:2"><label>Product</label><select name="upsellVariantId">${variantOptions(funnel?.upsell.variantId)}</select></div><div class="field" style="width:110px"><label>% off</label><input name="upsellDiscount" value="${funnel?.upsell.discountPercent ?? 20}"></div></div>
    <div class="field"><label>Headline</label><input name="upsellHeadline" value="${escapeHtml(funnel?.upsell.headline ?? '')}" placeholder="Add a second pair for 20% off?"></div>
    <div class="eyebrow" style="margin:.4rem 0">5 · Downsell (only if the upsell is declined)</div>
    <div class="row"><div class="field" style="flex:2"><label>Product</label><select name="downsellVariantId">${variantOptions(funnel?.downsell.variantId)}</select></div><div class="field" style="width:110px"><label>% off</label><input name="downsellDiscount" value="${funnel?.downsell.discountPercent ?? ''}" placeholder="35"></div></div>
    <div class="field"><label>Headline</label><input name="downsellHeadline" value="${escapeHtml(funnel?.downsell.headline ?? '')}" placeholder="How about the wraps instead, 35% off?"></div>
    <div class="eyebrow" style="margin:.4rem 0">6 · Split test</div>
    <div class="row"><div class="field" style="flex:2"><label>Test group (funnels sharing a name split the traffic at /go/&lt;group&gt;)</label><input name="testGroup" value="${escapeHtml(funnel?.testGroup ?? '')}" placeholder="spring-offer"></div><div class="field" style="width:110px"><label>Weight</label><input name="weight" value="${funnel?.weight ?? 0}"></div></div>
    <div class="row"><button class="btn primary" type="submit">${funnel ? 'Save' : 'Create funnel'}</button>${funnel ? `<a class="btn" href="${escapeHtml(ctx.storeUrl)}/pages/${escapeHtml(pages.find((page) => page.id === funnel.advertorialPageId)?.handle ?? '')}" target="_blank" rel="noopener">Open step 1 ↗</a>` : ''}</div></form>
    ${funnel ? `<form method="post" action="/admin/funnels/${escapeHtml(funnel.id)}/delete" style="margin:-.6rem 0 1rem"><button class="btn" type="submit">Delete funnel</button></form>` : ''}`
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Funnels</h1><p class="muted" style="margin:.25rem 0 0">Ad → advertorial → offer → checkout with a bump → upsell → downsell → thank you. The pages are yours; the checkout, the offers and the thank-you page read the funnel.</p></div></div>
  <div class="grid2"><div>${funnels.map((funnel) => form(funnel)).join('') || '<div class="card"><p class="muted">No funnels yet. Create one on the right; the seed store has one already if you re-seed.</p></div>'}</div><div>${form()}${funnelTestCard(ctx)}</div></div>`
}

/* ------------------------------------------------------------ pages hub */

export function pagesPage(ctx: Ctx): string {
  const pages = listPages(ctx.db, ctx.store.id)
  const products = listProducts(ctx.db, ctx.store.id, { status: 'published', limit: 50 })
  const productOptions = products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.title)}</option>`).join('')
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Pages &amp; funnels</h1>
    <p class="muted" style="margin:.25rem 0 0">Landing pages, advertorials, offers — built from blocks, written as HTML, or cloned from a page you point at.</p></div></div>
  <div class="grid3" style="margin-bottom:1.2rem">
    <form method="post" action="/admin/pages/new" class="card"><h2>Start from a template</h2>
      <div class="field" style="margin-top:.6rem"><label>Template</label><select name="template"><option value="offer">Offer page (the funnel landing page)</option><option value="advertorial">Advertorial (listicle)</option><option value="quiz">Quiz funnel</option><option value="landing">Product landing page</option><option value="blank">Blank</option></select></div>
      <div class="field"><label>Product</label><select name="productId"><option value="">— none —</option>${productOptions}</select></div>
      <div class="field"><label>Title</label><input name="title" placeholder="5 reasons people are switching"></div>
      <button class="btn primary" type="submit">Create and open the editor</button></form>
    <form method="post" action="/admin/pages/clone" class="card"><h2>Clone a reference page</h2>
      <p class="muted" style="font-size:12px;margin:.3rem 0 .6rem">Paste any URL. Its stylesheets are inlined, every link and image made absolute, images copied into your uploads. You get the page, as HTML, to edit or use as a template.</p>
      <div class="field"><label>URL</label><input name="url" type="url" required placeholder="https://"></div>
      <label class="row" style="font-size:12px;margin-bottom:.6rem"><input type="checkbox" name="keepScripts" value="true"> Keep scripts (pixels, chat widgets, the source's app)</label>
      <button class="btn primary" type="submit">Clone it</button></form>
    <form method="post" action="/admin/pages/html" class="card"><h2>Paste raw HTML</h2>
      <div class="field" style="margin-top:.6rem"><label>Title</label><input name="title" placeholder="My page" required></div>
      <div class="field"><label>HTML</label><textarea name="html" rows="5" placeholder="<!doctype html>…"></textarea></div>
      <button class="btn primary" type="submit">Create</button></form>
  </div>
  <div class="grid2" style="margin-bottom:1.2rem">${ripCard(ctx)}${suggestCard(ctx)}</div>
  <div class="card" style="padding:0"><table class="data"><thead><tr><th>Page</th><th>Kind</th><th>Mode</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>
  ${pages.length ? pages.map((page) => `<tr><td><a href="/admin/pages/${escapeHtml(page.id)}/edit">${escapeHtml(page.title)}</a>${page.isHome ? ' <span class="tag ok">home</span>' : ''}<div class="muted" style="font-size:11.5px">/pages/${escapeHtml(page.handle)}${page.sourceUrl ? ` · cloned from ${escapeHtml(page.sourceUrl.replace(/^https?:\/\//, '').slice(0, 40))}` : ''}</div></td>
    <td>${escapeHtml(page.kind)}</td><td>${page.mode === 'html' ? 'HTML' : `${page.blocks.length} blocks`}</td>
    <td><span class="tag ${page.status === 'published' ? 'ok' : 'warn'}">${page.status}</span></td><td class="muted">${page.updatedAt.slice(0, 16).replace('T', ' ')}</td>
    <td style="text-align:right"><div class="row" style="justify-content:flex-end"><a class="btn" href="/admin/pages/${escapeHtml(page.id)}/edit">Edit</a>
      <a class="btn" href="${escapeHtml(ctx.storeUrl)}/pages/${escapeHtml(page.handle)}" target="_blank" rel="noopener">View ↗</a>
      <form method="post" action="/admin/pages/${escapeHtml(page.id)}/duplicate"><button class="btn">Duplicate</button></form>
      <form method="post" action="/admin/pages/${escapeHtml(page.id)}/delete" onsubmit="return confirm('Delete this page?')"><button class="btn">Delete</button></form></div></td></tr>`).join('')
    : '<tr><td colspan="6" class="muted" style="padding:1.4rem">No pages yet. Start from the advertorial template, clone a page, or paste HTML.</td></tr>'}
  </tbody></table></div>`
}

/* --------------------------------------------------------------- bundles */

export function bundlesPage(ctx: Ctx): string {
  const bundles = listBundles(ctx.db, ctx.store.id)
  const products = listProducts(ctx.db, ctx.store.id, { status: 'published', limit: 100 })
  const titles = new Map(products.map((product) => [product.id, product]))
  const tiersField = (tiers: typeof DEFAULT_TIERS) => tiers.map((tier) => `${tier.quantity}|${tier.discountPercent}|${tier.label}|${tier.badge ?? ''}|${tier.freeShipping ? 'ship' : ''}|${tier.giftVariantId ?? ''}|${tier.giftLabel ?? ''}`).join('\n')
  const variantOptions = products.flatMap((product) => product.variants.map((variant) => `<option value="${escapeHtml(variant.id)}">${escapeHtml(product.title)} — ${escapeHtml(variant.title)}</option>`)).join('')
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Bundles</h1>
    <p class="muted" style="margin:.25rem 0 0">Quantity breaks on the product page: buy 1, buy 2 and save, buy 3 and save more with free shipping and a gift. The tiers are enforced in the cart, not just drawn on the page.</p></div></div>
  <div class="grid2"><div>
    ${bundles.length ? bundles.map((bundle) => { const product = titles.get(bundle.productId); return `<div class="card"><div class="row" style="justify-content:space-between"><h2>${escapeHtml(product?.title ?? bundle.productId)}</h2><span class="tag ${bundle.status === 'active' ? 'ok' : ''}">${bundle.status}</span></div>
      <table class="data" style="margin:.5rem 0"><thead><tr><th>Tier</th><th>Qty</th><th>Off</th><th>Badge</th><th>Unlocks</th></tr></thead><tbody>${bundle.tiers.map((tier) => `<tr><td>${escapeHtml(tier.label)}</td><td>${tier.quantity}</td><td>${tier.discountPercent}%</td><td>${escapeHtml(tier.badge ?? '—')}</td><td class="muted">${[tier.freeShipping ? 'free shipping' : '', tier.giftVariantId ? `gift: ${escapeHtml(tier.giftLabel || tier.giftVariantId)}` : ''].filter(Boolean).join(', ') || '—'}</td></tr>`).join('')}</tbody></table>
      <div class="row"><a class="btn" href="${escapeHtml(ctx.storeUrl)}/products/${escapeHtml(product?.handle ?? '')}" target="_blank" rel="noopener">See it on the page ↗</a>
        <form method="post" action="/admin/bundles/${escapeHtml(bundle.id)}/delete"><button class="btn">Remove</button></form></div></div>` }).join('')
      : '<div class="card"><p class="muted">No bundles yet. Create one on the right — it appears on that product page and in any "Bundle offer" block.</p></div>'}
  </div>
  <form method="post" action="/admin/bundles" class="card"><h2>Create or replace a bundle</h2>
    <div class="field" style="margin-top:.6rem"><label>Product</label><select name="productId" required>${products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.title)}</option>`).join('')}</select></div>
    <div class="field"><label>Widget title</label><input name="title" value="Bundle & save"></div>
    <div class="field"><label>Tiers — one per line: quantity | % off | label | badge | ship (for free shipping) | gift variant id | gift label</label>
      <textarea name="tiers" rows="4">${escapeHtml(tiersField(DEFAULT_TIERS))}</textarea></div>
    <div class="field"><label>Gift variant on the top tier (optional)</label><select name="giftVariantId"><option value="">— none —</option>${variantOptions}</select></div>
    <div class="field"><label>Gift label</label><input name="giftLabel" placeholder="Free hand wraps"></div>
    <div class="row"><div class="field" style="flex:1"><label>Layout</label><select name="layout"><option value="stacked">Stacked</option><option value="row">Side by side</option></select></div>
      <div class="field" style="flex:1"><label>Accent colour</label><input name="accent" placeholder="#7a4a2b"></div></div>
    <button class="btn primary" type="submit">Save bundle</button></form></div>`
}

/* -------------------------------------------------------------- payments */

export function paymentsPage(ctx: Ctx): string {
  const stripe = getInstalled(ctx.db, ctx.store.id, 'stripe')
  const connected = Boolean(stripe && hasCredentials(ctx.db, ctx.store.id, 'stripe'))
  const webhookUrl = `${ctx.storeUrl.startsWith('http') ? ctx.storeUrl : '{your store address}'}/webhooks/stripe`
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Payments</h1>
    <p class="muted" style="margin:.25rem 0 0">One-page checkout with express buttons, Apple Pay, Google Pay, Link and cards through Stripe. Money goes to your Stripe account; the platform fee is billed separately.</p></div>
    <span class="tag ${connected ? 'ok' : 'warn'}">${connected ? 'Stripe connected' : 'Demo mode — orders place without a charge'}</span></div>
  <div class="grid2"><form method="post" action="/admin/plugins/stripe/settings" class="card"><h2>Stripe keys</h2>
    <div class="field" style="margin-top:.6rem"><label>Publishable key</label><input name="publishableKey" value="${escapeHtml(String(stripe?.settings.publishableKey ?? ''))}" placeholder="pk_live_…" required></div>
    <div class="field"><label>Secret key ${connected ? '<span class="muted">— sealed; paste again to replace</span>' : ''}</label><input name="secretKey" placeholder="sk_live_…" ${connected ? '' : 'required'}></div>
    <div class="field"><label>Webhook signing secret</label><input name="webhookSecret" placeholder="whsec_…"></div>
    <div class="field"><label>Capture</label><select name="captureMode"><option ${stripe?.settings.captureMode === 'automatic' ? 'selected' : ''}>automatic</option><option ${stripe?.settings.captureMode === 'manual' ? 'selected' : ''}>manual</option></select></div>
    <label class="row" style="font-size:12px;margin-bottom:.7rem"><input type="checkbox" name="saveCards" value="true" ${stripe?.settings.saveCards !== false ? 'checked' : ''}> Save cards for one-click post-purchase offers</label>
    <button class="btn primary" type="submit">${connected ? 'Update' : 'Connect Stripe'}</button></form>
  <div>
    <div class="card"><h2>What the checkout does</h2><ul style="margin:.4rem 0 0;padding-left:1.1rem;font-size:12.5px;color:var(--muted)">
      <li>Express row at the top: Apple Pay, Google Pay and Link appear on devices that have them</li>
      <li>Contact → delivery → shipping method → payment, one page, one button</li>
      <li>Order summary on the right; collapsed to one line on a phone</li>
      <li>Buy-now from any product page or buy box skips the cart</li>
      <li>After payment, one post-purchase offer, charged to the saved card in one click</li>
      <li>Refunds from the order page go back through Stripe when the order was paid there</li></ul></div>
    <div class="card"><h2>Webhook</h2><p class="muted" style="font-size:12px">Add an endpoint in Stripe pointing at:</p><code style="font-size:12px;word-break:break-all">${escapeHtml(webhookUrl)}</code>
      <p class="muted" style="font-size:12px;margin-top:.6rem">Events: <code>payment_intent.succeeded</code>, <code>charge.refunded</code>. Paste its signing secret above. Unsigned deliveries are rejected.</p></div>
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
    return `<div class="card" style="display:flex;flex-direction:column;gap:.5rem">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div class="row">${store.brand.logoSvg ? `<img src="${escapeHtml(store.brand.logoSvg)}" alt="" style="width:36px;height:36px;border-radius:8px">` : ''}
          <div><h2>${escapeHtml(store.name)}</h2><div class="muted" style="font-size:11.5px">${escapeHtml(store.brand.slogan ?? '')}</div></div></div>
        <span class="tag ${store.status === 'live' ? 'ok' : 'warn'}">${store.status}</span></div>
      <div class="muted" style="font-size:12px">${products} products · ${sales.orders} orders / 30d · ${format(sales.revenueCents, store.currency)}</div>
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
    return `${flash(ctx)}<div class="head"><h1 class="serif">Customer research</h1></div><div class="grid2">${runForm}<div class="card"><p class="muted">Nothing on file yet. Stores built through onboarding get this automatically; this one was not, or it was reset.</p></div></div>
    <div style="margin-top:1rem">${competitorsCard(ctx)}${avatarsCard(ctx)}</div>`
  }
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Customer research</h1>
    <p class="muted" style="margin:.25rem 0 0">${research.createdAt.slice(0, 16).replace('T', ' ')} · ${research.source === 'rules' ? 'from category rules — set ANTHROPIC_API_KEY or OPENAI_API_KEY and run again for real research' : `written by ${escapeHtml(research.model || 'a model')}${research.source === 'model+site' ? ', with your site read in' : ''}`}</p></div></div>
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
  </div></div>
  <div class="grid2" style="margin-top:1rem"><div>${avatarsCard(ctx)}</div><div>${competitorsCard(ctx)}</div></div>`
}

/* ------------------------------------------------------------------- ai page */

export function aiPage(ctx: Ctx, messages: ChatMessage[]): string {
  const runs = listRuns(ctx.db, ctx.store.id, 8)
  const counts = toolCountsByArea()
  return `${flash(ctx)}<div class="head"><div><h1 class="serif">Assistant</h1>
    <p class="muted" style="margin:.25rem 0 0">${listTools().length} tools across ${Object.keys(counts).length} areas. Every call is validated against its schema and audited; it edits the draft, and publishing is yours.</p></div></div>
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
