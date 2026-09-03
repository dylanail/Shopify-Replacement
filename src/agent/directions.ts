import type { Product, ProductContent } from '../domain/types.ts'
import type { Research } from './research.ts'
import type { Brief } from './copy.ts'
import { newBlock } from '../pages/store.ts'
import type { BlockInstance } from '../pages/blocks.ts'

/**
 * Formats and direction.
 *
 * A format is a proven shape — the listicle, the "I tried it for thirty days"
 * story, problem-agitate-solve — and a direction is what the merchant typed:
 * "make it urgent", "premium, no hype", "for gift buyers". Both are read into
 * a small set of decisions (tone words, which sections lead, what the
 * headline pattern is), and the same decisions drive the rules writer and the
 * model prompt, so switching a key on does not change what a format *means*.
 */
export type Tone = 'plain' | 'urgent' | 'premium' | 'warm' | 'clinical' | 'playful' | 'blunt'

export type Direction = {
  raw: string
  tone: Tone
  audience: string
  angle: string
  /** Words the merchant used that should appear in the copy. */
  mustSay: string[]
  urgency: boolean
  priceLed: boolean
}

export type Format = {
  id: string
  kind: 'advertorial' | 'pdp'
  name: string
  description: string
  headline: (input: { product: string; store: string; reasons: number; audience: string }) => string
}

export const ADVERTORIAL_FORMATS: Format[] = [
  { id: 'listicle', kind: 'advertorial', name: 'Listicle', description: '"N reasons people are switching" — the workhorse.', headline: ({ product, reasons }) => `${reasons} reasons people are switching to ${product}` },
  { id: 'story', kind: 'advertorial', name: 'First-person story', description: '"I tried it for 30 days" — one person, one arc, one verdict.', headline: ({ product }) => `I used ${product} every day for a month. Here is what happened.` },
  { id: 'pas', kind: 'advertorial', name: 'Problem · agitate · solve', description: 'Name the problem, make it hurt, present the fix.', headline: ({ product }) => `If your gear keeps failing you, this is why — and what ${product} does differently` },
  { id: 'expert', kind: 'advertorial', name: 'Expert take', description: 'A coach, a maker, a clinician explains the decision.', headline: ({ product, audience }) => `Why a coach who has seen a thousand pairs recommends ${product} to ${audience}` },
  { id: 'roundup', kind: 'advertorial', name: 'We tested five', description: 'A comparison roundup where the product wins on the criteria that matter.', headline: ({ product }) => `We tested five of the best-selling options. ${product} was the one we kept.` },
  { id: 'mistakes', kind: 'advertorial', name: 'Mistakes to avoid', description: '"N mistakes people make" — teaches, then sells the fix.', headline: ({ reasons }) => `${reasons} mistakes almost everyone makes when buying this — and how to avoid them` },
]

export const PDP_FORMATS: Format[] = [
  { id: 'benefit', kind: 'pdp', name: 'Benefit-led', description: 'What it does for you, first.', headline: ({ product }) => product },
  { id: 'story', kind: 'pdp', name: 'Story-led', description: 'Why it exists, who made it, then the buy box.', headline: ({ product, store }) => `${product}, the piece ${store} started with` },
  { id: 'ugc', kind: 'pdp', name: 'UGC-led', description: 'Reviews and photos above the fold; the product speaks second.', headline: ({ product }) => `What people say about ${product}` },
  { id: 'comparison', kind: 'pdp', name: 'Comparison-led', description: 'Against the cheap version, row by row, before the price.', headline: ({ product }) => `${product}, compared to what you were going to buy` },
  { id: 'premium', kind: 'pdp', name: 'Premium minimal', description: 'Big image, few words, one button.', headline: ({ product }) => product },
  { id: 'offer', kind: 'pdp', name: 'Offer-led', description: 'The bundle tiers are the page.', headline: ({ product }) => `${product}: buy two, save more` },
  { id: 'urgency', kind: 'pdp', name: 'Urgency-led', description: 'Countdown, stock, recent buyers — for cold paid traffic.', headline: ({ product }) => `${product} — this batch is nearly gone` },
]

