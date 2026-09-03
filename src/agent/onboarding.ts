import type { Db } from '../lib/db.ts'
import { logger } from '../lib/log.ts'
import { createStore, getStore, setTheme, type Store } from '../control/stores.ts'
import { seedDefaultRegion } from '../domain/regions.ts'
import { seedTodos, refreshTodos } from '../control/todos.ts'
import { upsertSeoPage } from '../seo/schema.ts'
import { paletteFor, promotionPlan, readBrief, type Brief } from './copy.ts'
import { authorBrandKit, type BrandKit } from './brand.ts'
import { authorResearch, readSite, saveResearch, type AuthoredResearch } from './research.ts'
import { describe, modelFor } from './models.ts'
import { listCollections, listProducts } from '../domain/catalog.ts'
import { createRun, runToCompletion, type PlannedStep, type Run } from './runtime.ts'

const log = logger('onboarding')

/**
 * One sentence to a live store.
 *
 * Research is written first, then the brand kit from it, then the store
 * exists and the run builds it: naming, catalog, brand and merchandising in
 * parallel branches, because they genuinely do not depend on each other. Only
 * the product photography depends on the product existing, which is why it
 * sits *inside* the catalog branch rather than beside it.
 */
export function planOnboarding(kit: BrandKit, brief: Brief, opts: { referenceImage?: string } = {}): PlannedStep[] {
  const palette = paletteFor({ ...brief, mood: kit.mood })
  const steps: PlannedStep[] = []

  steps.push({
    branch: 'brand',
    area: 'store',
    tool: 'set_brand',
    args: {
      name: kit.name,
      slogan: kit.slogan,
      description: kit.description,
      voice: kit.voice,
      primary: palette.primary,
      secondary: palette.secondary,
      paper: palette.paper,
      ink: palette.ink,
      announcement: kit.announcement,
    },
  })
  const hero = kit.products[0]
  steps.push({
    branch: 'brand',
    area: 'store',
    tool: 'generate_hero_image',
    args: {
      scene: `${hero?.title ?? brief.category} on a plain ground, single soft light`,
      headline: kit.name.toUpperCase(),
      sub: kit.slogan,
    },
  })

  kit.products.forEach((product, index) => {
    steps.push({
      branch: `catalog-${index}`,
      area: 'products',
      tool: 'create_product',
      args: {
        title: product.title,
        subtitle: product.subtitle,
        description: product.description,
        priceCents: product.priceCents,
        status: 'published',
        tags: product.tags,
        options: product.options.map((option) => ({ title: option.title, values: option.values.map((value) => value.value) })),
        inventory: 24,
        role: product.role,
        ...(opts.referenceImage ? { reference: opts.referenceImage } : {}),
      },
    })
  })

  for (const promotion of promotionPlan()) {
    steps.push({
      branch: 'merchandising',
      area: 'promotions',
      tool: 'create_promotion',
      args: {
        title: promotion.title,
        kind: promotion.kind,
        value: promotion.value,
        ...(promotion.code ? { code: promotion.code } : {}),
        ...(promotion.rules ?? {}),
      },
    })
  }
  for (const collection of kit.collections) {
    steps.push({ branch: 'merchandising', area: 'organization', tool: 'create_collection', args: { title: collection.title, description: collection.description } })
  }

  return steps
}

function phaseTwo(db: Db, storeId: string): PlannedStep[] {
  const products = listProducts(db, storeId, { status: 'published', limit: 20 })
  const collections = listCollections(db, storeId)
  const steps: PlannedStep[] = []
  const everything = collections.find((collection) => /new arrivals/i.test(collection.title)) ?? collections[0]
  const essentials = collections.find((collection) => /essentials/i.test(collection.title)) ?? collections[1]
  if (everything) {
    steps.push({
      branch: 'merch',
      area: 'organization',
      tool: 'manage_collection_products',
      args: { collectionId: everything.id, productIds: products.map((product) => product.id), mode: 'set' },
    })
  }
  if (essentials && essentials.id !== everything?.id) {
    steps.push({
      branch: 'merch',
      area: 'organization',
      tool: 'manage_collection_products',
      args: { collectionId: essentials.id, productIds: products.slice(0, 2).map((product) => product.id), mode: 'set' },
    })
  }
  steps.push({ branch: 'plugins', area: 'plugins', tool: 'install_plugin', args: { pluginId: 'product-reviews' } })
  steps.push({ branch: 'plugins', area: 'plugins', tool: 'install_plugin', args: { pluginId: 'upsells' } })
  return steps
}

