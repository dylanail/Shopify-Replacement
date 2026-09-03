import { json, now, type Db } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { logger } from '../lib/log.ts'
import { readBrief, type Brief } from './copy.ts'

const log = logger('research')

/**
 * Customer research.
 *
 * Before a single product page is written, the platform works out who buys
 * this, what stops them, what they compare it against and what they will pay.
 * Every page that follows reads this record: the benefits are answers to the
 * triggers, the FAQ is the objections, the comparison table is the competitor
 * angles, the price sits inside the anchor. Copy that is not grounded in this
 * is the difference between a store that looks generated and one that sells.
 */
export type Persona = {
  name: string
  who: string
  wants: string
  fears: string
  buysWhen: string
  share: number
}

export type Research = {
  category: string
  positioning: string
  audience: Persona[]
  triggers: string[]
  objections: Array<{ objection: string; answer: string }>
  competitors: Array<{ name: string; angle: string; priceBand: string; weakness: string }>
  priceAnchor: { lowCents: number; midCents: number; highCents: number; note: string }
  keywords: string[]
  proofPoints: string[]
  comparison: { us: string[]; them: string[]; rows: Array<{ label: string; us: string; them: string }> }
  /** What the source material (site or image) told us, if anything. */
  sourceNotes: string[]
}

export type ResearchRecord = Research & { id: string; source: 'rules' | 'model' | 'model+site'; brief: string; createdAt: string }

/* ------------------------------------------------------------ the knowledge */

type CategoryKnowledge = {
  personas: Array<Omit<Persona, 'share'> & { share: number }>
  triggers: string[]
  objections: Array<{ objection: string; answer: string }>
  competitors: Array<{ name: string; angle: string; priceBand: string; weakness: string }>
  anchor: [number, number, number]
  keywords: string[]
  rows: Array<{ label: string; us: string; them: string }>
}