export function formatById(id: string, kind: 'advertorial' | 'pdp'): Format {
  const list = kind === 'advertorial' ? ADVERTORIAL_FORMATS : PDP_FORMATS
  return list.find((format) => format.id === id) ?? (list[0] as Format)
}

const TONE_WORDS: Array<[Tone, string[]]> = [
  ['urgent', ['urgent', 'urgency', 'scarcity', 'fomo', 'hurry', 'limited', 'countdown', 'now', 'fast']],
  ['premium', ['premium', 'luxury', 'high-end', 'elevated', 'no hype', 'understated', 'quiet', 'minimal', 'classy']],
  ['clinical', ['clinical', 'scientific', 'data', 'evidence', 'facts', 'technical', 'spec', 'precise']],
  ['warm', ['warm', 'friendly', 'gift', 'family', 'cozy', 'kind', 'gentle', 'story']],
  ['playful', ['playful', 'fun', 'cheeky', 'bold', 'loud', 'punchy', 'witty']],
  ['blunt', ['blunt', 'direct', 'no fluff', 'straight', 'honest', 'plain']],
]

export function readDirection(raw: string): Direction {
  const text = (raw ?? '').toLowerCase()
  const tone = TONE_WORDS.find(([, words]) => words.some((word) => text.includes(word)))?.[0] ?? 'plain'
  const audience = /\b(?:for|aimed at|targeting)\s+([a-z][a-z\s-]{2,48}?)(?:[.,;]|$|\s+(?:focus|lead|emphasi|say|angle|about)\b)/.exec(text)?.[1]?.trim() ?? ''
  const angle = /\b(?:angle|focus on|lead with|emphasi[sz]e|about)\s+([a-z][a-z\s-]{2,60}?)(?:[.,;]|$)/.exec(text)?.[1]?.trim() ?? ''
  const mustSay = [...raw.matchAll(/"([^"]{2,60})"/g)].map((match) => match[1] as string)
  return {
    raw: raw ?? '',
    tone,
    audience,
    angle,
    mustSay,
    urgency: tone === 'urgent' || /\b(sale|deadline|ends|limited)\b/.test(text),
    priceLed: /\b(price|cheap|deal|discount|save|bundle|offer)\b/.test(text),
  }
}

/* --------------------------------------------------------------- writers */

const TONE_VERBS: Record<Tone, { cta: string; opener: string; closer: string }> = {
  plain: { cta: 'Get yours', opener: 'Here is what it is and what it is not.', closer: 'Built to order. Free returns for thirty days.' },
  urgent: { cta: 'Claim yours before this batch goes', opener: 'This run is small and it does not get restocked on a schedule.', closer: 'When the counter hits zero the price goes back up. That is not a trick; it is how small batches work.' },
  premium: { cta: 'Order', opener: 'There is not much to say. The materials say it.', closer: 'Made to order. Delivered in fourteen days. Repaired for life.' },
  warm: { cta: 'Choose yours', opener: 'Whoever you are buying this for, you already know what they will say when they open it.', closer: 'It arrives boxed, with a card from the workshop if you want one.' },
  clinical: { cta: 'Order', opener: 'The specification is on this page. Every claim on it can be checked.', closer: 'Tolerances, materials and lead times are stated because they are measured.' },
  playful: { cta: 'Yes, obviously', opener: 'You have read enough product pages. This one is short.', closer: 'Thirty days to change your mind. You will not.' },
  blunt: { cta: 'Buy it', opener: 'No story. Here is the product and here is the price.', closer: 'If it fails, we fix it. If you hate it, send it back.' },
}

type WriterInput = {
  product: Product
  store: { name: string; prompt: string }
  research: Research
  brief: Brief
  direction: Direction
  format: Format
}

