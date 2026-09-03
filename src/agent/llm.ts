import { listProducts } from '../domain/catalog.ts'
import { listPromotions } from '../domain/promotions.ts'
import { getStore } from '../control/stores.ts'
import type { Db } from '../lib/db.ts'
import { logger } from '../lib/log.ts'
import { toolDefinitions } from './registry.ts'
import type { PlannedStep } from './runtime.ts'

const log = logger('planner')

export type PlanContext = { db: Db; storeId: string; page?: string }

export type Plan = {
  steps: PlannedStep[]
  /** What the assistant says before it starts working. */
  preamble: string
  source: 'model' | 'rules'
}

/* ------------------------------------------------------------------ the model */

type AnthropicBlock = { type: string; name?: string; input?: Record<string, unknown>; text?: string }

/**
 * With a key configured the model plans: it is given the real tool schemas and
 * the store's current state, and its tool_use blocks become the run's steps.
 * The model never executes anything itself — the registry's executor still
 * validates every argument and still refuses the risky calls.
 */
async function modelPlan(prompt: string, context: PlanContext): Promise<Plan | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AMBORAS_MODEL ?? 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: systemPrompt(context),
        tools: toolDefinitions(),
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      log.warn(`model planner returned ${response.status}; falling back to rules`)
      return null
    }
    const payload = (await response.json()) as { content?: AnthropicBlock[] }
    const blocks = payload.content ?? []
    const steps = blocks
      .filter((block) => block.type === 'tool_use' && block.name)
      .map((block) => ({ tool: block.name as string, args: block.input ?? {} }))
    const preamble = blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join(' ')
      .trim()
    if (!steps.length && !preamble) return null
    return { steps, preamble, source: 'model' }
  } catch (error) {
    log.warn(`model planner unreachable: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function systemPrompt(context: PlanContext): string {
  const store = getStore(context.db, context.storeId)
  const products = listProducts(context.db, context.storeId, { limit: 20 })
  const promotions = listPromotions(context.db, context.storeId)
  return [
    `You run the admin of "${store?.name ?? 'a store'}" on Amboras. You act by calling tools; you do not describe what the merchant should click.`,
    store?.brand.voice ? `Store voice: ${store.brand.voice}` : '',
    context.page ? `The merchant is on the ${context.page} page — prefer tools relevant to it.` : '',
    `Currency is ${store?.currency ?? 'USD'} and every amount you pass is in minor units (cents).`,
    products.length ? `Products: ${products.map((product) => `${product.title} (${product.id})`).join(', ')}` : 'The catalog is empty.',
    promotions.length ? `Promotions: ${promotions.map((promotion) => `${promotion.title}${promotion.code ? ` [${promotion.code}]` : ''}`).join(', ')}` : '',
    `Prefer one tool call that does the job over three that approximate it. If something is genuinely ambiguous, say so instead of guessing at a destructive call.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/* ------------------------------------------------------------------- the rules */

type Rule = {
  match: RegExp
  build: (groups: string[], input: string, context: PlanContext) => { steps: PlannedStep[]; preamble: string } | null
}

const money = (raw?: string) => (raw ? Math.round(parseFloat(raw.replace(/[^0-9.]/g, '')) * 100) : undefined)
const quoted = (input: string) => /["'“]([^"'”]{2,80})["'”]/.exec(input)?.[1]

/**
 * The rules planner.
 *
 * This is not a fallback nobody exercises: with no API key, no network and no
 * budget, the whole product still has to work, so these rules are the floor
 * under every demo, every test and every offline deployment. They cover the
 * things merchants actually type at an admin.
 */
const RULES: Rule[] = [
  {
    match: /\b(add|create|make)\b.*\b(product|item|sku)\b/i,
    build(_groups, input) {
      const title = quoted(input) ?? /(?:called|named)\s+([A-Za-z0-9' -]{2,60})/i.exec(input)?.[1]?.trim() ?? 'New Product'
      const price = money(/(?:for|at|priced?)\s*\$?\s*([0-9]+(?:\.[0-9]{2})?)/i.exec(input)?.[1]) ?? 9900
      const sizes = /\b(with|in)\s+(sizes?|variants?)\b/i.test(input) || /\b(s\/m\/l|small.*large)\b/i.test(input)
      return {
        preamble: `Adding ${title} at ${(price / 100).toFixed(2)}, writing the copy and rendering an image for it.`,
        steps: [
          {
            tool: 'create_product',
            area: 'products',
            args: {
              title,
              priceCents: price,
              status: 'published',
              ...(sizes ? { options: [{ title: 'Size', values: ['S', 'M', 'L', 'XL'] }] } : {}),
            },
          },
        ],
      }
    },
  },
  {
    match: /\b(discount|promo|promotion|coupon|sale|code)\b|free\s+(shipping|delivery)/i,
    build(_groups, input) {
      const percent = Number(/([0-9]{1,2})\s*%/.exec(input)?.[1] ?? 10)
      const code = /\bcode\s+([A-Z0-9]{3,20})\b/.exec(input)?.[1] ?? /\b([A-Z]{4,12}[0-9]{0,2})\b/.exec(input)?.[1]
      const freeShipping = /free\s+(shipping|delivery)/i.test(input)
      if (freeShipping) {
        const threshold = money(/(?:over|above)\s*\$?\s*([0-9]+)/i.exec(input)?.[1]) ?? 20000
        return {
          preamble: `Setting up free shipping over ${(threshold / 100).toFixed(0)}.`,
          steps: [{ tool: 'create_promotion', area: 'promotions', args: { title: `Free shipping over ${(threshold / 100).toFixed(0)}`, kind: 'free_shipping', minSubtotalCents: threshold } }],
        }
      }
      return {
        preamble: `Creating a ${percent}% discount${code ? ` on code ${code}` : ' that applies automatically'}.`,
        steps: [
          {
            tool: 'create_promotion',
            area: 'promotions',
            args: { title: code ? `${percent}% off with ${code}` : `${percent}% off`, kind: 'percentage', value: percent, ...(code ? { code } : {}) },
          },
        ],
      }
    },
  },
  {
    match: /\b(analytics|how (are|is) (we|the store|sales)|performance|kpis?|conversion|revenue|traffic)\b/i,
    build() {
      return {
        preamble: 'Pulling the numbers and the funnel.',
        steps: [
          { tool: 'get_kpis', area: 'analytics', args: { range: '7d' } },
          { tool: 'get_funnel', area: 'analytics', args: { range: '7d' } },
        ],
      }
    },
  },
  {
    match: /\b(home ?page|hero|storefront|theme|design|look|redesign)\b/i,
    build(_groups, input) {
      const headline = quoted(input)
      const darker = /\b(dark|darker|moody|black)\b/i.test(input)
      const roomier = /\b(roomy|airy|spacious|breathing)\b/i.test(input)
      const scene = /\b(?:with|showing|of)\s+([^.,]{6,80})/i.exec(input)?.[1]?.trim()
      const steps: PlannedStep[] = []
      if (scene || !headline) {
        steps.push({
          tool: 'generate_hero_image',
          area: 'store',
          args: { scene: scene ?? 'the flagship product on a plain ground, single soft light', ...(headline ? { headline } : {}) },
        })
      }
      if (headline || darker || roomier) {
        steps.push({
          tool: 'edit_storefront',
          area: 'store',
          args: { ...(headline ? { heroHeadline: headline } : {}), ...(roomier ? { density: 'roomy' } : {}), ...(darker ? { template: 'gallery' } : {}) },
        })
      }
      return { preamble: 'Editing the draft storefront. Nothing changes for customers until you publish.', steps }
    },
  },
  {
    match: /\b(publish|go live|make it live|ship it)\b/i,
    build() {
      return { preamble: 'Publishing the draft over the live storefront.', steps: [{ tool: 'publish_store', area: 'store', args: {} }] }
    },
  },
  {
    match: /\brefund\b/i,
    build(_groups, input) {
      const order = /#?([0-9]{3,6})\b/.exec(input)?.[1]
      if (!order) return null
      return { preamble: `Refunding order #${order}.`, steps: [{ tool: 'refund_order', area: 'orders', args: { orderId: order, reason: 'Requested from the admin' } }] }
    },
  },
  {
    match: /\b(fulfil+|ship)\b.*\b(order)\b|\border\b.*\b(fulfil+|ship)\b/i,
    build(_groups, input) {
      const order = /#?([0-9]{3,6})\b/.exec(input)?.[1]
      if (!order) return null
      return { preamble: `Marking order #${order} fulfilled.`, steps: [{ tool: 'fulfill_order', area: 'orders', args: { orderId: order } }] }
    },
  },
  {
    match: /\borders?\b/i,
    build() {
      return { preamble: 'Here are the most recent orders.', steps: [{ tool: 'list_orders', area: 'orders', args: { limit: 10 } }] }
    },
  },
  {
    match: /\breviews?\b/i,
    build(_groups, input) {
      const pending = /\b(pending|moderat|queue|waiting)\b/i.test(input)
      return {
        preamble: pending ? 'Here is the moderation queue.' : 'Here are the reviews.',
        steps: [{ tool: 'list_reviews', area: 'reviews', args: { status: pending ? 'pending' : 'all', limit: 20 } }],
      }
    },
  },
  {
    match: /\b(domain|dns)\b/i,
    build(_groups, input) {
      const host = /([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i.exec(input)?.[1]
      if (!host) return { preamble: 'Tell me the domain you own and I will set it up.', steps: [{ tool: 'list_domains', area: 'setup', args: {} }] }
      return { preamble: `Attaching ${host}.`, steps: [{ tool: 'connect_domain', area: 'setup', args: { hostname: host } }] }
    },
  },
  {
    match: /\b(install|connect|add)\b.*\b(stripe|shippo|klaviyo|ga4|analytics|pixel|reviews?|upsells?|exit intent|engraving)\b/i,
    build(_groups, input) {
      const map: Array<[RegExp, string]> = [
        [/stripe/i, 'stripe'],
        [/shippo/i, 'shippo'],
        [/klaviyo/i, 'klaviyo'],
        [/ga4|google analytics/i, 'ga4'],
        [/pixel|meta|facebook/i, 'meta-pixel'],
        [/reviews?/i, 'product-reviews'],
        [/upsells?|cross.?sell/i, 'upsells'],
        [/exit.?intent/i, 'exit-intent'],
        [/engraving/i, 'engraving'],
      ]
      const pluginId = map.find(([pattern]) => pattern.test(input))?.[1]
      if (!pluginId) return null
      return { preamble: `Installing ${pluginId}.`, steps: [{ tool: 'install_plugin', area: 'plugins', args: { pluginId } }] }
    },
  },
  {
    match: /\b(blog|article|journal|post)\b/i,
    build(_groups, input, context) {
      const store = getStore(context.db, context.storeId)
      const title = quoted(input) ?? /\babout\s+([^.?!]{4,70})/i.exec(input)?.[1]?.trim() ?? 'How this is made'
      const body = `${store?.brand.description ?? ''}\n\n${title}. The short version: we build in small runs, we name our materials, and we repair what we sell. The long version is below.`
      return { preamble: `Writing "${title}".`, steps: [{ tool: 'create_article', area: 'content', args: { title, body, status: 'published' } }] }
    },
  },
  {
    match: /\b(collection|organi[sz]e|categor)/i,
    build(_groups, input) {
      const title = quoted(input)
      if (title) return { preamble: `Creating the ${title} collection.`, steps: [{ tool: 'create_collection', area: 'organization', args: { title } }] }
      return { preamble: 'Grouping the catalog into collections.', steps: [{ tool: 'organize_catalog', area: 'organization', args: { axis: 'tag' } }] }
    },
  },
  {
    match: /\b(seo|search|google|schema|structured data)\b/i,
    build() {
      return {
        preamble: 'Checking what a crawler sees.',
        steps: [
          { tool: 'validate_schema', area: 'seo', args: {} },
          { tool: 'seo_report', area: 'seo', args: {} },
        ],
      }
    },
  },
  {
    match: /\b(stock|inventory|out of stock|low)\b/i,
    build() {
      return { preamble: 'Checking stock levels.', steps: [{ tool: 'low_stock_report', area: 'products', args: { threshold: 5 } }] }
    },
  },
  {
    match: /\b(customers?|buyers?)\b/i,
    build() {
      return {
        preamble: 'Here is the customer base.',
        steps: [
          { tool: 'list_customers', area: 'customers', args: { limit: 10 } },
          { tool: 'segment_customers', area: 'customers', args: {} },
        ],
      }
    },
  },
  {
    match: /\b(email|campaign|newsletter)\b/i,
    build(_groups, input) {
      return { preamble: 'Drafting it. Nothing sends until you say so.', steps: [{ tool: 'draft_campaign', area: 'emails', args: { brief: input } }] }
    },
  },
  {
    match: /\b(products?|catalog|catalogue|inventory list)\b/i,
    build() {
      return { preamble: 'Here is the catalog.', steps: [{ tool: 'list_products', area: 'products', args: { limit: 20 } }] }
    },
  },
]

export function rulesPlan(prompt: string, context: PlanContext): Plan {
  for (const rule of RULES) {
    const groups = rule.match.exec(prompt)
    if (!groups) continue
    const built = rule.build([...groups], prompt, context)
    if (built) return { ...built, source: 'rules' }
  }
  return {
    steps: [{ tool: 'get_kpis', area: 'analytics', args: { range: '7d' } }],
    preamble:
      'I am not sure which of my tools that maps to. Here is where the store stands — or tell me plainly what to change (a product, a discount, the homepage, a domain) and I will do it.',
    source: 'rules',
  }
}

export async function plan(prompt: string, context: PlanContext): Promise<Plan> {
  return (await modelPlan(prompt, context)) ?? rulesPlan(prompt, context)
}

/** The reply the merchant reads once the run finishes. */
export function compose(preamble: string, summaries: string[], failures: string[]): string {
  const parts = [preamble.trim()]
  if (summaries.length) parts.push(summaries.join(' '))
  if (failures.length) parts.push(`I could not finish everything: ${failures.join('; ')}.`)
  return parts.filter(Boolean).join('\n\n')
}
