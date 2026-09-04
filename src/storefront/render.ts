import { escapeHtml } from '../lib/http.ts'
import { format } from '../lib/money.ts'
import type { Db } from '../lib/db.ts'
import type { Collection } from '../domain/catalog.ts'
import type { Product } from '../domain/types.ts'
import type { Cart } from '../domain/cart.ts'
import type { Totals } from '../domain/types.ts'
import type { Order } from '../domain/types.ts'
import { listReviews, statsFor, type Review, type ReviewStats } from '../domain/reviews.ts'
import { BUNDLE_CSS, bundleFor, renderBundleWidget } from '../domain/bundles.ts'
import type { Region } from '../domain/regions.ts'
import { renderSlot } from '../control/plugins.ts'
import { PAGE_CSS, blockContextFor, renderPageBody, type Page } from '../pages/store.ts'
import type { BlockContext } from '../pages/blocks.ts'
import { deliveryEstimate, viewersNow, listQuestions, type TrackingView } from '../domain/ops.ts'
import { getProduct } from '../domain/catalog.ts'
import { legalFor } from './legal.ts'
import type { ResolvedBump, ResolvedOffer } from '../domain/funnels.ts'
import type { Store, StoreEnvironment } from '../control/stores.ts'
import { breadcrumbJsonLd, jsonLdTag, metaTags, productJsonLd } from '../seo/schema.ts'
import { fontLink, themeCss } from './theme.ts'
import { popupHtml, trackingScript } from './behaviour.ts'

export type StoreView = {
  db: Db
  store: Store
  env: StoreEnvironment
  base: string
  preview: boolean
  cart: Cart | null
  totals: Totals | null
}

const money = (cents: number, view: StoreView) => format(cents, view.totals?.currency ?? view.store.currency)

function stars(rating: number): string {
  const full = Math.round(rating)
  return `${'★'.repeat(full)}${'☆'.repeat(5 - full)}`
}

/* --------------------------------------------------------------------- chrome */