export function reasonsFor(input: WriterInput, count: number): Array<{ headline: string; text: string }> {
  const { research, direction, format, product } = input
  const base = research.triggers.slice(0, count)
  const objections = research.objections
  const name = product.title
  return base.map((trigger, index) => {
    const objection = objections[index % Math.max(1, objections.length)]
    switch (format.id) {
      case 'mistakes':
        return { headline: `Mistake ${index + 1}: ${trigger.toLowerCase().replace(/^the /, 'buying because the ')}`, text: objection ? `${objection.objection} ${objection.answer}` : trigger }
      case 'story':
        return { headline: `Week ${index + 1}: ${trigger}`, text: `${objection?.answer ?? ''} By the end of the week I had stopped noticing the ${name.toLowerCase()} at all, which is the point.` }
      case 'pas':
        return { headline: index === 0 ? `The problem: ${trigger.toLowerCase()}` : index === count - 1 ? `What ${name} does instead` : `Why the usual fix fails`, text: objection ? `${objection.answer}` : trigger }
      case 'expert':
        return { headline: trigger, text: `Every coach has seen this. ${objection?.answer ?? ''}` }
      case 'roundup':
        return { headline: `Criterion ${index + 1}: ${trigger.toLowerCase()}`, text: `Three of the five failed here. ${objection?.answer ?? ''}` }
      default:
        return { headline: trigger, text: objection ? objection.answer : `${direction.tone === 'blunt' ? '' : 'Plainly: '}${trigger.toLowerCase()} is the moment ${name} was built for.` }
    }
  })
}

/** An advertorial in the chosen format and tone. */
export function writeAdvertorial(input: WriterInput): BlockInstance[] {
  const { product, store, research, direction, format } = input
  const reasons = reasonsFor(input, format.id === 'story' ? 4 : 5)
  const tone = TONE_VERBS[direction.tone]
  const audience = direction.audience || research.audience[0]?.name.toLowerCase().replace(/^the /, '') || 'people who train'
  const headline = direction.mustSay[0] ?? format.headline({ product: product.title, store: store.name, reasons: reasons.length, audience })
  const blocks: BlockInstance[] = [
    newBlock('publication-bar', { name: `${store.name} Journal`, section: format.id === 'expert' ? 'Opinion' : format.id === 'roundup' ? 'Tested' : 'Reviews' }),
    newBlock('headline', { level: 'h1', eyebrow: format.id === 'story' ? 'First person' : format.id === 'roundup' ? 'We tested them' : 'Editor’s pick', text: headline, sub: direction.angle ? `On ${direction.angle}.` : product.subtitle, width: 'narrow', padding: 'small' }),
    newBlock('byline', { author: format.id === 'expert' ? 'By a coach who has seen a thousand pairs' : format.id === 'story' ? 'By someone who bought it with their own money' : 'By the editorial team', readTime: `${3 + reasons.length} min read` }),
  ]
  if (product.heroImage) blocks.push(newBlock('image', { src: product.heroImage, alt: product.title, width: 'narrow', padding: 'none' }))
  blocks.push(newBlock('rich-text', { text: `${tone.opener}\n\n${direction.mustSay.slice(1).join(' ')}`.trim() }))
  if (direction.urgency) blocks.push(newBlock('progress-bar', { label: '73% of this batch claimed', percent: 73 }))
  reasons.forEach((reason, index) => blocks.push(newBlock('numbered-reason', { number: index + 1, headline: reason.headline, text: reason.text })))
  if (format.id === 'roundup') blocks.push(newBlock('comparison', { themLabel: research.competitors[0]?.name ?? 'The others', rows: research.comparison.rows.map((row) => `${row.label}|${row.us}|${row.them}`).join('\n') }))
  blocks.push(newBlock('pull-quote', { quote: format.id === 'story' ? 'I stopped thinking about it. That is the whole point.' : `${research.proofPoints[0] ?? 'Named materials, one maker.'}`, who: format.id === 'story' ? '' : 'From the workshop' }))
  blocks.push(newBlock('review-wall', { headline: 'From people who bought it', count: 6, productId: product.id }))
  if (direction.urgency) blocks.push(newBlock('countdown', { text: 'Offer ends in', minutes: 15 }))
  blocks.push(newBlock(direction.priceLed ? 'bundle-offer' : 'buy-box', { productId: product.id, buyNow: true, background: 'raise', headline: direction.priceLed ? 'Buy more, pay less' : undefined }))
  blocks.push(newBlock('faq', { headline: 'Before you decide', items: research.objections.map((entry) => `${entry.objection}|${entry.answer}`).join('\n') }))
  blocks.push(newBlock('guarantee', {}))
  blocks.push(newBlock('rich-text', { text: tone.closer, width: 'narrow' }))
  blocks.push(newBlock('comments', {}))
  blocks.push(newBlock('sticky-cta', { label: `${tone.cta} — ${product.title}`, href: '#offer' }))
  blocks.push(newBlock('disclaimer', {}))
  blocks.push(newBlock('footer', {}))
  return blocks
}

