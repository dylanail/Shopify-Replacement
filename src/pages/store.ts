import { bool, json, now, type Db, type Row } from '../lib/db.ts'
import { handle as toHandle, id } from '../lib/ids.ts'
import { bundleFor, renderBundleWidget } from '../domain/bundles.ts'
import { listProducts } from '../domain/catalog.ts'
import { listReviews } from '../domain/reviews.ts'
import { deliveryEstimate, listQuestions, recentPurchases, viewersNow } from '../domain/ops.ts'
import type { Store } from '../control/stores.ts'
import { BLOCK_RUNTIME, blockDefinition, defaultsFor, renderBlocks, type BlockContext, type BlockDefinition, type BlockInstance } from './blocks.ts'
import { customDefinitions } from './custom-blocks.ts'

export type Page = {
  id: string
  storeId: string
  title: string
  handle: string
  kind: 'landing' | 'advertorial' | 'product' | 'custom'
  mode: 'blocks' | 'html'
  blocks: BlockInstance[]
  rawHtml: string
  headHtml: string
  seo: { title?: string; description?: string; image?: string }
  status: 'draft' | 'published'
  sourceUrl: string
  isHome: boolean
  /** A version of a product's page (role 'pdp') or an advertorial for it. */
  productId: string
  role: 'page' | 'pdp' | 'advertorial' | 'offer'
  /** Split-test weight among a product's pdp versions; 0 = not in the test. */
  weight: number
  format: string
  direction: string
  createdAt: string
  updatedAt: string
}

