import { getStore } from '../../control/stores.ts'
import { getProduct, listProducts } from '../../domain/catalog.ts'
import { DEFAULT_TIERS, listBundles, upsertBundle, type BundleTier } from '../../domain/bundles.ts'
import { clonePage } from '../../pages/clone.ts'
import { advertorialTemplate, blankTemplate, createPage, landingTemplate, listPages, updatePage } from '../../pages/store.ts'
import { blockDefinition } from '../../pages/blocks.ts'
import { latestResearch } from '../research.ts'
import { defineTools, type Tool } from '../registry.ts'

export const pageTools: Tool[] = defineTools([
  {
    name: 'create_page',
    area: 'store',
    description: 'Create a landing page or advertorial from a template, wired to a product and the research on file. Opens as a draft in the page builder.',
    schema: {
      template: { type: 'string', enum: ['advertorial', 'landing', 'blank'], default: 'advertorial' },
      title: { type: 'string' },
      productId: { type: 'string', help: 'Defaults to the first published product.' },
      publish: { type: 'boolean', default: false },
    },
    handler(args, ctx) {
      const store = getStore(ctx.db, ctx.storeId)
      if (!store) throw new Error('No store')
      const product = (args.productId ? getProduct(ctx.db, ctx.storeId, args.productId as string) : null) ?? listProducts(ctx.db, ctx.storeId, { status: 'published', limit: 1 })[0] ?? null
      const research = latestResearch(ctx.db, ctx.storeId)
      const input = {
        storeName: store.name,
        ...(product ? { product: { id: product.id, title: product.title, image: product.heroImage, subtitle: product.subtitle } } : {}),
        research: research ? { triggers: research.triggers, objections: research.objections, comparison: research.comparison, competitors: research.competitors } : null,
      }
      const template = args.template as string
      const blocks = template === 'advertorial' ? advertorialTemplate(input) : template === 'landing' ? landingTemplate(input) : blankTemplate()
      const created = createPage(ctx.db, ctx.storeId, {
        title: (args.title as string) || (template === 'advertorial' ? `Why people are switching to ${product?.title ?? store.name}` : `${product?.title ?? store.name} — offer`),
        kind: template === 'advertorial' ? 'advertorial' : 'landing',
        blocks,
        status: args.publish ? 'published' : 'draft',
      })
      return {
        summary: `Created "${created.title}" with ${blocks.length} blocks${args.publish ? ', published' : ' as a draft'}.`,
        data: { id: created.id, handle: created.handle },
        artifacts: [{ type: 'link', href: `/admin/pages/${created.id}/edit`, label: 'Open it in the page builder' }],
      }
    },
  },
  {
    name: 'clone_page',
    area: 'store',
    description: 'Clone a reference page from a URL into this store as editable HTML — stylesheets inlined, links made absolute, images copied in.',
    risk: 'confirm',
    schema: { url: { type: 'string', required: true, pattern: '^https?://' }, keepScripts: { type: 'boolean', default: false } },
    async handler(args, ctx) {
      const result = await clonePage(args.url as string, { storeId: ctx.storeId, keepScripts: Boolean(args.keepScripts) })
      const created = createPage(ctx.db, ctx.storeId, { title: result.title, kind: 'custom', mode: 'html', rawHtml: result.html, seo: { title: result.title, description: result.description }, sourceUrl: result.sourceUrl })
      return {
        summary: `Cloned ${result.sourceUrl}: ${result.stylesheets} stylesheets inlined, ${result.imagesLocalized} images copied. ${result.notes.join(' ')}`.trim(),
        data: { id: created.id, handle: created.handle },
        artifacts: [{ type: 'link', href: `/admin/pages/${created.id}/edit`, label: 'Open the clone' }],
      }
    },
  },
  {
    name: 'list_pages',
    area: 'store',
    description: 'List the built, cloned and HTML pages on this store.',
    schema: {},
    handler(_args, ctx) {
      const pages = listPages(ctx.db, ctx.storeId)
      return {
        summary: `${pages.length} page${pages.length === 1 ? '' : 's'}.`,
        artifacts: [{ type: 'table', columns: ['Page', 'Path', 'Mode', 'Status'], rows: pages.map((page) => [page.title, `/pages/${page.handle}`, page.mode === 'html' ? 'HTML' : `${page.blocks.length} blocks`, page.status]) }],
      }
    },
  },
  {
    name: 'add_block',
    area: 'store',
    description: 'Append a block to a page. Settings follow the block schema; anything left out takes its default.',
    schema: { pageId: { type: 'string', required: true }, type: { type: 'string', required: true }, settings: { type: 'object' }, position: { type: 'number', integer: true, min: 0 } },
    handler(args, ctx) {
      const definition = blockDefinition(args.type as string)
      if (!definition) throw new Error(`No block called ${args.type}`)
      const pageId = args.pageId as string
      const { getPage, newBlock } = require_pages()
      const page = getPage(ctx.db, ctx.storeId, pageId)
      if (!page) throw new Error('No such page')
      const block = newBlock(args.type as string, (args.settings as Record<string, unknown>) ?? {})
      const blocks = [...page.blocks]
      blocks.splice(args.position === undefined ? blocks.length : (args.position as number), 0, block)
      updatePage(ctx.db, ctx.storeId, page.id, { blocks })
      return { summary: `Added a ${definition.name} block to ${page.title} (${blocks.length} blocks now).` }
    },
  },
  {
    name: 'publish_page',
    area: 'store',
    description: 'Publish a page, optionally making it the store home page.',
    schema: { pageId: { type: 'string', required: true }, home: { type: 'boolean', default: false } },
    handler(args, ctx) {
      const page = updatePage(ctx.db, ctx.storeId, args.pageId as string, { status: 'published', ...(args.home ? { isHome: true } : {}) })
      return { summary: `${page.title} is published at /pages/${page.handle}${args.home ? ' and is now the home page' : ''}.`, artifacts: [{ type: 'link', href: `/s/${getStore(ctx.db, ctx.storeId)?.slug}/pages/${page.handle}`, label: 'View it' }] }
    },
  },
  {
    name: 'create_bundle',
    area: 'promotions',
    description: 'Put quantity-break tiers on a product: buy 1, buy 2 and save, buy 3 and save more, with badges, free shipping and a gift. Enforced in the cart.',
    schema: {
      productId: { type: 'string', required: true },
      title: { type: 'string', default: 'Bundle & save' },
      tiers: {
        type: 'array',
        of: { type: 'object', fields: { quantity: { type: 'number', integer: true, min: 1, required: true }, discountPercent: { type: 'number', min: 0, max: 90, default: 0 }, label: { type: 'string' }, badge: { type: 'string' }, freeShipping: { type: 'boolean' }, giftVariantId: { type: 'string' }, giftLabel: { type: 'string' } } },
        help: 'Defaults to buy 1 / buy 2 save 15% / buy 3 save 25% with free shipping.',
      },
    },
    handler(args, ctx) {
      const raw = (args.tiers as Array<Partial<BundleTier> & { quantity: number }> | undefined) ?? []
      const tiers: BundleTier[] = raw.length ? raw.map((tier) => ({ quantity: tier.quantity, discountPercent: tier.discountPercent ?? 0, label: tier.label ?? `Buy ${tier.quantity}`, ...(tier.badge ? { badge: tier.badge } : {}), ...(tier.freeShipping ? { freeShipping: true } : {}), ...(tier.giftVariantId ? { giftVariantId: tier.giftVariantId, giftLabel: tier.giftLabel ?? 'free gift' } : {}) })) : DEFAULT_TIERS
      const bundle = upsertBundle(ctx.db, ctx.storeId, { productId: args.productId as string, title: args.title as string, tiers })
      const product = getProduct(ctx.db, ctx.storeId, bundle.productId)
      return {
        summary: `${product?.title ?? 'Product'} now has ${bundle.tiers.length} tiers: ${bundle.tiers.map((tier) => `${tier.label}${tier.discountPercent ? ` (−${tier.discountPercent}%)` : ''}`).join(', ')}. The discount is a promotion the cart enforces.`,
        artifacts: [{ type: 'link', href: '/admin/bundles', label: 'Open bundles' }],
      }
    },
  },
  {
    name: 'list_bundles',
    area: 'promotions',
    description: 'List the quantity-break bundles on this store.',
    schema: {},
    handler(_args, ctx) {
      const bundles = listBundles(ctx.db, ctx.storeId)
      return {
        summary: `${bundles.length} bundle${bundles.length === 1 ? '' : 's'}.`,
        artifacts: [{ type: 'table', columns: ['Product', 'Tiers', 'Status'], rows: bundles.map((bundle) => [getProduct(ctx.db, ctx.storeId, bundle.productId)?.title ?? bundle.productId, bundle.tiers.map((tier) => `${tier.quantity}×${tier.discountPercent ? ` −${tier.discountPercent}%` : ''}`).join(' · '), bundle.status]) }],
      }
    },
  },
])

// Avoids a circular import at module load: pages/store imports domain code that imports nothing from tools.
function require_pages() {
  return { getPage: getPageSync, newBlock: newBlockSync }
}
import { getPage as getPageSync, newBlock as newBlockSync } from '../../pages/store.ts'
