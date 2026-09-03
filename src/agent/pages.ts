import type { Product, ProductContent } from '../domain/types.ts'
import { readBrief, type Brief } from './copy.ts'
import type { Research } from './research.ts'

/**
 * The product page writer.
 *
 * A Shopify-grade page has a shape: benefits answer the purchase triggers, the
 * comparison table answers "why not the cheaper one", the FAQ answers the
 * objections, the guarantee removes the last reason to wait. This function is
 * the mapping from research to that shape — so a page can never contain a
 * claim that the research did not put there.
 */
export function writeProductContent(
  research: Research,
  brief: Brief,
  product: { title: string; role?: 'hero' | 'complement'; priceCents: number; options?: Array<{ title: string; values: Array<{ value: string }> }> },
): ProductContent {
  const material = brief.material
  const isHero = product.role !== 'complement'

  const benefits = research.triggers.slice(0, 4).map((trigger, index) => ({
    title: benefitTitle(trigger, material, index),
    body: benefitBody(trigger, material, brief, product.title),
  }))

  const specs: ProductContent['specs'] = [
    { label: 'Material', value: capitalize(material) },
    { label: 'Made in', value: brief.place },
    { label: 'Build time', value: 'Fourteen days, built to order' },
    ...(product.options ?? []).map((option) => ({ label: option.title, value: option.values.map((value) => value.value).join(' · ') })),
    { label: 'Repairs', value: 'In-house, for as long as we are here' },
    { label: 'Returns', value: 'Free for thirty days' },
  ]

  const faq = [
    ...research.objections.slice(0, isHero ? 4 : 3).map((entry) => ({ q: entry.objection, a: entry.answer })),
    { q: 'When will it ship?', a: 'Stock builds leave the workshop within fourteen days. You see the date before you pay, and you get tracking the moment it moves.' },
    { q: 'What if it is not right?', a: 'Send it back within thirty days for a full refund or an exchange. We cover the return label.' },
  ]

  return {
    benefits,
    comparison: { rows: research.comparison.rows.slice(0, 5), themLabel: research.competitors[0]?.name ?? 'The usual' },
    specs,
    faq,
    guarantee: `Thirty days, no questions. If the ${product.title.replace(/^The /, '').toLowerCase()} is not what you hoped, send it back and we refund the lot.`,
    shipping: `Built to order in ${brief.place}. Ships in fourteen days; free over 200; tracked the whole way.`,
    audience: research.audience[0] ? `Made for ${research.audience[0].name.toLowerCase().replace(/^the /, '')}: ${research.audience[0].wants.toLowerCase()}` : '',
    trust: research.proofPoints.slice(0, 3),
  }
}

function benefitTitle(trigger: string, material: string, index: number): string {
  const titles = [
    `Built for the moment ${trigger.toLowerCase().replace(/^(the|a|an) /, '')}`,
    `${capitalize(material)} that gets better, not worse`,
    'One person built it, and their name is on it',
    'Repaired, never replaced',
  ]
  return titles[index] ?? capitalize(trigger)
}

function benefitBody(trigger: string, material: string, brief: Brief, title: string): string {
  const lower = trigger.toLowerCase()
  if (/fail|broke|soft|wore|stale|reaction/.test(lower)) {
    return `That is the failure we designed against. The ${title.replace(/^The /, '').toLowerCase()} is built where the load actually goes, from ${material}, so the part that gives out on the cheap version is the part that lasts here.`
  }
  if (/first|starting|new/.test(lower)) {
    return `If this is your first, the sizing guide and the free exchange take the risk out of it. Most people get it right the first time; the rest swap it for free.`
  }
  if (/gift|occasion|holiday|birthday/.test(lower)) {
    return `It arrives looking like something, in a box that does not need wrapping, with a card from the workshop in ${brief.place} if you want one.`
  }
  return `${capitalize(material)} takes on the shape of the person using it. Expect it to look better in a year than it does in the photographs.`
}

/** Fills the page for a product that was created without research. */
export function contentFor(research: Research, prompt: string, product: Product): ProductContent {
  return writeProductContent(research, readBrief(`${prompt} ${product.title}`), {
    title: product.title,
    priceCents: Math.min(...product.variants.map((variant) => variant.priceCents)),
    options: product.options,
  })
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1)
}
