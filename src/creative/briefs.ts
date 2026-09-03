import { json, now, type Db } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { logger } from '../lib/log.ts'
import type { Product } from '../domain/types.ts'
import type { Research } from '../agent/research.ts'
import type { Avatar } from '../agent/avatars.ts'
import { knowledge } from '../agent/knowledge.ts'
import { completeJson, describe, S, type ModelChoice } from '../agent/models.ts'
import { BLOCKS } from '../pages/blocks.ts'

const log = logger('creative')

/**
 * Creative work that needs a person before it is used.
 *
 * Three kinds of thing go through the queue: photo briefs (shots the product
 * does not have yet, described so a phone can take them), synthetic UGC
 * concepts (an idea for a real customer or a real shoot to fulfil — never a
 * fake customer on the page), and GIFs made from the product's renders. Each
 * waits as pending until the owner approves or rejects it, and nothing
 * pending reaches a page, a review or an ad.
 */
export type QueueKind = 'photo-brief' | 'ugc-concept' | 'gif'
export type QueueStatus = 'pending' | 'approved' | 'rejected'

export type QueueItem<T = Record<string, unknown>> = { id: string; storeId: string; productId: string; kind: QueueKind; title: string; body: T; status: QueueStatus; note: string; createdAt: string; updatedAt: string }

type QueueRow = { id: string; store_id: string; product_id: string; kind: string; title: string; body: string; status: string; note: string; created_at: string; updated_at: string }

