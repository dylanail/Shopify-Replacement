import { escapeHtml } from '../lib/http.ts'
import { format } from '../lib/money.ts'
import type { Db } from '../lib/db.ts'
import type { Collection } from '../domain/catalog.ts'
import type { Product } from '../domain/types.ts'
import type { Cart } from '../domain/cart.ts'
import type { Totals } from '../domain/types.ts'
import type { Order } from '../domain/types.ts'
import { statsFor, type Review, type ReviewStats } from '../domain/reviews.ts'
import { renderSlot } from '../control/plugins.ts'
import type { Store, StoreEnvironment } from '../control/stores.ts'
import { breadcrumbJsonLd, jsonLdTag, metaTags, productJsonLd } from '../seo/schema.ts'
import { fontLink, themeCss } from './theme.ts'

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
  page: { title: string; description: string; body: string; jsonLd?: Array<Record<string, unknown>>; image?: string; canonical?: string },
): string {
  const { store, env } = view
  const brand = store.brand
  const cartCount = view.cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  const nav = env.theme.nav.length ? env.theme.nav : [{ label: 'Shop', href: '/collections/all' }]
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${metaTags({ title: page.title, description: page.description, url: page.canonical ?? view.base, ...(page.image ? { image: page.image } : {}) })}
${fontLink(brand)}
<style>${themeCss(brand, env.theme)}</style>
${page.jsonLd?.length ? jsonLdTag(page.jsonLd) : ''}
${renderSlot(view.db, store.id, 'headEnd', {}, { preview: view.preview })}
</head><body>
${view.preview ? '<div class="announce" style="background:#1a1a1a">DRAFT PREVIEW — not what customers see</div>' : ''}
${brand.announcement ? `<div class="announce">${escapeHtml(brand.announcement)}</div>` : ''}
${renderSlot(view.db, store.id, 'announcementBar', {}, { preview: view.preview })}
<header class="site"><div class="wrap row">
  <a class="brandmark" href="${view.base}/">
    ${brand.logoSvg ? `<img src="${escapeHtml(brand.logoSvg)}" alt="">` : ''}
    <span><span class="name">${escapeHtml(store.name)}</span>${brand.slogan ? `<br><span class="sub">${escapeHtml(brand.slogan)}</span>` : ''}</span>
  </a>
  <nav class="main">${nav.map((entry) => `<a href="${view.base}${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a>`).join('')}</nav>
  <div class="tools"><a href="${view.base}/cart" style="text-decoration:none">Cart (${cartCount})</a></div>
</div></header>
<main>${page.body}</main>
<footer class="site"><div class="wrap">
  <div>
    <div class="word">${escapeHtml(store.name)}</div>
    <p style="opacity:.75;margin-top:.8rem;max-width:34ch">${escapeHtml(brand.description ?? '')}</p>
  </div>
  <div><div class="eyebrow" style="color:inherit;opacity:.6">Shop</div>${nav.map((entry) => `<a href="${view.base}${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a>`).join('')}</div>
  <div><div class="eyebrow" style="color:inherit;opacity:.6">Help</div>
    <a href="${view.base}/pages/shipping">Shipping &amp; returns</a>
    <a href="${view.base}/pages/about">About</a>
    <a href="${view.base}/cart">Cart</a></div>
</div></footer>
${renderSlot(view.db, store.id, 'bodyEnd', {}, { preview: view.preview })}
</body></html>`
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
  const buildOptions = `<div class="buildopts">
    <label class="buildopt" data-selected="true"><input type="radio" name="build" value="stock" checked>
      <span><strong>Stock build</strong><small>Ships in 14 days &middot; ${money(cheapest.priceCents, view)}</small></span></label>
    <label class="buildopt"><input type="radio" name="build" value="custom">
      <span><strong>Custom stitched</strong><small>Your initials, 21 days &middot; ${money(Math.round(cheapest.priceCents * 1.13), view)}</small></span></label>
  </div>`

  const body = `<div class="wrap pdp">
  <div class="gallery">
    <div class="main"><img id="pdp-main" src="${escapeHtml(unique[0] ?? '')}" alt="${escapeHtml(product.title)}"></div>
    ${unique.length > 1 ? `<div class="thumbs">${unique
        .map((src, index) => `<button type="button" aria-current="${index === 0}" data-src="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt=""></button>`)
        .join('')}</div>` : ''}
  </div>
  <div class="buybox">
    <div class="crumbs"><a href="${view.base}/">Home</a> / <a href="${view.base}/collections/all">Shop</a> / ${escapeHtml(product.title)}</div>
    ${stats.count ? `<div class="rating"><span class="stars">${stars(stats.average)}</span> ${stats.average} &middot; ${stats.count} reviews</div>` : ''}
    ${product.subtitle ? `<div class="eyebrow">${escapeHtml(product.subtitle)}</div>` : ''}
    <h1 style="font-size:clamp(2rem,4vw,3rem)">${escapeHtml(product.title)}</h1>
    <div class="price-lg" id="pdp-price">${money(cheapest.priceCents, view)}</div>
    ${optionBlocks}
    ${buildOptions}
    <form method="post" action="${view.base}/cart/add">
      <input type="hidden" name="variantId" id="pdp-variant" value="${escapeHtml(cheapest.id)}">
      <button class="btn btn--wide" type="submit" id="pdp-cta">Add to cart — <span>${money(cheapest.priceCents, view)}</span></button>
    </form>
    <p class="micro">${escapeHtml(product.variants.some((variant) => variant.inventory > 0) ? 'In stock and built to order. Free returns for 30 days.' : 'Made to order. Ships in 14 days.')}</p>
    ${content.benefits?.length ? `<ul class="benefits">${content.benefits.slice(0, 4).map((benefit) => `<li><strong>${escapeHtml(benefit.title)}</strong></li>`).join('')}</ul>` : ''}
    <div class="trust">${(content.trust?.length ? content.trust : [product.tags[0] ?? 'Made in small runs', 'Repaired in-house', 'Free shipping over 200']).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>
    ${content.guarantee ? `<div class="guarantee"><span class="badge">30</span><div><strong>Thirty-day guarantee</strong><p class="micro" style="margin:.2rem 0 0">${escapeHtml(content.guarantee)}</p></div></div>` : ''}
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
<div class="stickybar" id="stickybar">
  <div><div class="t">${escapeHtml(product.title)}</div><div class="p" id="sticky-price">${money(cheapest.priceCents, view)}</div></div>
  <button class="btn" type="button" onclick="document.getElementById('pdp-cta').closest('form').requestSubmit()">Add to cart</button>
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
    document.querySelector('#pdp-cta span').textContent = money(match.price);
    var sticky = document.getElementById('sticky-price'); if (sticky) sticky.textContent = money(match.price);
  }
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

export function checkoutPage(view: StoreView, totals: Totals, error?: string): string {
  const body = `<section class="wrap"><div class="section-head"><div><div class="eyebrow">Step 2 of 3</div><h2>Checkout</h2></div></div>
  ${error ? `<div class="notice" style="border-left-color:#b3261e;margin-bottom:1.4rem">${escapeHtml(error)}</div>` : ''}
  <div style="display:grid;gap:3rem;grid-template-columns:1.2fr .8fr;align-items:start">
  <form method="post" action="${view.base}/checkout">
    <div class="eyebrow" style="margin-bottom:.8rem">Contact</div>
    <div class="field"><label for="co-email">Email</label><input id="co-email" name="email" type="email" required placeholder="you@example.com"></div>
    <div class="eyebrow" style="margin:1.6rem 0 .8rem">Delivery</div>
    <div class="field"><label for="co-name">Name</label><input id="co-name" name="name" required></div>
    <div class="field"><label for="co-line1">Address</label><input id="co-line1" name="line1" required></div>
    <div class="two"><div class="field"><label for="co-city">City</label><input id="co-city" name="city" required></div>
      <div class="field"><label for="co-postal">Postcode</label><input id="co-postal" name="postal" required></div></div>
    <div class="field"><label for="co-country">Country</label><input id="co-country" name="country" value="US" required></div>
    <div class="eyebrow" style="margin:1.6rem 0 .8rem">Payment</div>
    <div class="notice"><strong>Card, Apple Pay, Google Pay and Link</strong>
      <p class="micro" style="margin:.5rem 0 0">This deployment has no payment provider connected, so the order is placed and marked captured without a charge.
      Connect Stripe in the admin and this block becomes the real Payment Element.</p></div>
    <label class="micro" style="display:flex;gap:.5rem;margin:1rem 0 1.4rem;align-items:center">
      <input type="checkbox" name="marketing" value="true" style="width:auto"> Email me when there is something new</label>
    <button class="btn btn--wide" type="submit">Pay ${money(totals.totalCents, view)}</button>
    <p class="micro" style="margin-top:.8rem">Free returns for 30 days. Your address is used to ship the order and nothing else.</p>
  </form>
  <div>${totalsBlock(view, totals)}
    <div class="micro" style="margin-top:1rem">${(view.cart?.items ?? []).map((item) => `${escapeHtml(item.title)} × ${item.quantity}`).join('<br>')}</div>
  </div></div></section>
  ${renderSlot(view.db, view.store.id, 'checkoutStart', {}, { preview: view.preview })}`
  return layout(view, { title: `Checkout — ${view.store.name}`, description: 'Checkout', body })
}

export function orderPage(view: StoreView, order: Order): string {
  const body = `<section class="wrap" style="max-width:min(680px,92vw)">
    <div class="eyebrow">Order confirmed</div>
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
    <p style="margin-top:2rem"><a class="btn btn--ghost" href="${view.base}/">Keep shopping</a></p>
    ${renderSlot(view.db, view.store.id, 'orderConfirmed', { orderId: order.id, total: order.totalCents }, { preview: view.preview })}
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
