import { json, now, type Db } from '../lib/db.ts'

/**
 * The guided build.
 *
 * A store is built one of three ways, and each way has its own order of
 * work. The order is not a wizard that locks the next screen: every step
 * links to where the work happens, and its status is read from what exists
 * (a product with images, research on file, avatars, versions) rather than
 * from a checkbox the owner ticked. Skipping is a decision, so it is kept.
 *
 * The buyer questions are asked up front. "I don't know" is an answer: it
 * is stored as such, research fills the blank, and the fill is marked as
 * assumed until the owner confirms it.
 */
export type BuildMode = 'copy-funnel' | 'copy-funnel-no-angle' | 'own-product'

export type BuildStep = {
  key: string
  label: string
  detail: string
  /** Admin path, without the /admin prefix. */
  href: string
}

export type BuildAnswer = { value: string; unknown: boolean; assumed?: string }

export type BuildState = {
  mode: BuildMode | ''
  answers: Record<string, BuildAnswer>
  skipped: string[]
  startedAt: string
}

export const MODES: Array<{ id: BuildMode; name: string; description: string; steps: BuildStep[] }> = [
  {
    id: 'own-product',
    name: 'Bring your own product',
    description: 'You have the product. The platform researches the market, finds the avatar and the mechanism, writes the pages and briefs the photos.',
    steps: [
      { key: 'images', label: 'Upload the product images', detail: 'The photos you have, at their best. Everything visual is derived from these.', href: '/products' },
      { key: 'reference', label: 'Make the 360 reference set', detail: 'Front, side, back, top and detail renders from your photo, so every page and ad has the same product.', href: '/products' },
      { key: 'guidance', label: 'Tell it what you know about the buyer', detail: 'Eight questions. "I don\'t know" is fine; research fills the blank and says it did.', href: '/build#answers' },
      { key: 'research', label: 'Run market research', detail: 'Who buys, what stops them, the competitors, the price band, and where the customer language lives.', href: '/research' },
      { key: 'market', label: 'Write the market analysis', detail: 'Awareness, sophistication, the mechanism, the new information, the underserved avatar. If no way to stand out is found, it says so.', href: '/market' },
      { key: 'avatars', label: 'Build the core avatar and sub-avatars', detail: 'One desire-based core avatar; sub-avatars layer experience, emotion and behaviour and each gives an angle.', href: '/market#avatars' },
      { key: 'targeting', label: 'Choose who to target first', detail: 'Turn on the avatars the pages and ads are written to. One core avatar under $100k a month.', href: '/research#avatars' },
      { key: 'copy', label: 'Write the page copy', detail: 'Product page versions and advertorials from the research, the avatar and the mechanism.', href: '/products' },
      { key: 'proof', label: 'Images, testimonials and reviews', detail: 'Photo briefs to shoot, real reviews imported, and any synthetic concepts vetted before they go anywhere.', href: '/creative' },
      { key: 'photos', label: 'Review the product photos against the eight briefs', detail: 'Hero, in hand, in use, detail, box, size, result, 360. What is missing is listed.', href: '/creative#photos' },
      { key: 'offer', label: 'Set the offer and the funnel', detail: 'Bundle tiers, the bump, the upsell, the downsell; the checkout reads them.', href: '/bundles' },
      { key: 'ship', label: 'Legal pages, popup, tracking, publish', detail: 'Privacy and terms are generated; the popup is optional; behaviour tracking is on; then publish.', href: '/store' },
    ],
  },
  {
    id: 'copy-funnel',
    name: 'Copy a funnel',
    description: 'Point at a funnel that works. Its structure is kept, its angle is kept, and every word and every image is replaced with yours.',
    steps: [
      { key: 'rip', label: 'Read the funnel', detail: 'Paste the page URLs. The structure comes back as a block outline; the copy and the images do not.', href: '/pages#rip' },
      { key: 'images', label: 'Add your product and images', detail: 'The product the funnel will sell, with your photos.', href: '/products' },
      { key: 'copy', label: 'Rewrite every word in the same angle', detail: 'Same order of sections, same reason to buy, new copy that is yours.', href: '/pages' },
      { key: 'proof', label: 'Replace every image', detail: 'Renders from your photos, photo briefs for the shots you do not have yet.', href: '/creative' },
      { key: 'offer', label: 'Set the offer and the funnel', detail: 'Bundle tiers, the bump, the upsell, the downsell.', href: '/funnels' },
      { key: 'ship', label: 'Legal pages, popup, tracking, publish', detail: 'Generated legal pages, the optional popup, tracking on, then publish.', href: '/store' },
    ],
  },
  {
    id: 'copy-funnel-no-angle',
    name: 'Copy a funnel, change the angle',
    description: 'Keep the structure of a funnel that works, but sell to a different person or with a different mechanism.',
    steps: [
      { key: 'rip', label: 'Read the funnel', detail: 'Paste the page URLs. The structure comes back as a block outline.', href: '/pages#rip' },
      { key: 'research', label: 'Run market research', detail: 'What the market has already heard, so the new angle is actually new.', href: '/research' },
      { key: 'avatars', label: 'Find the underserved avatar or the new mechanism', detail: 'The market analysis names the reset; the sub-avatars give the angles.', href: '/market' },
      { key: 'angle', label: 'Pick the angle', detail: 'Turn on the avatar the pages are written to and write the angle down.', href: '/research#avatars' },
      { key: 'copy', label: 'Rewrite every word in the new angle', detail: 'Same order of sections, a different reason to buy.', href: '/pages' },
      { key: 'proof', label: 'Replace every image', detail: 'Renders and photo briefs that show the new avatar and the mechanism.', href: '/creative' },
      { key: 'offer', label: 'Set the offer and the funnel', detail: 'Bundle tiers, the bump, the upsell, the downsell.', href: '/funnels' },
      { key: 'ship', label: 'Legal pages, popup, tracking, publish', detail: 'Generated legal pages, the optional popup, tracking on, then publish.', href: '/store' },
    ],
  },
]

