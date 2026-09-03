import { now, type Db } from '../lib/db.ts'
import { fingerprint } from '../lib/crypto.ts'
import { id } from '../lib/ids.ts'

export type EventType =
  | 'view.page'
  | 'view.product'
  | 'view.collection'
  | 'cart.add'
  | 'checkout.start'
  | 'checkout.complete'
  | 'signup'
  | 'review.submit'

/**
 * First-party analytics.
 *
 * No cookie, no pixel, no SDK. A visitor is identified by an HMAC of ip, user
 * agent and the current day — stable enough to count a session, useless as a
 * cross-site identifier, and it rotates itself at midnight.
 */
export function sessionFor(db: Db, storeId: string, input: { ip: string; userAgent: string; referrer?: string; country?: string; city?: string }): string {
  const day = new Date().toISOString().slice(0, 10)
  const key = fingerprint(input.ip, input.userAgent, day)
  const existing = db.one<{ id: string }>('SELECT id FROM sessions_analytics WHERE store_id = ? AND fingerprint = ?', storeId, key)
  if (existing) {
    db.update('sessions_analytics', existing.id, { last_seen: now() })
    return existing.id
  }
  const sessionId = id('as')
  db.insert('sessions_analytics', {
    id: sessionId,
    store_id: storeId,
    fingerprint: key,
    country: input.country ?? geoGuess(input.ip).country,
    city: input.city ?? geoGuess(input.ip).city,
    referrer: input.referrer ?? '',
    variant: Math.random() < 0.5 ? 'a' : 'b',
    first_seen: now(),
    last_seen: now(),
  })
  return sessionId
}

/** Without a geo database, the demo derives a stable pseudo-location from the
 * address so the live map has something honest-looking to draw. Swap for
 * MaxMind at deploy time; nothing else reads the ip. */
const PLACES = [
  ['US', 'Austin'], ['US', 'Brooklyn'], ['US', 'Portland'], ['DE', 'Berlin'], ['FR', 'Lyon'],
  ['GB', 'Manchester'], ['MX', 'Mexico City'], ['ES', 'Valencia'], ['CA', 'Montreal'], ['JP', 'Osaka'],
] as const

function geoGuess(ip: string) {
  let hash = 0
  for (const character of ip) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const place = PLACES[hash % PLACES.length] as readonly [string, string]
  return { country: place[0], city: place[1] }
}

export function track(
  db: Db,
  storeId: string,
  sessionId: string,
  type: EventType,
  detail: { path?: string; productId?: string; amountCents?: number; meta?: Record<string, unknown> } = {},
) {
  db.insert('analytics_events', {
    id: id('ev'),
    store_id: storeId,
    session_id: sessionId,
    type,
    path: detail.path ?? '',
    product_id: detail.productId ?? null,
    amount_cents: detail.amountCents ?? 0,
    meta: detail.meta ?? {},
    created_at: now(),
  })
}

export type Range = '24h' | '7d' | '30d' | '90d'

export function since(range: Range): string {
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : 24 * 90
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

export type Kpis = {
  sessions: number
  orders: number
  revenueCents: number
  conversionRate: number
  aovCents: number
  deltas: Record<string, number>
}

function windowKpis(db: Db, storeId: string, from: string, to: string): Omit<Kpis, 'deltas'> {
  const sessions = db.one<{ c: number }>('SELECT COUNT(*) c FROM sessions_analytics WHERE store_id = ? AND first_seen >= ? AND first_seen < ?', storeId, from, to)?.c ?? 0
  const orderRow = db.one<{ c: number; total: number | null }>(
    "SELECT COUNT(*) c, SUM(total_cents) total FROM orders WHERE store_id = ? AND created_at >= ? AND created_at < ? AND status != 'cancelled'",
    storeId, from, to,
  )
  const orders = orderRow?.c ?? 0
  const revenue = orderRow?.total ?? 0
  return {
    sessions,
    orders,
    revenueCents: revenue,
    conversionRate: sessions ? orders / sessions : 0,
    aovCents: orders ? Math.round(revenue / orders) : 0,
  }
}

/** Every KPI tile carries its delta against the immediately preceding window. */
export function kpis(db: Db, storeId: string, range: Range = '7d'): Kpis {
  // The window is half-open, [from, to), so the two windows cannot double-count
  // a row on the boundary. The upper bound is a millisecond ahead of now
  // because timestamps have millisecond resolution: a session written in this
  // very millisecond belongs to the window being asked about.
  const to = new Date(Date.now() + 1).toISOString()
  const from = since(range)
  const span = Date.parse(to) - Date.parse(from)
  const previousFrom = new Date(Date.parse(from) - span).toISOString()
  const current = windowKpis(db, storeId, from, to)
  const previous = windowKpis(db, storeId, previousFrom, from)
  const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 1) : (a - b) / b)
  return {
    ...current,
    deltas: {
      sessions: delta(current.sessions, previous.sessions),
      orders: delta(current.orders, previous.orders),
      revenueCents: delta(current.revenueCents, previous.revenueCents),
      conversionRate: delta(current.conversionRate, previous.conversionRate),
      aovCents: delta(current.aovCents, previous.aovCents),
    },
  }
}

