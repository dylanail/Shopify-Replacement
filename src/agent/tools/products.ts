import { addVariant, createProduct, deleteProduct, getProduct, listProducts, lowStock, updateProduct, updateVariant } from '../../domain/catalog.ts'
import { getStore } from '../../control/stores.ts'
import { format } from '../../lib/money.ts'
import { upsertSeoPage } from '../../seo/schema.ts'
import { draftProducts, readBrief } from '../copy.ts'
import { enhance, generate, PRESETS, type PresetId } from '../images.ts'
import { defineTools, type Tool } from '../registry.ts'

const PRESET_IDS = PRESETS.map((preset) => preset.id)

export const productTools: Tool[] = defineTools([
  {
    name: 'create_product',
    area: 'products',
    description: 'Create a product with its options, variants, copy and imagery. Prices are in minor units (cents).',
    schema: {
      title: { type: 'string', required: true, max: 120, label: 'Product title' },
      subtitle: { type: 'string', max: 160 },
      description: { type: 'string', multiline: true },
      priceCents: { type: 'number', integer: true, min: 0, label: 'Price in minor units' },
      status: { type: 'string', enum: ['draft', 'published'], default: 'published' },
      tags: { type: 'array', of: { type: 'string' } },
      options: {
        type: 'array',
        max: 3,
        of: {
          type: 'object',
          fields: {
            title: { type: 'string', required: true },
            values: { type: 'array', of: { type: 'string' }, required: true },
          },
        },
      },
      inventory: { type: 'number', integer: true, min: 0, default: 25 },
    },
    async handler(args, ctx) {
      const store = getStore(ctx.db, ctx.storeId)
      const title = args.title as string
      const price = (args.priceCents as number) ?? 9900
      const rawOptions = (args.options as Array<{ title: string; values: string[] }> | undefined) ?? []
      const options = rawOptions.map((option) => ({
        title: option.title,
        values: option.values.map((value) => {
          const swatch = swatchFor(value)
          return swatch ? { value, swatch } : { value }
        }),
      }))

      const image = await generate({
        subject: `${title} by ${store?.name ?? 'the store'}`,
        kind: 'product',
        label: title,
        ...(store?.brand ? { palette: store.brand } : {}),
      })

      const combos = options.length
        ? cartesian(options.map((option) => option.values.map((entry) => ({ [option.title]: entry.value }))))
        : [[{}]]
      const variants = combos.map((combo, index) => {
        const optionValues = Object.assign({}, ...combo) as Record<string, string>
        const label = Object.values(optionValues).join(' / ') || 'Default'
        return {
          title: label,
          priceCents: price + index * Math.round(price * 0.05),
          inventory: (args.inventory as number) ?? 25,
          optionValues,
        }
      })

      const product = createProduct(ctx.db, ctx.storeId, {
        title,
        subtitle: (args.subtitle as string) ?? '',
        description: (args.description as string) ?? '',
        status: (args.status as 'draft' | 'published') ?? 'published',
        heroImage: image,
        media: [{ url: image, alt: `${title} on a plain ground` }],
        options,
        tags: (args.tags as string[]) ?? [],
        seo: { title: `${title} — ${store?.name ?? ''}`.trim(), description: ((args.subtitle as string) || (args.description as string) || title).slice(0, 155) },
        variants,
      })
      upsertSeoPage(ctx.db, ctx.storeId, {
        path: `/products/${product.handle}`,
        title: product.seo.title ?? product.title,
        description: product.seo.description ?? '',
        keyword: product.title.toLowerCase(),
      })
      return {
        summary: `Created ${product.title} with ${product.variants.length} variant${product.variants.length === 1 ? '' : 's'} from ${format(price, store?.currency ?? 'USD')}.`,
        data: { id: product.id, handle: product.handle },
        artifacts: [{ type: 'product', id: product.id, title: product.title, image: product.heroImage, href: `/products/${product.id}` }],
      }
    },
  },
  {
    name: 'update_product',
    area: 'products',
    description: 'Change a product title, subtitle, description, status or tags.',
    schema: {
      productId: { type: 'string', required: true },
      title: { type: 'string' },
      subtitle: { type: 'string' },
      description: { type: 'string', multiline: true },
      status: { type: 'string', enum: ['draft', 'published', 'archived'] },
      tags: { type: 'array', of: { type: 'string' } },
    },
    handler(args, ctx) {
      const patch: Record<string, unknown> = {}
      for (const key of ['title', 'subtitle', 'description', 'status', 'tags']) {
        if (args[key] !== undefined) patch[key] = args[key]
      }
      const product = updateProduct(ctx.db, ctx.storeId, args.productId as string, patch)
      return {
        summary: `Updated ${product.title}.`,
        data: { id: product.id },
        artifacts: [{ type: 'product', id: product.id, title: product.title, image: product.heroImage, href: `/products/${product.id}` }],
      }
    },
  },
  {
    name: 'delete_product',
    area: 'products',
    description: 'Permanently delete a product and its variants.',
    risk: 'confirm',
    schema: { productId: { type: 'string', required: true } },
    handler(args, ctx) {
      const product = getProduct(ctx.db, ctx.storeId, args.productId as string)
      if (!product) throw new Error('No product with that id')
      deleteProduct(ctx.db, ctx.storeId, product.id)
      return { summary: `Deleted ${product.title}.` }
    },
  },
  {
    name: 'list_products',
    area: 'products',
    description: 'List products, optionally filtered by status or a search term.',
    schema: {
      status: { type: 'string', enum: ['all', 'draft', 'published', 'archived'], default: 'all' },
      search: { type: 'string' },
      limit: { type: 'number', integer: true, min: 1, max: 100, default: 20 },
    },
    handler(args, ctx) {
      const store = getStore(ctx.db, ctx.storeId)
      const products = listProducts(ctx.db, ctx.storeId, {
        status: args.status as string,
        ...(args.search ? { search: args.search as string } : {}),
        limit: args.limit as number,
      })
      return {
        summary: `${products.length} product${products.length === 1 ? '' : 's'}.`,
        data: products.map((product) => ({ id: product.id, title: product.title, status: product.status, variants: product.variants.length })),
        artifacts: [
          {
            type: 'table',
            columns: ['Product', 'Status', 'Variants', 'From'],
            rows: products.map((product) => [
              product.title,
              product.status,
              String(product.variants.length),
              format(Math.min(...product.variants.map((variant) => variant.priceCents)), store?.currency ?? 'USD'),
            ]),
          },
        ],
      }
    },
  },
  {
    name: 'add_variant',
    area: 'products',
    description: 'Add a variant to an existing product.',
    schema: {
      productId: { type: 'string', required: true },
      title: { type: 'string', required: true },
      priceCents: { type: 'number', integer: true, min: 0, required: true },
      inventory: { type: 'number', integer: true, min: 0, default: 25 },
      sku: { type: 'string' },
    },
    handler(args, ctx) {
      const variant = addVariant(ctx.db, ctx.storeId, args.productId as string, {
        title: args.title as string,
        priceCents: args.priceCents as number,
        inventory: args.inventory as number,
        ...(args.sku ? { sku: args.sku as string } : {}),
      })
      return { summary: `Added the ${variant.title} variant.`, data: { id: variant.id } }
    },
  },
  {
    name: 'update_variant',
    area: 'products',
    description: 'Change a variant price, SKU, inventory or backorder setting.',
    schema: {
      variantId: { type: 'string', required: true },
      priceCents: { type: 'number', integer: true, min: 0 },
      sku: { type: 'string' },
      inventory: { type: 'number', integer: true, min: 0 },
      allowBackorder: { type: 'boolean' },
    },
    handler(args, ctx) {
      const patch: Record<string, unknown> = {}
      for (const key of ['priceCents', 'sku', 'inventory', 'allowBackorder']) if (args[key] !== undefined) patch[key] = args[key]
      const variant = updateVariant(ctx.db, ctx.storeId, args.variantId as string, patch)
      if (!variant) throw new Error('No variant with that id')
      return { summary: `Updated ${variant.title}.`, data: variant }
    },
  },
  {
    name: 'set_inventory',
    area: 'products',
    description: 'Set the stock level of one variant.',
    schema: { variantId: { type: 'string', required: true }, inventory: { type: 'number', integer: true, min: 0, required: true } },
    handler(args, ctx) {
      const variant = updateVariant(ctx.db, ctx.storeId, args.variantId as string, { inventory: args.inventory as number })
      if (!variant) throw new Error('No variant with that id')
      return { summary: `${variant.title} is now at ${variant.inventory} units.` }
    },
  },
  {
    name: 'low_stock_report',
    area: 'products',
    description: 'List variants that are at or below a stock threshold.',
    schema: { threshold: { type: 'number', integer: true, min: 0, default: 5 } },
    handler(args, ctx) {
      const rows = lowStock(ctx.db, ctx.storeId, args.threshold as number) as Array<{ product_title: string; title: string; inventory: number; sku: string }>
      return {
        summary: rows.length ? `${rows.length} variant${rows.length === 1 ? '' : 's'} at or below ${args.threshold}.` : 'Nothing is running low.',
        artifacts: [{ type: 'table', columns: ['Product', 'Variant', 'SKU', 'Left'], rows: rows.map((row) => [row.product_title, row.title, row.sku, String(row.inventory)]) }],
      }
    },
  },
  {
    name: 'generate_product_copy',
    area: 'products',
    description: 'Write or rewrite a product description in the store voice and save it.',
    schema: { productId: { type: 'string', required: true }, angle: { type: 'string', help: 'Optional steer, e.g. "lead on durability".' } },
    handler(args, ctx) {
      const store = getStore(ctx.db, ctx.storeId)
      const product = getProduct(ctx.db, ctx.storeId, args.productId as string)
      if (!product) throw new Error('No product with that id')
      const brief = readBrief(`${store?.prompt ?? ''} ${product.title} ${(args.angle as string) ?? ''}`)
      const draft = draftProducts(brief, store?.name ?? 'the store')[0]
      const description = draft?.description ?? product.description
      updateProduct(ctx.db, ctx.storeId, product.id, { description, subtitle: product.subtitle || (draft?.subtitle ?? '') })
      return { summary: `Rewrote the description for ${product.title} (${description.split(/\s+/).length} words).`, data: { description } }
    },
  },
  {
    name: 'enhance_image',
    area: 'products',
    description: 'Render four enhanced versions of a product image in one preset and attach the chosen lane.',
    schema: {
      productId: { type: 'string', required: true },
      preset: { type: 'string', enum: PRESET_IDS as unknown as string[], default: 'white-seamless' },
      attachLane: { type: 'number', integer: true, min: 0, max: 3, help: 'Leave empty to return the contact sheet without attaching.' },
    },
    async handler(args, ctx) {
      const store = getStore(ctx.db, ctx.storeId)
      const product = getProduct(ctx.db, ctx.storeId, args.productId as string)
      if (!product) throw new Error('No product with that id')
      const sheet = await enhance({
        subject: `${product.title} ${store?.name ?? ''}`,
        preset: args.preset as PresetId,
        kind: 'product',
        label: product.title,
        ...(store?.brand ? { palette: store.brand } : {}),
      })
      const lane = args.attachLane as number | undefined
      if (lane !== undefined && sheet.lanes[lane]) {
        const chosen = sheet.lanes[lane] as string
        updateProduct(ctx.db, ctx.storeId, product.id, {
          heroImage: chosen,
          media: [{ url: chosen, alt: `${product.title}, ${args.preset}` }, ...product.media].slice(0, 6),
        })
      }
      return {
        summary: `Rendered four ${args.preset} lanes for ${product.title} in ${sheet.tookMs}ms${lane !== undefined ? `, attached lane ${lane}` : ''}.`,
        artifacts: [{ type: 'image', urls: sheet.lanes, caption: `${product.title} — ${args.preset}` }],
      }
    },
  },
  {
    name: 'generate_product_image',
    area: 'products',
    description: 'Generate a fresh image for a product from a described scene and attach it.',
    schema: {
      productId: { type: 'string', required: true },
      scene: { type: 'string', required: true, help: 'What the picture should show.' },
      preset: { type: 'string', enum: PRESET_IDS as unknown as string[], default: 'lifestyle' },
    },
    async handler(args, ctx) {
      const store = getStore(ctx.db, ctx.storeId)
      const product = getProduct(ctx.db, ctx.storeId, args.productId as string)
      if (!product) throw new Error('No product with that id')
      const url = await generate({
        subject: `${product.title}: ${args.scene as string}`,
        preset: args.preset as PresetId,
        kind: 'product',
        label: product.title,
        ...(store?.brand ? { palette: store.brand } : {}),
      })
      updateProduct(ctx.db, ctx.storeId, product.id, { media: [...product.media, { url, alt: args.scene as string }].slice(0, 8) })
      return { summary: `Added an image to ${product.title}.`, artifacts: [{ type: 'image', urls: [url], caption: args.scene as string }] }
    },
  },
])

/**
 * A colour option renders as a swatch, not as the word "Oxblood" in a box —
 * but only when the value is a colour we can actually name. Guessing a hex for
 * "Medium" would be worse than showing the word.
 */
const SWATCHES: Record<string, string> = {
  natural: '#c9b79c', tan: '#b8834a', brown: '#6b4423', black: '#1f1f1f', white: '#f4f1ec',
  cream: '#f0e8db', bone: '#e8e1d4', oxblood: '#5d1f28', burgundy: '#5d1f28', red: '#9c2b1f',
  navy: '#1f2c4a', blue: '#2f4f7a', green: '#4d6b3c', olive: '#5f6135', sage: '#9aa88a',
  grey: '#8a8780', gray: '#8a8780', charcoal: '#3a3a38', sand: '#ded1ba', ash: '#b7b2a8',
  gold: '#b08d3f', silver: '#b9bcc0', pink: '#d8a7b1', terracotta: '#c2622c',
}

function swatchFor(value: string): string | undefined {
  return SWATCHES[value.trim().toLowerCase()]
}

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((prefix) => list.map((entry) => [...prefix, entry])), [[]])
}