export function layout(
  view: StoreView,
  page: { title: string; description: string; body: string; jsonLd?: Array<Record<string, unknown>>; image?: string; canonical?: string; bare?: boolean; head?: string },
): string {
  const { store, env } = view
  const brand = store.brand
  const cartCount = view.cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  const nav = env.theme.nav.length ? env.theme.nav : [{ label: 'Shop', href: '/collections/all' }]
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${metaTags({ title: page.title, description: page.description, url: page.canonical ?? view.base, ...(page.image ? { image: page.image } : {}) })}
${fontLink(brand)}
<style>${themeCss(brand, env.theme)}${BUNDLE_CSS}${PAGE_CSS}</style>
${env.theme.customCss ? `<style data-store-css>${env.theme.customCss.replace(/<\/style/gi, '')}</style>` : ''}
${page.jsonLd?.length ? jsonLdTag(page.jsonLd) : ''}
${page.head ?? ''}
${renderSlot(view.db, store.id, 'headEnd', {}, { preview: view.preview })}
</head><body data-cart-subtotal="${view.totals?.subtotalCents ?? 0}">
<a class="skip" href="#main">Skip to content</a>
${view.preview ? '<div class="announce" style="background:#1a1a1a">DRAFT PREVIEW — not what customers see</div>' : ''}
${page.bare ? '' : `${brand.announcement ? `<div class="announce">${escapeHtml(brand.announcement)}</div>` : ''}
${renderSlot(view.db, store.id, 'announcementBar', {}, { preview: view.preview })}
<header class="site"><div class="wrap row">
  <a class="brandmark" href="${view.base}/">
    ${brand.logoSvg ? `<img src="${escapeHtml(brand.logoSvg)}" alt="">` : ''}
    <span><span class="name">${escapeHtml(store.name)}</span>${brand.slogan ? `<br><span class="sub">${escapeHtml(brand.slogan)}</span>` : ''}</span>
  </a>
  <nav class="main" aria-label="Main">${nav.map((entry) => `<a href="${view.base}${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a>`).join('')}</nav>
  <div class="tools"><a href="${view.base}/cart" style="text-decoration:none">Cart (${cartCount})</a></div>
</div></header>`}
<main id="main" tabindex="-1">${page.body}</main>
${page.bare ? '' : `<footer class="site"><div class="wrap">
  <div>
    <div class="word">${escapeHtml(store.name)}</div>
    <p style="opacity:.75;margin-top:.8rem;max-width:34ch">${escapeHtml(brand.description ?? '')}</p>
  </div>
  <div><div class="eyebrow" style="color:inherit;opacity:.6">Shop</div>${nav.map((entry) => `<a href="${view.base}${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a>`).join('')}</div>
  <div><div class="eyebrow" style="color:inherit;opacity:.6">Help</div>
    <a href="${view.base}/pages/shipping">Shipping &amp; returns</a>
    <a href="${view.base}/pages/about">About</a>
    <a href="${view.base}/pages/privacy">Privacy</a>
    <a href="${view.base}/pages/terms">Terms</a>
    <a href="${view.base}/cart">Cart</a></div>
</div></footer>`}
${page.bare ? '' : popupHtml(view.base, env.theme.popup)}
${view.preview ? '' : trackingScript(view.base)}
${env.theme.customJs ? `<script data-store-js>${env.theme.customJs.replace(/<\/script/gi, '<\\/script')}</script>` : ''}
${renderSlot(view.db, store.id, 'bodyEnd', {}, { preview: view.preview })}
</body></html>`
}

/* ---------------------------------------------------------------- pages */

/** A built page. Block pages bring their own header and footer; the theme supplies tokens and the cart. */
export function blockPage(view: StoreView, page: Page): string {
  const context = blockContextFor(view.db, view.store, view.base)
  return layout(view, {
    title: page.seo.title || `${page.title} — ${view.store.name}`,
    description: page.seo.description || page.title,
    body: renderPageBody(page, context),
    ...(page.seo.image ? { image: page.seo.image } : {}),
    canonical: `${view.base}/pages/${page.handle}`,
    bare: true,
    head: page.headHtml,
  })
}

/** A cloned or hand-written HTML page is served as-is, with only the draft banner added in preview. */
export function htmlPage(view: StoreView, page: Page): string {
  const html = page.rawHtml || '<!doctype html><title>Empty page</title><p>This page has no HTML yet.</p>'
  if (!view.preview) return html
  const banner = '<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a1a1a;color:#fff;font:500 11px/1 system-ui;letter-spacing:.18em;text-transform:uppercase;text-align:center;padding:.7rem">Draft preview — not what customers see</div>'
  return html.includes('<body') ? html.replace(/<body[^>]*>/i, (match) => `${match}${banner}`) : banner + html
}

/* ----------------------------------------------------------------------- home */

export function home(view: StoreView, input: { featured: Product[]; collections: Collection[] }): string {
  const { store, env } = view
  const theme = env.theme
  const hero = theme.heroImage ?? input.featured[0]?.heroImage ?? ''
  const headline = theme.heroHeadline ?? store.name.toUpperCase()
  const sub = theme.heroSub ?? store.brand.slogan ?? ''
  const sections: Record<string, () => string> = {
    hero: () => `<div class="hero">${hero ? `<img src="${escapeHtml(hero)}" alt="">` : ''}
      <div class="inner"><h1>${escapeHtml(headline)}</h1><p>${escapeHtml(sub)}</p>
      <p style="margin-top:1.6rem"><a class="btn" href="${view.base}/collections/all">Shop everything</a></p></div></div>`,
    featured: () =>
      input.featured.length
        ? `<section class="wrap"><div class="section-head"><div><div class="eyebrow">The work</div><h2>What we make</h2></div>
           <a href="${view.base}/collections/all" style="text-decoration:none" class="eyebrow">All products &rarr;</a></div>
           <div class="grid">${input.featured.map((product) => productCard(view, product)).join('')}</div></section>`
        : '',
    story: () =>
      store.brand.description
        ? `<section class="wrap" style="max-width:min(760px,92vw)"><div class="eyebrow">Why</div>
           <h2 style="margin:.6rem 0 1.2rem">${escapeHtml(store.brand.slogan ?? '')}</h2>
           <p class="prose">${escapeHtml(store.brand.description)}</p></section>`
        : '',
    'collection-grid': () =>
      input.collections.length
        ? `<section class="wrap"><div class="section-head"><h2>Collections</h2></div><div class="grid">
           ${input.collections
             .map(
               (collection) => `<a class="card" href="${view.base}/collections/${escapeHtml(collection.handle)}">
                 <div class="body"><div class="title">${escapeHtml(collection.title)}</div>
                 <div class="sub">${escapeHtml(collection.description || `${collection.productIds.length} products`)}</div></div></a>`,
             )
             .join('')}</div></section>`
        : '',
    reviews: () => '',
    newsletter: () => `<section class="wrap" style="text-align:center">
      <div class="eyebrow">Stay in touch</div><h2 style="margin:.6rem 0 1rem">One email when there is something to say</h2>
      <form method="post" action="${view.base}/subscribe" style="display:flex;gap:.6rem;max-width:26rem;margin-inline:auto">
        <input name="email" type="email" required placeholder="you@example.com" aria-label="Email">
        <button class="btn" type="submit">Join</button></form></section>`,
  }
  const body = theme.sections
    .map((section) => sections[section]?.() ?? '')
    .join('\n')
  return layout(view, {
    title: `${store.name} — ${store.brand.slogan ?? 'Shop'}`,
    description: store.brand.description ?? store.name,
    body,
    ...(hero ? { image: hero } : {}),
    canonical: `${view.base}/`,
  })
}

export function productCard(view: StoreView, product: Product): string {
  const from = Math.min(...product.variants.map((variant) => variant.priceCents))
  return `<a class="card" href="${view.base}/products/${escapeHtml(product.handle)}">
    <figure>${product.heroImage ? `<img src="${escapeHtml(product.heroImage)}" alt="${escapeHtml(product.title)}" loading="lazy">` : ''}</figure>
    <div class="body"><div class="title">${escapeHtml(product.title)}</div>
      <div class="sub">${escapeHtml(product.subtitle || '')}</div>
      <div class="price">${money(from, view)}</div></div></a>`
}

/* ---------------------------------------------------------------- collections */

export function collectionPage(view: StoreView, collection: { title: string; description: string }, products: Product[]): string {
  return layout(view, {
    title: `${collection.title} — ${view.store.name}`,
    description: collection.description || `${collection.title} from ${view.store.name}`,
    body: `<section class="wrap"><div class="section-head"><div><div class="eyebrow">Collection</div>
      <h2>${escapeHtml(collection.title)}</h2>${collection.description ? `<p class="micro" style="margin-top:.6rem">${escapeHtml(collection.description)}</p>` : ''}</div>
      <span class="eyebrow">${products.length} products</span></div>
      <div class="grid">${products.map((product) => productCard(view, product)).join('')}</div>
      ${products.length ? '' : '<p class="micro">Nothing in here yet.</p>'}</section>`,
  })
}

/* ------------------------------------------------------------------------ pdp */

export function productPage(
  view: StoreView,
  input: { product: Product; stats: ReviewStats; reviews: Review[]; companions: Product[] },
): string {
  const { product, stats, reviews, companions } = input
  const content = product.content
  const media = [product.heroImage, ...product.media.map((entry) => entry.url)].filter(Boolean)
  const unique = [...new Set(media)]
  const cheapest = product.variants.reduce((best, variant) => (variant.priceCents < best.priceCents ? variant : best), product.variants[0]!)
  const url = `${view.base}/products/${product.handle}`

  const optionBlocks = product.options
    .map((option, index) => {
      const isColour = /colou?r|leather|finish|glaze/i.test(option.title)
      const controls = option.values
        .map((value, valueIndex) =>
          isColour && value.swatch
            ? `<button type="button" class="swatch" style="background:${escapeHtml(value.swatch)}" title="${escapeHtml(value.value)}"
                 data-option="${index}" data-value="${escapeHtml(value.value)}" aria-pressed="${valueIndex === 0}"></button>`
            : `<button type="button" class="pill" data-option="${index}" data-value="${escapeHtml(value.value)}"
                 aria-pressed="${valueIndex === 0}">${escapeHtml(value.value)}</button>`,
        )
        .join('')
      return `<div class="opt"><span class="label">${escapeHtml(option.title)}</span>
        <div class="${isColour ? 'swatches' : 'pills'}" data-group="${index}">${controls}</div></div>`
    })
    .join('')

  // The build-option cards are the platform's variant/upsell hybrid: the same
  // product, two ways to buy it, with the difference priced honestly.
  const bundle = bundleFor(view.db, view.store.id, product.id)
  const bundleWidget = bundle ? renderBundleWidget(bundle, product, view.totals?.currency ?? view.store.currency, { variantPriceCents: cheapest.priceCents }) : ''
  const buildOptions = bundle ? '' : `<div class="buildopts">
    <label class="buildopt" data-selected="true"><input type="radio" name="build" value="stock" checked>
      <span><strong>Stock build</strong><small>Ships in 14 days &middot; ${money(cheapest.priceCents, view)}</small></span></label>
    <label class="buildopt"><input type="radio" name="build" value="custom">
      <span><strong>Custom stitched</strong><small>Your initials, 21 days &middot; ${money(Math.round(cheapest.priceCents * 1.13), view)}</small></span></label>
  </div>`

  const body = `<div class="wrap pdp">
  <div class="gallery">
    <div class="main"><img id="pdp-main" src="${escapeHtml(unique[0] ?? '')}" alt="${escapeHtml(product.title)}"></div>
    ${unique.length > 1 ? `<div class="thumbs">${unique
        .map((src, index) => `<button type="button" aria-current="${index === 0}" aria-label="Show image ${index + 1}" data-src="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"></button>`)
        .join('')}</div>` : ''}
  </div>
  <div class="buybox">
    <div class="crumbs"><a href="${view.base}/">Home</a> / <a href="${view.base}/collections/all">Shop</a> / ${escapeHtml(product.title)}</div>
    ${stats.count ? `<div class="rating"><span class="stars">${stars(stats.average)}</span> ${stats.average} &middot; ${stats.count} reviews</div>` : ''}
    ${product.subtitle ? `<div class="eyebrow">${escapeHtml(product.subtitle)}</div>` : ''}
    <h1 style="font-size:clamp(2rem,4vw,3rem)">${escapeHtml(product.title)}</h1>
    <div class="price-row"><div class="price-lg" id="pdp-price">${money(cheapest.priceCents, view)}</div>${cheapest.compareAtCents && cheapest.compareAtCents > cheapest.priceCents ? `<s class="compare-at">${money(cheapest.compareAtCents, view)}</s><span class="off">−${Math.round((1 - cheapest.priceCents / cheapest.compareAtCents) * 100)}%</span>` : ''}</div>
    ${pdpSignals(view, product)}
    ${optionBlocks}
    ${buildOptions}
    <form method="post" action="${view.base}/cart/add" class="buyform" id="pdp-form">
      <input type="hidden" name="variantId" id="pdp-variant" value="${escapeHtml(cheapest.id)}">
      ${bundleWidget || '<input type="hidden" name="quantity" value="1">'}
      <button class="btn btn--wide" type="submit" id="pdp-cta">Add to cart — <span data-total>${money(cheapest.priceCents, view)}</span></button>
      <button class="btn btn--wide btn--ghost" type="submit" formaction="${view.base}/checkout/buy">Buy it now</button>
    </form>
    <p class="micro">${escapeHtml(product.variants.some((variant) => variant.inventory > 0) ? 'In stock and built to order. Free returns for 30 days.' : 'Made to order. Ships in 14 days.')}</p>
    ${content.benefits?.length ? `<ul class="benefits">${content.benefits.slice(0, 4).map((benefit) => `<li><strong>${escapeHtml(benefit.title)}</strong></li>`).join('')}</ul>` : ''}
    <div class="trust">${(content.trust?.length ? content.trust : [product.tags[0] ?? 'Made in small runs', 'Repaired in-house', 'Free shipping over 200']).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>
    ${content.guarantee ? `<div class="guarantee"><span class="badge">30</span><div><strong>Thirty-day guarantee</strong><p class="micro" style="margin:.2rem 0 0">${escapeHtml(content.guarantee)}</p></div></div>` : ''}
    <div class="payicons small"><i>VISA</i><i>MC</i><i>AMEX</i><i>Apple Pay</i><i>Google Pay</i><i>PayPal</i></div>
    ${product.variants.every((variant) => variant.inventory <= 0 && !variant.allowBackorder) ? `<form method="post" action="${view.base}/products/${escapeHtml(product.handle)}/notify" class="notify"><div class="eyebrow">Sold out — get notified</div><div class="row" style="gap:.5rem"><input name="email" type="email" required placeholder="you@example.com" aria-label="Email"><input type="hidden" name="variantId" value="${escapeHtml(cheapest.id)}"><button class="btn btn--ghost" type="submit">Notify me</button></div></form>` : ''}
    ${renderSlot(view.db, view.store.id, 'pdpBelowAddToCart', { productId: product.id }, { preview: view.preview })}
    ${companions.length ? upsellWidget(view, companions) : ''}
  </div>
</div>
${conversionSections(view, product, content)}
<section class="wrap" style="padding-top:0">
  <div class="section-head"><h2>The detail</h2></div>
  <div class="prose">${product.description
    .split(/\n{2,}|(?<=\.)\s(?=[A-Z])/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join('')}</div>
</section>
${reviewsSection(view, product, stats, reviews)}
${qaSection(view, product)}
<div class="stickybar" id="stickybar">
  <div><div class="t">${escapeHtml(product.title)}</div><div class="p" id="sticky-price">${money(cheapest.priceCents, view)}</div></div>
  <button class="btn" type="button" aria-label="Add to cart" onclick="document.getElementById('pdp-cta').closest('form').requestSubmit()">Add to cart</button>
</div>
<script>
(function(){
  var variants = ${JSON.stringify(
    product.variants.map((variant) => ({ id: variant.id, price: variant.priceCents, values: Object.values(variant.optionValues), stock: variant.inventory })),
  )};
  var fmt = ${JSON.stringify({ currency: view.totals?.currency ?? view.store.currency })};
  var chosen = variants[0] ? variants[0].values.slice() : [];
  function money(cents){ try { return new Intl.NumberFormat('en-US',{style:'currency',currency:fmt.currency}).format(cents/100) } catch(e){ return (cents/100).toFixed(2) } }
  function sync(){
    var match = variants.find(function(v){ return chosen.every(function(value,index){ return v.values[index] === undefined || v.values[index] === value }) }) || variants[0];
    if(!match) return;
    document.getElementById('pdp-variant').value = match.id;
    document.getElementById('pdp-price').textContent = money(match.price);
    var tier = document.querySelector('#pdp-form input[name=quantity]:checked');
    var total = tier && tier.dataset.total ? tier.dataset.total : money(match.price);
    document.querySelector('#pdp-cta span').textContent = total;
    var sticky = document.getElementById('sticky-price'); if (sticky) sticky.textContent = total;
  }
  document.getElementById('pdp-form') && document.getElementById('pdp-form').addEventListener('change', sync);
  sync();
  var cta = document.getElementById('pdp-cta'), bar = document.getElementById('stickybar');
  if (cta && bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function(entries){ bar.classList.toggle('show', !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0) }, { threshold: 0 }).observe(cta);
  }
  document.querySelectorAll('[data-option]').forEach(function(button){
    button.addEventListener('click', function(){
      var index = Number(button.dataset.option);
      button.parentElement.querySelectorAll('[data-option]').forEach(function(sibling){ sibling.setAttribute('aria-pressed','false') });
      button.setAttribute('aria-pressed','true');
      chosen[index] = button.dataset.value;
      sync();
    });
  });
  document.querySelectorAll('.thumbs button').forEach(function(button){
    button.addEventListener('click', function(){
      document.getElementById('pdp-main').src = button.dataset.src;
      document.querySelectorAll('.thumbs button').forEach(function(sibling){ sibling.setAttribute('aria-current','false') });
      button.setAttribute('aria-current','true');
    });
  });
  document.querySelectorAll('.buildopt input').forEach(function(input){
    input.addEventListener('change', function(){
      document.querySelectorAll('.buildopt').forEach(function(card){ card.dataset.selected = String(card.contains(input) && input.checked) });
    });
  });
})();
</script>
${renderSlot(view.db, view.store.id, 'pdpAnalytics', { productId: product.id, price: cheapest.priceCents }, { preview: view.preview })}`

  return layout(view, {
    title: product.seo.title || `${product.title} — ${view.store.name}`,
    description: product.seo.description || product.subtitle || product.description.slice(0, 155),
    body,
    ...(unique[0] ? { image: unique[0] } : {}),
    canonical: url,
    jsonLd: [
      productJsonLd(view.store, product, url, stats),
      breadcrumbJsonLd([
        { name: 'Home', url: `${view.base}/` },
        { name: 'Shop', url: `${view.base}/collections/all` },
        { name: product.title, url },
      ]),
    ],
  })
}

/**
 * The sections that turn a description into a page that sells: why this one
 * (benefits), why not the cheaper one (comparison), what exactly it is (specs),
 * what is stopping me (FAQ), and what happens if it goes wrong (shipping and
 * guarantee). Each renders only if the research put something there.
 */
function conversionSections(view: StoreView, product: Product, content: Product['content']): string {
  const parts: string[] = []
  if (content.benefits?.length) {
    parts.push(`<section class="wrap conv"><div class="section-head"><div><div class="eyebrow">Why this one</div><h2>${escapeHtml(content.audience || 'What you are actually paying for')}</h2></div></div>
      <div class="benefit-grid">${content.benefits.map((benefit, index) => `<div class="benefit"><span class="n">0${index + 1}</span><h3>${escapeHtml(benefit.title)}</h3><p>${escapeHtml(benefit.body)}</p></div>`).join('')}</div></section>`)
  }
  if (content.comparison?.rows.length) {
    parts.push(`<section class="wrap conv"><div class="section-head"><div><div class="eyebrow">Compared</div><h2>Against ${escapeHtml((content.comparison.themLabel ?? 'the usual').toLowerCase())}</h2></div></div>
      <div class="tablewrap"><table class="compare"><thead><tr><th></th><th class="us">${escapeHtml(view.store.name)}</th><th>${escapeHtml(content.comparison.themLabel ?? 'The usual')}</th></tr></thead>
      <tbody>${content.comparison.rows.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td class="us">${escapeHtml(row.us)}</td><td>${escapeHtml(row.them)}</td></tr>`).join('')}</tbody></table></div></section>`)
  }
  if (content.specs?.length || content.faq?.length) {
    parts.push(`<section class="wrap conv two-col">
      ${content.specs?.length ? `<div><div class="eyebrow">Specifications</div><dl class="specs">${content.specs.map((spec) => `<div><dt>${escapeHtml(spec.label)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`).join('')}</dl></div>` : '<div></div>'}
      ${content.faq?.length ? `<div><div class="eyebrow">Questions</div>${content.faq.map((entry, index) => `<details class="faq" ${index === 0 ? 'open' : ''}><summary>${escapeHtml(entry.q)}</summary><p>${escapeHtml(entry.a)}</p></details>`).join('')}</div>` : ''}
    </section>`)
  }
  if (content.shipping || content.guarantee) {
    parts.push(`<section class="wrap conv"><div class="promise">
      ${content.shipping ? `<div><div class="eyebrow">Shipping</div><p>${escapeHtml(content.shipping)}</p></div>` : ''}
      ${content.guarantee ? `<div><div class="eyebrow">Guarantee</div><p>${escapeHtml(content.guarantee)}</p></div>` : ''}
      <div><div class="eyebrow">Repairs</div><p>Handled in-house for as long as we are here. Post it back; we fix it and send it home.</p></div>
    </div></section>`)
  }
  return parts.join('\n')
}

/** The live signals under the price: delivery window, viewers, stock. All from real data; each hides when it has nothing honest to say. */
function pdpSignals(view: StoreView, product: Product): string {
  const parts: string[] = []
  const estimate = deliveryEstimate(product.supplier)
  parts.push(`<div class="edd" data-cutoff="15"><span class="ico">🚚</span><div>Order <b data-cutoff-text>today</b> for delivery by <b>${escapeHtml(estimate.from)} – ${escapeHtml(estimate.to)}</b></div></div>`)
  const stock = product.variants.reduce((sum, variant) => sum + Math.max(0, variant.inventory), 0)
  if (stock > 0 && stock <= 15) parts.push(`<div class="scarcity"><div class="meta">Only <b>${stock}</b> left in this batch</div><div class="track"><div class="fill" style="width:${Math.max(6, Math.round((stock / 15) * 100))}%"></div></div></div>`)
  const viewers = view.preview ? 0 : viewersNow(view.db, view.store.id, product.id)
  if (viewers >= 3) parts.push(`<div class="viewers"><i></i> ${viewers} people are looking at this right now</div>`)
  return `<div class="signals">${parts.join('')}</div>`
}

function qaSection(view: StoreView, product: Product): string {
  const questions = listQuestions(view.db, view.store.id, { productId: product.id, status: 'answered' })
  return `<section class="wrap conv"><div class="section-head"><div><div class="eyebrow">Questions</div><h2>Ask about ${escapeHtml(product.title)}</h2></div></div>
    <div class="two-col"><div>${questions.map((entry) => `<details class="faq"><summary>${escapeHtml(entry.question)}</summary><p>${escapeHtml(entry.answer)}${entry.asker ? ` <span class="micro">— asked by ${escapeHtml(entry.asker)}</span>` : ''}</p></details>`).join('') || '<p class="micro">No questions yet. Ask the first one.</p>'}</div>
    <form method="post" action="${view.base}/products/${escapeHtml(product.handle)}/questions" class="qa-form"><div class="two"><input name="asker" placeholder="Your name"><input name="email" type="email" placeholder="Email, for the answer"></div><textarea name="question" rows="2" required placeholder="What do you want to know?"></textarea><button class="btn btn--ghost" type="submit">Ask</button></form></div></section>`
}

/* --------------------------------------------------------------- tracking */

export function trackPage(view: StoreView, input: { tracking?: TrackingView | null; error?: string; related?: Product[] }): string {
  const { tracking } = input
  const body = `<section class="wrap" style="max-width:min(720px,92vw)">
    <div class="eyebrow">Track your order</div><h2 style="margin:.6rem 0 1rem">Where is it?</h2>
    ${input.error ? `<div class="notice" style="border-left-color:#b3261e;margin-bottom:1rem">${escapeHtml(input.error)}</div>` : ''}
    <form method="get" action="${view.base}/track" class="two" style="margin-bottom:2rem"><div class="field"><label>Order number</label><input name="order" placeholder="1001" required value="${escapeHtml(tracking?.order.displayId ?? '')}"></div><div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com"></div><button class="btn" type="submit" style="grid-column:1/-1">Find my order</button></form>
    ${tracking ? `<div class="timeline">${tracking.steps.map((step) => `<div class="step ${step.done ? 'done' : ''}"><i></i><div><strong>${escapeHtml(step.label)}</strong><div class="micro">${step.at ? escapeHtml(step.at.slice(0, 10)) : ''}${step.detail ? ` · ${escapeHtml(step.detail)}` : ''}</div></div></div>`).join('')}</div>
      ${tracking.live ? `<div class="notice" style="margin:1.2rem 0"><div class="row" style="justify-content:space-between;align-items:center"><div><div class="eyebrow">Live carrier status</div><strong>${escapeHtml(tracking.live.subStatus || tracking.live.status || 'Tracking registered')}</strong></div><span class="micro">Synced by 17TRACK${tracking.live.syncedAt ? ` · ${escapeHtml(tracking.live.syncedAt.slice(0, 16).replace('T', ' '))}` : ''}</span></div></div>` : ''}
      ${tracking.tracking ? `<p><a class="btn btn--ghost" href="${escapeHtml(tracking.tracking.url)}" target="_blank" rel="noopener">Track with ${escapeHtml(tracking.tracking.carrier)} ↗</a></p>` : tracking.estimate ? `<p class="micro">Estimated delivery ${escapeHtml(tracking.estimate.from)} – ${escapeHtml(tracking.estimate.to)}. You will get the tracking number the moment it ships.</p>` : ''}
      ${tracking.live?.events.length ? `<div style="margin-top:1.4rem"><div class="eyebrow" style="margin-bottom:.7rem">Carrier updates</div>${tracking.live.events.slice(0, 12).map((event) => `<div style="display:grid;grid-template-columns:7.5rem 1fr;gap:1rem;padding:.75rem 0;border-top:1px solid var(--line)"><div class="micro">${escapeHtml(event.at ? event.at.slice(0, 16).replace('T', ' ') : '')}</div><div><div>${escapeHtml(event.description || event.stage)}</div>${event.location ? `<div class="micro">${escapeHtml(event.location)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
      <table class="lines" style="margin-top:1.4rem">${tracking.order.items.map((item) => `<tr><td style="width:64px"><img src="${escapeHtml(item.image)}" alt=""></td><td>${escapeHtml(item.title)}<div class="micro">${escapeHtml(item.variantTitle)} × ${item.quantity}</div></td></tr>`).join('')}</table>` : ''}
    ${input.related?.length ? `<div class="section-head" style="margin-top:3rem"><h2>While you wait</h2></div><div class="grid">${input.related.map((product) => productCard(view, product)).join('')}</div>` : ''}
  </section>`
  return layout(view, { title: `Track your order — ${view.store.name}`, description: 'Order tracking', body })
}

/* ---------------------------------------------------------------- funnel */

export function bumpHtml(view: StoreView, bump: ResolvedBump | null): string {
  if (!bump) return ''
  return `<label class="bump"><input type="checkbox" name="bumpVariantId" value="${escapeHtml(bump.variantId)}" ${bump.product.metadata.kind === 'shipping-protection' ? 'checked' : ''}>
    <span><strong>${escapeHtml(bump.label)} — ${money(bump.priceCents, view)}</strong><span class="micro" style="display:block">${escapeHtml(bump.text)}</span></span></label>`
}

export function offerPage(view: StoreView, order: Order, offer: ResolvedOffer, step: 'upsell' | 'downsell'): string {
  const price = Math.round(offer.priceCents * (1 - offer.discountPercent / 100))
  const body = `<section class="wrap upsell-page">
    <div class="eyebrow">Order #${order.displayId} confirmed — ${step === 'downsell' ? 'one last thing' : 'one more thing'}</div>
    <h1 style="font-size:clamp(1.8rem,4vw,2.8rem);margin:.6rem 0 1.2rem">${escapeHtml(offer.headline)}</h1>
    <div class="upsell-card"><img src="${escapeHtml(offer.product.heroImage)}" alt="${escapeHtml(offer.product.title)}">
      <div><p class="lead" style="margin:0 0 .6rem">${escapeHtml(offer.text)}</p>
        <div class="price-lg">${format(price, order.currency)} ${offer.discountPercent ? `<s class="micro">${format(offer.priceCents, order.currency)}</s>` : ''}</div>
        <p class="micro">Ships with your order. ${order.paymentProvider === 'stripe' ? 'Charged to the card you just used — no form.' : 'Added to your order in one click.'}</p>
        <form method="post" action="${view.base}/orders/${escapeHtml(order.id)}/${step}" class="row" style="gap:.6rem;margin-top:1rem"><input type="hidden" name="accept" value="yes"><button class="btn" type="submit">Yes, add it — ${format(price, order.currency)}</button></form>
        <form method="post" action="${view.base}/orders/${escapeHtml(order.id)}/${step}" style="margin-top:.6rem"><input type="hidden" name="accept" value="no"><button class="btn btn--ghost" type="submit" style="border:0;padding:.5rem 0">No thanks${step === 'upsell' ? '' : ', take me to my order'}</button></form>
      </div></div></section>`
  return layout(view, { title: `One more thing — ${view.store.name}`, description: 'Your order', body, bare: true })
}

function upsellWidget(view: StoreView, companions: Product[]): string {
  return `<div class="upsell"><div class="eyebrow">Goes with this</div>
    ${companions
      .map((product) => {
        const variant = product.variants[0]
        if (!variant) return ''
        return `<div class="row"><img src="${escapeHtml(product.heroImage)}" alt="">
          <div><div style="font-size:.95rem">${escapeHtml(product.title)}</div><div class="micro">${money(variant.priceCents, view)}</div></div>
          <form method="post" action="${view.base}/cart/add">
            <input type="hidden" name="variantId" value="${escapeHtml(variant.id)}">
            <input type="hidden" name="source" value="upsell-pdp">
            <button class="btn btn--ghost" style="padding:.55rem .9rem;font-size:12px" type="submit">Add</button></form></div>`
      })
      .join('')}</div>`
}

function reviewsSection(view: StoreView, product: Product, stats: ReviewStats, reviews: Review[]): string {
  const total = Math.max(1, stats.count)
  return `<section class="wrap"><div class="section-head"><div><div class="eyebrow">Reviews</div>
    <h2>${stats.count ? `${stats.average} out of 5` : 'Be the first to review this'}</h2></div></div>
  <div style="display:grid;gap:2rem;grid-template-columns:minmax(240px,22rem) 1fr;align-items:start">
    <div>
      <div class="bars">${[5, 4, 3, 2, 1]
        .map((rating) => {
          const count = stats.distribution[rating] ?? 0
          return `<div class="bar"><span>${rating} ★</span><span class="track"><span class="fill" style="width:${(count / total) * 100}%"></span></span><span>${count}</span></div>`
        })
        .join('')}</div>
      ${stats.summary.length ? `<div class="notice" style="margin-top:1.4rem"><div class="eyebrow">What people keep saying</div>
        <ul style="margin:.6rem 0 0;padding-left:1.1rem">${stats.summary.map((line) => `<li style="margin-bottom:.4rem;font-size:.9rem">${escapeHtml(line)}</li>`).join('')}</ul>
        <p class="micro" style="margin:.8rem 0 0">Pulled from the reviews themselves — nothing here is written for you.</p></div>` : ''}
      <form method="post" action="${view.base}/products/${escapeHtml(product.handle)}/reviews" style="margin-top:1.4rem" id="review">
        <div class="eyebrow" style="margin-bottom:.6rem">Leave a review</div>
        <div class="two"><div class="field"><label for="rv-author">Name</label><input id="rv-author" name="author" required></div>
        <div class="field"><label for="rv-rating">Rating</label><select id="rv-rating" name="rating">${[5, 4, 3, 2, 1].map((rating) => `<option value="${rating}">${rating}</option>`).join('')}</select></div></div>
        <div class="field"><label for="rv-body">Review</label><textarea id="rv-body" name="body" rows="3" required></textarea></div>
        <button class="btn btn--ghost" type="submit">Submit for moderation</button></form>
    </div>
    <div class="reviews">${reviews.length ? reviews
      .map(
        (review) => `<article class="review"><div class="stars">${stars(review.rating)}</div>
          ${review.title ? `<h3 style="margin:.5rem 0 .35rem">${escapeHtml(review.title)}</h3>` : ''}
          <p style="margin:.4rem 0 0;font-size:.94rem">${escapeHtml(review.body)}</p>
          ${review.media.length ? `<div class="review-media">${review.media.slice(0, 4).map((url) => `<img src="${escapeHtml(url)}" alt="" loading="lazy">`).join('')}</div>` : ''}
          <div class="who">${escapeHtml(review.author)}${review.verified ? ' &middot; verified buyer' : ''} &middot; ${review.createdAt.slice(0, 10)}</div>
          ${review.reply ? `<div class="reply"><strong>${escapeHtml(view.store.name)}:</strong> ${escapeHtml(review.reply)}</div>` : ''}</article>`,
      )
      .join('') : '<p class="micro">No approved reviews yet.</p>'}</div>
  </div></section>`
}

/* ----------------------------------------------------------------------- cart */

export function cartPage(view: StoreView, totals: Totals): string {
  const cart = view.cart
  const items = cart?.items ?? []
  const gap = totals.freeShippingGapCents
  const body = `<section class="wrap"><div class="section-head"><h2>Your cart</h2><span class="eyebrow">${items.length} lines</span></div>
  ${items.length
      ? `<div style="display:grid;gap:3rem;grid-template-columns:1.4fr .8fr;align-items:start">
    <table class="lines">${items
      .map(
        (item) => `<tr><td style="width:80px"><img src="${escapeHtml(item.image)}" alt=""></td>
        <td><div>${escapeHtml(item.title)}</div><div class="micro">${escapeHtml(item.variantTitle)}${item.source ? ` &middot; added from ${escapeHtml(item.source)}` : ''}</div></td>
        <td style="width:130px"><form method="post" action="${view.base}/cart/update" style="display:flex;gap:.35rem">
          <input type="hidden" name="variantId" value="${escapeHtml(item.variantId)}">
          <input name="quantity" type="number" min="0" value="${item.quantity}" style="width:72px" aria-label="Quantity">
          <button class="btn btn--ghost" style="padding:.5rem .7rem;font-size:11px" type="submit">Set</button></form></td>
        <td style="width:110px;text-align:right">${money(item.unitCents * item.quantity, view)}</td></tr>`,
      )
      .join('')}</table>
    <div>
      ${gap !== null && gap > 0 ? `<div class="notice" style="margin-bottom:1rem"><div class="gap"><span>${money(gap, view)} to free shipping</span></div>
        <div class="gap" style="margin-top:.5rem"><span class="track"><span class="fill" style="width:${Math.min(100, (1 - gap / 20000) * 100)}%"></span></span></div></div>` : ''}
      <form method="post" action="${view.base}/cart/code" style="display:flex;gap:.5rem;margin-bottom:1.2rem">
        <input name="code" placeholder="Discount code" value="${escapeHtml(cart?.discountCode ?? '')}" aria-label="Discount code">
        <button class="btn btn--ghost" type="submit">Apply</button></form>
      ${totalsBlock(view, totals)}
      <a class="btn btn--wide" style="margin-top:1rem" href="${view.base}/checkout">Checkout</a>
      ${renderSlot(view.db, view.store.id, 'cartDrawer', {}, { preview: view.preview })}
    </div></div>`
      : `<p class="micro">Your cart is empty. <a href="${view.base}/collections/all">Have a look around</a>.</p>`}
  </section>`
  return layout(view, { title: `Cart — ${view.store.name}`, description: 'Your cart', body })
}

export function totalsBlock(view: StoreView, totals: Totals): string {
  return `<div class="totals">
    <div><span>Subtotal</span><span>${money(totals.subtotalCents, view)}</span></div>
    ${totals.appliedPromotions
      .map((promotion) => `<div><span>${escapeHtml(promotion.title)}${promotion.code ? ` (${escapeHtml(promotion.code)})` : ''}</span><span>${promotion.amountCents ? `-${money(promotion.amountCents, view)}` : 'applied'}</span></div>`)
      .join('')}
    <div><span>Shipping</span><span>${totals.shippingCents ? money(totals.shippingCents, view) : 'Free'}</span></div>
    ${totals.taxCents ? `<div><span>Tax</span><span>${money(totals.taxCents, view)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${money(totals.totalCents, view)}</span></div>
  </div>`
}

/* ------------------------------------------------------------------- checkout */

export type CheckoutInput = {
  totals: Totals
  region: Region | null
  error?: string
  stripe?: { publishableKey: string } | null
  isFirstOrder?: boolean
  bump?: ResolvedBump | null
}

/**
 * The one-page checkout, in Shopify's order: express buttons first, then
 * contact, delivery, shipping method, payment, one button. The summary sits
 * on the right on desktop and collapses to one line on a phone. With Stripe
 * connected the payment block is the Payment Element and the express row is
 * the Express Checkout Element — Apple Pay, Google Pay and Link appear on
 * their own where the device supports them. Without it, the same page places
 * a demo order so the flow can be walked end to end.
 */
/** The pieces of the checkout, built once from the cart, so the built-in page and a checkout laid out from blocks render the same form. */
export function checkoutParts(view: StoreView, input: CheckoutInput): { summary: string; form: string; express: string; bump: string; script: string; note: string; proof: string } {
  const { totals, region } = input
  const cart = view.cart
  const draft = cart?.checkout ?? {}
  const items = cart?.items ?? []
  const shipping = (region?.shipping ?? []).map((option) => {
    const free = totals.appliedPromotions.some((promotion) => promotion.amountCents === 0 && /shipping/i.test(promotion.title)) && option.position === 0
    const clears = option.freeAboveCents !== null && totals.subtotalCents - totals.discountCents >= option.freeAboveCents
    const amount = free || clears ? 0 : option.amountCents
    return { id: option.id, name: option.name, amountCents: amount, listCents: option.amountCents, selected: option.id === totals.shippingOptionId }
  })
  // What the reference checkouts do (docs/knowledge/reference-pages.md): the
  // arrival date above the form, the guarantee under the button in the
  // store's own numbers, free shipping shown as a saving, and proof below
  // the form for whoever scrolls past it.
  const legal = legalFor(view.db, view.store)
  const firstProduct = items[0] ? getProduct(view.db, view.store.id, items[0].productId) : null
  const arrival = firstProduct ? deliveryEstimate(firstProduct.supplier) : null
  const proof = listReviews(view.db, view.store.id, { status: 'approved', limit: 3 }).filter((review) => !items.length || items.some((item) => item.productId === review.productId)).slice(0, 3)
  const summary = `<div class="summary-body">
    <table class="lines">${items.map((item) => `<tr><td style="width:64px"><span class="thumb"><img src="${escapeHtml(item.image)}" alt=""><b>${item.quantity}</b></span></td>
      <td><div>${escapeHtml(item.title)}</div><div class="micro">${escapeHtml(item.variantTitle)}</div></td>
      <td style="text-align:right">${item.unitCents ? money(item.unitCents * item.quantity, view) : 'Free'}</td></tr>`).join('')}</table>
    <form method="post" action="${view.base}/cart/code" class="code"><input name="code" placeholder="Discount code" value="${escapeHtml(cart?.discountCode ?? '')}" aria-label="Discount code"><button class="btn btn--ghost" type="submit">Apply</button></form>
    ${totalsBlock(view, totals)}</div>`
  const bump = input.bump && !items.some((item) => item.variantId === input.bump?.variantId) ? `<section class="co-block">${bumpHtml(view, input.bump)}</section>` : ''
  const express = input.stripe ? `<div class="express"><div class="eyebrow">Express checkout</div><div id="express-element"></div><div class="or"><span>or</span></div></div>` : ''
  const form = `<form method="post" action="${view.base}/checkout" id="checkout-form" novalidate>
      <section class="co-block"><h2>Contact</h2>
        <div class="field"><input name="email" type="email" required autocomplete="email" placeholder="Email" value="${escapeHtml(draft.email ?? '')}" aria-label="Email"></div>
        <label class="micro check"><input type="checkbox" name="marketing" value="true" ${draft.marketing ? 'checked' : ''}> Email me with news and offers</label></section>
      <section class="co-block"><h2>Delivery</h2>
        <div class="field"><select name="country" autocomplete="country" aria-label="Country">${(region?.countries.length ? region.countries : ['US']).map((country) => `<option value="${escapeHtml(country)}" ${draft.address?.country === country ? 'selected' : ''}>${escapeHtml(countryName(country))}</option>`).join('')}</select></div>
        <div class="two"><div class="field"><input name="firstName" required autocomplete="given-name" placeholder="First name" value="${escapeHtml((draft.name ?? '').split(' ')[0] ?? '')}" aria-label="First name"></div>
          <div class="field"><input name="lastName" required autocomplete="family-name" placeholder="Last name" value="${escapeHtml((draft.name ?? '').split(' ').slice(1).join(' '))}" aria-label="Last name"></div></div>
        <div class="field"><input name="line1" required autocomplete="address-line1" placeholder="Address" value="${escapeHtml(draft.address?.line1 ?? '')}" aria-label="Address"></div>
        <div class="two"><div class="field"><input name="city" required autocomplete="address-level2" placeholder="City" value="${escapeHtml(draft.address?.city ?? '')}" aria-label="City"></div>
          <div class="field"><input name="postal" required autocomplete="postal-code" placeholder="Postal code" value="${escapeHtml(draft.address?.postal ?? '')}" aria-label="Postal code"></div></div>
        <div class="field"><input name="phone" type="tel" autocomplete="tel" placeholder="Phone (for delivery updates)" value="${escapeHtml(draft.phone ?? '')}" aria-label="Phone"></div></section>
      <section class="co-block"><h2>Shipping method</h2>${arrival ? `<p class="micro" style="margin-top:-.4rem">🚚 Arrives ${escapeHtml(arrival.from)}–${escapeHtml(arrival.to)}</p>` : ''}
        <div class="methods" id="methods">${shipping.length ? shipping.map((option) => `<label class="method"><input type="radio" name="shippingOptionId" value="${escapeHtml(option.id)}" ${option.selected ? 'checked' : ''} data-amount="${option.amountCents}"><span>${escapeHtml(option.name)}</span><b>${option.amountCents ? money(option.amountCents, view) : option.listCents ? `<s class="micro">${money(option.listCents, view)}</s> Free` : 'Free'}</b></label>`).join('') : '<p class="micro">Enter your address to see shipping.</p>'}</div></section>
      <!--bump-->
      <section class="co-block"><h2>Payment</h2><p class="micro" style="margin-top:-.4rem">All transactions are secure and encrypted.</p>
        ${input.stripe ? '<div id="payment-element" class="pay-el"></div><div id="payment-error" class="micro" style="color:#b3261e"></div>' : `<div class="pay-demo"><div class="row"><strong>Card</strong><span class="cards"><i>VISA</i><i>MC</i><i>AMEX</i></span></div>
          <p class="micro">No payment provider is connected on this store, so the order is placed without a charge. Connect Stripe in the admin and this block becomes the card form, Apple Pay, Google Pay and Link.</p></div>`}
        <label class="micro check" style="margin-top:.8rem"><input type="checkbox" name="billingSame" value="true" checked> Billing address same as shipping</label></section>
      <button class="btn btn--wide pay" type="submit" id="pay"><span><!--pay-label--></span> · <b data-pay-total>${money(totals.totalCents, view)}</b></button>
    </form>`
  const script = `<script>
(function(){
  var base = ${JSON.stringify(view.base)};
  var fmt = ${JSON.stringify({ currency: totals.currency })};
  function money(c){ try { return new Intl.NumberFormat('en-US',{style:'currency',currency:fmt.currency}).format(c/100) } catch(e){ return (c/100).toFixed(2) } }
  function refresh(t){
    document.querySelectorAll('[data-pay-total], .co-summary-mobile summary b').forEach(function(el){ el.textContent = money(t.totalCents) });
    document.querySelectorAll('.totals').forEach(function(el){ el.outerHTML = t.totalsHtml });
    if (window.__elements) window.__elements.update({ amount: t.totalCents });
  }
  var bumps = document.querySelectorAll('.bump input');
  bumps.forEach(function(bump){ bump.addEventListener('change', function(){
    bumps.forEach(function(other){ other.checked = bump.checked });
    fetch(base + '/checkout/bump', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ variantId: bump.value, on: bump.checked }) })
      .then(function(r){ return r.json() }).then(refresh);
  })});
  document.querySelectorAll('#methods input').forEach(function(radio){ radio.addEventListener('change', function(){
    fetch(base + '/checkout/shipping', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ shippingOptionId: radio.value }) })
      .then(function(r){ return r.json() }).then(refresh);
  })});
})();
</script>
${input.stripe ? stripeScript(view, input.stripe.publishableKey, totals) : ''}`
  const note = `🔒 Secure checkout · ${legal.guaranteeDays}-day money-back guarantee · ${legal.returnsDays}-day returns${arrival ? ` · Arrives ${escapeHtml(arrival.from)}–${escapeHtml(arrival.to)}` : ''}`
  const proofHtml = `<div class="co-proof">
      <div class="co-guarantee"><i>⛨</i><div><b>${legal.guaranteeDays}-day money-back guarantee</b><p class="micro">If it is not what the page said, tell us within ${legal.guaranteeDays} days and we refund the price. Returns within ${legal.returnsDays} days of delivery.</p></div></div>
      ${proof.length ? `<div class="reviews co-reviews">${proof.map((review) => `<article class="review">${stars(review.rating)}${review.title ? `<h3 style="margin:.4rem 0 .2rem">${escapeHtml(review.title)}</h3>` : ''}<p style="margin:.3rem 0 0">${escapeHtml(review.body)}</p><div class="who">${escapeHtml(review.author)}${review.verified ? ' · verified buyer' : ''}</div></article>`).join('')}</div>` : ''}
    </div>`
  return { summary, form, express, bump, script, note, proof: proofHtml }
}

/**
 * The one-page checkout, in Shopify's order: express buttons first, then
 * contact, delivery, shipping method, payment, one button. The summary sits
 * on the right on desktop and collapses to one line on a phone. With Stripe
 * connected the payment block is the Payment Element and the express row is
 * the Express Checkout Element — Apple Pay, Google Pay and Link appear on
 * their own where the device supports them. Without it, the same page places
 * a demo order so the flow can be walked end to end.
 */
export function checkoutPage(view: StoreView, input: CheckoutInput): string {
  const { totals } = input
  const parts = checkoutParts(view, input)
  const body = `<div class="checkout">
  <div class="co-main">
    <a class="co-logo" href="${view.base}/">${escapeHtml(view.store.name)}</a>
    ${input.error ? `<div class="notice" style="border-left-color:#b3261e;margin-bottom:1.2rem">${escapeHtml(input.error)}</div>` : ''}
    <details class="co-summary-mobile"><summary><span>Show order summary</span><b>${money(totals.totalCents, view)}</b></summary>${parts.summary}</details>
    ${parts.express}
    ${parts.form.replace('<!--bump-->', parts.bump).replace('<!--pay-label-->', 'Pay now')}
    <p class="micro center">${parts.note}</p>
    ${parts.proof}
  </div>
  <aside class="co-side">${parts.summary}</aside>
</div>
${renderSlot(view.db, view.store.id, 'checkoutStart', {}, { preview: view.preview })}
${parts.script}`
  return layout(view, { title: `Checkout — ${view.store.name}`, description: 'Checkout', body, bare: true })
}

/**
 * A checkout laid out from blocks: the same form, summary, express row and
 * bump as the built-in page, placed by the checkout blocks among whatever
 * else the page carries — a timer, steps, a guarantee, testimonials. The
 * scripts that keep the totals live ride along once, after the blocks.
 */
export function checkoutBlockPage(view: StoreView, page: Page, input: CheckoutInput, opts: { sample?: boolean } = {}): string {
  const parts = checkoutParts(view, input)
  const context: BlockContext = {
    ...blockContextFor(view.db, view.store, view.base),
    checkout: {
      formHtml: parts.form,
      summaryHtml: parts.summary,
      expressHtml: parts.express,
      bumpHtml: parts.bump,
      totalCents: input.totals.totalCents,
      itemCount: (view.cart?.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
      ...(input.error ? { error: input.error } : {}),
      sample: opts.sample ?? false,
    },
  }
  return layout(view, {
    title: page.seo.title || `Checkout — ${view.store.name}`,
    description: page.seo.description || 'Checkout',
    body: `${renderPageBody(page, context)}${renderSlot(view.db, view.store.id, 'checkoutStart', {}, { preview: view.preview })}${parts.script}`,
    bare: true,
    head: page.headHtml,
  })
}

function stripeScript(view: StoreView, publishableKey: string, totals: Totals): string {
  return `<script src="https://js.stripe.com/v3/"></script>
<script>
(function(){
  var base = ${JSON.stringify(view.base)};
  var stripe = Stripe(${JSON.stringify(publishableKey)});
  var elements = stripe.elements({ mode: 'payment', amount: ${totals.totalCents}, currency: ${JSON.stringify(totals.currency.toLowerCase())}, setupFutureUsage: 'off_session',
    appearance: { theme: 'stripe', variables: { colorPrimary: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1a1a1a', borderRadius: '6px', fontFamily: 'inherit' } } });
  window.__elements = elements;
  var payment = elements.create('payment', { layout: 'accordion' }); payment.mount('#payment-element');
  var express = elements.create('expressCheckout', { buttonHeight: 48 }); express.mount('#express-element');
  express.on('ready', function(ev){ if (!ev.availablePaymentMethods) document.querySelector('.express').style.display = 'none' });
  var form = document.getElementById('checkout-form'), button = document.getElementById('pay'), errorBox = document.getElementById('payment-error');
  function draft(){ var d = new FormData(form); var o = {}; d.forEach(function(v,k){ o[k] = v }); return o }
  async function pay(confirmWith){
    button.disabled = true; errorBox.textContent = '';
    var prepared = await fetch(base + '/checkout/prepare', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(draft()) }).then(function(r){ return r.json() });
    if (!prepared.ok) { errorBox.textContent = prepared.error || 'Check your details'; button.disabled = false; return }
    var submitted = await elements.submit(); if (submitted.error) { errorBox.textContent = submitted.error.message; button.disabled = false; return }
    var intent = await fetch(base + '/checkout/intent', { method:'POST' }).then(function(r){ return r.json() });
    if (!intent.clientSecret) { errorBox.textContent = intent.error || 'Could not start the payment'; button.disabled = false; return }
    var result = await stripe.confirmPayment({ elements: elements, clientSecret: intent.clientSecret, confirmParams: { return_url: location.origin + base + '/checkout/complete' } });
    if (result.error) { errorBox.textContent = result.error.message; button.disabled = false }
  }
  form.addEventListener('submit', function(ev){ ev.preventDefault(); if (!form.reportValidity()) return; pay() });
  express.on('confirm', function(){ pay(true) });
})();
</script>`
}

const COUNTRIES: Record<string, string> = { US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands', MX: 'Mexico', JP: 'Japan', IN: 'India', BR: 'Brazil', SE: 'Sweden', DK: 'Denmark', IE: 'Ireland', PT: 'Portugal', AT: 'Austria', CH: 'Switzerland', NZ: 'New Zealand' }
function countryName(code: string): string {
  return COUNTRIES[code.toUpperCase()] ?? code
}

/** The one-click post-purchase offer. One product, one price, two buttons, no form. */
export function upsellPage(view: StoreView, order: Order, offer: { product: Product; variantId: string; priceCents: number; discountPercent: number }): string {
  const was = offer.priceCents
  const price = Math.round(was * (1 - offer.discountPercent / 100))
  const body = `<section class="wrap upsell-page">
    <div class="eyebrow">Order #${order.displayId} confirmed — one more thing</div>
    <h1 style="font-size:clamp(1.8rem,4vw,2.8rem);margin:.6rem 0 1.2rem">Add ${escapeHtml(offer.product.title)} to this order for ${offer.discountPercent}% off?</h1>
    <div class="upsell-card">
      <img src="${escapeHtml(offer.product.heroImage)}" alt="${escapeHtml(offer.product.title)}">
      <div><p class="lead" style="margin:0 0 .6rem">${escapeHtml(offer.product.subtitle || offer.product.description.split('. ')[0] || '')}</p>
        <div class="price-lg">${format(price, order.currency)} <s class="micro">${format(was, order.currency)}</s></div>
        <p class="micro">Ships with your order. ${order.paymentProvider === 'stripe' ? 'Charged to the card you just used — no form.' : 'Added to your order in one click.'}</p>
        <form method="post" action="${view.base}/orders/${escapeHtml(order.id)}/offer" class="row" style="gap:.6rem;margin-top:1rem">
          <input type="hidden" name="variantId" value="${escapeHtml(offer.variantId)}"><input type="hidden" name="accept" value="yes">
          <button class="btn" type="submit">Yes, add it — ${format(price, order.currency)}</button></form>
        <form method="post" action="${view.base}/orders/${escapeHtml(order.id)}/offer" style="margin-top:.6rem"><input type="hidden" name="accept" value="no"><button class="btn btn--ghost" type="submit" style="border:0;padding:.5rem 0">No thanks, take me to my order</button></form>
      </div></div></section>`
  return layout(view, { title: `One more thing — ${view.store.name}`, description: 'Your order', body, bare: true })
}

export function orderPage(view: StoreView, order: Order, related: Product[] = []): string {
  const body = `<section class="wrap" style="max-width:min(680px,92vw)">
    <div class="eyebrow">Order confirmed${order.upsell.accepted ? ' · offer added' : ''}</div>
    <h2 style="margin:.6rem 0 1rem">Thank you — order #${order.displayId}</h2>
    <p class="micro">A receipt is on its way to ${escapeHtml(order.email)}. Built to order; you will get tracking when it ships.</p>
    <table class="lines" style="margin-top:2rem">${order.items
      .map((item) => `<tr><td style="width:80px"><img src="${escapeHtml(item.image)}" alt=""></td>
        <td>${escapeHtml(item.title)}<div class="micro">${escapeHtml(item.variantTitle)} × ${item.quantity}</div></td>
        <td style="text-align:right">${format(item.unitCents * item.quantity, order.currency)}</td></tr>`)
      .join('')}</table>
    <div class="totals" style="margin-top:1.4rem">
      <div><span>Subtotal</span><span>${format(order.subtotalCents, order.currency)}</span></div>
      ${order.discountCents ? `<div><span>Discount${order.discountCode ? ` (${escapeHtml(order.discountCode)})` : ''}</span><span>-${format(order.discountCents, order.currency)}</span></div>` : ''}
      <div><span>Shipping</span><span>${order.shippingCents ? format(order.shippingCents, order.currency) : 'Free'}</span></div>
      <div class="grand"><span>Total</span><span>${format(order.totalCents, order.currency)}</span></div></div>
    <p style="margin-top:2rem" class="row"><a class="btn btn--ghost" href="${view.base}/track?order=${order.displayId}">Track this order</a> <a class="btn btn--ghost" href="${view.base}/">Keep shopping</a></p>
    ${related.length ? `<div class="section-head" style="margin-top:3rem"><h2>Goes with your order</h2></div><div class="grid">${related.map((product) => productCard(view, product)).join('')}</div>` : ''}
    ${renderSlot(view.db, view.store.id, 'orderConfirmed', { orderId: order.id, total: order.totalCents, currency: order.currency }, { preview: view.preview })}
  </section>`
  return layout(view, { title: `Order #${order.displayId}`, description: 'Order confirmation', body })
}

export function simplePage(view: StoreView, title: string, html: string): string {
  return layout(view, {
    title: `${title} — ${view.store.name}`,
    description: title,
    body: `<section class="wrap" style="max-width:min(760px,92vw)"><div class="eyebrow">${escapeHtml(title)}</div>
      <h2 style="margin:.6rem 0 1.4rem">${escapeHtml(title)}</h2><div class="prose">${html}</div></section>`,
  })
}

export { statsFor }