function rowToItem<T>(row: QueueRow): QueueItem<T> {
  return { id: row.id, storeId: row.store_id, productId: row.product_id, kind: row.kind as QueueKind, title: row.title, body: json<T>(row.body, {} as T), status: row.status as QueueStatus, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function enqueue<T>(db: Db, storeId: string, input: { productId?: string; kind: QueueKind; title: string; body: T }): QueueItem<T> {
  const itemId = id('cq')
  const timestamp = now()
  db.insert('creative_queue', { id: itemId, store_id: storeId, product_id: input.productId ?? '', kind: input.kind, title: input.title, body: input.body, status: 'pending', note: '', created_at: timestamp, updated_at: timestamp })
  return getQueueItem<T>(db, storeId, itemId) as QueueItem<T>
}

export function getQueueItem<T>(db: Db, storeId: string, itemId: string): QueueItem<T> | null {
  const row = db.one<QueueRow>('SELECT * FROM creative_queue WHERE store_id = ? AND id = ?', storeId, itemId)
  return row ? rowToItem<T>(row) : null
}

export function listQueue<T = Record<string, unknown>>(db: Db, storeId: string, opts: { kind?: QueueKind; status?: QueueStatus; productId?: string } = {}): Array<QueueItem<T>> {
  const where = ['store_id = ?']
  const params: unknown[] = [storeId]
  if (opts.kind) { where.push('kind = ?'); params.push(opts.kind) }
  if (opts.status) { where.push('status = ?'); params.push(opts.status) }
  if (opts.productId) { where.push('product_id = ?'); params.push(opts.productId) }
  return db.all<QueueRow>(`SELECT * FROM creative_queue WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, ...params).map((row) => rowToItem<T>(row))
}

export function setQueueStatus(db: Db, storeId: string, itemId: string, status: QueueStatus, note = ''): QueueItem | null {
  db.run('UPDATE creative_queue SET status = ?, note = ?, updated_at = ? WHERE store_id = ? AND id = ?', status, note, now(), storeId, itemId)
  return getQueueItem(db, storeId, itemId)
}

export function deleteQueueItem(db: Db, storeId: string, itemId: string) {
  db.run('DELETE FROM creative_queue WHERE store_id = ? AND id = ?', storeId, itemId)
}

/* ------------------------------------------------------------ photo briefs */

export type PhotoBrief = { id: string; name: string; what: string; why: string; how: string }

/** The eight shots every product page and ad set draws on. */
export const PHOTO_BRIEFS: PhotoBrief[] = [
  { id: 'hero', name: 'Hero on a plain ground', what: 'The product alone, front three-quarter, on a plain surface with one soft light.', why: 'The buy box, the ad thumbnail and the share image all use it.', how: 'Window light from one side, a white or neutral card behind, phone at product height, nothing else in frame.' },
  { id: 'hand', name: 'In hand, for scale', what: 'Someone holding or wearing it, hands only.', why: 'Answers "how big is it" without a ruler and reads as real.', how: 'Same light as the hero; crop at the wrist; skin tone true.' },
  { id: 'use', name: 'In use, in the real place', what: 'The product doing its job where it is used: the kitchen, the gym, the nursery, the desk.', why: 'The lifestyle block and the first ad frame; the buyer sees their own life.', how: 'Wider shot, natural mess allowed, product clearly the subject.' },
  { id: 'detail', name: 'Detail of the mechanism', what: 'A close-up of the part that makes it work: the seam, the clip, the texture, the ingredient list.', why: 'The mechanism must be shown, not asserted; this is the proof shot.', how: 'Macro or portrait mode, fill the frame with the detail, sharp focus.' },
  { id: 'box', name: 'What arrives', what: 'The box or bag open with everything laid out.', why: 'Sets expectations, cuts "is that all?" support tickets, feeds the bundle tiers.', how: 'Top-down on a plain surface, every item visible, labels readable.' },
  { id: 'size', name: 'Size and options side by side', what: 'Every size, colour or variant in one frame.', why: 'The options picker and the size chart need it; returns fall when people see the range.', how: 'Same distance and light for every unit, evenly spaced.' },
  { id: 'result', name: 'The result, or before and after', what: 'What is different after using it: the clean surface, the sleeping baby, the flat pack.', why: 'The outcome is what is bought; the before-and-after block and the ad hold read this.', how: 'Same framing before and after; if there is no before, the after alone with the product in frame.' },
  { id: 'turn', name: 'The 360 set', what: 'Front, both sides, back and top, on the same ground.', why: 'Every render and every page needs the product from more than one side; the reference set is built from these.', how: 'Turn the product, not the phone; keep the distance and the light fixed.' },
]

/** Which briefs a product already has, read from its media alt text and tags ("photo:hero"). */
export function photoCoverage(product: Product): { have: PhotoBrief[]; missing: PhotoBrief[] } {
  const text = [...product.media.map((media) => media.alt), ...product.tags, product.metadata.photos ?? ''].join(' ').toLowerCase()
  const have = PHOTO_BRIEFS.filter((brief) => text.includes(`photo:${brief.id}`) || (brief.id === 'hero' && Boolean(product.heroImage)))
  return { have, missing: PHOTO_BRIEFS.filter((brief) => !have.includes(brief)) }
}

/** One queue item per missing shot; already-queued ones are left alone. */
export function queuePhotoBriefs(db: Db, storeId: string, product: Product): Array<QueueItem<PhotoBrief>> {
  const existing = new Set(listQueue<PhotoBrief>(db, storeId, { kind: 'photo-brief', productId: product.id }).map((item) => item.body.id))
  const { missing } = photoCoverage(product)
  for (const brief of missing) {
    if (existing.has(brief.id)) continue
    enqueue(db, storeId, { productId: product.id, kind: 'photo-brief', title: `${product.title}: ${brief.name}`, body: brief })
  }
  return listQueue<PhotoBrief>(db, storeId, { kind: 'photo-brief', productId: product.id })
}

/* ------------------------------------------------------------ UGC concepts */

export type UgcConcept = {
  title: string
  who: string
  scene: string
  says: string
  shots: string[]
  format: string
  angle: string
  /** Always present: how the ad will disclose that it is a paid or scripted creator piece. */
  disclosure: string
}

const UGC_SCHEMA = S.obj({
  concepts: S.arr(
    S.obj({
      title: S.str('Five words.'),
      who: S.str('The kind of person on camera, matching the avatar. Not a name.'),
      scene: S.str('Where, doing what, with the product.'),
      says: S.str('What they say, in their words, about twenty seconds. Claims only the product can keep.'),
      shots: S.arr(S.str(), 'Four to six shots in order, each one line.'),
      format: S.str('talking-head | voiceover-b-roll | subtitles-b-roll | pov'),
      angle: S.str('The reason to buy this piece carries.'),
      disclosure: S.str('How the piece is labelled: "paid partnership", "creator content", "dramatisation".'),
    }),
    'Three concepts, each for a real creator or a real customer to film.',
  ),
})

export function rulesUgcConcepts(product: Product, avatar: Avatar | null, research: Research | null): UgcConcept[] {
  const who = avatar ? avatar.who.split(/[.;]/)[0]?.trim() || avatar.name : research?.audience[0]?.who.split(/[.;]/)[0]?.trim() || 'a real customer'
  const angle = avatar?.angle || research?.triggers[0] || `what ${product.title} does`
  return [
    { title: 'First use, honestly', who, scene: `Unboxing ${product.title} at home and using it for the first time.`, says: `I'll tell you what I expected and what actually happened. ${angle}.`, shots: ['Box on the table, hands opening it', 'Product in hand, turned once', 'First use, real place', 'Reaction, no script', 'The result', 'Product back in frame with the one-line verdict'], format: 'talking-head', angle, disclosure: 'creator content' },
    { title: 'What I tried before', who, scene: `The old solution on the left, ${product.title} on the right.`, says: `Here is what I used before and why it did not work. Here is the difference.`, shots: ['The old thing failing', 'The label of who this is for', 'The mechanism close up', 'It working', 'Side by side'], format: 'subtitles-b-roll', angle, disclosure: 'creator content' },
    { title: 'A day with it', who, scene: 'Three moments in one day where it is used.', says: 'Morning, afternoon, evening. Same product, three jobs.', shots: ['Morning use', 'Midday use', 'Evening use', 'One line on the outcome'], format: 'pov', angle, disclosure: 'creator content' },
  ]
}

export async function authorUgcConcepts(choice: ModelChoice | null, product: Product, avatar: Avatar | null, research: Research | null): Promise<{ concepts: UgcConcept[]; source: 'model' | 'rules' }> {
  const rules = rulesUgcConcepts(product, avatar, research)
  if (!choice) return { concepts: rules, source: 'rules' }
  try {
    const prompt = [
      `Product: ${product.title}${product.subtitle ? ` — ${product.subtitle}` : ''}. ${product.description.slice(0, 800)}`,
      avatar ? `Avatar: ${JSON.stringify({ name: avatar.name, who: avatar.who, wants: avatar.wants, fears: avatar.fears, angle: avatar.angle, label: avatar.label, hooks: avatar.hooks })}` : '',
      research ? `Research: ${JSON.stringify({ triggers: research.triggers, objections: research.objections.slice(0, 3), proofPoints: research.proofPoints })}` : '',
      'Write three creator-content concepts for a real person to film. Every claim spoken must be one the product can keep. Each concept carries one angle and states how it will be disclosed.',
    ]
      .filter(Boolean)
      .join('\n\n')
    const parsed = await completeJson<{ concepts: UgcConcept[] }>(choice, {
      task: 'ads',
      system: `You write briefs for creator content (UGC) for a dropshipping brand. The result is filmed by a real person; nothing you write is presented as a customer review.\n\n${knowledge('creatives', 'avatars', 'honesty')}`,
      prompt,
      schema: UGC_SCHEMA,
      name: 'ugc_concepts',
    })
    return { concepts: (parsed.concepts ?? []).slice(0, 3).map((concept) => ({ ...concept, disclosure: concept.disclosure || 'creator content' })), source: 'model' }
  } catch (error) {
    log.warn(`${describe(choice)} could not write UGC concepts; using the rules: ${error instanceof Error ? error.message : String(error)}`)
    return { concepts: rules, source: 'rules' }
  }
}

/** Concepts land in the queue as pending. They never touch the reviews table. */
export async function queueUgcConcepts(db: Db, storeId: string, product: Product, avatar: Avatar | null, research: Research | null, choice: ModelChoice | null): Promise<Array<QueueItem<UgcConcept>>> {
  const { concepts } = await authorUgcConcepts(choice, product, avatar, research)
  return concepts.map((concept) => enqueue<UgcConcept>(db, storeId, { productId: product.id, kind: 'ugc-concept', title: `${product.title}: ${concept.title}`, body: concept }))
}

/* ------------------------------------------------------- block suggestions */

export type PageGoal = 'offer' | 'advertorial' | 'quiz' | 'pdp' | 'home'

export type BlockSuggestion = { type: string; why: string; settings?: Record<string, unknown> }

const CATALOG = BLOCKS.map((block) => ({ type: block.type, name: block.name, description: block.description }))

const SUGGEST_SCHEMA = S.obj({
  blocks: S.arr(S.obj({ type: S.str('A block type from the catalog, exactly.'), why: S.str('One line: the job this block does at this point on the page.') }), 'The page, top to bottom: eight to twenty blocks.'),
  note: S.str('One sentence on the shape chosen and why.'),
})

/** The default orders, from the pages knowledge. */
export function rulesSuggestBlocks(goal: PageGoal, product: { id: string } | null): BlockSuggestion[] {
  const buy = product ? { type: 'buy-box', why: 'The offer: same photo, badge, was/now, tiers, guarantee.', settings: { productId: product.id, buyNow: true, background: 'raise' } } : { type: 'offer-box', why: 'The offer.' }
  switch (goal) {
    case 'offer':
      return [
        { type: 'header', why: 'Brand mark and one button.' },
        { type: 'countdown', why: 'The saving, ending soon.' },
        { type: 'hero', why: 'The promise above the fold with the CTA.' },
        { type: 'trust-badges', why: 'Guarantee, delivery, credential, shipping.' },
        { type: 'headline', why: 'The problem headline: the alternatives failing.' },
        { type: 'rich-text', why: 'The story of each failed alternative and its cost.' },
        { type: 'image-with-text', why: 'The product reveal with proof-of-work.' },
        { type: 'video', why: 'How it works, shown.' },
        { type: 'multicolumn', why: 'How it works in three or four bullets.' },
        { type: 'review-wall', why: 'Proof from people like them.' },
        buy,
        { type: 'comparison', why: 'The mechanism against the usual alternative.' },
        { type: 'faq', why: 'The objections, answered.' },
        { type: 'guarantee', why: 'The risk removed.' },
        { type: 'sticky-cta', why: 'The button follows the reader.' },
        { type: 'footer', why: 'Legal links and contact.' },
      ]
    case 'advertorial':
      return [
        { type: 'publication-bar', why: 'Reads as editorial.' },
        { type: 'headline', why: 'The listicle or story headline.' },
        { type: 'byline', why: 'Author and read time.' },
        { type: 'image', why: 'The lead image.' },
        { type: 'rich-text', why: 'The lead: what was tried and why.' },
        { type: 'numbered-reason', why: 'One argument.' },
        { type: 'numbered-reason', why: 'One argument.' },
        { type: 'numbered-reason', why: 'One argument.' },
        { type: 'pull-quote', why: 'A real quote.' },
        { type: 'comparison', why: 'Against what they were going to buy.' },
        { type: 'review-wall', why: 'Proof.' },
        buy,
        { type: 'faq', why: 'Objections.' },
        { type: 'guarantee', why: 'Risk removed.' },
        { type: 'comments', why: 'Social proof in the reader\'s register.' },
        { type: 'sticky-cta', why: 'The button follows.' },
        { type: 'disclaimer', why: 'It says it is an advertisement.' },
        { type: 'footer', why: 'Legal links.' },
      ]
    case 'quiz':
      return [
        { type: 'header', why: 'Brand mark, no distractions.' },
        { type: 'quiz', why: 'One question per screen; the result names the sub-avatar and its offer.', settings: product ? { productId: product.id } : {} },
        { type: 'trust-badges', why: 'Guarantee and delivery under the quiz.' },
        { type: 'footer', why: 'Legal links.' },
      ]
    case 'home':
      return [
        { type: 'announcement-bar', why: 'The offer in one line.' },
        { type: 'header', why: 'Navigation and cart.' },
        { type: 'hero', why: 'The promise.' },
        { type: 'featured-products', why: 'The catalog.' },
        { type: 'image-with-text', why: 'The story.' },
        { type: 'review-wall', why: 'Proof.' },
        { type: 'email-signup', why: 'The list.' },
        { type: 'footer', why: 'Legal links.' },
      ]
    default:
      return [
        { type: 'header', why: 'Navigation and cart.' },
        buy,
        { type: 'multicolumn', why: 'Benefits with images.' },
        { type: 'comparison', why: 'The mechanism against the usual.' },
        { type: 'faq', why: 'Objections.' },
        { type: 'review-wall', why: 'Proof.' },
        { type: 'guarantee', why: 'Risk removed.' },
        { type: 'sticky-cta', why: 'The button follows.' },
        { type: 'footer', why: 'Legal links.' },
      ]
  }
}

export async function suggestBlocks(choice: ModelChoice | null, input: { goal: PageGoal; product: Product | null; research: Research | null; avatar: Avatar | null; direction?: string }): Promise<{ blocks: BlockSuggestion[]; note: string; source: 'model' | 'rules' }> {
  const rules = rulesSuggestBlocks(input.goal, input.product)
  if (!choice) return { blocks: rules, note: 'The default order for this kind of page.', source: 'rules' }
  try {
    const prompt = [
      `Kind of page: ${input.goal}. ${input.direction ? `Direction: ${input.direction}` : ''}`,
      input.product ? `Product: ${input.product.title} — ${input.product.subtitle}. ${input.product.description.slice(0, 600)}` : 'No product yet.',
      input.avatar ? `Avatar: ${input.avatar.name}: ${input.avatar.who} Angle: ${input.avatar.angle}` : '',
      input.research ? `Research: ${JSON.stringify({ positioning: input.research.positioning, triggers: input.research.triggers, objections: input.research.objections.map((entry) => entry.objection), competitors: input.research.competitors.map((entry) => entry.name) })}` : '',
      `Blocks available (use the type exactly):\n${JSON.stringify(CATALOG)}`,
      'Choose the blocks and their order for this page, with the job each does. Every page ends with a footer; a selling page has a buy-box (or offer-box) and a sticky-cta.',
    ]
      .filter(Boolean)
      .join('\n\n')
    const parsed = await completeJson<{ blocks: BlockSuggestion[]; note: string }>(choice, {
      task: 'pages',
      system: `You lay out direct-response pages for a dropshipping brand from a fixed block catalog. You decide order and purpose, not copy.\n\n${knowledge('pages', 'offers')}`,
      prompt,
      schema: SUGGEST_SCHEMA,
      name: 'page_layout',
    })
    const known = new Set(CATALOG.map((entry) => entry.type))
    const blocks = (parsed.blocks ?? []).filter((entry) => known.has(entry.type)).map((entry) => (entry.type === 'buy-box' && input.product ? { ...entry, settings: { productId: input.product.id, buyNow: true } } : entry))
    return blocks.length >= 3 ? { blocks, note: parsed.note ?? '', source: 'model' } : { blocks: rules, note: 'The model returned too little; the default order stands.', source: 'rules' }
  } catch (error) {
    log.warn(`${describe(choice)} could not suggest a layout; using the rules: ${error instanceof Error ? error.message : String(error)}`)
    return { blocks: rules, note: 'The default order for this kind of page.', source: 'rules' }
  }
}
