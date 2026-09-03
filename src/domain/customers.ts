import { bool, json, now, type Db, type Row } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import type { Address } from './types.ts'

export type Customer = {
  id: string
  storeId: string
  email: string
  name: string
  marketing: boolean
  address: Address
  ordersCount: number
  spendCents: number
  tags: string[]
  createdAt: string
}

function rowToCustomer(row: Row): Customer {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    email: row.email as string,
    name: row.name as string,
    marketing: bool(row.marketing),
    address: json(row.address, {} as Address),
    ordersCount: row.orders_count as number,
    spendCents: row.spend_cents as number,
    tags: json(row.tags, [] as string[]),
    createdAt: row.created_at as string,
  }
}

export function listCustomers(db: Db, storeId: string, opts: { search?: string; limit?: number } = {}): Customer[] {
  if (opts.search) {
    const like = `%${opts.search}%`
    return db
      .all('SELECT * FROM customers WHERE store_id = ? AND (email LIKE ? OR name LIKE ?) ORDER BY spend_cents DESC LIMIT ?', storeId, like, like, opts.limit ?? 100)
      .map(rowToCustomer)
  }
  return db
    .all('SELECT * FROM customers WHERE store_id = ? ORDER BY created_at DESC LIMIT ?', storeId, opts.limit ?? 100)
    .map(rowToCustomer)
}

export function getCustomer(db: Db, storeId: string, idOrEmail: string): Customer | null {
  const row = db.one('SELECT * FROM customers WHERE store_id = ? AND (id = ? OR email = ? COLLATE NOCASE)', storeId, idOrEmail, idOrEmail)
  return row ? rowToCustomer(row) : null
}

/** Checkout upserts the customer; a guest checkout still produces a record. */
export function upsertCustomer(
  db: Db,
  storeId: string,
  input: { email: string; name?: string; marketing?: boolean; address?: Address },
): Customer {
  const existing = getCustomer(db, storeId, input.email)
  if (existing) {
    db.update('customers', existing.id, {
      name: input.name || existing.name,
      marketing: input.marketing ?? existing.marketing,
      address: input.address ?? existing.address,
    })
    return getCustomer(db, storeId, existing.id) as Customer
  }
  const customerId = id('cus')
  db.insert('customers', {
    id: customerId,
    store_id: storeId,
    email: input.email.toLowerCase(),
    name: input.name ?? '',
    marketing: input.marketing ?? false,
    address: input.address ?? {},
    orders_count: 0,
    spend_cents: 0,
    tags: [],
    created_at: now(),
  })
  return getCustomer(db, storeId, customerId) as Customer
}

export function recordPurchase(db: Db, customerId: string, totalCents: number) {
  db.run('UPDATE customers SET orders_count = orders_count + 1, spend_cents = spend_cents + ? WHERE id = ?', totalCents, customerId)
}

export function segment(db: Db, storeId: string) {
  const rows = db.all<{ orders_count: number; spend_cents: number }>('SELECT orders_count, spend_cents FROM customers WHERE store_id = ?', storeId)
  const repeat = rows.filter((row) => row.orders_count > 1).length
  const spend = rows.reduce((sum, row) => sum + row.spend_cents, 0)
  return {
    total: rows.length,
    repeat,
    repeatRate: rows.length ? repeat / rows.length : 0,
    lifetimeValueCents: rows.length ? Math.round(spend / rows.length) : 0,
  }
}
