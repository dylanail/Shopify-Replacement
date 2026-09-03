import { getStore } from '../../control/stores.ts'
import { getProduct, listProducts } from '../../domain/catalog.ts'
import { DEFAULT_TIERS, listBundles, upsertBundle, type BundleTier } from '../../domain/bundles.ts'
import { clonePage } from '../../pages/clone.ts'
import { advertorialTemplate, blankTemplate, createPage, homeTemplate, landingTemplate, listPages, offerTemplate, quizTemplate, salesTemplate, updatePage } from '../../pages/store.ts'
import { blockDefinition, BLOCKS, customDefinition, type CustomField } from '../../pages/blocks.ts'
import { customCatalog, customDefinitions, deleteCustomBlock, getCustomBlock, upsertCustomBlock } from '../../pages/custom-blocks.ts'
import { latestResearch } from '../research.ts'
import { defineTools, type Tool } from '../registry.ts'

export const pageTools: Tool[] = defineTools([
  {
    name: 'create_page',
    area: 'store',
    description: 'Create a page from a template, wired to a product and the research on file: sales (the long funnel page, buy box on top), offer (the short funnel landing page), advertorial (listicle), quiz, landing, home, or blank. Opens as a draft in the page builder.',
    schema: {
      template: { type: 'string', enum: ['sales', 'offer', 'advertorial', 'quiz', 'landing', 'home', 'blank'], default: 'advertorial' },
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
      const blocks = template === 'advertorial' ? advertorialTemplate(input) : template === 'landing' ? landingTemplate(input) : template === 'offer' ? offerTemplate(input) : template === 'sales' ? salesTemplate(input) : template === 'home' ? homeTemplate(input) : template === 'quiz' ? quizTemplate(input) : blankTemplate()
      const titles: Record<string, string> = { advertorial: `Why people are switching to ${product?.title ?? store.name}`, sales: `${product?.title ?? store.name} — the sales page`, offer: `${product?.title ?? store.name} — save today`, quiz: `Find your ${product?.title ?? 'fit'}`, home: `${store.name} — home` }
      const created = createPage(ctx.db, ctx.storeId, {
        title: (args.title as string) || titles[template] || `${product?.title ?? store.name} — offer`,
        kind: template === 'advertorial' ? 'advertorial' : 'landing',
        ...(template === 'offer' || template === 'sales' ? { role: 'offer' as const } : {}),
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
    name: 'list_blocks',
    area: 'store',
    description: 'Every section type a page can be built from: the catalog and the blocks this store defined for itself, with what each is for and its setting keys. Read it before add_block or create_block.',
    schema: {},
    handler(_args, ctx) {
      const custom = customCatalog(ctx.db, ctx.storeId)
      const catalog = BLOCKS.map((block) => ({ type: block.type, name: block.name, group: block.group, description: block.description, fields: Object.keys(block.schema).filter((key) => !['background', 'padding', 'width', 'align'].includes(key)) }))
      return {
        summary: `${catalog.length} catalog blocks and ${custom.length} of this store's own. When none fits, add a section as custom-html, or define a reusable one with create_block.`,
        data: { catalog, custom },
        artifacts: [{ type: 'table', columns: ['Type', 'Name', 'For', 'Fields'], rows: [...catalog.map((block) => [block.type, block.name, block.description, block.fields.join(', ')]), ...custom.map((block) => [block.type, block.name, block.description, block.fields.join(', ')])] }],
      }
    },
  },
  {
    name: 'add_block',
    area: 'store',
    description: 'Insert a section into a page: any catalog block, one of this store\'s own blocks, or, when nothing fits, "custom-html" with settings.html holding the section\'s HTML (the theme\'s classes — head, lead, cols, col, checks, btn — are available), or "custom-code" with settings.css and settings.js for styling or behaviour this one page needs (for the whole store use set_store_code). Settings follow the block schema; anything left out takes its default. Position 0 is the top; omitted appends.',
    schema: { pageId: { type: 'string', required: true }, type: { type: 'string', required: true }, settings: { type: 'object' }, position: { type: 'number', integer: true, min: 0 } },
    handler(args, ctx) {
      const type = args.type as string
      const definition = blockDefinition(type) ?? customDefinitions(ctx.db, ctx.storeId).find((entry) => entry.type === type) ?? null
      if (!definition) throw new Error(`No block called ${type}. Use list_blocks, or create_block to define one, or type "custom-html" with settings.html.`)
      const pageId = args.pageId as string
      const { getPage, newBlock } = require_pages()
      const page = getPage(ctx.db, ctx.storeId, pageId)
      if (!page) throw new Error('No such page')
      const block = newBlock(type, (args.settings as Record<string, unknown>) ?? {}, definition)
      const blocks = [...page.blocks]
      blocks.splice(args.position === undefined ? blocks.length : Math.min(blocks.length, args.position as number), 0, block)
      updatePage(ctx.db, ctx.storeId, page.id, { blocks })
      return { summary: `Added a ${definition.name} block to ${page.title} (${blocks.length} blocks now).`, artifacts: [{ type: 'link', href: `/admin/pages/${page.id}/edit`, label: 'Open the page' }] }
    },
  },
  {
    name: 'create_block',
    area: 'store',
    description: 'Define a new reusable block for this store when no catalog block does the job (check list_blocks first). Give it fields, an HTML template over them, and css and js when it needs them: {{key}} escaped, {{{key}}} raw, {{#if key}}…{{else}}…{{/if}}, {{#each key}}…{{/each}} over the lines of a multiline field with {{0}} {{1}} for its "|" parts and {{.}} for the line, plus {{store.name}}, {{base}}, {{product.title}}, {{product.image}}, {{product.price}}, {{product.handle}}. The theme\'s classes (head, lead, eyebrow, cols, col, checks, btn, micro, rating) style it; add css only for what they do not cover. No scripts. The block then appears in the builder palette and can be placed with add_block.',
    schema: {
      name: { type: 'string', required: true, help: 'What the owner will see in the palette, e.g. "Ingredient strip".' },
      type: { type: 'string', pattern: '^custom-[a-z0-9][a-z0-9-]{1,40}$', help: 'custom-… ; derived from the name when omitted. Reusing an existing type replaces that block.' },
      description: { type: 'string', help: 'One line on what it is for.' },
      icon: { type: 'string', help: 'One glyph or emoji.' },
      fields: { type: 'array', required: true, of: { type: 'object', fields: { key: { type: 'string', required: true, pattern: '^[a-z][a-zA-Z0-9]{0,30}$' }, label: { type: 'string' }, type: { type: 'string', enum: ['string', 'number', 'boolean'], required: true }, multiline: { type: 'boolean' }, default: { type: 'any' }, help: { type: 'string' } } }, max: 24 },
      template: { type: 'string', required: true, max: 40000 },
      css: { type: 'string', max: 10000, help: 'CSS for the block; the theme classes cover most of it.' },
      js: { type: 'string', max: 20000, help: 'A script the block needs (a tab switcher, a counter). It runs once per page that uses the block; find the instances with document.querySelectorAll(".blk--<type>"). No external scripts.' },
    },
    handler(args, ctx) {
      const fields = (args.fields as CustomField[]).map((field) => ({ ...field, ...(field.default === undefined ? {} : { default: field.default as string | number | boolean }) }))
      const block = upsertCustomBlock(ctx.db, ctx.storeId, { ...(args.type ? { type: args.type as string } : {}), name: args.name as string, description: (args.description as string) ?? '', icon: (args.icon as string) ?? '✚', fields, template: args.template as string, css: (args.css as string) ?? '', js: (args.js as string) ?? '', source: 'model' })
      const definition = customDefinition(block)
      return {
        summary: `Defined "${block.name}" as ${block.type} with fields ${fields.map((field) => field.key).join(', ') || '(none)'}. It is in the palette under Custom; place it with add_block.`,
        data: { type: block.type, settings: Object.keys(definition.schema) },
        artifacts: [{ type: 'link', href: '/admin/pages#blocks', label: 'See the store\'s blocks' }],
      }
    },
  },
  {
    name: 'delete_block',
    area: 'store',
    description: 'Remove one of this store\'s own blocks. Pages that used it show a note where it was.',
    risk: 'confirm',
    schema: { type: { type: 'string', required: true } },
    handler(args, ctx) {
      const existing = getCustomBlock(ctx.db, ctx.storeId, args.type as string)
      if (!existing) throw new Error(`No custom block called ${args.type}`)
      deleteCustomBlock(ctx.db, ctx.storeId, existing.type)
      return { summary: `Removed ${existing.name} (${existing.type}).` }
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