const KNOWLEDGE: Record<string, CategoryKnowledge> = {
  'boxing gear': {
    personas: [
      { name: 'The serious amateur', who: 'Trains 3–5 times a week, spars, has been through two pairs of gym-brand gloves.', wants: 'Wrist support that survives a year and padding that protects a partner.', fears: 'Paying premium money for a logo.', buysWhen: 'The current pair goes soft at the wrist.', share: 0.45 },
      { name: 'The coach', who: 'Runs a gym or a small fight team and buys for others.', wants: 'Gear that holds up to daily shared use and can be repaired.', fears: 'A brand that vanishes when a lace or a stitch fails.', buysWhen: 'Kitting out new members or replacing club stock.', share: 0.2 },
      { name: 'The gift buyer', who: 'Partner or parent of someone who trains, does not box.', wants: 'Something obviously well made that will be used, not shelved.', fears: 'Choosing the wrong size or weight.', buysWhen: 'A birthday or a first fight.', share: 0.2 },
      { name: 'The collector', who: 'Loves the craft and the heritage as much as the sport.', wants: 'Materials, provenance, the story of the workshop.', fears: 'Mass-produced gear dressed up as artisan.', buysWhen: 'A limited run or a custom option appears.', share: 0.15 },
    ],
    triggers: ['The wrist closure failed on the last pair', 'A sparring partner complained about hard gloves', 'Starting to spar for the first time', 'Wanting one pair that lasts instead of three that do not'],
    objections: [
      { objection: 'They cost three times what my gym sells.', answer: 'They are built to outlast three of those pairs, and the wrist and lace can be repaired instead of replaced.' },
      { objection: 'Leather gloves need breaking in.', answer: 'About two weeks of bag work. We tell you that up front because the payoff is a glove shaped to your hand for years.' },
      { objection: 'I do not know which weight to buy.', answer: '14oz for bag and pads, 16oz for sparring at most gyms. If your coach says otherwise, follow your coach — and we exchange free.' },
      { objection: 'Fourteen days is a long wait.', answer: 'Every pair is built to order by one person. Stock builds ship in fourteen days; custom in twenty-one.' },
    ],
    competitors: [
      { name: 'Gym-brand basics', angle: 'Cheap, available today, everyone has them.', priceBand: '$40–80', weakness: 'Wrist support goes soft inside a year; not repairable.' },
      { name: 'Big-name pro gear', angle: 'Seen on fighters, heavy marketing.', priceBand: '$150–250', weakness: 'Much of the price is the logo; often factory-made.' },
      { name: 'Custom heritage makers', angle: 'Hand-made, long waits, mostly word of mouth.', priceBand: '$300–500', weakness: 'Hard to buy from; no returns; months of lead time.' },
    ],
    anchor: [8000, 22000, 45000],
    keywords: ['leather boxing gloves', 'lace up boxing gloves', 'sparring gloves 16oz', 'handmade boxing gloves', 'best boxing gloves for sparring', 'boxing gloves mexican style'],
    rows: [
      { label: 'Leather', us: 'Full-grain, vegetable-tanned', them: 'Split leather or synthetic' },
      { label: 'Wrist', us: 'Lace-up, repairable', them: 'Velcro, wears out' },
      { label: 'Padding', us: 'Layered horsehair and foam', them: 'Moulded foam' },
      { label: 'Made', us: 'One person, built to order', them: 'Factory line' },
      { label: 'Repairs', us: 'In-house, for life', them: 'None' },
    ],
  },
  skincare: {
    personas: [
      { name: 'The ingredient reader', who: 'Knows what niacinamide does and checks the percentage.', wants: 'Clinical actives at honest concentrations without fragrance.', fears: 'Marketing dressed as science.', buysWhen: 'A routine stops working or a new active gets attention.', share: 0.4 },
      { name: 'The minimalist', who: 'Wants three products that work and nothing else.', wants: 'A routine that takes two minutes.', fears: 'Ten-step regimes and drawers of half-used jars.', buysWhen: 'Simplifying after an overwhelming phase.', share: 0.3 },
      { name: 'The sensitive-skin buyer', who: 'Has reacted badly before and reads reviews for that word.', wants: 'Proof it will not sting.', fears: 'Another wasted bottle and a flare-up.', buysWhen: 'Someone with the same skin recommends it.', share: 0.3 },
    ],
    triggers: ['A product caused a reaction', 'Dry winter skin', 'A routine has too many steps', 'A dermatologist mentioned an ingredient'],
    objections: [
      { objection: 'How is this different from the pharmacy version?', answer: 'Same actives, at the concentrations the studies used, without fragrance or filler. The label says the percentages.' },
      { objection: 'Will it irritate sensitive skin?', answer: 'It is fragrance-free and patch-tested; start every other night. If it does not suit you, send it back — even opened.' },
      { objection: 'It is expensive for 30ml.', answer: 'A pea-sized amount twice a day lasts about ten weeks. Per week it costs less than a coffee.' },
    ],
    competitors: [
      { name: 'Pharmacy actives', angle: 'Cheap, clinical, no frills.', priceBand: '$8–20', weakness: 'Inconsistent formulations; harsh bases.' },
      { name: 'Prestige counters', angle: 'Luxury texture, beautiful packaging.', priceBand: '$80–200', weakness: 'You pay for the jar; actives are vague.' },
      { name: 'Influencer brands', angle: 'Trend-led, fast launches.', priceBand: '$30–60', weakness: 'Fragrance-heavy; little published testing.' },
    ],
    anchor: [2500, 6000, 12000],
    keywords: ['barrier repair serum', 'fragrance free moisturiser', 'niacinamide serum', 'sensitive skin routine', 'minimal skincare routine'],
    rows: [
      { label: 'Actives', us: 'Named, with percentages', them: '"Proprietary complex"' },
      { label: 'Fragrance', us: 'None', them: 'Usually added' },
      { label: 'Testing', us: 'Patch-tested, published', them: 'Rarely stated' },
      { label: 'Routine', us: 'Three steps', them: 'Seven to ten' },
    ],
  },
  coffee: {
    personas: [
      { name: 'The home brewer', who: 'Owns a grinder and a scale; has opinions about water.', wants: 'Fresh roast dates and origin detail.', fears: 'Stale beans from a warehouse.', buysWhen: 'Running out, every two to three weeks.', share: 0.5 },
      { name: 'The office buyer', who: 'Orders for a team; wants it simple and reliable.', wants: 'Consistent house blend on a subscription.', fears: 'Complaints from colleagues.', buysWhen: 'The office runs dry.', share: 0.25 },
      { name: 'The gifter', who: 'Buying for someone who is fussy about coffee.', wants: 'Something that looks considered.', fears: 'Getting it wrong.', buysWhen: 'Holidays.', share: 0.25 },
    ],
    triggers: ['Bought a grinder', 'Stale supermarket beans', 'Wanting a subscription that just arrives', 'Curiosity about a specific origin'],
    objections: [
      { objection: 'Why pay twice the supermarket price?', answer: 'Roast date on every bag, shipped within days of roasting. Supermarket beans are months old before you open them.' },
      { objection: 'Will it suit my machine?', answer: 'Choose the grind for your brewer at checkout, or whole bean if you grind at home.' },
      { objection: 'I do not want to be locked into a subscription.', answer: 'Pause, skip or cancel from one page. No calls, no forms.' },
    ],
    competitors: [
      { name: 'Supermarket', angle: 'Cheap and everywhere.', priceBand: '$6–12', weakness: 'No roast date; stale.' },
      { name: 'Big speciality roasters', angle: 'Known names, wide range.', priceBand: '$16–24', weakness: 'Shipping delays; blends change.' },
      { name: 'Local micro-roasters', angle: 'Very fresh, very small.', priceBand: '$14–22', weakness: 'Hard to buy online; inconsistent.' },
    ],
    anchor: [1400, 2200, 3600],
    keywords: ['single origin coffee', 'fresh roasted coffee beans', 'coffee subscription', 'espresso beans online', 'filter coffee beans'],
    rows: [
      { label: 'Roast date', us: 'On every bag', them: 'Best-before only' },
      { label: 'Shipped', us: 'Within 3 days of roasting', them: 'Weeks to months' },
      { label: 'Origin', us: 'Farm and lot named', them: '"Blend"' },
      { label: 'Subscription', us: 'Pause or cancel in one click', them: 'Call to cancel' },
    ],
  },
}

