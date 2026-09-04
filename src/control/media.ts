import { json, type Db } from '../lib/db.ts'
import { listUploads } from '../lib/uploads.ts'

export type StoreMedia = {
  url: string
  source: 'Brand' | 'Product' | 'Variant' | 'Collection' | 'Page' | 'Review' | 'Creative' | 'Upload'
  label: string
  uploadedAt: string | null
  bytes: number | null
}

const explicitImage = /(?:\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)|\/_uploads\/|\/_media\/)/i

/**
 * A store's image library is a view over the source of truth, not another
 * gallery a caller has to remember to update. It includes owned files plus
 * images referenced by commerce records, block pages and imported HTML.
 */
export function listStoreMedia(db: Db, storeId: string): StoreMedia[] {
  const found = new Map<string, StoreMedia>()
  const add = (value: unknown, source: StoreMedia['source'], label: string, options: { uploadedAt?: string | null; bytes?: number | null; trusted?: boolean } = {}) => {
    if (typeof value !== 'string') return
    const url = value.trim()
    if (!url || url.startsWith('data:') || url.startsWith('<svg')) return
    if (!options.trusted && !explicitImage.test(url)) return
    if (!/^(?:https?:\/\/|\/)/i.test(url)) return
    const current = found.get(url)
    if (current) {
      if (!current.uploadedAt && options.uploadedAt) current.uploadedAt = options.uploadedAt
      if (current.bytes === null && options.bytes !== undefined) current.bytes = options.bytes
      return
    }
    found.set(url, { url, source, label, uploadedAt: options.uploadedAt ?? null, bytes: options.bytes ?? null })
  }
  const walk = (value: unknown, source: StoreMedia['source'], label: string, key = '') => {
    if (typeof value === 'string') {
      if (/image|photo|media|hero|logo|poster|background|src|url/i.test(key) || explicitImage.test(value)) add(value, source, label, { trusted: /image|photo|media|hero|logo|poster|background|src/i.test(key) })
      return
    }
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, source, label, key))
    else if (value && typeof value === 'object') Object.entries(value as Record<string, unknown>).forEach(([childKey, entry]) => walk(entry, source, label, childKey))
  }

  const store = db.one<{ brand: string; reference_image: string }>('SELECT brand, reference_image FROM stores WHERE id = ?', storeId)
  if (store) {
    add(store.reference_image, 'Brand', 'Reference image', { trusted: true })
    const brand = json<Record<string, unknown>>(store.brand, {})
    add(brand.logoSvg, 'Brand', 'Logo', { trusted: true })
    walk(brand, 'Brand', 'Brand kit')
  }

  for (const product of db.all<{ id: string; title: string; hero_image: string; media: string; metadata: string; updated_at: string }>('SELECT id, title, hero_image, media, metadata, updated_at FROM products WHERE store_id = ?', storeId)) {
    add(product.hero_image, 'Product', `${product.title} hero`, { trusted: true, uploadedAt: product.updated_at })
    walk(json(product.media, []), 'Product', product.title)
    walk(json(product.metadata, {}), 'Product', product.title)
  }
  for (const variant of db.all<{ title: string; image: string }>('SELECT title, image FROM variants WHERE store_id = ?', storeId)) add(variant.image, 'Variant', variant.title, { trusted: true })
  for (const collection of db.all<{ title: string; image: string }>('SELECT title, image FROM collections WHERE store_id = ?', storeId)) add(collection.image, 'Collection', collection.title, { trusted: true })
  for (const page of db.all<{ title: string; blocks: string; raw_html: string; seo: string; updated_at: string }>('SELECT title, blocks, raw_html, seo, updated_at FROM pages WHERE store_id = ?', storeId)) {
    walk(json(page.blocks, []), 'Page', page.title)
    walk(json(page.seo, {}), 'Page', page.title)
    for (const match of page.raw_html.matchAll(/<(?:img|source)\b[^>]*(?:src|srcset)=["']([^"']+)/gi)) add(match[1], 'Page', page.title, { trusted: true, uploadedAt: page.updated_at })
    for (const match of page.raw_html.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) add(match[1], 'Page', page.title)
  }
  for (const review of db.all<{ author: string; media: string }>('SELECT author, media FROM reviews WHERE store_id = ?', storeId)) walk(json(review.media, []), 'Review', review.author || 'Customer photo')
  for (const creative of db.all<{ title: string; body: string }>('SELECT title, body FROM creative_queue WHERE store_id = ?', storeId)) walk(json(creative.body, {}), 'Creative', creative.title || 'Creative')

  for (const upload of listUploads(storeId)) add(upload.url, 'Upload', upload.url.split('/').pop() ?? 'Upload', { trusted: true, uploadedAt: upload.uploadedAt, bytes: upload.bytes })

  return [...found.values()].sort((a, b) => {
    const date = (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? '')
    return date || a.source.localeCompare(b.source) || a.label.localeCompare(b.label)
  })
}

export function storeCoverImage(db: Db, storeId: string): string {
  return listStoreMedia(db, storeId).find((asset) => asset.source === 'Brand' || asset.source === 'Product' || asset.source === 'Page')?.url ?? ''
}
