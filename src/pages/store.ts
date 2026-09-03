import { bool, json, now, type Db, type Row } from '../lib/db.ts'
import { handle as toHandle, id } from '../lib/ids.ts'
import { bundleFor, renderBundleWidget } from '../domain/bundles.ts'
import { listProducts } from '../domain/catalog.ts'
import { listReviews } from '../domain/reviews.ts'
import type { Store } from '../control/stores.ts'
import { BLOCK_RUNTIME, blockDefinition, defaultsFor, renderBlocks, type BlockContext, type BlockInstance } from './blocks.ts'

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

export function newBlock(type: string, settings: Record<string, unknown> = {}): BlockInstance {
  const definition = blockDefinition(type)
  return { id: id('blk', 8), type, settings: { ...(definition ? defaultsFor(definition) : {}), ...settings } }
}

export function createPage(
  db: Db,
  storeId: string,
  input: { title: string; kind?: Page['kind']; mode?: Page['mode']; blocks?: BlockInstance[]; rawHtml?: string; headHtml?: string; seo?: Page['seo']; status?: Page['status']; sourceUrl?: string; handle?: string },
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
    reviews: listReviews(db, store.id, { status: 'approved', limit: 60 }).map((review) => ({ productId: review.productId, rating: review.rating, title: review.title, body: review.body, author: review.author, verified: review.verified })),
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
@media (max-width:820px){.iwt,.buybox-blk{grid-template-columns:1fr}.iwt--right figure{order:0}.cols{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.cols{grid-template-columns:1fr}}
`