export type OnboardingResult = { store: Store; run: Run; summaries: string[]; failures: string[]; research: AuthoredResearch; kit: BrandKit }

/**
 * Research, then the brand kit, then the store, then the run. The store row
 * exists before any tool fires so the preview URL is real from the first
 * second — the merchant can open it and watch products appear.
 */
export async function onboard(
  db: Db,
  input: { ownerId: string; prompt: string; currency?: string; referenceImage?: string; referenceUrl?: string },
): Promise<OnboardingResult> {
  const brief = readBrief(input.prompt)
  const currency = (input.currency ?? 'USD').toUpperCase()
  const notes: string[] = []
  let sourceText = ''
  if (input.referenceUrl) {
    const site = await readSite(input.referenceUrl)
    sourceText = site.text
    notes.push(...site.notes)
  }
  if (input.referenceImage) notes.push('The merchant supplied a product photograph; imagery is derived from it.')

  // Research first, and on its own: the brand kit and every product page read it.
  const researchModel = modelFor(db, null, 'research')
  const research = await authorResearch(researchModel, brief, { sourceText, notes, currency, hasSite: Boolean(input.referenceUrl && sourceText) })
  const kit = await authorBrandKit(modelFor(db, null, 'brand'), brief, research.research, { currency })
  log.info(`research by ${describe(researchModel)}, brand kit by ${kit.source === 'model' ? kit.model : 'rules'}: ${kit.name}`)

  const store = createStore(db, input.ownerId, {
    name: kit.name,
    prompt: input.prompt,
    currency,
    ...(input.referenceImage ? { referenceImage: input.referenceImage } : {}),
    ...(input.referenceUrl ? { referenceUrl: input.referenceUrl } : {}),
  })
  saveResearch(db, store.id, research, input.prompt)
  seedDefaultRegion(db, store.id, store.currency)
  seedTodos(db, store.id)
  setTheme(db, store.id, {
    template: kit.mood === 'monochrome' ? 'gallery' : 'atelier',
    nav: [
      { label: 'Shop', href: '/collections/all' },
      { label: 'Journal', href: '/blogs/journal' },
      { label: 'About', href: '/pages/about' },
    ],
  }, { build: `Generated from: "${input.prompt.slice(0, 80)}"` })
  upsertSeoPage(db, store.id, { path: '/', title: kit.name, description: kit.slogan, keyword: research.research.category })

  const actor = { actor: { type: 'agent' as const, id: 'onboarding' }, page: 'onboarding' }
  const steps = planOnboarding(kit, brief, { ...(input.referenceImage ? { referenceImage: input.referenceImage } : {}) })
  const run = createRun(db, { storeId: store.id, kind: 'onboarding', prompt: input.prompt, steps })
  const outcome = await runToCompletion(db, run.id, actor)

  // Phase two reads the world the first phase built. Merchandising cannot be
  // planned up front because it needs the product ids that phase one minted,
  // and inventing a placeholder id to patch later would be a lie in the run log.
  const merchandising = createRun(db, {
    storeId: store.id,
    kind: 'onboarding',
    prompt: 'Merchandise the new catalog',
    steps: phaseTwo(db, store.id),
  })
  const second = await runToCompletion(db, merchandising.id, actor)
  outcome.results.push(...second.results)
  outcome.failures.push(...second.failures)
  refreshTodos(db, store.id)

  return {
    store: getStore(db, store.id) ?? store,
    run: outcome.run,
    summaries: outcome.results.map((result) => result.summary),
    failures: outcome.failures,
    research,
    kit,
  }
}