/** A product page version in the chosen format: the buy box plus the sections that format leads with. */
export function writePdp(input: WriterInput): BlockInstance[] {
  const { product, research, direction, format } = input
  const tone = TONE_VERBS[direction.tone]
  const headline = direction.mustSay[0] ?? format.headline({ product: product.title, store: input.store.name, reasons: 3, audience: direction.audience || 'you' })
  const content = product.content
  const benefits = newBlock('multicolumn', { headline: 'Why this one', columns: (content.benefits ?? []).slice(0, 4).map((benefit) => `✦|${benefit.title}|${benefit.body.split('. ')[0]}.`).join('\n') })
  const comparison = newBlock('comparison', { themLabel: content.comparison?.themLabel ?? 'The usual', rows: (content.comparison?.rows ?? research.comparison.rows).map((row) => `${row.label}|${row.us}|${row.them}`).join('\n') })
  const reviews = newBlock('review-wall', { headline: 'What people say', count: 6, productId: product.id })
  const faq = newBlock('faq', { headline: 'Questions', items: (content.faq ?? []).map((entry) => `${entry.q}|${entry.a}`).join('\n') })
  const buy = newBlock(direction.priceLed || format.id === 'offer' ? 'bundle-offer' : 'buy-box', { productId: product.id, buyNow: true, ...(format.id === 'premium' ? { showImage: true } : {}) })
  const hero = newBlock('hero', { headline, sub: product.subtitle, image: product.heroImage, cta: tone.cta, ctaHref: '#offer', height: format.id === 'premium' ? 'large' : 'medium', overlay: format.id === 'premium' ? 25 : 45 })
  const trust = newBlock('trust-badges', {})
  const guarantee = newBlock('guarantee', {})
  const urgency = [newBlock('countdown', { text: 'This price ends in', minutes: 20 }), newBlock('progress-bar', { label: 'Only a few of this batch left', percent: 82 })]
  const order: Record<string, BlockInstance[]> = {
    benefit: [newBlock('header', {}), hero, benefits, buy, reviews, comparison, faq, guarantee, trust],
    story: [newBlock('header', {}), newBlock('headline', { level: 'h1', eyebrow: 'Why it exists', text: headline, sub: research.positioning, width: 'narrow' }), newBlock('image-with-text', { image: product.heroImage, headline: 'Built where the load goes', text: product.description.split('. ').slice(0, 3).join('. ') + '.', cta: tone.cta, ctaHref: '#offer' }), buy, reviews, faq, guarantee],
    ugc: [newBlock('header', {}), newBlock('headline', { level: 'h1', text: headline, align: 'center' }), reviews, newBlock('carousel', { images: [product.heroImage, ...product.media.map((entry) => entry.url)].filter(Boolean).join('\n') }), buy, benefits, faq, guarantee],
    comparison: [newBlock('header', {}), newBlock('headline', { level: 'h1', text: headline, sub: 'Row by row.', width: 'narrow' }), comparison, benefits, buy, reviews, faq, guarantee],
    premium: [newBlock('header', {}), hero, newBlock('rich-text', { text: tone.opener, align: 'center', width: 'narrow' }), buy, newBlock('image', { src: product.media[1]?.url ?? product.heroImage, width: 'wide' }), guarantee],
    offer: [newBlock('header', {}), newBlock('headline', { level: 'h1', text: headline, sub: 'The more you take, the less each one costs.', align: 'center' }), buy, benefits, reviews, faq, guarantee, trust],
    urgency: [newBlock('announcement-bar', { text: 'THIS PRICE ENDS TONIGHT · FREE SHIPPING ON 2+' }), newBlock('header', {}), hero, ...urgency, buy, reviews, benefits, faq, guarantee, newBlock('sticky-cta', { label: tone.cta, href: '#offer' })],
  }
  const blocks = order[format.id] ?? order.benefit!
  if (direction.urgency && format.id !== 'urgency') blocks.splice(2, 0, ...urgency)
  blocks.push(newBlock('footer', {}))
  return blocks
}