/** The buyer questions, in the order they are asked. Every one accepts "I don't know". */
export const QUESTIONS: Array<{ key: string; label: string; help: string }> = [
  { key: 'who', label: 'Who buys this, in one sentence they would agree with?', help: '"People whose back hurts from sitting all day", not "adults 25–54".' },
  { key: 'instinct', label: 'Which instinct is it really about?', help: 'Health, status, sex, comfort, control or belonging. Pick the strongest one the product can truthfully serve.' },
  { key: 'tried', label: 'What did they try before this, and why did it fail?', help: 'The product experience with its outcome: "tried nose strips, still tired".' },
  { key: 'outcome', label: 'What do they say when it works?', help: 'The result in their words, not in yours.' },
  { key: 'fear', label: 'What are they afraid of getting wrong?', help: 'Wrong size, wasted money, looking foolish, it not working for them.' },
  { key: 'where', label: 'Where do they find out about things like this?', help: 'A subreddit, a creator, a store, a friend, a doctor.' },
  { key: 'cost', label: 'What does it cost them to not solve this, per month?', help: 'Money, time, pain. A number if you have one.' },
  { key: 'competitors', label: 'Who else is selling to them, and what do those pages say?', help: 'Paste URLs; the competitor reader will pull the angles.' },
]

export function modeById(id: string): (typeof MODES)[number] | null {
  return MODES.find((mode) => mode.id === id) ?? null
}

export function buildState(db: Db, storeId: string): BuildState {
  const row = db.one<{ build: string }>('SELECT build FROM stores WHERE id = ?', storeId)
  const stored = json<Partial<BuildState>>(row?.build, {})
  return { mode: stored.mode ?? '', answers: stored.answers ?? {}, skipped: stored.skipped ?? [], startedAt: stored.startedAt ?? '' }
}