const GENERIC: CategoryKnowledge = {
  personas: [
    { name: 'The considered buyer', who: 'Researches before buying and reads the reviews that mention flaws.', wants: 'Something that will not need replacing.', fears: 'Overpaying for marketing.', buysWhen: 'The cheap version fails.', share: 0.4 },
    { name: 'The gift buyer', who: 'Buying for someone with taste they do not share.', wants: 'An obvious signal of quality.', fears: 'Choosing wrong.', buysWhen: 'An occasion is close.', share: 0.3 },
    { name: 'The enthusiast', who: 'Cares about the craft and the materials.', wants: 'Provenance and detail.', fears: 'Mass-produced goods dressed as artisan.', buysWhen: 'A limited run or new piece appears.', share: 0.3 },
  ],
  triggers: ['The last one broke', 'An occasion', 'A recommendation from someone trusted', 'Wanting to buy once and stop thinking about it'],
  objections: [
    { objection: 'It costs more than the alternatives.', answer: 'It is built to outlast them and to be repaired rather than replaced.' },
    { objection: 'How do I know it is good?', answer: 'Every material is named, the maker is named, and returns are free for thirty days.' },
    { objection: 'How long will it take?', answer: 'Built to order and shipped in fourteen days; the date is shown before you pay.' },
  ],
  competitors: [
    { name: 'Marketplace listings', angle: 'Cheapest option, next-day delivery.', priceBand: 'Low', weakness: 'Unknown maker; no support.' },
    { name: 'Established brand', angle: 'Recognised name.', priceBand: 'Mid to high', weakness: 'Price carries the marketing.' },
    { name: 'Artisan makers', angle: 'Hand-made, small.', priceBand: 'High', weakness: 'Hard to buy from; long waits.' },
  ],
  anchor: [4000, 12000, 30000],
  keywords: [],
  rows: [
    { label: 'Materials', us: 'Named, chosen one at a time', them: 'Unspecified' },
    { label: 'Made', us: 'Small runs, by name', them: 'Factory line' },
    { label: 'Repairs', us: 'In-house', them: 'None' },
    { label: 'Returns', us: '30 days, free', them: 'Varies' },
  ],
}

/* --------------------------------------------------------------- the rules */

export function rulesResearch(brief: Brief, sourceNotes: string[] = []): Research {
  const knowledge = KNOWLEDGE[brief.category] ?? GENERIC
  const keywords = knowledge.keywords.length
    ? knowledge.keywords
    : [`handmade ${brief.category}`, `best ${brief.category}`, `${brief.category} ${brief.place.toLowerCase()}`, `${brief.material} ${brief.category}`, `buy ${brief.category} online`]
  const [low, mid, high] = knowledge.anchor
  return {
    category: brief.category,
    positioning: `${capitalize(brief.category)} for ${brief.audience}, made from ${brief.material} in ${brief.place} — priced above the mass market and below the bespoke makers, and easier to buy from than either.`,
    audience: knowledge.personas.map((persona) => ({ ...persona })),
    triggers: knowledge.triggers,
    objections: knowledge.objections,
    competitors: knowledge.competitors,
    priceAnchor: {
      lowCents: low,
      midCents: mid,
      highCents: high,
      note: `The mass market sits around ${(low / 100).toFixed(0)}, the bespoke makers around ${(high / 100).toFixed(0)}. Sitting near ${(mid / 100).toFixed(0)} reads as premium without needing a waiting list to justify it.`,
    },
    keywords,
    proofPoints: [
      `${capitalize(brief.material)}, named on the page`,
      `Made in ${brief.place} in small runs`,
      'Repaired in-house for the life of the product',
      'Free returns for thirty days',
      'Built to order; ship date shown before checkout',
    ],
    comparison: {
      us: knowledge.rows.map((row) => row.us),
      them: knowledge.rows.map((row) => row.them),
      rows: knowledge.rows,
    },
    sourceNotes,
  }
}

