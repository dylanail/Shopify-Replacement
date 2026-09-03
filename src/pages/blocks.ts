import { escapeHtml } from '../lib/http.ts'
import { format } from '../lib/money.ts'
import type { Schema } from '../lib/validate.ts'
import { check } from '../lib/validate.ts'

/**
 * The block library.
 *
 * A page is a flat list of blocks, the way Shopify's theme editor is a flat
 * list of sections; the vocabulary is Shopify's sections plus Funnelish's
 * conversion elements plus the parts an advertorial needs. Every block has a
 * schema (the same shape plugins and tools use, so one form renderer draws
 * the settings panel for all of them) and a render function that takes the
 * validated settings and the page context and returns HTML.
 *
 * Blocks never reach into the database. Anything that needs store data — a
 * buy box, a review wall, a bundle widget — is handed it through `context`,
 * which the storefront route assembles once per page.
 */
export type BlockInstance = { id: string; type: string; settings: Record<string, unknown> }

export type BlockContext = {
  storeName: string
  base: string
  currency: string
  products: Array<{
    id: string
    handle: string
    title: string
    subtitle: string
    image: string
    priceCents: number
    variants: Array<{ id: string; title: string; priceCents: number }>
    options: Array<{ title: string; values: Array<{ value: string; swatch?: string }> }>
  }>
  reviews: Array<{ productId: string; rating: number; title: string; body: string; author: string; verified: boolean; media?: string[] }>
  bundles: Array<{ productId: string; html: string }>
  brand: { primary?: string; secondary?: string; logoSvg?: string; slogan?: string }
  /** Live numbers the conversion blocks read. Always from real data; empty when there is none. */
  live?: {
    purchases: Array<{ name: string; city: string; product: string; image: string; at: string }>
    viewers: Record<string, number>
    stock: Record<string, number>
    estimates: Record<string, { from: string; to: string }>
    questions: Array<{ productId: string; question: string; answer: string; asker: string }>
    sizeCharts: Record<string, string>
  }
}

export type BlockDefinition = {
  type: string
  name: string
  group: 'Layout' | 'Text & media' | 'Commerce' | 'Social proof' | 'Conversion' | 'Advertorial' | 'Forms' | 'Advanced'
  icon: string
  description: string
  schema: Schema
  render: (settings: Record<string, unknown>, context: BlockContext, block: BlockInstance) => string
}

/* --------------------------------------------------------------- helpers */

const COMMON: Schema = {
  background: { type: 'string', label: 'Background', enum: ['paper', 'raise', 'ink', 'primary', 'none'], default: 'none' },
  padding: { type: 'string', label: 'Vertical padding', enum: ['none', 'small', 'medium', 'large'], default: 'medium' },
  width: { type: 'string', label: 'Width', enum: ['narrow', 'regular', 'wide', 'full'], default: 'regular' },
  align: { type: 'string', label: 'Text align', enum: ['left', 'center'], default: 'left' },
}

const e = escapeHtml

function wrap(settings: Record<string, unknown>, block: BlockInstance, inner: string, extra = ''): string {
  const classes = ['blk', `blk--${block.type}`, `bg-${settings.background ?? 'none'}`, `pad-${settings.padding ?? 'medium'}`, `w-${settings.width ?? 'regular'}`, `al-${settings.align ?? 'left'}`, extra]
  return `<section class="${classes.filter(Boolean).join(' ')}" data-block="${e(block.id)}"><div class="blk-in">${inner}</div></section>`
}

function button(label: unknown, href: unknown, style: unknown = 'primary'): string {
  if (!label) return ''
  return `<a class="btn ${style === 'ghost' ? 'btn--ghost' : ''} ${style === 'wide' ? 'btn--wide' : ''}" href="${e(href || '#')}">${e(label)}</a>`
}