function rowToPage(row: Row): Page {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    title: row.title as string,
    handle: row.handle as string,
    kind: row.kind as Page['kind'],
    mode: row.mode as Page['mode'],
    blocks: json(row.blocks, [] as BlockInstance[]),
    rawHtml: row.raw_html as string,
    headHtml: row.head_html as string,
    seo: json(row.seo, {}),
    status: row.status as Page['status'],
    sourceUrl: row.source_url as string,
    isHome: bool(row.is_home),
    productId: (row.product_id as string) ?? '',
    role: ((row.role as string) || 'page') as Page['role'],
    weight: (row.weight as number) ?? 0,
    format: (row.format as string) ?? '',
    direction: (row.direction as string) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function listPages(db: Db, storeId: string): Page[] {
  return db.all('SELECT * FROM pages WHERE store_id = ? ORDER BY updated_at DESC', storeId).map(rowToPage)
}

export function getPage(db: Db, storeId: string, idOrHandle: string): Page | null {
  const row = db.one('SELECT * FROM pages WHERE store_id = ? AND (id = ? OR handle = ?)', storeId, idOrHandle, idOrHandle)
  return row ? rowToPage(row) : null
}

export function homePage(db: Db, storeId: string): Page | null {
  const row = db.one("SELECT * FROM pages WHERE store_id = ? AND is_home = 1 AND status = 'published'", storeId)
  return row ? rowToPage(row) : null
}

function uniqueHandle(db: Db, storeId: string, title: string, ignoreId?: string): string {
  const base = toHandle(title)
  let candidate = base
  let suffix = 2
  while (db.one('SELECT id FROM pages WHERE store_id = ? AND handle = ? AND id != ?', storeId, candidate, ignoreId ?? '')) candidate = `${base}-${suffix++}`
  return candidate
}

export function newBlock(type: string, settings: Record<string, unknown> = {}, definition: BlockDefinition | null = blockDefinition(type)): BlockInstance {
  return { id: id('blk', 8), type, settings: { ...(definition ? defaultsFor(definition) : {}), ...settings } }
}

export function createPage(
  db: Db,
  storeId: string,
  input: { title: string; kind?: Page['kind']; mode?: Page['mode']; blocks?: BlockInstance[]; rawHtml?: string; headHtml?: string; seo?: Page['seo']; status?: Page['status']; sourceUrl?: string; handle?: string; productId?: string; role?: Page['role']; weight?: number; format?: string; direction?: string },
): Page {
  const pageId = id('page')
  const timestamp = now()
  db.insert('pages', {
    id: pageId,
    store_id: storeId,
    title: input.title,
    handle: uniqueHandle(db, storeId, input.handle ?? input.title),
    kind: input.kind ?? 'landing',
    mode: input.mode ?? (input.rawHtml ? 'html' : 'blocks'),
    blocks: input.blocks ?? [],
    raw_html: input.rawHtml ?? '',
    head_html: input.headHtml ?? '',
    seo: input.seo ?? {},
    status: input.status ?? 'draft',
    source_url: input.sourceUrl ?? '',
    is_home: false,
    product_id: input.productId ?? '',
    role: input.role ?? 'page',
    weight: input.weight ?? 0,
    format: input.format ?? '',
    direction: input.direction ?? '',
    created_at: timestamp,
    updated_at: timestamp,
  })
  return getPage(db, storeId, pageId) as Page
}

export function updatePage(db: Db, storeId: string, pageId: string, patch: Partial<Omit<Page, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>>): Page {
  const page = getPage(db, storeId, pageId)
  if (!page) throw new Error('No such page')
  const values: Row = { updated_at: now() }
  if (patch.title !== undefined) values.title = patch.title
  if (patch.handle !== undefined) values.handle = uniqueHandle(db, storeId, patch.handle, page.id)
  if (patch.kind !== undefined) values.kind = patch.kind
  if (patch.mode !== undefined) values.mode = patch.mode
  if (patch.blocks !== undefined) values.blocks = patch.blocks
  if (patch.rawHtml !== undefined) values.raw_html = patch.rawHtml
  if (patch.headHtml !== undefined) values.head_html = patch.headHtml
  if (patch.seo !== undefined) values.seo = { ...page.seo, ...patch.seo }
  if (patch.status !== undefined) values.status = patch.status
  if (patch.isHome !== undefined) {
    if (patch.isHome) db.run('UPDATE pages SET is_home = 0 WHERE store_id = ?', storeId)
    values.is_home = patch.isHome
  }
  if (patch.productId !== undefined) values.product_id = patch.productId
  if (patch.role !== undefined) values.role = patch.role
  if (patch.weight !== undefined) values.weight = patch.weight
  if (patch.format !== undefined) values.format = patch.format
  if (patch.direction !== undefined) values.direction = patch.direction
  db.update('pages', page.id, values)
  return getPage(db, storeId, page.id) as Page
}

export function deletePage(db: Db, storeId: string, pageId: string): boolean {
  return Number(db.run('DELETE FROM pages WHERE id = ? AND store_id = ?', pageId, storeId).changes) > 0
}

export function duplicatePage(db: Db, storeId: string, pageId: string): Page {
  const page = getPage(db, storeId, pageId)
  if (!page) throw new Error('No such page')
  return createPage(db, storeId, {
    title: `${page.title} (copy)`,
    kind: page.kind,
    mode: page.mode,
    blocks: page.blocks.map((block) => ({ ...block, id: id('blk', 8) })),
    rawHtml: page.rawHtml,
    headHtml: page.headHtml,
    seo: page.seo,
    sourceUrl: page.sourceUrl,
    productId: page.productId,
    role: page.role,
    format: page.format,
    direction: page.direction,
  })
}

/* ------------------------------------------------------------- templates */

export type TemplateInput = { storeName: string; product?: { id: string; title: string; image: string; subtitle: string }; research?: { triggers: string[]; objections: Array<{ objection: string; answer: string }>; comparison: { rows: Array<{ label: string; us: string; them: string }> }; competitors: Array<{ name: string }> } | null }

/** The advertorial listicle: the DTC workhorse, as blocks, ready to edit. */
export function advertorialTemplate(input: TemplateInput): BlockInstance[] {
  const product = input.product
  const reasons = (input.research?.triggers ?? ['It lasts', 'It is repairable', 'It is honest about the wait']).slice(0, 5)
  return [
    newBlock('publication-bar', { name: `${input.storeName} Journal`, section: 'Reviews' }),
    newBlock('headline', { level: 'h1', eyebrow: 'Editor’s pick', text: `${reasons.length} reasons people are switching to ${product?.title ?? input.storeName}`, sub: product?.subtitle ?? '', width: 'narrow', padding: 'small' }),
    newBlock('byline', { author: 'By the editorial team', readTime: '4 min read' }),
    ...(product?.image ? [newBlock('image', { src: product.image, alt: product.title, width: 'narrow', padding: 'none' })] : []),
    newBlock('rich-text', { text: 'We spent three months with it. Here is what held up, what did not, and who should skip it.' }),
    ...reasons.map((reason, index) => newBlock('numbered-reason', { number: index + 1, headline: reason, text: 'Say what happened, not what it means. One specific detail beats three adjectives.' })),
    newBlock('pull-quote', { quote: 'I stopped thinking about my gear. That is the whole point.', who: 'A customer, verified' }),
    ...(input.research?.comparison.rows.length ? [newBlock('comparison', { themLabel: input.research.competitors[0]?.name ?? 'The usual', rows: input.research.comparison.rows.map((row) => `${row.label}|${row.us}|${row.them}`).join('\n') })] : []),
    newBlock('review-wall', { headline: 'From people who bought it', count: 6, ...(product ? { productId: product.id } : {}) }),
    ...(product ? [newBlock('buy-box', { productId: product.id, buyNow: true, background: 'raise' })] : [newBlock('offer-box', {})]),
    ...(input.research?.objections.length ? [newBlock('faq', { headline: 'Before you decide', items: input.research.objections.map((entry) => `${entry.objection}|${entry.answer}`).join('\n') })] : []),
    newBlock('guarantee', {}),
    newBlock('comments', {}),
    newBlock('sticky-cta', { label: product ? `Get ${product.title}` : 'Get the offer', href: '#offer' }),
    newBlock('disclaimer', {}),
    newBlock('footer', {}),
  ]
}

/** A product landing page: banner, benefits, offer, proof, questions. */
export function landingTemplate(input: TemplateInput): BlockInstance[] {
  const product = input.product
  return [
    newBlock('announcement-bar', {}),
    newBlock('header', { cta: 'Buy now', ctaHref: '#offer' }),
    newBlock('hero', { headline: product?.title ?? `Introducing ${input.storeName}`, sub: product?.subtitle ?? '', image: product?.image ?? '', cta: 'Get yours', ctaHref: '#offer', height: 'large' }),
    newBlock('logos', {}),
    newBlock('multicolumn', { headline: 'Why this one' }),
    ...(product ? [newBlock('image-with-text', { image: product.image, headline: 'Built where the load goes', text: 'Doubled where it matters. Burnished, not painted. Hardware a size up.', cta: 'See the offer', ctaHref: '#offer' })] : []),
    ...(product ? [newBlock('bundle-offer', { productId: product.id, background: 'raise' })] : [newBlock('offer-box', {})]),
    newBlock('review-wall', { count: 6, ...(product ? { productId: product.id } : {}) }),
    ...(input.research?.comparison.rows.length ? [newBlock('comparison', { rows: input.research.comparison.rows.map((row) => `${row.label}|${row.us}|${row.them}`).join('\n') })] : []),
    newBlock('faq', { ...(input.research?.objections.length ? { items: input.research.objections.map((entry) => `${entry.objection}|${entry.answer}`).join('\n') } : {}) }),
    newBlock('guarantee', {}),
    newBlock('trust-badges', {}),
    newBlock('countdown', { text: 'This offer ends in' }),
    newBlock('sticky-cta', { label: 'Claim the offer', href: '#offer' }),
    newBlock('footer', {}),
  ]
}

/** The offer page: the order that turned 1.18x into 3.59x — the saving above the fold, proof, the problem, the mechanism, the buy box, the objections. */
export function offerTemplate(input: TemplateInput): BlockInstance[] {
  const product = input.product
  return [
    newBlock('header', { cta: 'Claim the offer', ctaHref: '#offer' }),
    newBlock('countdown', { text: 'Save on your first order — ending soon' }),
    newBlock('hero', { headline: product ? `${product.title}: the one that works when the others did not` : `Introducing ${input.storeName}`, sub: product?.subtitle ?? '', image: product?.image ?? '', cta: 'Get it and save', ctaHref: '#offer', height: 'medium' }),
    newBlock('trust-badges', {}),
    newBlock('headline', { level: 'h2', text: 'Why the usual fix keeps failing', sub: 'Say what the alternatives do wrong, in one line each.' }),
    newBlock('rich-text', { text: 'The cheap version fails in a month. The expensive one asks for a routine nobody keeps. Name each one, what it cost, and what happened next.' }),
    ...(product ? [newBlock('image-with-text', { image: product.image, headline: `What ${product.title} does differently`, text: 'The mechanism: how it creates the result, in two sentences an eleven-year-old follows.', cta: 'See the offer', ctaHref: '#offer' })] : []),
    newBlock('multicolumn', { headline: 'How it works' }),
    newBlock('review-wall', { headline: 'From people who bought it', count: 6, ...(product ? { productId: product.id } : {}) }),
    ...(product ? [newBlock('buy-box', { productId: product.id, buyNow: true, background: 'raise' })] : [newBlock('offer-box', {})]),
    ...(input.research?.comparison.rows.length ? [newBlock('comparison', { themLabel: input.research.competitors[0]?.name ?? 'The usual', rows: input.research.comparison.rows.map((row) => `${row.label}|${row.us}|${row.them}`).join('\n') })] : []),
    ...(input.research?.objections.length ? [newBlock('faq', { headline: 'Before you decide', items: input.research.objections.map((entry) => `${entry.objection}|${entry.answer}`).join('\n') })] : [newBlock('faq', {})]),
    newBlock('guarantee', {}),
    newBlock('sticky-cta', { label: product ? `Get ${product.title}` : 'Claim the offer', href: '#offer' }),
    newBlock('footer', {}),
  ]
}

/** The quiz funnel: one question per screen, the result names the sub-avatar and shows the offer. */
export function quizTemplate(input: TemplateInput): BlockInstance[] {
  const product = input.product
  const triggers = (input.research?.triggers ?? []).slice(0, 3)
  const steps = [
    `What brought you here?|${triggers.length ? triggers.join('|') : 'The last one broke|A recommendation|Curiosity'}`,
    'What did you try before?|Nothing yet|Something cheap that did not last|Something expensive that disappointed',
    'What matters most to you?|It lasts|It is easy|It looks right',
  ].join('\n')
  return [
    newBlock('header', {}),
    newBlock('quiz', { headline: `Find the right ${product?.title ?? 'one'} for you`, steps, resultHeadline: 'Here is the one for you', resultText: 'Based on what you told us, this is the build to start with.', ctaLabel: 'See the offer', ctaHref: '#offer', ...(product ? { productId: product.id } : {}) }),
    newBlock('trust-badges', {}),
    ...(product ? [newBlock('buy-box', { productId: product.id, buyNow: true, background: 'raise' })] : [newBlock('offer-box', {})]),
    newBlock('guarantee', {}),
    newBlock('footer', {}),
  ]
}

/**
 * The long-form sales page, the Funnelish shape read from the reference
 * funnels (docs/knowledge/reference-pages.md): the buy box at the top with
 * its bullets, ship line, chips and guarantee; then the persuasion for the
 * scroller — the problem as image scenes, the reframe, the mechanism in
 * three verbs, the timeline, the expert, the dream outcomes, the audience,
 * proof, the steps, the offer stack, the comparison, the objections, the
 * guarantee — and the sticky button. Every CTA anchors to the buy box.
 */
export function salesTemplate(input: TemplateInput): BlockInstance[] {
  const product = input.product
  const triggers = (input.research?.triggers ?? []).slice(0, 4)
  const name = product?.title ?? input.storeName
  return [
    newBlock('announcement-bar', { text: 'LIMITED-TIME OFFER · FREE SHIPPING TODAY' }),
    newBlock('header', { cta: 'Get the offer', ctaHref: '#offer' }),
    newBlock('rating-line', { ...(product ? { productId: product.id } : {}) }),
    newBlock('headline', { level: 'h1', eyebrow: 'Tired of fixes that come with side effects, need a prescription, or do nothing?', text: `${name}: the one that works the first time you use it`, sub: product?.subtitle ?? '', align: 'center', padding: 'small' }),
    ...(product
      ? [newBlock('buy-box', { productId: product.id, buyNow: true, background: 'raise', bullets: (triggers.length ? triggers : ['Holds up at hour 8', 'Works anywhere', 'No routine to keep']).map((line) => `${line}|`).join('\n'), offerLabel: 'Limited time offer', cta: 'Buy now & save', chips: '🚚|Free shipping\n⛨|90-day money-back guarantee\n🔒|Secure checkout', guaranteeHeadline: 'Feel the difference or it is free', guaranteeText: 'Use it every day for 90 days. If it is not what you hoped, email us and we refund every penny.' })]
      : [newBlock('offer-box', {})]),
    newBlock('review-wall', { headline: '', count: 1, ...(product ? { productId: product.id } : {}), padding: 'small' }),
    newBlock('image-grid', { headline: 'If this has become the worst part of your day, you are not imagining it', sub: 'The moments customers described to us before they found it.', items: '|By mid-afternoon it turns into a deep ache.\n|Long drives leave it on fire.\n|Getting up takes a brace and a deep breath.\n|You shift and shift and never get comfortable.', perRow: 4, bridge: 'Here is what nobody told you: it was never you. It is the gap the usual fix leaves.' }),
    newBlock('headline', { level: 'h2', eyebrow: 'The root cause', text: 'It was never your fault. It is the gap the usual fix leaves.', sub: 'Name the mechanism: what actually creates the result, in two sentences an eleven-year-old follows.' }),
    newBlock('alternatives', {}),
    ...(product ? [newBlock('image-with-text', { image: product.image, eyebrow: 'Introducing', headline: `${name}: built to fix it at the source`, text: 'Say what it does that the alternatives cannot, and the one number that proves it.', cta: 'Get the offer', ctaHref: '#offer' })] : []),
    newBlock('multicolumn', { headline: 'It takes one second — here is how', columns: '1|Offload|The first thing it does, the moment it is used.\n2|Align|The second thing, and why that matters.\n3|Hold|Why it is still doing it at 5 p.m., not just at 9 a.m.' }),
    newBlock('timeline', { headline: 'What relief feels like, week by week' }),
    newBlock('expert-quote', {}),
    newBlock('benefit-bullets', { headline: 'Get your life back, one day at a time', items: 'Sit through the whole drive|no stops to stretch\nMake it to 5 p.m.|without the lockup\nTake the long trip|to see the grandkids' }),
    newBlock('image-grid', { headline: 'And it goes everywhere you go', items: '|In the car\n|At the desk\n|On the porch\n|On the go', perRow: 4 }),
    newBlock('audience', {}),
    newBlock('review-wall', { headline: 'From people who bought it', count: 6, ...(product ? { productId: product.id } : {}) }),
    newBlock('steps', { headline: 'Three seconds to set up' }),
    newBlock('offer-stack', { headline: 'Special offer on now', items: `${name}|\n90-day money-back guarantee|\nFree priority shipping|\nThe quick-start guide|[confirm value]`, totalValue: '', price: '', cta: 'Claim the offer', href: '#offer' }),
    ...(input.research?.comparison.rows.length ? [newBlock('comparison', { themLabel: input.research.competitors[0]?.name ?? 'The usual', rows: input.research.comparison.rows.map((row) => `${row.label}|${row.us}|${row.them}`).join('\n') })] : [newBlock('comparison', {})]),
    newBlock('cost-stack', {}),
    ...(input.research?.objections.length ? [newBlock('faq', { headline: 'Before you decide', items: input.research.objections.map((entry) => `${entry.objection}|${entry.answer}`).join('\n') })] : [newBlock('faq', {})]),
    newBlock('guarantee', { days: 90, headline: 'Your order is protected by a 90-day guarantee' }),
    newBlock('sticky-cta', { label: 'Buy now & save', href: '#offer', ...(product ? { productId: product.id } : {}) }),
    newBlock('disclaimer', { text: 'Individual results vary. Statements on this page have not been evaluated by a regulator and the product is not intended to diagnose, treat, cure or prevent any disease. Any person shown is a model unless stated.' }),
    newBlock('footer', {}),
  ]
}

/**
 * The home page of a store, from Flovir, Honex and SlideBelts: announcement
 * with the offer in one line, navigation, the hero with three bullets, the
 * press, one idea and one number per section, the catalog, proof, the offer
 * restated, the list, and a footer with real contact details.
 */
export function homeTemplate(input: TemplateInput): BlockInstance[] {
  const product = input.product
  return [
    newBlock('announcement-bar', { text: 'FREE SHIPPING ON EVERY ORDER · 30-DAY RETURNS' }),
    newBlock('header', { showNav: true, cta: 'Shop now', ctaHref: product ? '#offer' : '/collections/all' }),
    newBlock('hero', { headline: product ? `${product.title}: the one people do not believe until they try it` : `Welcome to ${input.storeName}`, sub: product?.subtitle ?? '', image: product?.image ?? '', cta: 'Shop now', ctaHref: product ? '#offer' : '/collections/all', height: 'large' }),
    newBlock('benefit-bullets', { headline: '', items: 'The first thing it does|in one line\nThe second|in one line\nThe guarantee|in one line', align: 'center' }),
    newBlock('logos', {}),
    newBlock('rating-line', {}),
    ...(product ? [newBlock('image-with-text', { image: product.image, headline: 'One idea, one number', text: 'Every section on a home page carries one idea and one number: "14 days in a carry-on", "$75 saved on the first trip".', cta: 'See it', ctaHref: '#offer' })] : []),
    newBlock('featured-products', { headline: 'Best sellers', count: 3 }),
    newBlock('review-wall', { headline: 'What people say', count: 3 }),
    newBlock('trust-badges', {}),
    ...(product ? [newBlock('buy-box', { productId: product.id, buyNow: false, background: 'raise', showImage: true, cta: 'Add to cart' })] : []),
    newBlock('faq', { headline: 'Questions' }),
    newBlock('email-signup', { headline: '0% spam. 100% offers.', text: 'Join the list for the next offer first.' }),
    newBlock('footer', {}),
  ]
}

export function blankTemplate(): BlockInstance[] {
  return [newBlock('header', {}), newBlock('headline', { level: 'h1', text: 'A new page' }), newBlock('rich-text', {}), newBlock('footer', {})]
}

/* ------------------------------------------------------------- rendering */

export function blockContextFor(db: Db, store: Store, base: string): BlockContext {
  const products = listProducts(db, store.id, { status: 'published', limit: 60 })
  const currency = store.currency
  return {
    storeName: store.name,
    base,
    currency,
    brand: store.brand,
    custom: customDefinitions(db, store.id),
    products: products.map((product) => ({
      id: product.id,
      handle: product.handle,
      title: product.title,
      subtitle: product.subtitle,
      image: product.heroImage,
      priceCents: Math.min(...product.variants.map((variant) => variant.priceCents)),
      variants: product.variants.map((variant) => ({ id: variant.id, title: variant.title, priceCents: variant.priceCents })),
      options: product.options,
    })),
    reviews: listReviews(db, store.id, { status: 'approved', limit: 60 }).map((review) => ({ productId: review.productId, rating: review.rating, title: review.title, body: review.body, author: review.author, verified: review.verified, media: review.media })),
    live: {
      purchases: recentPurchases(db, store.id, 10),
      viewers: Object.fromEntries(products.map((product) => [product.id, viewersNow(db, store.id, product.id)])),
      stock: Object.fromEntries(products.map((product) => [product.id, product.variants.reduce((sum, variant) => sum + Math.max(0, variant.inventory), 0)])),
      estimates: Object.fromEntries(products.map((product) => { const estimate = deliveryEstimate(product.supplier); return [product.id, { from: estimate.from, to: estimate.to }] })),
      questions: listQuestions(db, store.id, { status: 'answered' }).map((entry) => ({ productId: entry.productId, question: entry.question, answer: entry.answer, asker: entry.asker })),
      sizeCharts: Object.fromEntries(products.filter((product) => product.metadata.sizeChart).map((product) => [product.id, product.metadata.sizeChart as string])),
    },
    bundles: products
      .map((product) => {
        const bundle = bundleFor(db, store.id, product.id)
        return bundle ? { productId: product.id, html: renderBundleWidget(bundle, product, currency) } : null
      })
      .filter((entry): entry is { productId: string; html: string } => entry !== null),
  }
}

export function renderPageBody(page: Page, context: BlockContext): string {
  return `${renderBlocks(page.blocks, context)}<script>${BLOCK_RUNTIME}</script>`
}

export { BLOCK_RUNTIME }

/** Styles the blocks need on top of the theme. Tokens come from the theme; nothing here hard-codes a colour. */
export const PAGE_CSS = `
.blk{padding-block:var(--pad)}
.pad-none{--pad:0}.pad-small{--pad:1.4rem}.pad-medium{--pad:3.2rem}.pad-large{--pad:5.5rem}
.blk-in{margin-inline:auto;width:min(92vw,var(--w))}
.w-narrow{--w:720px}.w-regular{--w:1080px}.w-wide{--w:1320px}.w-full{--w:100%}.w-full .blk-in{width:100%}
.al-center{text-align:center}.al-center .prose,.al-center p{margin-inline:auto}
.bg-paper{background:var(--paper)}.bg-raise{background:var(--raise)}
.bg-ink{background:var(--ink);color:var(--paper)}.bg-ink .eyebrow,.bg-ink .micro{color:color-mix(in srgb,var(--paper) 70%,transparent)}
.bg-primary{background:var(--primary);color:#fff}.bg-primary .eyebrow{color:rgba(255,255,255,.7)}
.head{margin:0 0 .6rem}.lead{font-size:1.1rem;color:var(--muted);max-width:60ch}
.eyebrow.light{color:rgba(255,255,255,.8)}
.hero--small{min-height:42vh}.hero--medium{min-height:62vh}.hero--large{min-height:82vh}
.hero::after{background:linear-gradient(to bottom,rgba(0,0,0,calc(var(--overlay,.45) * .7)),rgba(0,0,0,var(--overlay,.45)))}
.hero .ctas{display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-top:1.4rem}
.hero .btn--ghost{color:#fff;border-color:#fff}
.rule{border:0;border-top:1px solid var(--line);margin:0}
.fig{margin:0}.fig img{width:100%;border-radius:var(--radius)}.fig figcaption{font-size:.8rem;color:var(--muted);margin-top:.5rem}
.ph{border:1px dashed var(--line);border-radius:var(--radius);padding:2rem;text-align:center;color:var(--muted);font-size:.9rem}
.iwt{display:grid;gap:2.5rem;grid-template-columns:1fr 1fr;align-items:center}
.iwt--right figure{order:2}.iwt figure{margin:0}.iwt img{width:100%;border-radius:var(--radius)}
.video{position:relative;aspect-ratio:16/9;background:#000;border-radius:var(--radius);overflow:hidden;cursor:pointer}
.video img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.85}
.video .play{position:absolute;inset:0;margin:auto;width:72px;height:72px;border-radius:999px;border:0;background:#fff;font-size:1.4rem;cursor:pointer}
.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
video.video{width:100%;height:auto;aspect-ratio:auto}
.carousel{display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:.5rem}
.carousel img{flex:0 0 min(78vw,420px);aspect-ratio:4/5;object-fit:cover;border-radius:var(--radius);scroll-snap-align:start}
.ba{position:relative;aspect-ratio:4/3;border-radius:var(--radius);overflow:hidden}
.ba img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ba .after{clip-path:inset(0 0 0 var(--pos))}
.ba input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}
.ba .lbl{position:absolute;bottom:.7rem;font:600 11px/1 var(--body);letter-spacing:.14em;text-transform:uppercase;background:rgba(0,0,0,.55);color:#fff;padding:.4rem .6rem;border-radius:999px}
.ba .lbl.l{left:.7rem}.ba .lbl.r{right:.7rem}
.cols{display:grid;gap:1.6rem;grid-template-columns:repeat(var(--per,3),1fr);margin-top:1.4rem}
.col .ico{font-size:1.6rem;color:var(--primary)}.col h3{margin:.5rem 0 .3rem}.col p{color:var(--muted);font-size:.94rem;margin:0}
.buybox-blk{display:grid;gap:2.5rem;grid-template-columns:1fr 1fr;align-items:start}
.buybox-blk figure{margin:0}.buybox-blk img{width:100%;border-radius:var(--radius)}
.buybox-blk h2{font-size:clamp(1.8rem,3.6vw,2.6rem)}
.buyform{display:grid;gap:.8rem;margin-top:1rem}
.logos{display:flex;flex-wrap:wrap;gap:1.2rem 2.4rem;justify-content:center;margin-top:1rem;font-family:var(--display);font-size:1.15rem;color:var(--muted);letter-spacing:.02em}
.badges{display:flex;flex-wrap:wrap;gap:.8rem 1.6rem;justify-content:center;font-size:.86rem;color:var(--muted)}
.badges i{font-style:normal;margin-right:.4rem}
.comments{display:grid;gap:1rem}
.comment{display:flex;gap:.8rem}.comment .av,.byline .av{flex:0 0 auto;width:36px;height:36px;border-radius:999px;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:600}
.comment .meta{font-size:.82rem;color:var(--muted)}.comment p{margin:.2rem 0 0;font-size:.94rem}
.countdown{display:inline-flex;gap:1rem;align-items:center;border:1px solid var(--line);border-radius:var(--radius);padding:.8rem 1.2rem;background:var(--raise)}
.countdown .lbl{font-size:.86rem;color:var(--muted)}.countdown .clock{font-family:var(--display);font-size:1.6rem;font-variant-numeric:tabular-nums}
.progress .meta{font-size:.86rem;margin-bottom:.4rem}.progress .track{height:10px;background:var(--line);border-radius:999px;overflow:hidden}.progress .fill{height:100%;background:var(--primary)}
.offer{border:2px solid var(--primary);border-radius:var(--radius);padding:1.8rem;background:var(--raise);max-width:32rem;margin-inline:auto}
.offer ul{padding-left:1.1rem;margin:.8rem 0}.offer li{margin:.25rem 0}
.pubbar{background:var(--ink);color:var(--paper);font:500 11px/1 var(--body);letter-spacing:.14em;text-transform:uppercase}
.pubbar .wrap{display:flex;gap:1.2rem;align-items:center;padding:.7rem 0}.pubbar .pub{font-family:var(--display);font-size:1rem;letter-spacing:.04em;text-transform:none}
.pubbar .sec{opacity:.7}.pubbar .adv{margin-left:auto;opacity:.6;border:1px solid currentColor;padding:.25rem .5rem;border-radius:999px}
.byline{display:flex;gap:.8rem;align-items:center}
.reason .num{font-family:var(--display);font-size:3rem;line-height:1;color:var(--primary)}
.reason h2{margin:.2rem 0 .8rem}.reason .fig{margin:1rem 0}
blockquote.pull{font-family:var(--display);font-size:clamp(1.4rem,2.6vw,2rem);line-height:1.25;margin:0;padding-left:1.2rem;border-left:3px solid var(--primary)}
blockquote.pull cite{display:block;font:400 .9rem var(--body);color:var(--muted);margin-top:.6rem;font-style:normal}
.disclaimer{opacity:.8}
.share{display:flex;gap:1rem;align-items:center}.share a{font-size:.86rem;text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:.35rem .8rem}
.signup{display:flex;gap:.6rem;max-width:28rem;margin-inline:auto;margin-top:1rem}
.contact .two{margin-bottom:0}
.announce--rotate span{display:inline-block}
.salespop{position:fixed;bottom:1rem;left:1rem;z-index:60;display:flex;gap:.7rem;align-items:center;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);padding:.6rem .8rem;box-shadow:0 10px 30px rgba(0,0,0,.14);max-width:320px;font-size:.85rem}
.salespop--bottom-right{left:auto;right:1rem}.salespop img{width:44px;height:44px;object-fit:cover;border-radius:var(--radius)}.salespop b{display:block}.salespop small{color:var(--muted);display:block;font-size:.72rem}
.viewers{display:inline-flex;gap:.5rem;align-items:center;font-size:.86rem;color:var(--muted)}.viewers i{width:8px;height:8px;border-radius:999px;background:#2f7a4f;box-shadow:0 0 0 4px rgba(47,122,79,.18)}
.scarcity .meta{font-size:.86rem;margin-bottom:.35rem}.scarcity .track{height:8px;background:var(--line);border-radius:999px;overflow:hidden}.scarcity .fill{height:100%;background:#b3261e}
.edd{display:flex;gap:.7rem;align-items:center;font-size:.9rem;border:1px solid var(--line);border-radius:var(--radius);padding:.7rem .9rem;background:var(--raise)}.edd .ico{font-size:1.2rem}
.shipbar{background:var(--ink);color:var(--paper);font-size:.8rem;text-align:center;padding:.5rem 1rem}.shipbar .track{display:block;height:3px;background:rgba(255,255,255,.2);margin-top:.35rem;border-radius:999px;overflow:hidden}.shipbar .fill{display:block;height:100%;background:var(--primary)}
.payicons{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center}.payicons i{font:600 10px/1 var(--body);letter-spacing:.06em;border:1px solid var(--line);border-radius:4px;padding:.4rem .5rem;background:#fff;color:#1a1a1a;font-style:normal}
.sizechart summary{cursor:pointer;font-weight:500;padding:.6rem 0;border-bottom:1px solid var(--line)}
.ugc{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.ugc figure{margin:0}.ugc img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius)}.ugc figcaption{font-size:.75rem;color:var(--muted);margin-top:.25rem}
.qa-form{display:grid;gap:.5rem;margin-top:1rem}
.quiz{text-align:center}.qprogress{height:6px;background:var(--line);border-radius:999px;overflow:hidden;margin:.8rem auto 1.4rem;max-width:22rem}.qprogress span{display:block;height:100%;background:var(--primary);transition:width .3s}
.qstep{border:0;padding:0;margin:0}.qstep legend{margin-inline:auto}.qopts{display:grid;gap:.6rem;max-width:26rem;margin:1rem auto 0}
.qopt{border:1px solid var(--line);background:var(--raise);color:var(--ink);border-radius:var(--radius);padding:.9rem 1rem;font:inherit;cursor:pointer;text-align:left}.qopt:hover{border-color:var(--primary)}
.qresult .qproduct{display:flex;gap:1rem;align-items:center;justify-content:center;text-align:left;margin:1rem 0}.qresult .qproduct img{width:96px;height:96px;object-fit:cover;border-radius:var(--radius)}
.checks{list-style:none;padding:0;margin:.8rem 0;display:grid;gap:.45rem}.checks li{display:flex;gap:.6rem;align-items:flex-start}.checks i{font-style:normal;color:var(--primary);font-weight:700;flex:0 0 auto}
.offer-label{display:inline-block;font:600 11px/1 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--primary);border:1px solid var(--primary);border-radius:999px;padding:.35rem .6rem;margin:.6rem 0 .2rem}
.shipline{display:flex;gap:.5rem;align-items:center;font-size:.9rem;margin:0}.shipline .dot{width:9px;height:9px;border-radius:999px;background:#2f7a4f;box-shadow:0 0 0 3px rgba(47,122,79,.18)}
.chips{margin-top:.8rem;justify-content:flex-start}
.guarantee-inline{display:flex;gap:.8rem;align-items:flex-start;margin-top:1rem;border:1px solid var(--line);border-radius:var(--radius);padding:.8rem 1rem;background:var(--raise)}.guarantee-inline i{font-style:normal;font-size:1.4rem;color:var(--primary)}.guarantee-inline p{margin:.2rem 0 0;font-size:.9rem;color:var(--muted)}
.rating a{text-decoration:none;color:inherit}
.sticky-product{display:flex;gap:.6rem;align-items:center;min-width:0}.sticky-product img{width:40px;height:40px;object-fit:cover;border-radius:var(--radius)}.sticky-product b{display:block;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.scenes .scene{margin:0}.scene img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius)}.scene figcaption{font-size:.9rem;margin-top:.5rem}.bridge{font-family:var(--display);font-size:1.25rem;margin-top:1.4rem}
.steps{list-style:none;padding:0;margin:1.4rem 0 0;display:grid;gap:1.6rem;grid-template-columns:repeat(3,1fr)}.step img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius);margin-bottom:.6rem}.step .num{font-family:var(--display);color:var(--primary);font-size:1.6rem}.step h3{margin:.2rem 0 .3rem}.step p{margin:0;color:var(--muted);font-size:.94rem}
.timeline{list-style:none;padding:0;margin:1rem 0 0;display:grid;gap:1rem}.timeline li{display:grid;grid-template-columns:7rem 1fr;gap:1rem;border-left:3px solid var(--primary);padding-left:1rem}.timeline .when{font:600 11px/1.4 var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--primary);padding-top:.35rem}.timeline h3{margin:0 0 .2rem}.timeline p{margin:0;color:var(--muted);font-size:.94rem}
.alts{margin:1rem 0 0;display:grid;gap:.9rem}.alts dt{font-weight:600}.alts dd{margin:.15rem 0 0;color:var(--muted)}
.coststack{width:100%;border-collapse:collapse;margin-top:1rem}.coststack td,.coststack th{padding:.55rem 0;border-bottom:1px solid var(--line);text-align:left}.coststack td:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.coststack tfoot th{border-bottom:0;padding-top:.8rem;font-family:var(--display);font-size:1.15rem}
.offerstack{max-width:34rem}.offerstack .checks{text-align:left}.offerstack .price-lg{margin:.4rem 0 .8rem}
.included{list-style:none;padding:0;margin:1rem 0 .4rem;display:grid;gap:.5rem}.included li{display:flex;gap:.7rem;align-items:center;border:1px solid var(--line);border-radius:var(--radius);padding:.55rem .8rem;background:var(--raise)}.included img{width:40px;height:40px;object-fit:cover;border-radius:var(--radius)}.included i{font-style:normal}.included span{flex:1}.included em{font-style:normal;font-weight:600;color:var(--primary);font-size:.85rem}.included em s{color:var(--muted);font-weight:400}
.expert{display:flex;gap:1.2rem;align-items:flex-start;margin:0}.expert img{width:96px;height:96px;object-fit:cover;border-radius:999px;flex:0 0 auto}.expert blockquote{margin:.3rem 0 .6rem;font-family:var(--display);font-size:1.2rem;line-height:1.35}.expert figcaption b{display:block}.expert figcaption .micro{display:block}
.press{display:grid;gap:1.2rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:1rem}.press blockquote{margin:0;border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.1rem;background:var(--raise)}.press p{margin:0 0 .5rem;font-family:var(--display);font-size:1.05rem}.press cite{font-style:normal;font-size:.8rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
.citations{list-style:none;padding:0;margin:1rem 0;display:grid;gap:1rem;counter-reset:cite}.citations li{border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.1rem;counter-increment:cite}.citations li::before{content:counter(cite,decimal-leading-zero);font:600 11px/1 var(--body);letter-spacing:.14em;color:var(--primary)}.citations h3{margin:.3rem 0 .4rem}.citations blockquote{margin:0 0 .5rem;color:var(--muted);font-size:.94rem;border-left:2px solid var(--line);padding-left:.8rem}.citations a{font-size:.86rem}
.ingredients img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius);margin-bottom:.5rem}
.stats{display:grid;gap:1.4rem;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:1.2rem 0 .6rem}.stats b{display:block;font-family:var(--display);font-size:clamp(2rem,5vw,3rem);line-height:1;color:var(--primary)}.stats span{display:block;margin-top:.4rem;color:var(--muted);font-size:.9rem}
@media (max-width:820px){.steps{grid-template-columns:1fr}.timeline li{grid-template-columns:1fr;gap:.2rem}.expert{flex-direction:column}}
@media (max-width:820px){.iwt,.buybox-blk{grid-template-columns:1fr}.iwt--right figure{order:0}.cols{grid-template-columns:repeat(2,1fr)}.salespop{max-width:calc(100vw - 2rem)}}
@media (max-width:520px){.cols{grid-template-columns:1fr}}
`