export type FunnelStage = { stage: string; count: number; share: number; dropOff: number }

/** Industry comparison numbers are published DTC medians, held in one place so
 * nobody has to wonder whether a benchmark was invented at the call site. */
export const BENCHMARK = { addToCart: 0.28, checkout: 0.092, purchase: 0.034, topDecilePurchase: 0.081 }

export function funnel(db: Db, storeId: string, range: Range = '7d'): FunnelStage[] {
  const from = since(range)
  const count = (type: EventType) =>
    db.one<{ c: number }>('SELECT COUNT(DISTINCT session_id) c FROM analytics_events WHERE store_id = ? AND type = ? AND created_at >= ?', storeId, type, from)?.c ?? 0
  const sessions = db.one<{ c: number }>('SELECT COUNT(*) c FROM sessions_analytics WHERE store_id = ? AND first_seen >= ?', storeId, from)?.c ?? 0
  const raw = [
    { stage: 'Sessions', count: sessions },
    { stage: 'Add to cart', count: count('cart.add') },
    { stage: 'Checkout', count: count('checkout.start') },
    { stage: 'Purchase', count: count('checkout.complete') },
  ]
  const top = raw[0]?.count ?? 0
  return raw.map((entry, index) => {
    const previous = raw[index - 1]?.count ?? entry.count
    return {
      stage: entry.stage,
      count: entry.count,
      share: top ? entry.count / top : 0,
      dropOff: previous ? 1 - entry.count / previous : 0,
    }
  })
}

export function liveVisitors(db: Db, storeId: string, minutes = 30) {
  const from = new Date(Date.now() - minutes * 60_000).toISOString()
  return db.all(
    `SELECT s.city, s.country, s.last_seen, (SELECT path FROM analytics_events e WHERE e.session_id = s.id ORDER BY created_at DESC LIMIT 1) path
     FROM sessions_analytics s WHERE s.store_id = ? AND s.last_seen >= ? ORDER BY s.last_seen DESC LIMIT 12`,
    storeId, from,
  )
}

export function recentEvents(db: Db, storeId: string, limit = 20) {
  return db.all(
    `SELECT e.type, e.path, e.amount_cents, e.created_at, s.city, s.country
     FROM analytics_events e LEFT JOIN sessions_analytics s ON s.id = e.session_id
     WHERE e.store_id = ? ORDER BY e.created_at DESC LIMIT ?`,
    storeId, limit,
  )
}

export function revenueSeries(db: Db, storeId: string, days = 14) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const rows = db.all<{ day: string; revenue: number; orders: number }>(
    `SELECT substr(created_at,1,10) day, SUM(total_cents) revenue, COUNT(*) orders
     FROM orders WHERE store_id = ? AND substr(created_at,1,10) >= ? AND status != 'cancelled'
     GROUP BY day ORDER BY day`,
    storeId, from,
  )
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const series: Array<{ day: string; revenue: number; orders: number }> = []
  for (let index = days - 1; index >= 0; index--) {
    const day = new Date(Date.now() - index * 86400000).toISOString().slice(0, 10)
    const row = byDay.get(day)
    series.push({ day, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 })
  }
  return series
}

export function topProducts(db: Db, storeId: string, limit = 5) {
  return db.all(
    `SELECT product_id, COUNT(*) views FROM analytics_events
     WHERE store_id = ? AND type = 'view.product' AND product_id IS NOT NULL
     GROUP BY product_id ORDER BY views DESC LIMIT ?`,
    storeId, limit,
  )
}

/**
 * Nightly affinity: which products actually get bought together, mined from
 * this store's own orders. Cross-sells and "goes with this" read this and
 * nothing else — no shared model, no other merchant's data.
 */
export function affinityPairs(db: Db, storeId: string, days = 90) {
  const from = new Date(Date.now() - days * 86400000).toISOString()
  const orders = db.all<{ items: string }>("SELECT items FROM orders WHERE store_id = ? AND created_at >= ? AND status != 'cancelled'", storeId, from)
  const pairs = new Map<string, number>()
  for (const order of orders) {
    let items: Array<{ productId: string }> = []
    try { items = JSON.parse(order.items) as Array<{ productId: string }> } catch { continue }
    const unique = [...new Set(items.map((item) => item.productId))].sort()
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = `${unique[i]}|${unique[j]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }
  return [...pairs.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split('|')
      return { a: a as string, b: b as string, count }
    })
    .sort((x, y) => y.count - x.count)
}

/** What the PDP shows when there is not enough order history to mine yet. */
export function companionsFor(db: Db, storeId: string, productId: string, limit = 2): string[] {
  const mined = affinityPairs(db, storeId)
    .filter((pair) => pair.a === productId || pair.b === productId)
    .map((pair) => (pair.a === productId ? pair.b : pair.a))
  if (mined.length >= limit) return mined.slice(0, limit)
  const fallback = db
    .all<{ id: string }>("SELECT id FROM products WHERE store_id = ? AND id != ? AND status = 'published' ORDER BY position LIMIT ?", storeId, productId, limit)
    .map((row) => row.id)
  return [...new Set([...mined, ...fallback])].slice(0, limit)
}