function save(db: Db, storeId: string, state: BuildState) {
  db.run('UPDATE stores SET build = ? WHERE id = ?', JSON.stringify(state), storeId)
}

export function setBuildMode(db: Db, storeId: string, mode: BuildMode): BuildState {
  if (!modeById(mode)) throw new Error('No such build mode')
  const state = buildState(db, storeId)
  const next = { ...state, mode, startedAt: state.startedAt || now() }
  save(db, storeId, next)
  return next
}

/** Answers are kept verbatim; an unknown keeps whatever was assumed for it later. */
export function saveAnswers(db: Db, storeId: string, input: Record<string, { value?: string; unknown?: boolean }>): BuildState {
  const state = buildState(db, storeId)
  const answers = { ...state.answers }
  for (const question of QUESTIONS) {
    const given = input[question.key]
    if (!given) continue
    const value = (given.value ?? '').trim()
    const unknown = Boolean(given.unknown) || !value
    const previous = answers[question.key]
    answers[question.key] = { value: unknown ? '' : value, unknown, ...(unknown && previous?.assumed ? { assumed: previous.assumed } : {}) }
  }
  const next = { ...state, answers }
  save(db, storeId, next)
  return next
}

/** Research fills the blanks the owner left; the fill stays labelled as assumed. */
export function assumeAnswers(db: Db, storeId: string, assumed: Record<string, string>): BuildState {
  const state = buildState(db, storeId)
  const answers = { ...state.answers }
  for (const question of QUESTIONS) {
    const fill = assumed[question.key]?.trim()
    if (!fill) continue
    const current = answers[question.key]
    if (current && !current.unknown && current.value) continue
    answers[question.key] = { value: '', unknown: true, assumed: fill }
  }
  const next = { ...state, answers }
  save(db, storeId, next)
  return next
}

export function skipStep(db: Db, storeId: string, key: string, skipped = true): BuildState {
  const state = buildState(db, storeId)
  const set = new Set(state.skipped)
  if (skipped) set.add(key)
  else set.delete(key)
  const next = { ...state, skipped: [...set] }
  save(db, storeId, next)
  return next
}

/** The answers as a block of owner input for a prompt, unknowns and assumptions labelled. */
export function answersForPrompt(state: BuildState): string {
  const lines = QUESTIONS.map((question) => {
    const answer = state.answers[question.key]
    if (!answer) return `${question.label} (not asked yet)`
    if (!answer.unknown) return `${question.label} ${answer.value}`
    return `${question.label} The owner does not know.${answer.assumed ? ` Assumed so far: ${answer.assumed}` : ''}`
  })
  return `What the owner said about the buyer:\n${lines.map((line) => `- ${line}`).join('\n')}`
}

export type StepStatus = 'done' | 'next' | 'waiting' | 'skipped'

/**
 * Each step's status comes from the world. The first step that is neither
 * done nor skipped is "next"; everything after it waits.
 */
export function buildProgress(db: Db, storeId: string): { mode: (typeof MODES)[number] | null; state: BuildState; steps: Array<BuildStep & { status: StepStatus; why: string }> } {
  const state = buildState(db, storeId)
  const mode = modeById(state.mode)
  if (!mode) return { mode: null, state, steps: [] }
  const facts = worldFacts(db, storeId, state)
  let nextFound = false
  const steps = mode.steps.map((step) => {
    const check = facts[step.key] ?? { done: false, why: '' }
    let status: StepStatus
    if (state.skipped.includes(step.key)) status = 'skipped'
    else if (check.done) status = 'done'
    else if (!nextFound) { status = 'next'; nextFound = true }
    else status = 'waiting'
    return { ...step, status, why: check.why }
  })
  return { mode, state, steps }
}