/** Rewrites the product's own page content (benefits, FAQ order, guarantee copy) in a tone. */
export function redirectContent(content: ProductContent, direction: Direction): ProductContent {
  const tone = TONE_VERBS[direction.tone]
  return {
    ...content,
    benefits: content.benefits?.map((benefit, index) => (index === 0 && direction.angle ? { ...benefit, title: `${benefit.title} — ${direction.angle}` } : benefit)),
    guarantee: direction.tone === 'blunt' ? 'Thirty days. Send it back, get your money.' : content.guarantee,
    shipping: direction.urgency ? `${content.shipping ?? ''} Order in the next few hours to make this week's batch.`.trim() : content.shipping,
    trust: direction.mustSay.length ? [...direction.mustSay.slice(0, 2), ...(content.trust ?? [])].slice(0, 3) : content.trust,
    audience: direction.audience ? `Made for ${direction.audience}` : content.audience,
    faq: content.faq ? [...content.faq, ...(direction.urgency ? [{ q: 'Why the countdown?', a: tone.closer }] : [])] : content.faq,
  }
}

/* ---------------------------------------------------------------- model */

/**
 * With a key, the model rewrites the words inside the blocks the format laid
 * out — never the layout. It gets the format, the direction verbatim, the
 * research and the product, and returns replacement settings keyed by block
 * id. Anything it does not return keeps the rules text.
 */
export async function modelRewrite(blocks: BlockInstance[], input: WriterInput): Promise<BlockInstance[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return blocks
  const textual = blocks
    .filter((block) => ['headline', 'rich-text', 'numbered-reason', 'pull-quote', 'hero', 'image-with-text', 'multicolumn', 'faq', 'offer-box'].includes(block.type))
    .map((block) => ({ id: block.id, type: block.type, settings: block.settings }))
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AMBORAS_MODEL ?? 'claude-sonnet-4-5',
        max_tokens: 6000,
        system: 'You write direct-response ecommerce pages. Rewrite ONLY the text values in the blocks you are given, in the format and direction described. Keep every key, keep the "label|value" line formats, never invent statistics or reviews. Reply with a JSON array of {id, settings} and nothing else.',
        messages: [{ role: 'user', content: `Format: ${input.format.name} — ${input.format.description}\nDirection from the merchant: ${input.direction.raw || '(none)'}\nProduct: ${input.product.title}. ${input.product.subtitle}. ${input.product.description.slice(0, 800)}\nResearch: ${JSON.stringify({ positioning: input.research.positioning, triggers: input.research.triggers, objections: input.research.objections, audience: input.research.audience.map((persona) => persona.name) })}\n\nBlocks:\n${JSON.stringify(textual)}` }],
      }),
    })
    if (!response.ok) return blocks
    const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = payload.content?.find((block) => block.type === 'text')?.text ?? ''
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1) return blocks
    const replacements = JSON.parse(text.slice(start, end + 1)) as Array<{ id: string; settings: Record<string, unknown> }>
    const byId = new Map(replacements.map((entry) => [entry.id, entry.settings]))
    return blocks.map((block) => (byId.has(block.id) ? { ...block, settings: { ...block.settings, ...byId.get(block.id) } } : block))
  } catch {
    return blocks
  }
}