function lines(text: unknown): string {
  return String(text ?? '')
    .split(/\n{2,}/)
    .filter((part) => part.trim())
    .map((part) => `<p>${e(part.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** One entry per line. Fields inside a line are split on `|` by the block itself. */
function list(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function productFor(context: BlockContext, id: unknown) {
  return context.products.find((product) => product.id === id || product.handle === id) ?? context.products[0] ?? null
}

function stars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)))
  return `<span class="stars" aria-label="${full} out of 5">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`
}

/* ---------------------------------------------------------------- blocks */

export const BLOCKS: BlockDefinition[] = [
  /* Layout */
  {
    type: 'announcement-bar',
    name: 'Announcement bar',
    group: 'Layout',
    icon: '▬',
    description: 'One line across the top: shipping promise, offer, deadline.',
    schema: { text: { type: 'string', label: 'Lines (one per line rotate)', multiline: true, required: true, default: 'FREE SHIPPING OVER $200 · 30-DAY RETURNS' }, ...COMMON },
    render: (settings, _context, block) => {
      const items = list(settings.text)
      if (items.length <= 1) return `<div class="announce" data-block="${e(block.id)}">${e(items[0] ?? settings.text)}</div>`
      return `<div class="announce announce--rotate" data-block="${e(block.id)}" data-rotate>${items.map((line, index) => `<span ${index ? 'hidden' : ''}>${e(line)}</span>`).join('')}</div>`
    },
  },
  {
    type: 'header',
    name: 'Header',
    group: 'Layout',
    icon: '⌂',
    description: 'Logo, name and navigation. Minimal by default, as a landing page should be.',
    schema: {
      showNav: { type: 'boolean', label: 'Show navigation', default: false },
      links: { type: 'string', label: 'Links (label|href per line)', multiline: true, default: 'Shop|/collections/all' },
      cta: { type: 'string', label: 'Button label', default: '' },
      ctaHref: { type: 'string', label: 'Button link', default: '#offer' },
    },
    render: (settings, context, block) => `<header class="site" data-block="${e(block.id)}"><div class="wrap row">
      <a class="brandmark" href="${context.base}/">${context.brand.logoSvg ? `<img src="${e(context.brand.logoSvg)}" alt="">` : ''}<span><span class="name">${e(context.storeName)}</span></span></a>
      ${settings.showNav ? `<nav class="main">${list(settings.links).map((entry) => { const [label = '', href = '#'] = entry.split('|'); return `<a href="${e(href.startsWith('/') ? context.base + href : href)}">${e(label)}</a>` }).join('')}</nav>` : '<span style="margin-left:auto"></span>'}
      ${settings.cta ? `<div class="tools">${button(settings.cta, settings.ctaHref)}</div>` : ''}</div></header>`,
  },
  {
    type: 'spacer',
    name: 'Spacer',
    group: 'Layout',
    icon: '↕',
    description: 'Vertical space.',
    schema: { height: { type: 'number', label: 'Height (px)', integer: true, min: 4, max: 400, default: 48 } },
    render: (settings, _context, block) => `<div data-block="${e(block.id)}" style="height:${Number(settings.height)}px"></div>`,
  },
  {
    type: 'divider',
    name: 'Divider',
    group: 'Layout',
    icon: '—',
    description: 'A rule between sections.',
    schema: { width: COMMON.width as never },
    render: (settings, _context, block) => wrap({ ...settings, padding: 'none' }, block, '<hr class="rule">'),
  },
  {
    type: 'footer',
    name: 'Footer',
    group: 'Layout',
    icon: '▁',
    description: 'Store name, links, legal line.',
    schema: { links: { type: 'string', label: 'Links (label|href per line)', multiline: true, default: 'Shipping & returns|/pages/shipping\nAbout|/pages/about' }, legal: { type: 'string', label: 'Legal line', default: '' } },
    render: (settings, context, block) => `<footer class="site" data-block="${e(block.id)}"><div class="wrap"><div><div class="word">${e(context.storeName)}</div><p style="opacity:.7;margin-top:.6rem">${e(context.brand.slogan ?? '')}</p></div>
      <div>${list(settings.links).map((entry) => { const [label = '', href = '#'] = entry.split('|'); return `<a href="${e(href.startsWith('/') ? context.base + href : href)}">${e(label)}</a>` }).join('')}</div>
      <div style="opacity:.6;font-size:.8rem">${e(settings.legal || `© ${new Date().getFullYear()} ${context.storeName}`)}</div></div></footer>`,
  },

  /* Text & media */
  {
    type: 'hero',
    name: 'Image banner',
    group: 'Text & media',
    icon: '▣',
    description: 'Full-width image with headline, subheading and a button. The Shopify "Image banner".',
    schema: {
      eyebrow: { type: 'string', label: 'Eyebrow', default: '' },
      headline: { type: 'string', label: 'Headline', required: true, default: 'The headline that earns the scroll' },
      sub: { type: 'string', label: 'Subheading', multiline: true, default: '' },
      image: { type: 'string', label: 'Background image URL', default: '' },
      cta: { type: 'string', label: 'Button label', default: 'Shop now' },
      ctaHref: { type: 'string', label: 'Button link', default: '#offer' },
      cta2: { type: 'string', label: 'Second button', default: '' },
      cta2Href: { type: 'string', label: 'Second button link', default: '' },
      height: { type: 'string', label: 'Height', enum: ['small', 'medium', 'large'], default: 'medium' },
      overlay: { type: 'number', label: 'Darken image (0–90)', integer: true, min: 0, max: 90, default: 45 },
    },
    render: (settings, _context, block) => `<div class="hero hero--${e(settings.height)}" data-block="${e(block.id)}" style="--overlay:${Number(settings.overlay) / 100}">
      ${settings.image ? `<img src="${e(settings.image)}" alt="" loading="eager" fetchpriority="high">` : ''}
      <div class="inner">${settings.eyebrow ? `<div class="eyebrow light">${e(settings.eyebrow)}</div>` : ''}<h1>${e(settings.headline)}</h1>${settings.sub ? `<p>${e(settings.sub)}</p>` : ''}
      <p class="ctas">${button(settings.cta, settings.ctaHref)} ${button(settings.cta2, settings.cta2Href, 'ghost')}</p></div></div>`,
  },
  {
    type: 'headline',
    name: 'Headline',
    group: 'Text & media',
    icon: 'H',
    description: 'A heading on its own, with optional eyebrow and subheading.',
    schema: {
      eyebrow: { type: 'string', label: 'Eyebrow', default: '' },
      text: { type: 'string', label: 'Headline', required: true, default: 'Say the one thing' },
      sub: { type: 'string', label: 'Subheading', multiline: true, default: '' },
      level: { type: 'string', label: 'Size', enum: ['h1', 'h2', 'h3'], default: 'h2' },
      ...COMMON,
    },
    render: (settings, _context, block) => wrap(settings, block, `${settings.eyebrow ? `<div class="eyebrow">${e(settings.eyebrow)}</div>` : ''}<${e(settings.level)} class="head">${e(settings.text)}</${e(settings.level)}>${settings.sub ? `<p class="lead">${e(settings.sub)}</p>` : ''}`),
  },
  {
    type: 'rich-text',
    name: 'Rich text',
    group: 'Text & media',
    icon: '¶',
    description: 'Paragraphs. A blank line starts a new one.',
    schema: { text: { type: 'string', label: 'Text', multiline: true, required: true, default: 'Write like you would say it.' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="prose">${lines(settings.text)}</div>`),
  },
  {
    type: 'image',
    name: 'Image',
    group: 'Text & media',
    icon: '▨',
    description: 'One image, optional caption.',
    schema: { src: { type: 'string', label: 'Image URL', required: true, default: '' }, alt: { type: 'string', label: 'Alt text', default: '' }, caption: { type: 'string', label: 'Caption', default: '' }, ...COMMON },
    render: (settings, _context, block) => wrap(settings, block, `<figure class="fig">${settings.src ? `<img src="${e(settings.src)}" alt="${e(settings.alt)}" loading="lazy" decoding="async">` : '<div class="ph">Add an image</div>'}${settings.caption ? `<figcaption>${e(settings.caption)}</figcaption>` : ''}</figure>`),
  },
  {
    type: 'image-with-text',
    name: 'Image with text',
    group: 'Text & media',
    icon: '◧',
    description: 'Image on one side, headline, text and a button on the other.',
    schema: {
      image: { type: 'string', label: 'Image URL', default: '' },
      imageSide: { type: 'string', label: 'Image side', enum: ['left', 'right'], default: 'left' },
      eyebrow: { type: 'string', label: 'Eyebrow', default: '' },
      headline: { type: 'string', label: 'Headline', required: true, default: 'A benefit, not a feature' },
      text: { type: 'string', label: 'Text', multiline: true, default: '' },
      cta: { type: 'string', label: 'Button label', default: '' },
      ctaHref: { type: 'string', label: 'Button link', default: '#offer' },
      ...COMMON,
    },
    render: (settings, _context, block) => wrap(settings, block, `<div class="iwt iwt--${e(settings.imageSide)}">
      <figure>${settings.image ? `<img src="${e(settings.image)}" alt="" loading="lazy" decoding="async">` : '<div class="ph">Image</div>'}</figure>
      <div>${settings.eyebrow ? `<div class="eyebrow">${e(settings.eyebrow)}</div>` : ''}<h2>${e(settings.headline)}</h2><div class="prose">${lines(settings.text)}</div><p>${button(settings.cta, settings.ctaHref)}</p></div></div>`),
  },
  {
    type: 'video',
    name: 'Video',
    group: 'Text & media',
    icon: '▶',
    description: 'YouTube, Vimeo or an MP4 URL. Loads on click, so it costs nothing until watched.',
    schema: { url: { type: 'string', label: 'Video URL', required: true, default: '' }, poster: { type: 'string', label: 'Poster image URL', default: '' }, caption: { type: 'string', label: 'Caption', default: '' }, ...COMMON },
    render: (settings, _context, block) => {
      const url = String(settings.url ?? '')
      const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/.exec(url)?.[1]
      const vimeo = /vimeo\.com\/(\d+)/.exec(url)?.[1]
      const embed = yt ? `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1` : vimeo ? `https://player.vimeo.com/video/${vimeo}?autoplay=1` : ''
      const inner = embed
        ? `<div class="video" data-embed="${e(embed)}">${settings.poster ? `<img src="${e(settings.poster)}" alt="" loading="lazy">` : ''}<button type="button" class="play" aria-label="Play">▶</button></div>`
        : url
          ? `<video class="video" controls preload="none" ${settings.poster ? `poster="${e(settings.poster)}"` : ''} src="${e(url)}"></video>`
          : '<div class="ph">Add a video URL</div>'
      return wrap(settings, block, `${inner}${settings.caption ? `<p class="micro">${e(settings.caption)}</p>` : ''}`)
    },
  },
  {
    type: 'carousel',
    name: 'Media carousel',
    group: 'Text & media',
    icon: '◫',
    description: 'A row of images that scrolls sideways. Slideshow on Shopify, carousel on Funnelish.',
    schema: { images: { type: 'string', label: 'Image URLs (one per line)', multiline: true, required: true, default: '' }, ...COMMON, width: { ...(COMMON.width as object), default: 'wide' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="carousel">${list(settings.images).map((src) => `<img src="${e(src)}" alt="" loading="lazy" decoding="async">`).join('')}</div>`),
  },
  {
    type: 'before-after',
    name: 'Before / after',
    group: 'Text & media',
    icon: '◐',
    description: 'Two images with a slider between them.',
    schema: { before: { type: 'string', label: 'Before image URL', required: true, default: '' }, after: { type: 'string', label: 'After image URL', required: true, default: '' }, beforeLabel: { type: 'string', default: 'Before' }, afterLabel: { type: 'string', default: 'After' }, ...COMMON },
    render: (settings, _context, block) => wrap(settings, block, `<div class="ba" style="--pos:50%"><img src="${e(settings.before)}" alt="${e(settings.beforeLabel)}" loading="lazy"><img class="after" src="${e(settings.after)}" alt="${e(settings.afterLabel)}" loading="lazy">
      <span class="lbl l">${e(settings.beforeLabel)}</span><span class="lbl r">${e(settings.afterLabel)}</span><input type="range" min="0" max="100" value="50" aria-label="Compare"></div>`),
  },
  {
    type: 'multicolumn',
    name: 'Multicolumn',
    group: 'Text & media',
    icon: '⫼',
    description: 'Three or four columns of icon, heading and text. Features, benefits, steps.',
    schema: {
      headline: { type: 'string', label: 'Headline', default: '' },
      columns: { type: 'string', label: 'Columns (icon|title|text per line)', multiline: true, required: true, default: '✦|Made properly|Named materials, one maker, small runs.\n✦|Repaired for life|Post it back; we fix it.\n✦|Free returns|Thirty days, no questions.' },
      perRow: { type: 'number', label: 'Per row', integer: true, min: 2, max: 4, default: 3 },
      ...COMMON,
    },
    render: (settings, _context, block) => wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}<div class="cols" style="--per:${Number(settings.perRow)}">${list(settings.columns).map((entry) => { const [icon = '', title = '', text = ''] = entry.split('|'); return `<div class="col"><div class="ico">${e(icon)}</div><h3>${e(title)}</h3><p>${e(text)}</p></div>` }).join('')}</div>`),
  },
  {
    type: 'button',
    name: 'Button',
    group: 'Text & media',
    icon: '▭',
    description: 'A call to action on its own.',
    schema: { label: { type: 'string', label: 'Label', required: true, default: 'Get yours' }, href: { type: 'string', label: 'Link', default: '#offer' }, style: { type: 'string', enum: ['primary', 'ghost', 'wide'], default: 'primary' }, note: { type: 'string', label: 'Line under the button', default: '' }, ...COMMON, align: { ...(COMMON.align as object), default: 'center' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<p>${button(settings.label, settings.href, settings.style)}</p>${settings.note ? `<p class="micro">${e(settings.note)}</p>` : ''}`),
  },

  /* Commerce */
  {
    type: 'buy-box',
    name: 'Product buy box',
    group: 'Commerce',
    icon: '🛒',
    description: 'A product with its options, price and add-to-cart, embedded in any page. Funnelish order form, Shopify featured product.',
    schema: { productId: { type: 'string', label: 'Product', required: true, default: '' }, showImage: { type: 'boolean', label: 'Show image', default: true }, buyNow: { type: 'boolean', label: 'Skip cart, go straight to checkout', default: true }, ...COMMON, width: { ...(COMMON.width as object), default: 'regular' } as never },
    render: (settings, context, block) => {
      const product = productFor(context, settings.productId)
      if (!product) return wrap(settings, block, '<div class="ph">Choose a product</div>')
      const cheapest = product.variants[0]
      const bundle = context.bundles.find((entry) => entry.productId === product.id)
      return wrap(settings, block, `<div class="buybox-blk" id="offer">
        ${settings.showImage ? `<figure><img src="${e(product.image)}" alt="${e(product.title)}" loading="lazy"></figure>` : ''}
        <div>
          <h2>${e(product.title)}</h2>${product.subtitle ? `<p class="lead">${e(product.subtitle)}</p>` : ''}
          <div class="price-lg">${format(cheapest?.priceCents ?? product.priceCents, context.currency)}</div>
          <form method="post" action="${context.base}${settings.buyNow ? '/checkout/buy' : '/cart/add'}" class="buyform">
            ${product.variants.length > 1 ? `<label class="opt"><span class="label">Choose</span><select name="variantId">${product.variants.map((variant) => `<option value="${e(variant.id)}">${e(variant.title)} — ${format(variant.priceCents, context.currency)}</option>`).join('')}</select></label>` : `<input type="hidden" name="variantId" value="${e(cheapest?.id ?? '')}">`}
            ${bundle ? bundle.html : '<input type="hidden" name="quantity" value="1">'}
            <button class="btn btn--wide" type="submit">${settings.buyNow ? 'Buy now' : 'Add to cart'} — <span data-total>${format(cheapest?.priceCents ?? 0, context.currency)}</span></button>
          </form>
          <p class="micro">Free returns for 30 days · Secure checkout · Ships in 14 days</p>
        </div></div>`)
    },
  },
  {
    type: 'featured-products',
    name: 'Featured products',
    group: 'Commerce',
    icon: '▦',
    description: 'A grid of products from the catalog.',
    schema: { headline: { type: 'string', label: 'Headline', default: 'What we make' }, count: { type: 'number', label: 'How many', integer: true, min: 1, max: 12, default: 3 }, ...COMMON },
    render: (settings, context, block) => wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}<div class="grid">${context.products.slice(0, Number(settings.count)).map((product) => `<a class="card" href="${context.base}/products/${e(product.handle)}"><figure><img src="${e(product.image)}" alt="${e(product.title)}" loading="lazy"></figure><div class="body"><div class="title">${e(product.title)}</div><div class="sub">${e(product.subtitle)}</div><div class="price">${format(product.priceCents, context.currency)}</div></div></a>`).join('')}</div>`),
  },
  {
    type: 'bundle-offer',
    name: 'Bundle offer',
    group: 'Commerce',
    icon: '⧉',
    description: 'The quantity-break widget for a product: buy 1, 2, 3 with savings, badges, free shipping and a gift on the higher tiers.',
    schema: { productId: { type: 'string', label: 'Product', required: true, default: '' }, headline: { type: 'string', label: 'Headline', default: 'Bundle & save' }, ...COMMON },
    render: (settings, context, block) => {
      const product = productFor(context, settings.productId)
      const bundle = product ? context.bundles.find((entry) => entry.productId === product.id) : null
      if (!product || !bundle) return wrap(settings, block, '<div class="ph">Create a bundle for this product under Bundles, then it renders here.</div>')
      return wrap(settings, block, `<div id="offer">${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}<form method="post" action="${context.base}/checkout/buy" class="buyform"><input type="hidden" name="variantId" value="${e(product.variants[0]?.id ?? '')}">${bundle.html}<button class="btn btn--wide" type="submit">Claim this offer — <span data-total>${format(product.priceCents, context.currency)}</span></button></form></div>`)
    },
  },
  {
    type: 'guarantee',
    name: 'Guarantee',
    group: 'Commerce',
    icon: '✓',
    description: 'The risk reversal, with a badge.',
    schema: { days: { type: 'number', label: 'Days', integer: true, min: 1, max: 365, default: 30 }, headline: { type: 'string', default: 'Thirty-day guarantee' }, text: { type: 'string', multiline: true, default: 'If it is not what you hoped, send it back and we refund the lot. We cover the return label.' }, ...COMMON },
    render: (settings, _context, block) => wrap(settings, block, `<div class="guarantee"><span class="badge">${Number(settings.days)}</span><div><strong>${e(settings.headline)}</strong><p class="micro" style="margin:.2rem 0 0">${e(settings.text)}</p></div></div>`),
  },
  {
    type: 'comparison',
    name: 'Comparison table',
    group: 'Commerce',
    icon: '⊞',
    description: 'Us against the usual, row by row.',
    schema: { usLabel: { type: 'string', label: 'Our column', default: '' }, themLabel: { type: 'string', label: 'Their column', default: 'The usual' }, rows: { type: 'string', label: 'Rows (label|us|them per line)', multiline: true, required: true, default: 'Materials|Named, chosen one at a time|Unspecified\nMade|Small runs, by name|Factory line\nRepairs|In-house|None\nReturns|30 days, free|Varies' }, ...COMMON },
    render: (settings, context, block) => wrap(settings, block, `<div class="tablewrap"><table class="compare"><thead><tr><th></th><th class="us">${e(settings.usLabel || context.storeName)}</th><th>${e(settings.themLabel)}</th></tr></thead><tbody>${list(settings.rows).map((entry) => { const [label = '', us = '', them = ''] = entry.split('|'); return `<tr><th>${e(label)}</th><td class="us">${e(us)}</td><td>${e(them)}</td></tr>` }).join('')}</tbody></table></div>`),
  },

  /* Social proof */
  {
    type: 'testimonials',
    name: 'Testimonials',
    group: 'Social proof',
    icon: '❝',
    description: 'Quotes you type in. For real product reviews use the review wall.',
    schema: { headline: { type: 'string', default: '' }, quotes: { type: 'string', label: 'Quotes (stars|quote|name per line)', multiline: true, required: true, default: '5|Four months of sparring and the stitching has not moved.|Marisol A.\n5|My old gloves went soft inside a year. These have not.|Dev P.' }, ...COMMON },
    render: (settings, _context, block) => wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}<div class="reviews">${list(settings.quotes).map((entry) => { const [rating = '5', quote = '', name = ''] = entry.split('|'); return `<article class="review">${stars(Number(rating))}<p style="margin:.5rem 0 0">${e(quote)}</p><div class="who">${e(name)}</div></article>` }).join('')}</div>`),
  },
  {
    type: 'review-wall',
    name: 'Review wall',
    group: 'Social proof',
    icon: '★',
    description: 'Approved reviews from the catalog, live.',
    schema: { productId: { type: 'string', label: 'Product (empty for all)', default: '' }, count: { type: 'number', integer: true, min: 1, max: 24, default: 6 }, headline: { type: 'string', default: 'What people say' }, ...COMMON },
    render: (settings, context, block) => {
      const reviews = context.reviews.filter((review) => !settings.productId || review.productId === settings.productId).slice(0, Number(settings.count))
      const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0
      return wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}${reviews.length ? `<div class="rating">${stars(average)} ${average.toFixed(1)} · ${reviews.length} reviews</div>` : ''}<div class="reviews">${reviews.map((review) => `<article class="review">${stars(review.rating)}${review.title ? `<h3 style="margin:.5rem 0 .3rem">${e(review.title)}</h3>` : ''}<p style="margin:.4rem 0 0">${e(review.body)}</p><div class="who">${e(review.author)}${review.verified ? ' · verified buyer' : ''}</div></article>`).join('') || '<p class="micro">No approved reviews yet.</p>'}</div>`)
    },
  },
  {
    type: 'logos',
    name: 'As seen on',
    group: 'Social proof',
    icon: '◈',
    description: 'A strip of publication or partner names.',
    schema: { label: { type: 'string', default: 'As seen in' }, names: { type: 'string', label: 'Names (one per line)', multiline: true, required: true, default: 'The Fight Journal\nRingside Weekly\nGym Quarterly' }, ...COMMON, align: { ...(COMMON.align as object), default: 'center' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="eyebrow">${e(settings.label)}</div><div class="logos">${list(settings.names).map((name) => `<span>${e(name)}</span>`).join('')}</div>`),
  },
  {
    type: 'trust-badges',
    name: 'Trust badges',
    group: 'Social proof',
    icon: '⛨',
    description: 'Secure checkout, free returns, made-in — the row under the button.',
    schema: { items: { type: 'string', label: 'Badges (icon|text per line)', multiline: true, required: true, default: '🔒|Secure checkout\n↩|Free 30-day returns\n🚚|Free shipping over $200\n✎|Repaired for life' }, ...COMMON, align: { ...(COMMON.align as object), default: 'center' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="badges">${list(settings.items).map((entry) => { const [icon = '', text = ''] = entry.split('|'); return `<span><i>${e(icon)}</i>${e(text)}</span>` }).join('')}</div>`),
  },
  {
    type: 'comments',
    name: 'Comments',
    group: 'Social proof',
    icon: '💬',
    description: 'A social-style comment thread. Label it honestly; the FTC does.',
    schema: { comments: { type: 'string', label: 'Comments (name|time|text per line)', multiline: true, required: true, default: 'Priya N.|2h|Sizing runs true. 14oz for bags, 16oz for sparring.\nOwen B.|5h|Asked about a repair and got a real answer in two hours.' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="comments">${list(settings.comments).map((entry) => { const [name = '', time = '', text = ''] = entry.split('|'); return `<div class="comment"><span class="av">${e(name.slice(0, 1))}</span><div><div class="meta"><strong>${e(name)}</strong> · ${e(time)}</div><p>${e(text)}</p></div></div>` }).join('')}</div>`),
  },

  /* Conversion */
  {
    type: 'countdown',
    name: 'Countdown timer',
    group: 'Conversion',
    icon: '⏱',
    description: 'A deadline. Fixed date, or evergreen per visitor.',
    schema: { text: { type: 'string', label: 'Text', default: 'Offer ends in' }, mode: { type: 'string', enum: ['evergreen', 'fixed'], default: 'evergreen' }, minutes: { type: 'number', label: 'Evergreen minutes', integer: true, min: 1, max: 10080, default: 15 }, endsAt: { type: 'string', label: 'Fixed end (ISO date)', default: '' }, ...COMMON, align: { ...(COMMON.align as object), default: 'center' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="countdown" data-mode="${e(settings.mode)}" data-minutes="${Number(settings.minutes)}" data-ends="${e(settings.endsAt)}" data-key="cd-${e(block.id)}"><span class="lbl">${e(settings.text)}</span><span class="clock"><b data-h>00</b>:<b data-m>00</b>:<b data-s>00</b></span></div>`),
  },
  {
    type: 'progress-bar',
    name: 'Progress bar',
    group: 'Conversion',
    icon: '▰',
    description: '"73% claimed", "stock nearly gone": momentum you can see.',
    schema: { label: { type: 'string', default: '73% of this batch claimed' }, percent: { type: 'number', integer: true, min: 1, max: 100, default: 73 }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="progress"><div class="meta">${e(settings.label)}</div><div class="track"><div class="fill" style="width:${Number(settings.percent)}%"></div></div></div>`),
  },
  {
    type: 'sticky-cta',
    name: 'Sticky button',
    group: 'Conversion',
    icon: '⤓',
    description: 'A bar pinned to the bottom of the screen once the reader scrolls past the first button.',
    schema: { label: { type: 'string', required: true, default: 'Claim the offer' }, href: { type: 'string', default: '#offer' }, note: { type: 'string', default: '' } },
    render: (settings, _context, block) => `<div class="stickybar" data-block="${e(block.id)}" data-sticky><div>${settings.note ? `<div class="p">${e(settings.note)}</div>` : ''}</div><a class="btn" href="${e(settings.href)}">${e(settings.label)}</a></div>`,
  },
  {
    type: 'offer-box',
    name: 'Offer box',
    group: 'Conversion',
    icon: '◘',
    description: 'The boxed offer: what they get, what it costs, the button. Points at the buy box or the checkout.',
    schema: { headline: { type: 'string', required: true, default: 'Today only: 15% off + free shipping' }, bullets: { type: 'string', label: 'What they get (one per line)', multiline: true, default: 'Free shipping\n30-day returns\nRepaired for life' }, price: { type: 'string', label: 'Price line', default: '' }, cta: { type: 'string', default: 'Get the offer' }, href: { type: 'string', default: '#offer' }, ...COMMON },
    render: (settings, _context, block) => wrap(settings, block, `<div class="offer"><h2>${e(settings.headline)}</h2><ul>${list(settings.bullets).map((line) => `<li>${e(line)}</li>`).join('')}</ul>${settings.price ? `<div class="price-lg">${e(settings.price)}</div>` : ''}<p>${button(settings.cta, settings.href, 'wide')}</p></div>`),
  },
  {
    type: 'faq',
    name: 'Collapsible content',
    group: 'Conversion',
    icon: '⌄',
    description: 'Questions that open. Shopify calls it collapsible content.',
    schema: { headline: { type: 'string', default: 'Questions' }, items: { type: 'string', label: 'Items (question|answer per line)', multiline: true, required: true, default: 'When will it ship?|Built to order; fourteen days.\nWhat if it is not right?|Send it back within thirty days.' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}${list(settings.items).map((entry, index) => { const [q = '', a = ''] = entry.split('|'); return `<details class="faq" ${index === 0 ? 'open' : ''}><summary>${e(q)}</summary><p>${e(a)}</p></details>` }).join('')}`),
  },

  /* Advertorial */
  {
    type: 'publication-bar',
    name: 'Publication bar',
    group: 'Advertorial',
    icon: '▔',
    description: 'The masthead an advertorial sits under, with the "advertisement" label the FTC expects.',
    schema: { name: { type: 'string', required: true, default: 'The Fight Journal' }, section: { type: 'string', default: 'Gear' }, label: { type: 'string', label: 'Disclosure label', default: 'Advertisement' } },
    render: (settings, _context, block) => `<div class="pubbar" data-block="${e(block.id)}"><div class="wrap"><span class="pub">${e(settings.name)}</span><span class="sec">${e(settings.section)}</span><span class="adv">${e(settings.label)}</span></div></div>`,
  },
  {
    type: 'byline',
    name: 'Byline',
    group: 'Advertorial',
    icon: '✎',
    description: 'Author, date, read time.',
    schema: { author: { type: 'string', required: true, default: 'By a staff writer' }, date: { type: 'string', default: '' }, readTime: { type: 'string', default: '4 min read' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never, padding: { ...(COMMON.padding as object), default: 'small' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="byline"><span class="av">${e(String(settings.author).replace(/^By /i, '').slice(0, 1))}</span><div><strong>${e(settings.author)}</strong><div class="micro">${e(settings.date || new Date().toISOString().slice(0, 10))} · ${e(settings.readTime)}</div></div></div>`),
  },
  {
    type: 'numbered-reason',
    name: 'Numbered reason',
    group: 'Advertorial',
    icon: '①',
    description: 'One item of a listicle: number, heading, image, text.',
    schema: { number: { type: 'number', integer: true, min: 1, max: 99, default: 1 }, headline: { type: 'string', required: true, default: 'The reason' }, image: { type: 'string', label: 'Image URL', default: '' }, text: { type: 'string', multiline: true, default: '' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="reason"><div class="num">${Number(settings.number)}</div><h2>${e(settings.headline)}</h2>${settings.image ? `<figure class="fig"><img src="${e(settings.image)}" alt="" loading="lazy" decoding="async"></figure>` : ''}<div class="prose">${lines(settings.text)}</div></div>`),
  },
  {
    type: 'pull-quote',
    name: 'Pull quote',
    group: 'Advertorial',
    icon: '“',
    description: 'A big quote between paragraphs.',
    schema: { quote: { type: 'string', required: true, default: 'I stopped thinking about my gear. That is the whole point.' }, who: { type: 'string', default: '' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<blockquote class="pull">${e(settings.quote)}${settings.who ? `<cite>${e(settings.who)}</cite>` : ''}</blockquote>`),
  },
  {
    type: 'disclaimer',
    name: 'Disclaimer',
    group: 'Advertorial',
    icon: '§',
    description: 'The small print. Required on advertorials.',
    schema: { text: { type: 'string', multiline: true, required: true, default: 'This is an advertisement. The page is sponsored by the brand featured; results described are individual experiences and not a guarantee.' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<p class="micro disclaimer">${e(settings.text)}</p>`),
  },
  {
    type: 'share-bar',
    name: 'Share bar',
    group: 'Advertorial',
    icon: '⇪',
    description: 'Share links for the article.',
    schema: { text: { type: 'string', default: 'Share this' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never, padding: { ...(COMMON.padding as object), default: 'small' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="share"><span class="eyebrow">${e(settings.text)}</span><a href="#" data-share="facebook">Facebook</a><a href="#" data-share="x">X</a><a href="#" data-share="copy">Copy link</a></div>`),
  },

  /* Forms */
  {
    type: 'email-signup',
    name: 'Email signup',
    group: 'Forms',
    icon: '✉',
    description: 'Collect an email. Lands in customers with marketing on.',
    schema: { headline: { type: 'string', default: 'Get the next drop first' }, text: { type: 'string', default: '' }, button: { type: 'string', default: 'Join' }, ...COMMON, align: { ...(COMMON.align as object), default: 'center' } as never },
    render: (settings, context, block) => wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}${settings.text ? `<p class="lead">${e(settings.text)}</p>` : ''}<form method="post" action="${context.base}/subscribe" class="signup"><input name="email" type="email" required placeholder="you@example.com" aria-label="Email"><button class="btn" type="submit">${e(settings.button)}</button></form>`),
  },
  {
    type: 'contact-form',
    name: 'Contact form',
    group: 'Forms',
    icon: '✍',
    description: 'Name, email, message.',
    schema: { headline: { type: 'string', default: 'Ask us anything' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, context, block) => wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}<form method="post" action="${context.base}/contact" class="contact"><div class="two"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div></div><div class="field"><label>Message</label><textarea name="message" rows="4" required></textarea></div><button class="btn" type="submit">Send</button></form>`),
  },

  /* Dropshipping conversion set */
  {
    type: 'recent-sales',
    name: 'Recent sales popups',
    group: 'Conversion',
    icon: '◉',
    description: '"Marisol from Mexico City bought…" — from real orders only. Shows nothing until there are some.',
    schema: { delaySeconds: { type: 'number', integer: true, min: 3, max: 120, default: 8 }, everySeconds: { type: 'number', integer: true, min: 5, max: 300, default: 25 }, position: { type: 'string', enum: ['bottom-left', 'bottom-right'], default: 'bottom-left' } },
    render: (settings, context, block) => {
      const purchases = context.live?.purchases ?? []
      if (!purchases.length) return `<!-- data-block="${e(block.id)}" recent-sales: no orders yet -->`
      return `<div class="salespop salespop--${e(settings.position)}" data-block="${e(block.id)}" data-delay="${Number(settings.delaySeconds)}" data-every="${Number(settings.everySeconds)}" data-items='${e(JSON.stringify(purchases.slice(0, 10)))}' hidden><img alt=""><div><b></b><span></span><small></small></div></div>`
    },
  },
  {
    type: 'live-viewers',
    name: 'Live viewers',
    group: 'Conversion',
    icon: '👁',
    description: '"14 people are looking at this right now" — real sessions in the last 30 minutes.',
    schema: { productId: { type: 'string', label: 'Product', required: true, default: '' }, minimum: { type: 'number', label: 'Hide below', integer: true, min: 1, default: 3 }, ...COMMON, padding: { ...(COMMON.padding as object), default: 'none' } as never },
    render: (settings, context, block) => {
      const product = productFor(context, settings.productId)
      const count = product ? (context.live?.viewers[product.id] ?? 0) : 0
      if (count < Number(settings.minimum)) return `<!-- data-block="${e(block.id)}" live-viewers: ${count} -->`
      return wrap(settings, block, `<div class="viewers"><i></i> ${count} people are looking at this right now</div>`)
    },
  },
  {
    type: 'stock-scarcity',
    name: 'Stock scarcity',
    group: 'Conversion',
    icon: '▮',
    description: '"Only 7 left" with a bar — from real inventory.',
    schema: { productId: { type: 'string', label: 'Product', required: true, default: '' }, threshold: { type: 'number', label: 'Show when at or below', integer: true, min: 1, default: 15 }, ...COMMON, padding: { ...(COMMON.padding as object), default: 'none' } as never },
    render: (settings, context, block) => {
      const product = productFor(context, settings.productId)
      const stock = product ? (context.live?.stock[product.id] ?? 0) : 0
      if (!product || stock <= 0 || stock > Number(settings.threshold)) return `<!-- data-block="${e(block.id)}" stock-scarcity: ${stock} -->`
      const percent = Math.max(6, Math.round((stock / Number(settings.threshold)) * 100))
      return wrap(settings, block, `<div class="scarcity"><div class="meta">Only <b>${stock}</b> left in this batch</div><div class="track"><div class="fill" style="width:${percent}%"></div></div></div>`)
    },
  },
  {
    type: 'delivery-estimate',
    name: 'Delivery estimate',
    group: 'Conversion',
    icon: '🚚',
    description: '"Order in the next 3h to have it by Sep 12–16" — from the supplier lead times.',
    schema: { productId: { type: 'string', label: 'Product', required: true, default: '' }, cutoffHour: { type: 'number', label: 'Cut-off hour (24h)', integer: true, min: 0, max: 23, default: 15 }, ...COMMON, padding: { ...(COMMON.padding as object), default: 'none' } as never },
    render: (settings, context, block) => {
      const product = productFor(context, settings.productId)
      const estimate = product ? context.live?.estimates[product.id] : null
      if (!estimate) return `<!-- data-block="${e(block.id)}" delivery-estimate -->`
      return wrap(settings, block, `<div class="edd" data-cutoff="${Number(settings.cutoffHour)}"><span class="ico">🚚</span><div>Order <b data-cutoff-text>today</b> for delivery by <b>${e(estimate.from)} – ${e(estimate.to)}</b></div></div>`)
    },
  },
  {
    type: 'free-shipping-bar',
    name: 'Free shipping bar',
    group: 'Conversion',
    icon: '▬',
    description: 'How far the cart is from free shipping. Sits at the top like an announcement.',
    schema: { thresholdCents: { type: 'number', label: 'Threshold (minor units)', integer: true, min: 0, default: 20000 }, text: { type: 'string', default: 'Free shipping on orders over {threshold}' } },
    render: (settings, context, block) => `<div class="shipbar" data-block="${e(block.id)}" data-threshold="${Number(settings.thresholdCents)}" data-currency="${e(context.currency)}"><span data-text>${e(String(settings.text).replace('{threshold}', format(Number(settings.thresholdCents), context.currency)))}</span><i class="track"><i class="fill" style="width:0"></i></i></div>`,
  },
  {
    type: 'payment-icons',
    name: 'Payment icons',
    group: 'Social proof',
    icon: '💳',
    description: 'The row of card and wallet marks that says "this is a real shop".',
    schema: { methods: { type: 'string', label: 'Methods (one per line)', multiline: true, default: 'VISA\nMastercard\nAMEX\nApple Pay\nGoogle Pay\nPayPal\nKlarna' }, ...COMMON, padding: { ...(COMMON.padding as object), default: 'small' } as never, align: { ...(COMMON.align as object), default: 'center' } as never },
    render: (settings, _context, block) => wrap(settings, block, `<div class="payicons">${list(settings.methods).map((method) => `<i>${e(method)}</i>`).join('')}</div>`),
  },
  {
    type: 'size-chart',
    name: 'Size chart',
    group: 'Commerce',
    icon: '📏',
    description: 'A measurements table, in a collapsible so it does not eat the page.',
    schema: { title: { type: 'string', default: 'Size guide' }, rows: { type: 'string', label: 'Rows (first line is the header; cells separated by |)', multiline: true, required: true, default: 'Size|Chest|Waist\nS|86–91|71–76\nM|91–97|76–81\nL|97–102|81–86\nXL|102–107|86–91' }, note: { type: 'string', default: 'Measurements in cm. Between sizes? Size up.' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, _context, block) => {
      const [header = '', ...body] = list(settings.rows)
      return wrap(settings, block, `<details class="sizechart"><summary>${e(settings.title)}</summary><div class="tablewrap"><table class="compare"><thead><tr>${header.split('|').map((cell) => `<th>${e(cell.trim())}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.split('|').map((cell, index) => index === 0 ? `<th>${e(cell.trim())}</th>` : `<td>${e(cell.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${settings.note ? `<p class="micro">${e(settings.note)}</p>` : ''}</details>`)
    },
  },
  {
    type: 'ugc-gallery',
    name: 'Customer photos',
    group: 'Social proof',
    icon: '▦',
    description: 'A grid of photos from reviews. Real ones; nothing until there are some.',
    schema: { productId: { type: 'string', label: 'Product (empty for all)', default: '' }, headline: { type: 'string', default: 'From customers' }, count: { type: 'number', integer: true, min: 2, max: 24, default: 8 }, ...COMMON },
    render: (settings, context, block) => {
      const photos = context.reviews.filter((review) => (!settings.productId || review.productId === settings.productId) && review.media?.length).flatMap((review) => (review.media ?? []).map((url) => ({ url, author: review.author, body: review.body }))).slice(0, Number(settings.count))
      if (!photos.length) return `<!-- data-block="${e(block.id)}" ugc-gallery: no photos yet -->`
      return wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}<div class="ugc">${photos.map((photo) => `<figure><img src="${e(photo.url)}" alt="${e(photo.body.slice(0, 80))}" loading="lazy"><figcaption>${e(photo.author)}</figcaption></figure>`).join('')}</div>`)
    },
  },
  {
    type: 'product-qa',
    name: 'Questions & answers',
    group: 'Social proof',
    icon: '?',
    description: 'Answered customer questions, and a form to ask one.',
    schema: { productId: { type: 'string', label: 'Product', required: true, default: '' }, headline: { type: 'string', default: 'Questions people asked' }, ...COMMON, width: { ...(COMMON.width as object), default: 'narrow' } as never },
    render: (settings, context, block) => {
      const product = productFor(context, settings.productId)
      const questions = (context.live?.questions ?? []).filter((entry) => product && entry.productId === product.id && entry.answer)
      return wrap(settings, block, `${settings.headline ? `<h2 class="head">${e(settings.headline)}</h2>` : ''}${questions.map((entry) => `<details class="faq"><summary>${e(entry.question)}</summary><p>${e(entry.answer)}${entry.asker ? ` <span class="micro">— asked by ${e(entry.asker)}</span>` : ''}</p></details>`).join('') || '<p class="micro">No questions yet — ask the first.</p>'}
        ${product ? `<form method="post" action="${context.base}/products/${e(product.handle)}/questions" class="qa-form"><div class="two"><input name="asker" placeholder="Your name"><input name="email" type="email" placeholder="Email (for the answer)"></div><textarea name="question" rows="2" required placeholder="Ask a question about ${e(product.title)}"></textarea><button class="btn btn--ghost" type="submit">Ask</button></form>` : ''}`)
    },
  },

  /* Advanced */
  {
    type: 'custom-html',
    name: 'Custom HTML',
    group: 'Advanced',
    icon: '</>',
    description: 'Raw HTML, rendered as-is. Shopify calls it custom liquid.',
    schema: { html: { type: 'string', label: 'HTML', multiline: true, required: true, default: '<p>Anything.</p>' }, ...COMMON },
    render: (settings, _context, block) => wrap(settings, block, String(settings.html ?? '')),
  },
  {
    type: 'custom-code',
    name: 'Custom code',
    group: 'Advanced',
    icon: '{}',
    description: 'CSS and script for this page only.',
    schema: { css: { type: 'string', label: 'CSS', multiline: true, default: '' }, js: { type: 'string', label: 'JavaScript', multiline: true, default: '' } },
    render: (settings, _context, block) => `<!-- custom-code data-block="${e(block.id)}" -->${settings.css ? `<style data-block="${e(block.id)}">${String(settings.css)}</style>` : ''}${settings.js ? `<script data-block="${e(block.id)}">${String(settings.js)}</script>` : ''}`,
  },
]

const byType = new Map(BLOCKS.map((block) => [block.type, block]))

export function blockDefinition(type: string): BlockDefinition | null {
  return byType.get(type) ?? null
}

export function blockGroups(): Array<{ group: BlockDefinition['group']; blocks: BlockDefinition[] }> {
  const order: BlockDefinition['group'][] = ['Layout', 'Text & media', 'Commerce', 'Social proof', 'Conversion', 'Advertorial', 'Forms', 'Advanced']
  return order.map((group) => ({ group, blocks: BLOCKS.filter((block) => block.group === group) }))
}

/** Validated settings for a block, with defaults filled in. Unknown types render a visible note, never nothing. */
export function renderBlock(block: BlockInstance, context: BlockContext): string {
  const definition = byType.get(block.type)
  if (!definition) return `<section class="blk" data-block="${e(block.id)}"><div class="blk-in"><p class="micro">Unknown block: ${e(block.type)}</p></div></section>`
  const validated = check(definition.schema, block.settings)
  // A setting that fails its own field takes the default; the rest survive.
  // A page with one bad number in one block must not lose the block.
  const settings = validated.ok ? validated.value : { ...defaultsFor(definition), ...pickValid(definition, block.settings) }
  try {
    return definition.render(settings, context, block)
  } catch (error) {
    return `<section class="blk" data-block="${e(block.id)}"><div class="blk-in"><p class="micro">${e(definition.name)} could not render: ${e(error instanceof Error ? error.message : String(error))}</p></div></section>`
  }
}

function pickValid(definition: BlockDefinition, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(definition.schema)) {
    if (raw[key] === undefined) continue
    const single = check({ [key]: { ...field, required: false } }, { [key]: raw[key] })
    if (single.ok && single.value[key] !== undefined) out[key] = single.value[key]
  }
  return out
}

export function renderBlocks(blocks: BlockInstance[], context: BlockContext): string {
  return blocks.map((block) => renderBlock(block, context)).join('\n')
}

export function defaultsFor(definition: BlockDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(definition.schema)) if ('default' in field && field.default !== undefined) out[key] = field.default
  return out
}

/** The runtime the blocks need: countdowns, lazy video, before/after, sticky bar, share. Small, inline, dependency-free. */
export const BLOCK_RUNTIME = `(function(){
function pad(n){return String(Math.max(0,n)).padStart(2,'0')}
document.querySelectorAll('.countdown').forEach(function(el){
  var ends; if(el.dataset.mode==='fixed'&&el.dataset.ends){ends=Date.parse(el.dataset.ends)}
  else{var k=el.dataset.key;try{ends=Number(localStorage.getItem(k))}catch(e){ends=0}
    if(!ends||ends<Date.now()){ends=Date.now()+Number(el.dataset.minutes||15)*60000;try{localStorage.setItem(k,String(ends))}catch(e){}}}
  function tick(){var d=Math.max(0,Math.floor((ends-Date.now())/1000));el.querySelector('[data-h]').textContent=pad(Math.floor(d/3600));el.querySelector('[data-m]').textContent=pad(Math.floor(d%3600/60));el.querySelector('[data-s]').textContent=pad(d%60)}
  tick();setInterval(tick,1000)});
document.querySelectorAll('.video[data-embed]').forEach(function(el){el.addEventListener('click',function(){var f=document.createElement('iframe');f.src=el.dataset.embed;f.allow='autoplay; encrypted-media';f.allowFullscreen=true;el.replaceChildren(f);el.classList.add('on')})});
document.querySelectorAll('.ba input').forEach(function(r){r.addEventListener('input',function(){r.parentElement.style.setProperty('--pos',r.value+'%')})});
var bar=document.querySelector('[data-sticky]'),first=document.querySelector('.btn');
if(bar&&first&&'IntersectionObserver' in window){new IntersectionObserver(function(en){bar.classList.toggle('show',!en[0].isIntersecting&&en[0].boundingClientRect.top<0)}).observe(first)}
document.querySelectorAll('[data-share]').forEach(function(a){a.addEventListener('click',function(ev){ev.preventDefault();var u=location.href,t=a.dataset.share;
  if(t==='copy'){navigator.clipboard&&navigator.clipboard.writeText(u);a.textContent='Copied';return}
  window.open(t==='x'?'https://twitter.com/intent/tweet?url='+encodeURIComponent(u):'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(u),'_blank','noopener')})});
document.querySelectorAll('[data-rotate]').forEach(function(bar){var i=0,items=bar.querySelectorAll('span');if(items.length<2)return;setInterval(function(){items[i].hidden=true;i=(i+1)%items.length;items[i].hidden=false},4000)});
document.querySelectorAll('.salespop').forEach(function(pop){var items=[];try{items=JSON.parse(pop.dataset.items||'[]')}catch(e){}if(!items.length)return;var i=0;
  function show(){var it=items[i%items.length];i++;pop.querySelector('img').src=it.image||'';pop.querySelector('b').textContent=it.name+(it.city?' from '+it.city:'');pop.querySelector('span').textContent='bought '+it.product;pop.querySelector('small').textContent='verified purchase';pop.hidden=false;setTimeout(function(){pop.hidden=true},6000)}
  setTimeout(function(){show();setInterval(show,Number(pop.dataset.every||25)*1000)},Number(pop.dataset.delay||8)*1000)});
document.querySelectorAll('.edd').forEach(function(el){var cutoff=Number(el.dataset.cutoff||15),now=new Date(),h=cutoff-now.getHours()-1,m=60-now.getMinutes();var t=el.querySelector('[data-cutoff-text]');if(h>=0)t.textContent='in the next '+(h?h+'h ':'')+m+'m';else t.textContent='today'});
document.querySelectorAll('.shipbar').forEach(function(bar){var thr=Number(bar.dataset.threshold||0);var sub=Number((document.body.dataset.cartSubtotal)||0);if(!thr)return;var fill=bar.querySelector('.fill');var pct=Math.min(100,Math.round(sub/thr*100));fill.style.width=pct+'%';if(sub>=thr){bar.querySelector('[data-text]').textContent='You have free shipping'}else if(sub>0){var cur=bar.dataset.currency||'USD';try{bar.querySelector('[data-text]').textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:cur}).format((thr-sub)/100)+' away from free shipping'}catch(e){}}});
document.querySelectorAll('.buyform').forEach(function(form){var total=form.querySelector('[data-total]');function sync(){var t=form.querySelector('input[name=quantity]:checked');if(t&&total&&t.dataset.total)total.textContent=t.dataset.total}form.addEventListener('change',sync);sync()});
})();`
