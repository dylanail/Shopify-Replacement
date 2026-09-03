import type { Db } from '../lib/db.ts'
import { readUpload, saveUpload } from '../lib/uploads.ts'
import { getProduct, updateProduct } from '../domain/catalog.ts'
import { decodePng, encodeGif, inspectGif, isPng, type Rgba } from './gif.ts'
import { enqueue, getQueueItem, setQueueStatus, type QueueItem } from './briefs.ts'

/**
 * A product GIF: the product's renders, in order, as one looping image. It
 * goes into the creative queue for approval; approving it adds it to the
 * product's media so the gallery, a block or an ad can use it.
 */
export type GifRecord = { url: string; width: number; height: number; frames: number; sources: string[]; delay: number }

function frameFrom(url: string): Rgba | null {
  if (url.startsWith('data:image/png;base64,')) return decodePng(Buffer.from(url.slice('data:image/png;base64,'.length), 'base64'))
  if (url.startsWith('/_uploads/')) {
    const found = readUpload(url)
    if (!found || !isPng(found.data)) return null
    return decodePng(found.data)
  }
  return null
}

export type GifRequest = { productId: string; delay?: number; maxSide?: number; sources?: string[] }

export function makeProductGif(db: Db, storeId: string, request: GifRequest): QueueItem<GifRecord> {
  const product = getProduct(db, storeId, request.productId)
  if (!product) throw new Error('No product with that id')
  let sheet: { lanes?: string[] } = {}
  try { sheet = product.metadata.imageSheet ? (JSON.parse(product.metadata.imageSheet) as { lanes?: string[] }) : {} } catch { sheet = {} }
  const candidates = request.sources?.length ? request.sources : [...new Set([...(sheet.lanes ?? []), ...product.media.map((media) => media.url), product.heroImage].filter(Boolean))]
  const frames: Rgba[] = []
  const used: string[] = []
  const skipped: string[] = []
  for (const url of candidates) {
    try {
      const frame = frameFrom(url)
      if (frame) { frames.push(frame); used.push(url) } else skipped.push(url)
    } catch {
      skipped.push(url)
    }
    if (frames.length >= 12) break
  }
  if (frames.length < 2) throw new Error(`A GIF needs at least two PNG frames; found ${frames.length}.${skipped.length ? ' Skipped (not PNG): ' + skipped.map((url) => url.split('/').pop()).join(', ') + '. Render an image sheet or upload PNGs.' : ' Render an image sheet first.'}`)
  const bytes = encodeGif(frames, { delay: request.delay ?? 70, maxSide: request.maxSide ?? 480 })
  const saved = saveUpload({ name: `${product.handle}.gif`, type: 'image/gif', data: bytes }, storeId)
  const info = inspectGif(bytes)
  const record: GifRecord = { url: saved.url, width: info.width, height: info.height, frames: info.frames, sources: used, delay: request.delay ?? 70 }
  return enqueue<GifRecord>(db, storeId, { productId: product.id, kind: 'gif', title: `${product.title}: ${info.frames}-frame GIF`, body: record })
}

/** Approving a GIF puts it in the product's media; rejecting leaves the file but nothing points at it. */
export function approveGif(db: Db, storeId: string, itemId: string): QueueItem<GifRecord> | null {
  const item = getQueueItem<GifRecord>(db, storeId, itemId)
  if (!item || item.kind !== 'gif') return null
  const product = getProduct(db, storeId, item.productId)
  if (product && !product.media.some((media) => media.url === item.body.url)) {
    updateProduct(db, storeId, product.id, { media: [...product.media, { url: item.body.url, alt: `${product.title}, animated` }] })
  }
  setQueueStatus(db, storeId, itemId, 'approved')
  return getQueueItem<GifRecord>(db, storeId, itemId)
}
