import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateSync } from 'node:zlib'
import { fresh } from './helpers.ts'
import { createStore, environment, setTheme } from '../src/control/stores.ts'
import { createProduct, getProduct } from '../src/domain/catalog.ts'
import { seedDefaultRegion } from '../src/domain/regions.ts'
import { answersForPrompt, buildProgress, buildState, DOORS, MODES, pagePlan, QUESTIONS, saveAnswers, assumeAnswers, setBuildMode, setSiteShape, SHAPES, skipStep } from '../src/control/build.ts'
import { knowledge, calendarMonth, TOPIC_NAMES } from '../src/agent/knowledge.ts'
import { authorResearch, runResearch, rulesResearch } from '../src/agent/research.ts'
import { readBrief } from '../src/agent/copy.ts'
import { S, useModelTransport } from '../src/agent/models.ts'
import { listAvatars, saveAvatar, avatarTree, suggestAvatars } from '../src/agent/avatars.ts'
import { authorAnalysis, latestDoc, listDocs, rulesAnalysis, runAdPlan, runAnalysis, runOverview, saveLoop, suggestSubAvatars, updatePlanRow, type AdPlan, type MarketAnalysis } from '../src/agent/market.ts'
import { blocksFromOutline, outlinePage, ripHtml, ripToPage } from '../src/pages/rip.ts'
import { listQueue, photoCoverage, PHOTO_BRIEFS, queuePhotoBriefs, queueUgcConcepts, rulesSuggestBlocks, setQueueStatus, suggestBlocks } from '../src/creative/briefs.ts'
import { listReviews } from '../src/domain/reviews.ts'
import { decodePng, encodeGif, inspectGif, isPng, palette, solidFrame } from '../src/creative/gif.ts'
import { makeProductGif, approveGif } from '../src/creative/product-gif.ts'
import { saveUpload } from '../src/lib/uploads.ts'
import { auditHtml, auditStore, contrast } from '../src/storefront/health.ts'
import { privacyHtml, saveLegal, termsHtml } from '../src/storefront/legal.ts'
import { popupHtml, trackingScript } from '../src/storefront/behaviour.ts'
import { renderBlock, blockDefinition, type BlockContext } from '../src/pages/blocks.ts'
import { advertorialTemplate, createPage, homeTemplate, offerTemplate, quizTemplate, salesTemplate } from '../src/pages/store.ts'
import { funnelStats, pickFunnel, upsertFunnel, funnelEntry } from '../src/domain/funnels.ts'
import { behaviour, revenuePerSession, sessionFor, track } from '../src/analytics/events.ts'
import { blockContextFor } from '../src/pages/store.ts'
import { execute } from '../src/agent/registry.ts'

/* ------------------------------------------------------------- fixtures */