/* --------------------------------------------------------------- the model */

async function modelResearch(brief: Brief, sourceText: string, sourceNotes: string[]): Promise<Research | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const baseline = rulesResearch(brief, sourceNotes)
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AMBORAS_MODEL ?? 'claude-sonnet-4-5',
        max_tokens: 4000,
        system:
          'You are a DTC growth strategist doing customer research for a new store. Reply with one JSON object and nothing else, matching the schema of the example exactly. Be specific to the brief; never invent statistics. Prices are integers in minor units.',
        messages: [
          {
            role: 'user',
            content: `Brief: ${brief.prompt}\n\nCategory: ${brief.category}\n\n${sourceText ? `Source material from the merchant's existing site or image:\n${sourceText.slice(0, 6000)}\n\n` : ''}Example of the exact shape to return:\n${JSON.stringify(baseline)}`,
          },
        ],
      }),
    })
    if (!response.ok) {
      log.warn(`model research returned ${response.status}; using rules`)
      return null
    }
    const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = payload.content?.find((block) => block.type === 'text')?.text ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<Research>
    // The model fills in; the rules guarantee every field exists.
    return { ...baseline, ...parsed, sourceNotes: [...sourceNotes, ...(parsed.sourceNotes ?? [])] }
  } catch (error) {
    log.warn(`model research unreachable: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/* --------------------------------------------------------------- the source */

/**
 * A pasted URL is read for what it says about the brand: title, description,
 * headings and the first few hundred words. That text goes to the model when
 * there is one, and its headings become source notes either way.
 */
export async function readSite(url: string): Promise<{ text: string; notes: string[] }> {
  const notes: string[] = []
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'AmborasResearch/1.0' } })
    clearTimeout(timer)
    if (!response.ok) return { text: '', notes: [`Could not read ${url} (${response.status})`] }
    const html = (await response.text()).slice(0, 400_000)
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim()
    const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})/i.exec(html)?.[1]?.trim()
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]{1,120}?)<\/h[12]>/gi)].map((match) => strip(match[1] ?? '')).filter(Boolean).slice(0, 8)
    const body = strip(html.replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, '')).slice(0, 4000)
    if (title) notes.push(`Existing site title: ${title}`)
    if (description) notes.push(`Existing site description: ${description}`)
    for (const heading of headings.slice(0, 4)) notes.push(`Heading on the existing site: ${heading}`)
    return { text: [title, description, ...headings, body].filter(Boolean).join('\n'), notes }
  } catch {
    return { text: '', notes: [`Could not reach ${url}`] }
  }
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

/* --------------------------------------------------------------- the record */

export async function runResearch(
  db: Db,
  storeId: string,
  input: { prompt: string; siteUrl?: string; imageNote?: string },
): Promise<ResearchRecord> {
  const brief = readBrief(input.prompt)
  const notes: string[] = []
  let sourceText = ''
  if (input.siteUrl) {
    const site = await readSite(input.siteUrl)
    sourceText = site.text
    notes.push(...site.notes)
  }
  if (input.imageNote) notes.push(input.imageNote)

  const modelled = await modelResearch(brief, sourceText, notes)
  const research = modelled ?? rulesResearch(brief, notes)
  const source: ResearchRecord['source'] = modelled ? (input.siteUrl ? 'model+site' : 'model') : 'rules'
  const recordId = id('res')
  db.insert('store_research', { id: recordId, store_id: storeId, source, brief: input.prompt, body: research, created_at: now() })
  return { ...research, id: recordId, source, brief: input.prompt, createdAt: now() }
}

export function latestResearch(db: Db, storeId: string): ResearchRecord | null {
  const row = db.one<{ id: string; source: ResearchRecord['source']; brief: string; body: string; created_at: string }>(
    'SELECT * FROM store_research WHERE store_id = ? ORDER BY created_at DESC LIMIT 1',
    storeId,
  )
  if (!row) return null
  return { ...json<Research>(row.body, rulesResearch(readBrief(row.brief))), id: row.id, source: row.source, brief: row.brief, createdAt: row.created_at }
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1)
}