function worldFacts(db: Db, storeId: string, state: BuildState): Record<string, { done: boolean; why: string }> {
  const count = (sql: string, ...params: unknown[]) => db.one<{ c: number }>(sql, storeId, ...params)?.c ?? 0
  const products = count("SELECT COUNT(*) c FROM products WHERE store_id = ? AND status != 'archived'")
  const withImages = count("SELECT COUNT(*) c FROM products WHERE store_id = ? AND hero_image != ''")
  const withSheet = count("SELECT COUNT(*) c FROM products WHERE store_id = ? AND json_extract(metadata, '$.imageSheet') IS NOT NULL")
  const research = count('SELECT COUNT(*) c FROM store_research WHERE store_id = ?')
  const analysis = count("SELECT COUNT(*) c FROM market_docs WHERE store_id = ? AND kind = 'analysis'")
  const avatars = count('SELECT COUNT(*) c FROM avatars WHERE store_id = ?')
  const subAvatars = count("SELECT COUNT(*) c FROM avatars WHERE store_id = ? AND parent_id != ''")
  const selected = count('SELECT COUNT(*) c FROM avatars WHERE store_id = ? AND selected = 1')
  const versions = count("SELECT COUNT(*) c FROM pages WHERE store_id = ? AND role IN ('pdp','advertorial')")
  const ripped = count("SELECT COUNT(*) c FROM pages WHERE store_id = ? AND source_url != ''")
  const reviews = count("SELECT COUNT(*) c FROM reviews WHERE store_id = ? AND status = 'approved'")
  const briefs = count("SELECT COUNT(*) c FROM creative_queue WHERE store_id = ? AND kind = 'photo-brief'")
  const vetted = count("SELECT COUNT(*) c FROM creative_queue WHERE store_id = ? AND status != 'pending'")
  const bundles = count("SELECT COUNT(*) c FROM bundles WHERE store_id = ? AND status = 'active'")
  const funnels = count('SELECT COUNT(*) c FROM funnels WHERE store_id = ?')
  const live = db.one<{ status: string }>('SELECT status FROM stores WHERE id = ?', storeId)?.status === 'live'
  const answered = Object.keys(state.answers).length
  return {
    images: { done: withImages > 0, why: withImages ? `${withImages} product${withImages === 1 ? '' : 's'} with an image` : products ? 'Products exist but none has an image yet' : 'No products yet' },
    reference: { done: withSheet > 0, why: withSheet ? 'A reference sheet has been rendered' : 'No renders yet' },
    guidance: { done: answered > 0, why: answered ? `${answered} of ${QUESTIONS.length} questions answered` : 'Nothing answered yet' },
    research: { done: research > 0, why: research ? 'Research on file' : 'No research yet' },
    market: { done: analysis > 0, why: analysis ? 'Market analysis written' : 'No market analysis yet' },
    avatars: { done: avatars > 0 && subAvatars > 0, why: avatars ? `${avatars} avatars, ${subAvatars} of them sub-avatars` : 'No avatars yet' },
    targeting: { done: selected > 0 && avatars > 0, why: selected ? `${selected} avatar${selected === 1 ? '' : 's'} turned on` : 'None turned on' },
    angle: { done: selected > 0 && analysis > 0, why: selected && analysis ? 'An avatar is on and the analysis names the reset' : 'Needs the analysis and an avatar turned on' },
    copy: { done: versions > 0, why: versions ? `${versions} page version${versions === 1 ? '' : 's'}` : 'No versions written yet' },
    proof: { done: reviews > 0 || vetted > 0, why: reviews ? `${reviews} approved reviews` : vetted ? 'Creative has been vetted' : 'No reviews or vetted creative yet' },
    photos: { done: briefs > 0, why: briefs ? 'Photo briefs reviewed' : 'Photos not reviewed against the briefs yet' },
    offer: { done: bundles > 0 || funnels > 0, why: bundles ? 'Bundle tiers set' : funnels ? 'A funnel exists' : 'No bundle or funnel yet' },
    rip: { done: ripped > 0, why: ripped ? `${ripped} page${ripped === 1 ? '' : 's'} read from a funnel` : 'Nothing read yet' },
    ship: { done: live, why: live ? 'Published' : 'Not published yet' },
  }
}