function shop() {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Night Shift Sleep Co', prompt: 'blackout blinds for people who sleep during the day' })
  seedDefaultRegion(db, store.id, 'USD')
  const product = createProduct(db, store.id, { title: 'Total Blackout Blind', subtitle: 'Sleep in the dark at noon', description: 'A blind that blocks every bit of light and installs in five minutes without drilling.', status: 'published', variants: [{ title: 'Standard', priceCents: 7900, compareAtCents: 9900, inventory: 30 }] })
  return { db, user, store, product }
}

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(vars)) { saved[key] = process.env[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value }
  try { await fn() } finally {
    for (const key of Object.keys(vars)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
    useModelTransport(null)
  }
}

type Captured = { url: string; body: Record<string, unknown> }

function fakeAnthropic(reply: (captured: Captured) => unknown): { calls: Captured[] } {
  const calls: Captured[] = []
  useModelTransport(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const captured = { url, body }
    calls.push(captured)
    const answer = reply(captured)
    return new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return { calls }
}

const CHOICE = { provider: 'anthropic' as const, model: 'claude-opus-5' }

/** A real 8-bit RGB PNG, built by hand: enough for the decoder to have something honest to read. */
function pngBytes(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c }
  const crc = (buffer: Buffer) => { let c = -1; for (const byte of buffer) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (type: string, data: Buffer) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([length, body, sum]) }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; for (let x = 0; x < width; x++) { const o = y * (width * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = x === y ? 0 : rgb[2] } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/* -------------------------------------------------------------- knowledge */

test('the knowledge base is topical and reaches the research prompt', async () => {
  assert.ok(TOPIC_NAMES.length >= 9)
  assert.match(knowledge('desires'), /six mass instincts/i)
  assert.ok(!knowledge('desires').includes('3:2:2'), 'the desires topic does not carry the testing rules')
  assert.match(knowledge('testing'), /3:2:2/)
  assert.equal(calendarMonth(new Date('2026-09-15')).month, 'September')
  await withEnv({ ANTHROPIC_API_KEY: 'sk-test' }, async () => {
    const net = fakeAnthropic(() => ({ ...rulesResearch(readBrief('blackout blinds')), comparison: { rows: [{ label: 'Light', us: 'None', them: 'Some' }] }, sourceNotes: [] }))
    await authorResearch(CHOICE, readBrief('blackout blinds for shift workers'), {})
    const system = String(net.calls[0]?.body.system ?? '')
    assert.match(system, /six mass instincts/i, 'the desires topic is in the research system prompt')
    assert.match(system, /NEW MECHANISM/, 'and the sophistication resets')
    assert.match(system, /Never invent reviews/, 'and the honesty rule')
  })
})

/* ------------------------------------------------------------------ build */

test('a build mode has an ordered plan whose statuses come from the world, and "I don\'t know" is an answer', () => {
  const { db, store, product } = shop()
  assert.equal(buildProgress(db, store.id).mode, null)
  setBuildMode(db, store.id, 'own-product')
  let progress = buildProgress(db, store.id)
  assert.equal(progress.mode?.id, 'own-product')
  assert.equal(progress.steps[0]?.key, 'shape')
  assert.equal(progress.steps[0]?.status, 'done', 'a product of one\'s own defaults to a store until the owner says otherwise')
  assert.equal(progress.steps[1]?.key, 'images')
  assert.equal(progress.steps[1]?.status, 'next', 'no product has an image yet')
  assert.equal(progress.steps.filter((step) => step.status === 'next').length, 1, 'exactly one step is next')

  // An image on the product completes the step without anyone ticking anything.
  const { updateProduct } = require_catalog()
  updateProduct(db, store.id, product.id, { heroImage: '/_uploads/x.png' })
  progress = buildProgress(db, store.id)
  assert.equal(progress.steps[1]?.status, 'done')
  assert.equal(progress.steps[2]?.status, 'next')

  skipStep(db, store.id, 'reference')
  progress = buildProgress(db, store.id)
  assert.equal(progress.steps[2]?.status, 'skipped')
  assert.equal(progress.steps[3]?.status, 'next', 'skipping moves next along')

  const state = saveAnswers(db, store.id, { who: { value: 'People who work nights and sleep at noon' }, instinct: { unknown: true }, tried: { value: '' } })
  assert.equal(state.answers.who?.unknown, false)
  assert.equal(state.answers.instinct?.unknown, true)
  assert.equal(state.answers.tried?.unknown, true, 'a blank counts as unknown')
  assumeAnswers(db, store.id, { instinct: 'health', who: 'should not overwrite' })
  const filled = buildState(db, store.id)
  assert.equal(filled.answers.instinct?.assumed, 'health')
  assert.equal(filled.answers.who?.value, 'People who work nights and sleep at noon', 'an answer the owner gave is never overwritten by an assumption')
  const prompt = answersForPrompt(filled)
  assert.match(prompt, /does not know\. Assumed so far: health/)
  assert.equal(MODES.length, 3)
  assert.equal(QUESTIONS.length, 8)
  for (const mode of MODES) assert.ok(mode.steps.every((step) => step.href.startsWith('/')), `${mode.id} steps link somewhere`)
  for (const mode of MODES) assert.ok(mode.steps.some((step) => step.key === 'shape') && mode.steps.some((step) => step.key === 'pages'), `${mode.id} decides the shape and builds its pages`)
})

test('the shape decides the page plan, and every page on it reads its status from the store', () => {
  const { db, store, product } = shop()
  assert.equal(SHAPES.length, 2)
  assert.equal(DOORS.length, 2)
  assert.equal(pagePlan(db, store.id).pages.length, 0, 'no shape, no plan')

  // Copying a funnel implies a funnel; a store is a click away.
  setBuildMode(db, store.id, 'copy-funnel')
  assert.equal(buildState(db, store.id).shape, 'funnel')
  let plan = pagePlan(db, store.id)
  const keys = plan.pages.map((entry) => entry.key)
  assert.deepEqual(keys, ['sales', 'bundle', 'checkout', 'upsell', 'thankyou', 'popup', 'legal'])
  assert.equal(plan.pages.find((entry) => entry.key === 'sales')?.status, 'missing')
  assert.equal(plan.pages.find((entry) => entry.key === 'sales')?.template, 'sales')
  assert.equal(plan.pages.find((entry) => entry.key === 'checkout')?.status, 'missing', 'no funnel record yet')
  assert.equal(plan.pages.find((entry) => entry.key === 'thankyou')?.status, 'built-in')

  // The sales page is found by what it is, not by a checkbox: a landing page with a buy box counts.
  const sales = createPage(db, store.id, { title: 'Save today', kind: 'landing', blocks: offerTemplate({ storeName: store.name, product: { id: product.id, title: product.title, image: '', subtitle: '' } }) })
  const funnel = upsertFunnel(db, store.id, { name: 'Main', productId: product.id, offerPageId: sales.id, upsell: { variantId: product.variants[0]?.id, discountPercent: 20 } })
  plan = pagePlan(db, store.id)
  assert.equal(plan.pages.find((entry) => entry.key === 'sales')?.status, 'done')
  assert.equal(plan.pages.find((entry) => entry.key === 'sales')?.href, `/pages/${sales.id}/edit`, 'an existing page links to its editor')
  assert.equal(plan.pages.find((entry) => entry.key === 'checkout')?.status, 'done')
  assert.equal(plan.pages.find((entry) => entry.key === 'upsell')?.status, 'done')
  assert.ok(funnel.id)

  // Front doors go in front, in the order chosen; the popup decision adds or removes its row.
  setSiteShape(db, store.id, { doors: ['quiz', 'advertorial', 'nonsense'], popup: 'yes' })
  plan = pagePlan(db, store.id)
  assert.deepEqual(plan.doors, ['quiz', 'advertorial'], 'unknown doors are dropped')
  assert.deepEqual(plan.pages.slice(0, 2).map((entry) => entry.key), ['quiz', 'advertorial'])
  assert.equal(plan.pages.find((entry) => entry.key === 'quiz')?.status, 'missing')
  assert.equal(plan.pages.find((entry) => entry.key === 'popup')?.status, 'missing', 'chosen but not on')
  assert.equal(plan.pages.find((entry) => entry.key === 'popup')?.optional, false)
  createPage(db, store.id, { title: 'Find yours', kind: 'landing', blocks: quizTemplate({ storeName: store.name }) })
  createPage(db, store.id, { title: '7 reasons', kind: 'advertorial', blocks: advertorialTemplate({ storeName: store.name }) })
  setTheme(db, store.id, { popup: { enabled: true, trigger: 'exit', after: 0, headline: 'Wait', text: '', code: 'TEN', buttonLabel: 'Send', dismissDays: 7 } })
  plan = pagePlan(db, store.id)
  assert.equal(plan.pages.find((entry) => entry.key === 'quiz')?.status, 'done', 'a page with a quiz block is the quiz')
  assert.equal(plan.pages.find((entry) => entry.key === 'advertorial')?.status, 'done')
  assert.equal(plan.pages.find((entry) => entry.key === 'popup')?.status, 'done')
  setSiteShape(db, store.id, { popup: 'no' })
  assert.ok(!pagePlan(db, store.id).pages.some((entry) => entry.key === 'popup'), 'no popup means no popup row')

  // A store has other pages, and the pages step reads the plan.
  setSiteShape(db, store.id, { shape: 'store', doors: [] })
  plan = pagePlan(db, store.id)
  assert.deepEqual(plan.pages.map((entry) => entry.key), ['home', 'collection', 'pdp', 'bundle', 'checkout', 'legal'])
  assert.equal(plan.pages.find((entry) => entry.key === 'pdp')?.status, 'missing', 'the product has no image yet')
  const progress = buildProgress(db, store.id)
  assert.equal(progress.steps.find((step) => step.key === 'shape')?.status, 'done')
  assert.match(progress.steps.find((step) => step.key === 'pages')?.why ?? '', /Missing: Product page, Bundle tiers/)
  assert.throws(() => setSiteShape(db, store.id, { shape: 'catalogue' }), /No such shape/)
})

function require_catalog() {
  // Indirection keeps the import list honest about what this test needs from the catalog.
  return { updateProduct: (db: Parameters<typeof getProduct>[0], storeId: string, id: string, patch: { heroImage: string }) => { db.run('UPDATE products SET hero_image = ? WHERE id = ? AND store_id = ?', patch.heroImage, id, storeId); return getProduct(db, storeId, id) } }
}

/* ----------------------------------------------------------------- market */

test('the market analysis is honest without a model and reads everything with one', async () => {
  const { db, store } = shop()
  await assert.rejects(runAnalysis(db, store.id, { model: null }), /research first/i)
  await runResearch(db, store.id, { prompt: store.prompt, model: null })
  const rules = await runAnalysis(db, store.id, { model: null })
  assert.equal(rules.source, 'rules')
  assert.equal(rules.body.standOut.found, false, 'rules never claim a way to stand out')
  assert.ok(rules.body.researchQueries.some((query) => query.where === 'Reddit'))
  assert.equal(rules.body.calendar.month, calendarMonth().month)

  await withEnv({ ANTHROPIC_API_KEY: 'sk-test' }, async () => {
    saveAnswers(db, store.id, { instinct: { unknown: true }, who: { value: 'night shift nurses' } })
    const baseline = rulesAnalysis(rulesResearch(readBrief(store.prompt)), [])
    const net = fakeAnthropic(({ body }) => {
      assert.match(String(body.system), /AWARENESS AND SOPHISTICATION/)
      const prompt = String((body.messages as Array<{ content: string }>)[0]?.content)
      assert.match(prompt, /night shift nurses/, 'the owner\'s answers reach the model')
      assert.match(prompt, /The owner does not know/, 'so does the unknown')
      return { ...baseline, summary: 'Stage 4 market; the new identity is the night-shift worker.', awareness: 'solution', sophistication: 4, underserved: [{ avatar: 'Night-shift nurses', why: 'Every blind is sold to parents of babies.', angle: 'Sleep at noon like it is midnight', tier: 'mid' }], standOut: { found: true, via: 'identity', recommendation: 'Lead with the night-shift identity.' }, answers: { instinct: 'health', who: 'ignored' }, calendar: { month: 'September', theme: 'Structure', angle: 'Back on a routine.' } }
    })
    const doc = await runAnalysis(db, store.id)
    assert.equal(doc.source, 'model')
    assert.equal(doc.body.sophistication, 4)
    assert.equal(doc.body.standOut.via, 'identity')
    assert.equal(net.calls.length, 1)
    const state = buildState(db, store.id)
    assert.equal(state.answers.instinct?.assumed, 'health', 'the model\'s assumption fills the unknown')
    assert.equal(state.answers.who?.value, 'night shift nurses', 'and never the owner\'s answer')
    assert.equal(latestDoc<MarketAnalysis>(db, store.id, 'analysis')?.id, doc.id)
  })
})

test('the product overview, the ad plan and feedback loops are saved under the store', async () => {
  const { db, store, product } = shop()
  const overview = await runOverview(db, store.id, product.id, store.currency, null)
  assert.equal(overview.body.assumed, true)
  assert.equal(overview.body.price, '79 USD')
  assert.equal(overview.body.compareAt, '99 USD')
  const again = await runOverview(db, store.id, product.id, store.currency, null)
  assert.equal(again.id, overview.id, 'one overview per product, updated in place')

  saveAvatar(db, store.id, { name: 'The day sleeper', who: 'Works nights.', wants: 'Real sleep during the day', fears: 'Waking at noon', buysWhen: 'After a bad week', angle: 'sleep at noon like midnight', hooks: ['Sleep at noon like it is midnight.'], tone: 'plain', desire: 'I want to sleep through the day', selected: true })
  const plan = await runAdPlan(db, store.id, null)
  assert.equal(plan.body.rows.length, 2)
  assert.equal(plan.body.rows[0]?.method, 'marksman')
  assert.equal(plan.body.rows[1]?.method, 'sniper')
  updatePlanRow(db, store.id, 0, { status: 'working', result: 'launched' })
  const rerun = await runAdPlan(db, store.id, null)
  assert.equal(rerun.body.rows[0]?.status, 'working', 'a row being worked survives a re-plan')
  assert.equal(rerun.body.rows.length, 2, 'no duplicate concepts')

  const loop = saveLoop(db, store.id, { failing: 'Statics get no purchases', working: 'Comparison angle', hypotheses: ['Landing page incongruent'], actions: ['Match the headline'], outcome: '' })
  assert.equal(loop.kind, 'loop')
  assert.equal(listDocs(db, store.id).length, 3)
  const kinds = listDocs(db, store.id).map((doc) => doc.kind).sort()
  assert.deepEqual(kinds, ['ad-plan', 'loop', 'product-overview'])
})

test('sub-avatars hang under a core avatar, keep its desire and add a category each', async () => {
  const { db, store } = shop()
  await runResearch(db, store.id, { prompt: store.prompt, model: null })
  const avatars = await suggestAvatars(db, store.id, null)
  const core = avatars[0]!
  const subs = await suggestSubAvatars(db, store.id, core.id, null)
  assert.ok(subs.length >= 2)
  assert.ok(subs.every((sub) => sub.parentId === core.id))
  assert.ok(subs.every((sub) => sub.experience), 'rules sub-avatars are defined by an experience')
  assert.ok(subs.every((sub) => !sub.selected), 'suggested sub-avatars start off')
  const tree = avatarTree(db, store.id)
  assert.equal(tree.find((entry) => entry.core.id === core.id)?.subs.length, subs.length)
  await withEnv({ ANTHROPIC_API_KEY: 'sk-test' }, async () => {
    fakeAnthropic(() => ({ avatars: [{ name: 'The night-shift nurse', label: 'night shift', who: 'Twelve-hour shifts, home at eight.', desire: core.desire || core.wants, experience: 'Tried blackout curtains; light leaks at the edges', emotion: 'frustrated: why is it still bright', behaviour: 'Wears an eye mask every day', demographic: '', angle: 'Blocks the edges the curtains leak', hooks: ['POV: you work the night shift and the curtains leak light'], objection: 'Will it fit my window?', answer: 'It is cut to measure.', tone: 'plain', tier: 'mid' }] }))
    const written = await suggestSubAvatars(db, store.id, core.id)
    const nurse = written.find((sub) => sub.name === 'The night-shift nurse')
    assert.ok(nurse)
    assert.equal(nurse.tier, 'mid')
    assert.equal(nurse.label, 'night shift')
    assert.equal(nurse.wants, core.wants, 'the desire is the core avatar\'s')
  })
})

/* -------------------------------------------------------------------- rip */

const COMPETITOR_HTML = `<!doctype html><html><head><title>SleepDark Blind — Save $30 today</title><meta property="og:site_name" content="SleepDark"></head><body>
<h1>Finally sleep during the day, even in July</h1>
<p>Most blackout curtains leak light around the edges. That sliver is enough to keep your brain awake. Our patented rail seals the frame. Offer ends in 4 hours.</p>
<img src="https://cdn.example.com/hero.jpg" alt="Woman asleep at noon">
<h2>How it works</h2><ul><li>Seals the frame edge to edge</li><li>Installs in five minutes</li><li>No drilling</li></ul>
<h2>Why people switched</h2><blockquote>I slept nine hours after a night shift for the first time in years.</blockquote>
<img src="https://cdn.example.com/detail.jpg">
<form action="/cart/add"><input name="quantity"><button>Add to cart — $79</button></form>
<h2>Questions</h2><ul><li>Does it fit any window?</li><li>What if it does not work?</li></ul>
<p>30-day money-back guarantee. 4.8 stars from 2,000 reviews.</p></body></html>`

test('a ripped page keeps the structure and the angle, and none of the words or the images', async () => {
  const { db, store, product } = shop()
  const read = ripHtml(COMPETITOR_HTML, 'https://sleepdark.example/offer')
  assert.equal(read.angle.brand, 'SleepDark')
  assert.equal(read.imageBriefs.length, 2)
  assert.match(read.imageBriefs[0] as string, /Woman asleep at noon/, 'the brief describes the shot from the alt text')
  const types = read.sections.map((section) => section.type)
  assert.ok(types.includes('countdown'), 'the timer was detected')
  assert.ok(types.includes('guarantee'))
  assert.ok(types.includes('review-wall'))
  assert.ok(types.includes('faq'), 'a list of questions is a FAQ')
  assert.ok(types.includes('buy-box'))
  const blocks = blocksFromOutline(read.sections, { id: product.id, title: product.title, image: '' }, store.name)
  const text = JSON.stringify(blocks)
  assert.ok(!text.includes('cdn.example.com'), 'no image URL comes across')
  assert.ok(!text.includes('patented rail'), 'no sentence comes across')
  assert.ok(text.includes('Photo 1:'), 'the image block carries the brief')
  assert.equal(blocks.filter((block) => block.type === 'buy-box').length, 1)
  assert.equal(blocks.at(-1)?.type, 'footer')

  const result = await ripToPage(db, store, { html: COMPETITOR_HTML, url: 'https://sleepdark.example/offer', productId: product.id, keepAngle: true, model: null })
  assert.equal(result.page.sourceUrl, 'https://sleepdark.example/offer')
  assert.equal(result.page.role, 'pdp')
  assert.equal(result.page.status, 'draft')
  assert.equal(result.source, 'rules')

  await withEnv({ ANTHROPIC_API_KEY: 'sk-test' }, async () => {
    const net = fakeAnthropic(({ body }) => {
      const prompt = String((body.messages as Array<{ content: string }>)[0]?.content)
      assert.match(prompt, /do not reuse any phrase/, 'the rewrite is told not to copy')
      assert.match(prompt, /problem-solution|urgency|offer|risk-reversal|clinical|social-proof|comparison|premium|story|benefit/, 'and which angle to keep')
      const textual = JSON.parse(/Blocks, in page order, with their current placeholder text:\n(\[[\s\S]*?\])\n\n/.exec(prompt)?.[1] ?? '[]') as Array<{ id: string; type: string }>
      const headline = textual.find((block) => block.type === 'headline')
      return { blocks: headline ? [{ id: headline.id, values: [{ key: 'text', value: 'Sleep at noon like it is midnight' }] }] : [] }
    })
    const written = await ripToPage(db, store, { html: COMPETITOR_HTML, productId: product.id, keepAngle: true })
    assert.equal(written.source, 'model')
    assert.ok(written.page.blocks.some((block) => block.settings.text === 'Sleep at noon like it is midnight'))
    assert.equal(net.calls.length, 1)
  })
  const fetched = await ripToPage(db, store, { url: 'https://blocked.example/', productId: product.id, keepAngle: false, model: null, fetcher: async () => ({ ok: false, status: 403, text: '' }) }).catch((error: Error) => error)
  assert.match((fetched as Error).message, /403/, 'a blocked site says so and asks for pasted HTML')
  assert.ok(outlinePage('<html><body><p>Nothing here</p></body></html>').sections.length <= 1)
})

/* --------------------------------------------------------------- creative */

test('photo briefs, creator-content concepts and GIFs wait in a queue and never touch the reviews', async () => {
  const { db, store, product } = shop()
  assert.equal(PHOTO_BRIEFS.length, 8)
  const before = photoCoverage(product)
  assert.equal(before.have.length, 0)
  const queued = queuePhotoBriefs(db, store.id, product)
  assert.equal(queued.length, 8)
  assert.equal(queuePhotoBriefs(db, store.id, product).length, 8, 'queueing again adds nothing')
  const { updateProduct } = await import('../src/domain/catalog.ts')
  updateProduct(db, store.id, product.id, { heroImage: '/_uploads/h.png', media: [{ url: '/_uploads/d.png', alt: 'photo:detail the seam' }] })
  const after = photoCoverage(getProduct(db, store.id, product.id)!)
  assert.deepEqual(after.have.map((brief) => brief.id).sort(), ['detail', 'hero'])

  const concepts = await queueUgcConcepts(db, store.id, product, null, null, null)
  assert.equal(concepts.length, 3)
  assert.ok(concepts.every((item) => item.status === 'pending'))
  assert.ok(concepts.every((item) => item.body.disclosure), 'every concept states its disclosure')
  assert.equal(listReviews(db, store.id, {}).length, 0, 'nothing reached the reviews')
  setQueueStatus(db, store.id, concepts[0]!.id, 'approved', 'film it')
  assert.equal(listQueue(db, store.id, { status: 'approved' }).length, 1)
  assert.equal(listReviews(db, store.id, {}).length, 0, 'approving a concept still does not make a review')

  const layout = rulesSuggestBlocks('offer', { id: product.id })
  assert.equal(layout[0]?.type, 'header')
  assert.ok(layout.some((block) => block.type === 'countdown'))
  assert.ok(layout.some((block) => block.type === 'buy-box'))
  assert.equal(layout.at(-1)?.type, 'footer')
  assert.ok(layout.every((block) => blockDefinition(block.type)), 'every suggested block exists')
  assert.equal(rulesSuggestBlocks('quiz', null).find((block) => block.type === 'quiz') !== undefined, true)
  const suggested = await suggestBlocks(null, { goal: 'advertorial', product, research: null, avatar: null })
  assert.equal(suggested.source, 'rules')
})

test('the GIF maker decodes PNGs and writes a looping GIF89a with one palette', () => {
  const { db, store, product } = shop()
  const png = pngBytes(24, 16, [200, 40, 40])
  assert.ok(isPng(png))
  const decoded = decodePng(png)
  assert.equal(decoded.width, 24)
  assert.equal(decoded.height, 16)
  assert.equal(decoded.data[0], 200)
  assert.equal(decoded.data[3], 255)
  const gif = encodeGif([decoded, solidFrame(30, 20, [20, 120, 220]), solidFrame(10, 10, [0, 200, 0])], { delay: 50, maxSide: 24 })
  assert.equal(gif.toString('ascii', 0, 6), 'GIF89a')
  const info = inspectGif(gif)
  assert.equal(info.frames, 3)
  assert.equal(info.width, 24)
  assert.equal(info.height, 16, 'later frames are cropped to the first frame\'s size')
  assert.ok(gif.includes(Buffer.from('NETSCAPE2.0')), 'it loops')
  assert.equal(gif[gif.length - 1], 0x3b, 'trailer')
  assert.equal(palette([decoded], 8).length, 24)

  const one = saveUpload({ name: 'a.png', type: 'image/png', data: png }, store.id)
  const two = saveUpload({ name: 'b.png', type: 'image/png', data: pngBytes(24, 16, [10, 10, 200]) }, store.id)
  const jpeg = saveUpload({ name: 'c.jpg', type: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) }, store.id)
  assert.throws(() => makeProductGif(db, store.id, { productId: product.id, sources: [jpeg.url] }), /PNG/)
  const item = makeProductGif(db, store.id, { productId: product.id, sources: [one.url, two.url, jpeg.url] })
  assert.equal(item.kind, 'gif')
  assert.equal(item.body.frames, 2)
  assert.deepEqual(item.body.sources, [one.url, two.url])
  assert.ok(!getProduct(db, store.id, product.id)!.media.some((media) => media.url === item.body.url), 'pending GIFs are not on the product')
  approveGif(db, store.id, item.id)
  assert.ok(getProduct(db, store.id, product.id)!.media.some((media) => media.url === item.body.url), 'approved GIFs join the media')
})

/* -------------------------------------------------------------- storefront */

test('the health audit finds what a screen reader and a slow phone would', () => {
  const bad = auditHtml('<html><head></head><body><img src="a.jpg"><button></button><input name="q"><h3>Deep</h3><a href="#"></a><iframe src="x"></iframe></body></html>', { path: '/bad', brand: { primary: '#ffff00', paper: '#ffffff', ink: '#cccccc' } })
  const checks = bad.issues.map((issue) => issue.check)
  for (const expected of ['lang', 'landmark', 'alt', 'h1', 'button-name', 'input-label', 'iframe-title', 'link-name', 'viewport', 'contrast']) assert.ok(checks.includes(expected), `finds ${expected}`)
  assert.ok(bad.score < 50)
  const good = auditHtml('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>:focus-visible{outline:2px solid}</style></head><body><a class="skip" href="#main">Skip</a><main id="main"><h1>Title</h1><h2>Sub</h2><img src="a.jpg" alt="A"><form><label for="e">Email</label><input id="e"></form><button>Buy</button></main></body></html>', { path: '/good', brand: { primary: '#7a4a2b', paper: '#faf7f3', ink: '#1c1a17' } })
  assert.deepEqual(good.issues, [])
  assert.equal(good.score, 100)
  assert.equal(contrast('#000000', '#ffffff'), 21)
  const { db, store } = shop()
  const report = auditStore(db, store)
  assert.ok(report.pages.length >= 2, 'home and the product page were rendered')
  for (const page of report.pages) {
    assert.ok(!page.issues.some((issue) => ['lang', 'landmark', 'alt', 'skip-link', 'viewport', 'focus', 'h1'].includes(issue.check)), `${page.path} has no basic accessibility failure: ${JSON.stringify(page.issues)}`)
    assert.ok(page.gzipBytes < 120_000, `${page.path} is light on the wire`)
    assert.ok(page.metrics.externalStyles <= 1, 'at most one stylesheet: the fonts')
  }
})

test('legal pages, the popup and the quiz block render from the store\'s own configuration', () => {
  const { db, store, product } = shop()
  const privacy = privacyHtml(db, store)
  assert.match(privacy, /cookie-free/)
  assert.match(privacy, /scrolled/, 'the behaviour tracking is disclosed')
  assert.ok(!privacy.includes('Stripe'), 'no Stripe until it is installed')
  saveLegal(db, store.id, { company: 'Night Shift Sleep LLC', email: 'hello@example.com', returnsDays: 45 })
  const terms = termsHtml(db, store)
  assert.match(terms, /Night Shift Sleep LLC/)
  assert.match(terms, /within 45 days/)
  assert.match(privacyHtml(db, store), /hello@example\.com/)

  assert.equal(popupHtml('/s/x', undefined), '')
  assert.equal(popupHtml('/s/x', { enabled: false, trigger: 'exit', after: 0, headline: '', text: '', code: '', buttonLabel: '', dismissDays: 7 }), '')
  const popup = popupHtml('/s/x', { enabled: true, trigger: 'delay', after: 5, headline: 'Wait', text: 'Ten percent off', code: 'TEN', buttonLabel: 'Go', dismissDays: 3 })
  assert.match(popup, /role="dialog"/)
  assert.match(popup, /data-trigger="delay"/)
  assert.match(popup, /TEN/)
  assert.match(popup, /action="\/s\/x\/subscribe"/)
  setTheme(db, store.id, { popup: { enabled: true, trigger: 'exit', after: 20, headline: 'Wait', text: '', code: '', buttonLabel: 'Go', dismissDays: 7 } })
  assert.equal(environment(db, store.id, 'draft').theme.popup?.enabled, true)
  assert.match(trackingScript('/s/x'), /\/_t/)

  const context: BlockContext = blockContextFor(db, store, '/s/x')
  const quiz = renderBlock({ id: 'q1', type: 'quiz', settings: { steps: 'When do you sleep?|Days|Nights\nWhat leaks?|Edges|Everything', productId: product.id } }, context)
  assert.equal((quiz.match(/class="qstep"/g) ?? []).length, 2)
  assert.match(quiz, /role="progressbar"/)
  assert.match(quiz, /Total Blackout Blind/, 'the result shows the product')
  assert.match(quiz, /data-quiz-cta/)
  const template = quizTemplate({ storeName: store.name, product: { id: product.id, title: product.title, image: '', subtitle: '' } })
  assert.equal(template.find((block) => block.type === 'quiz')?.settings.productId, product.id)
  const offer = offerTemplate({ storeName: store.name, product: { id: product.id, title: product.title, image: '', subtitle: '' }, research: null })
  assert.equal(offer[1]?.type, 'countdown', 'the saving with a timer is above the fold')
  assert.ok(offer.some((block) => block.type === 'buy-box'))
})

test('the blocks, templates, popup kinds and hygiene checks learned from the reference pages', () => {
  const { db, store, product } = shop()
  const context: BlockContext = blockContextFor(db, store, '/s/x')
  const shape = { id: product.id, title: product.title, image: '', subtitle: '' }

  // The buy box carries the reference skeleton: bullets, offer label, ship line, chips, the note, the guarantee.
  const buy = renderBlock({ id: 'b1', type: 'buy-box', settings: { productId: product.id, eyebrow: 'Sleep-specialist designed', bullets: 'Blocks every bit of light|even at noon\nInstalls in five minutes|no drilling', offerLabel: 'Limited time offer', chips: '🚚|Free shipping\n⛨|90-day guarantee', note: 'Results vary.', guaranteeHeadline: 'The empty-box promise', guaranteeText: 'Send it back, box or no box.' } }, context)
  assert.match(buy, /Sleep-specialist designed/)
  assert.match(buy, /<b>Blocks every bit of light<\/b>/)
  assert.match(buy, /offer-label/)
  assert.match(buy, /shipline/, 'the arrival line comes from the delivery estimate')
  assert.match(buy, /90-day guarantee/)
  assert.match(buy, /The empty-box promise/)
  assert.ok(!buy.includes('class="rating"'), 'no rating line without real reviews')

  // The sticky bar can carry the product and its price.
  const sticky = renderBlock({ id: 's1', type: 'sticky-cta', settings: { label: 'Buy now', href: '#offer', productId: product.id } }, context)
  assert.match(sticky, /Total Blackout Blind/)
  assert.match(sticky, /\$79\.00/)

  // Honesty: survey stats need a source; the rating line renders nothing without reviews.
  assert.match(renderBlock({ id: 'st', type: 'stats', settings: { items: '76%|felt better' } }, context), /need a source/)
  assert.match(renderBlock({ id: 'st2', type: 'stats', settings: { items: '76%|felt better', source: 'Survey of 500 customers, May 2026' } }, context), /76%/)
  assert.equal(renderBlock({ id: 'r', type: 'rating-line', settings: {} }, context), '')

  // The new blocks render their lines.
  assert.match(renderBlock({ id: 't', type: 'timeline', settings: { items: 'Week 1|Build the habit|Less light.' } }, context), /Build the habit/)
  assert.match(renderBlock({ id: 'c', type: 'cost-stack', settings: { items: 'Blackout curtains|$400', total: 'Total: $400' } }, context), /<tfoot>/)
  assert.match(renderBlock({ id: 'i', type: 'included', settings: { items: 'The blind||\nThe fitting kit|$19|' } }, context), /1 free gift included/)
  assert.match(renderBlock({ id: 'o', type: 'offer-stack', settings: { items: 'The blind|\nThe guide|$27', price: 'Today: $79' } }, context), /<s>\$27<\/s> <b>FREE<\/b>/)
  assert.match(renderBlock({ id: 'a', type: 'alternatives', settings: { items: 'curtains|They leak at the edges.' } }, context), /Instead of curtains:/)
  assert.match(renderBlock({ id: 'ci', type: 'citations', settings: { items: 'Darkness helps|Sleep 2019|Quote|https://example.org' } }, context), /Read the study/)
  for (const type of ['benefit-bullets', 'image-grid', 'steps', 'expert-quote', 'press-quotes', 'ingredients', 'audience']) assert.ok(blockDefinition(type), `${type} is in the catalog`)

  // The sales page is the Funnelish shape: buy box near the top, the argument below, the sticky button carrying the product.
  const sales = salesTemplate({ storeName: store.name, product: shape, research: null })
  const types = sales.map((block) => block.type)
  assert.ok(types.indexOf('buy-box') < types.indexOf('image-grid'), 'the buy box comes before the persuasion')
  for (const type of ['timeline', 'alternatives', 'offer-stack', 'cost-stack', 'audience', 'steps', 'sticky-cta', 'disclaimer']) assert.ok(types.includes(type), `sales page has ${type}`)
  assert.equal(sales.find((block) => block.type === 'sticky-cta')?.settings.productId, product.id)
  const home = homeTemplate({ storeName: store.name, product: shape, research: null })
  assert.ok(home.some((block) => block.type === 'featured-products') && home.some((block) => block.type === 'email-signup'))
  // A page from the sales template is found by the page plan as the sales page.
  setBuildMode(db, store.id, 'copy-funnel')
  createPage(db, store.id, { title: 'Sales', kind: 'landing', blocks: sales })
  assert.equal(pagePlan(db, store.id).pages.find((entry) => entry.key === 'sales')?.status, 'done')

  // The popup offers one thing: an email, the deal, or the quiz; it says how long the code is good for.
  const offerPopup = popupHtml('/s/x', { enabled: true, trigger: 'exit', after: 0, kind: 'offer', headline: 'Wait', text: '', code: 'TEN', buttonLabel: 'Claim it', href: '#offer', validDays: 7, dismissDays: 7 })
  assert.match(offerPopup, /Use code <strong>TEN<\/strong>/)
  assert.match(offerPopup, /data-popup-go/)
  assert.ok(!offerPopup.includes('<form'), 'the offer kind asks for nothing')
  assert.match(offerPopup, /Valid for 7 days\./)
  const quizPopup = popupHtml('/s/x', { enabled: true, trigger: 'delay', after: 5, kind: 'quiz', headline: 'Find yours', text: '', code: '', buttonLabel: '', dismissDays: 7 })
  assert.match(quizPopup, /href="\/pages\/quiz"/)
  assert.match(quizPopup, /Take the quiz/)
  const emailPopup = popupHtml('/s/x', { enabled: true, trigger: 'exit', after: 0, headline: 'Wait', text: '', code: 'TEN', buttonLabel: 'Go', validDays: 3, dismissDays: 7 })
  assert.match(emailPopup, /<form/)
  assert.match(emailPopup, /Valid for 3 days after sign-up\./)

  // The health report flags template residue: unconfirmed facts, dead links, placeholder images, counters at zero.
  const residue = auditHtml('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>:focus-visible{outline:2px solid}</style></head><body><a class="skip" href="#main">Skip</a><main id="main"><h1>T</h1><p>[confirm] Dr Name says so</p><a href="#">Terms</a><img src="/placeholder-image.png" alt="x"><p>0 people bought this today</p></main></body></html>', { path: '/p' })
  const found = residue.issues.map((issue) => issue.check)
  for (const expected of ['unconfirmed', 'dead-link', 'placeholder', 'zero-counter']) assert.ok(found.includes(expected), `finds ${expected}`)
})

test('behaviour events and funnel split tests are counted per session and judged on revenue per session', () => {
  const { db, store, product } = shop()
  const a = sessionFor(db, store.id, { ip: '1.1.1.1', userAgent: 'a' })
  const b = sessionFor(db, store.id, { ip: '2.2.2.2', userAgent: 'b' })
  track(db, store.id, a, 'view.page', { path: '/pages/offer' })
  track(db, store.id, b, 'view.page', { path: '/pages/offer' })
  track(db, store.id, a, 'scroll', { path: '/pages/offer', meta: { depth: 25 } })
  track(db, store.id, a, 'scroll', { path: '/pages/offer', meta: { depth: 50 } })
  track(db, store.id, a, 'scroll', { path: '/pages/offer', meta: { depth: 50 } })
  track(db, store.id, a, 'section.view', { path: '/pages/offer', meta: { blockId: 'b1', blockType: 'hero' } })
  track(db, store.id, a, 'cta.click', { path: '/pages/offer', meta: { label: 'Buy now' } })
  track(db, store.id, a, 'cart.add', { path: '/pages/offer' })
  track(db, store.id, a, 'checkout.complete', { path: '/checkout', amountCents: 7900 })
  track(db, store.id, b, 'popup.show', { path: '/pages/offer' })
  const report = behaviour(db, store.id, '7d')
  assert.equal(report.scroll[50], 1, 'a session counts once at each depth')
  assert.equal(report.scroll[25], 1)
  assert.equal(report.ctas[0]?.label, 'Buy now')
  assert.equal(report.popup.shows, 1)
  const offer = report.pages.find((page) => page.path === '/pages/offer')
  assert.equal(offer?.sessions, 2)
  assert.equal(offer?.readHalf, 1)
  assert.equal(offer?.purchases, 1)
  assert.equal(offer?.revenuePerSessionCents, 3950)
  assert.equal(revenuePerSession(db, store.id, [a, b]).perSessionCents, 3950)

  const one = upsertFunnel(db, store.id, { name: 'A: advertorial first', productId: product.id, testGroup: 'spring', weight: 50 })
  const two = upsertFunnel(db, store.id, { name: 'B: straight to offer', productId: product.id, testGroup: 'spring', weight: 50 })
  upsertFunnel(db, store.id, { name: 'Not in the test', productId: product.id, testGroup: 'spring', weight: 0 })
  const picks = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'].map((key) => pickFunnel(db, store.id, 'spring', key)?.id))
  assert.ok(picks.has(one.id) && picks.has(two.id), 'both funnels get traffic')
  assert.equal(pickFunnel(db, store.id, 'spring', 'same')?.id, pickFunnel(db, store.id, 'spring', 'same')?.id, 'a session is sticky')
  assert.equal(pickFunnel(db, store.id, 'nothing', 'x'), null)
  assert.equal(funnelEntry(db, store.id, one), `/products/${product.handle}`)
  track(db, store.id, a, 'funnel.enter', { path: '/go/spring', meta: { funnelId: one.id, group: 'spring' } })
  track(db, store.id, b, 'funnel.enter', { path: '/go/spring', meta: { funnelId: two.id, group: 'spring' } })
  const stats = funnelStats(db, store.id, 'spring')
  assert.equal(stats.find((row) => row.funnelId === one.id)?.revenuePerSessionCents, 7900)
  assert.equal(stats.find((row) => row.funnelId === two.id)?.revenuePerSessionCents, 0)
})

/* ------------------------------------------------------------------ tools */

test('the planner can drive the build, the market and the creative queue through tools', async () => {
  const { db, store, product } = shop()
  const actor = { type: 'user' as const, id: 'u' }
  const mode = await execute('set_build_mode', { mode: 'copy-funnel' }, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(mode.summary, /Copy a funnel/)
  const progress = await execute('build_progress', {}, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(progress.summary, /Next: Read the funnel/)
  const answers = await execute('answer_buyer_questions', { answers: { who: 'night shift nurses', instinct: 'unknown' } }, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(answers.summary, /1 answered, 1 marked unknown/)
  await runResearch(db, store.id, { prompt: store.prompt, model: null })
  const analysis = await execute('write_market_analysis', {}, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(analysis.summary, /No way to stand out found yet/)
  const briefs = await execute('queue_photo_briefs', { productId: product.id }, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(briefs.summary, /8 photo briefs/)
  const layout = await execute('suggest_page_layout', { goal: 'quiz', productId: product.id }, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(layout.summary, /blocks laid out|Created/)
  const queue = await execute('creative_queue', {}, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(queue.summary, /8 waiting/)
  const health = await execute('site_health', {}, { db, storeId: store.id, actor, page: 'ai' })
  assert.match(health.summary, /Site score/)
  assert.ok(listAvatars(db, store.id).length >= 0)
  assert.ok(S.obj({}))
})
