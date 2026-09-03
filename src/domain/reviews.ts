import { bool, json, now, type Db, type Row } from '../lib/db.ts'
import { id } from '../lib/ids.ts'

export type Review = {
  id: string
  storeId: string
  productId: string
  rating: number
  title: string
  body: string
  author: string
  status: 'pending' | 'approved' | 'rejected'
  verified: boolean
  flags: string[]
  media: string[]
  reply: string
  createdAt: string
}

function rowToReview(row: Row): Review {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    productId: row.product_id as string,
    rating: row.rating as number,
    title: row.title as string,
    body: row.body as string,
    author: row.author as string,
    status: row.status as Review['status'],
    verified: bool(row.verified),
    flags: json(row.flags, [] as string[]),
    media: json(row.media, [] as string[]),
    reply: row.reply as string,
    createdAt: row.created_at as string,
  }
}

export function listReviews(
  db: Db,
  storeId: string,
  opts: { productId?: string; status?: string; minRating?: number; withPhoto?: boolean; verifiedOnly?: boolean; limit?: number } = {},
): Review[] {
  const where = ['store_id = ?']
  const params: unknown[] = [storeId]
  if (opts.productId) {
    where.push('product_id = ?')
    params.push(opts.productId)
  }
  if (opts.status && opts.status !== 'all') {
    where.push('status = ?')
    params.push(opts.status)
  }
  if (opts.minRating) {
    where.push('rating >= ?')
    params.push(opts.minRating)
  }
  if (opts.verifiedOnly) where.push('verified = 1')
  if (opts.withPhoto) where.push("media != '[]'")
  return db
    .all(`SELECT * FROM reviews WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`, ...params, opts.limit ?? 100)
    .map(rowToReview)
}

/**
 * Reviews are auto-flagged, never auto-rejected. The signals below are the
 * cheap deterministic pass; a merchant still makes the call in the queue.
 */
export function flagsFor(input: { body: string; author: string; rating: number }): string[] {
  const flags: string[] = []
  const body = input.body.trim()
  if (body.length < 15) flags.push('very short')
  if (/https?:\/\//i.test(body)) flags.push('contains a link')
  if (/(.)\1{5,}/.test(body)) flags.push('repeated characters')
  if (!input.author.trim()) flags.push('no author')
  if (body.split(/\s+/).length > 4 && body === body.toUpperCase()) flags.push('all caps')
  if (input.rating === 5 && body.split(/\s+/).length < 6) flags.push('thin five-star')
  return flags
}

export function createReview(
  db: Db,
  storeId: string,
  input: { productId: string; rating: number; title?: string; body?: string; author?: string; media?: string[]; verified?: boolean; status?: Review['status'] },
): Review {
  const reviewId = id('rev')
  const flags = flagsFor({ body: input.body ?? '', author: input.author ?? '', rating: input.rating })
  db.insert('reviews', {
    id: reviewId,
    store_id: storeId,
    product_id: input.productId,
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    title: input.title ?? '',
    body: input.body ?? '',
    author: input.author ?? 'Anonymous',
    status: input.status ?? (flags.length ? 'pending' : 'approved'),
    verified: input.verified ?? false,
    flags,
    media: input.media ?? [],
    reply: '',
    created_at: now(),
  })
  return rowToReview(db.one('SELECT * FROM reviews WHERE id = ?', reviewId) as Row)
}

export function moderate(db: Db, storeId: string, reviewId: string, status: Review['status']) {
  db.run('UPDATE reviews SET status = ? WHERE id = ? AND store_id = ?', status, reviewId, storeId)
}

export function replyTo(db: Db, storeId: string, reviewId: string, reply: string) {
  db.run('UPDATE reviews SET reply = ? WHERE id = ? AND store_id = ?', reply, reviewId, storeId)
}

export type ReviewStats = {
  count: number
  average: number
  distribution: Record<number, number>
  summary: string[]
}

/**
 * The PDP summary is extractive, not generated: the sentences shown are the
 * merchant's actual customers, ranked by how often their vocabulary recurs.
 * Nothing is invented, which is the only defensible way to summarise reviews.
 */
export function statsFor(db: Db, storeId: string, productId: string): ReviewStats {
  const reviews = listReviews(db, storeId, { productId, status: 'approved', limit: 500 })
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const review of reviews) distribution[review.rating] = (distribution[review.rating] ?? 0) + 1
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0

  const stop = new Set('the a an and or but of to in is it was for with my me i on so very really that this they them we you at as be been are had has have not just too all more most'.split(' '))
  const frequency = new Map<string, number>()
  for (const review of reviews) {
    for (const word of new Set(review.body.toLowerCase().match(/[a-z']{4,}/g) ?? [])) {
      if (stop.has(word)) continue
      frequency.set(word, (frequency.get(word) ?? 0) + 1)
    }
  }
  const themes = [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const summary = themes
    .map(([word, count]) => {
      const quote = reviews.find((review) => review.body.toLowerCase().includes(word))
      const sentence = quote?.body.split(/(?<=[.!?])\s+/).find((part) => part.toLowerCase().includes(word))
      return sentence ? `${sentence.trim()} (${count} reviewers mention "${word}")` : ''
    })
    .filter(Boolean)
  return { count: reviews.length, average: Math.round(average * 10) / 10, distribution, summary }
}
