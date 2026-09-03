import type { Db } from '../lib/db.ts'
import { createStore, getStore, setTheme, type Store } from '../control/stores.ts'
import { seedDefaultRegion } from '../domain/regions.ts'
import { seedTodos, refreshTodos } from '../control/todos.ts'
import { upsertSeoPage } from '../seo/schema.ts'
import { announcement, brandName, collectionPlan, draftProducts, paletteFor, promotionPlan, readBrief } from './copy.ts'
import { runResearch } from './research.ts'
import { listCollections, listProducts } from '../domain/catalog.ts'
import { createRun, runToCompletion, type PlannedStep, type Run } from './runtime.ts'

/**
 * One sentence to a live store.
 *
 * The branches below are what actually makes this feel like a machine rather
 * than a form: naming, catalog, brand and merchandising run at the same time
 * and the merchant watches four things happen at once. They are separate
 * branches because they genuinely do not depend on each other — only the
 * product photography depends on the product existing, and that is why it sits
 * *inside* the catalog branch rather than beside it.
 */
export function planOnboarding(prompt: string, opts: { referenceImage?: string } = {}): { steps: PlannedStep[]; brandLabel: string } {
  const brief = readBrief(prompt)
  const name = brandName(brief)
  const palette = paletteFor(brief)
  const products = draftProducts(brief, name)

  const steps: PlannedStep[] = []

  steps.push({
    branch: 'brand',
    area: 'store',
    tool: 'set_brand',
    args: {
      name,
      primary: palette.primary,
      secondary: palette.secondary,
      paper: palette.paper,
      ink: palette.ink,
      announcement: announcement(brief),
    },
  })
  steps.push({
    branch: 'brand',
    area: 'store',
    tool: 'generate_hero_image',
    args: {
      scene: `${products[0]?.title ?? brief.category} on a plain ground, ${brief.material}, single soft light`,
      headline: name.toUpperCase(),
      sub: brief.material.charAt(0).toUpperCase() + brief.material.slice(1) + `, made in ${brief.place}`,
    },
  })

  products.forEach((product, index) => {
    const branch = `catalog-${index}`
    steps.push({
      branch,
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
  for (const collection of collectionPlan(brief)) {
    steps.push({ branch: 'merchandising', area: 'organization', tool: 'create_collection', args: { title: collection.title, description: collection.description } })
  }

  return { steps, brandLabel: name }
}

function phaseTwo(db: Db, storeId: string): PlannedStep[] {
  const products = listProducts(db, storeId, { status: 'published', limit: 20 })
  const collections = listCollections(db, storeId)
  const steps: PlannedStep[] = []
  const everything = collections.find((collection) => /new arrivals/i.test(collection.title))
  const essentials = collections.find((collection) => /essentials/i.test(collection.title))
  if (everything) {
    steps.push({
      branch: 'merch',
      area: 'organization',
      tool: 'manage_collection_products',
      args: { collectionId: everything.id, productIds: products.map((product) => product.id), mode: 'set' },
    })
  }
  if (essentials) {
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

export type OnboardingResult = { store: Store; run: Run; summaries: string[]; failures: string[] }

/**
 * Creates the store, then runs the plan. The store row exists before any tool
 * fires so the preview URL is real from the first second — the merchant can
 * open it and watch products appear, rather than staring at a spinner.
 */
export async function onboard(
  db: Db,
  input: { ownerId: string; prompt: string; currency?: string; planSlug?: string; referenceImage?: string; referenceUrl?: string },
): Promise<OnboardingResult> {
  const brief = readBrief(input.prompt)
  const { steps, brandLabel } = planOnboarding(input.prompt, { ...(input.referenceImage ? { referenceImage: input.referenceImage } : {}) })
  const store = createStore(db, input.ownerId, {
    name: brandLabel,
    prompt: input.prompt,
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.planSlug ? { planSlug: input.planSlug } : {}),
    ...(input.referenceImage ? { referenceImage: input.referenceImage } : {}),
    ...(input.referenceUrl ? { referenceUrl: input.referenceUrl } : {}),
  })

  // Research runs before anything is written, and on its own: the catalog
  // branch reads it, so it cannot be a sibling of the catalog branch.
  await runResearch(db, store.id, {
    prompt: input.prompt,
    ...(input.referenceUrl ? { siteUrl: input.referenceUrl } : {}),
    ...(input.referenceImage ? { imageNote: 'The merchant supplied a product photograph; imagery is derived from it.' } : {}),
  })
  seedDefaultRegion(db, store.id, store.currency)
  seedTodos(db, store.id)
  setTheme(db, store.id, {
    template: brief.mood === 'monochrome' ? 'gallery' : 'atelier',
    nav: [
      { label: 'Shop', href: '/collections/all' },
      { label: 'Journal', href: '/blogs/journal' },
      { label: 'About', href: '/pages/about' },
    ],
  }, { build: `Generated from: "${input.prompt.slice(0, 80)}"` })
  upsertSeoPage(db, store.id, { path: '/', title: brandLabel, description: `${brandLabel} — ${brief.material}, made in ${brief.place}.`, keyword: brief.category })

  const actor = { actor: { type: 'agent' as const, id: 'onboarding' }, confirmed: true, page: 'onboarding' }
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
  }
}
