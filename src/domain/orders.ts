import { json, now, type Db, type Row } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { releaseInventory, reserveInventory } from './catalog.ts'
import { getCart, totals as computeTotals, type Cart } from './cart.ts'
import { recordPurchase, upsertCustomer } from './customers.ts'
import { recordPromotionUse } from './promotions.ts'
import type { Address, LineItem, Order } from './types.ts'

export function rowToOrder(row: Row): Order {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    displayId: row.display_id as number,
    email: row.email as string,
    items: json(row.items, [] as LineItem[]),
    currency: row.currency as string,
    subtotalCents: row.subtotal_cents as number,
    discountCents: row.discount_cents as number,
    shippingCents: row.shipping_cents as number,
    taxCents: row.tax_cents as number,
    totalCents: row.total_cents as number,
    discountCode: row.discount_code as string,
    status: row.status as Order['status'],
    paymentStatus: row.payment_status as Order['paymentStatus'],
    fulfillmentStatus: row.fulfillment_status as Order['fulfillmentStatus'],
    address: json(row.address, {} as Address),
    fulfillments: json(row.fulfillments, []),
    refunds: json(row.refunds, []),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function listOrders(db: Db, storeId: string, opts: { status?: string; limit?: number; email?: string } = {}): Order[] {
  const where = ['store_id = ?']
  const params: unknown[] = [storeId]
  if (opts.status && opts.status !== 'all') {
    where.push('status = ?')
    params.push(opts.status)
  }
  if (opts.email) {
    where.push('email = ? COLLATE NOCASE')
    params.push(opts.email)
  }
  return db
    .all(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY display_id DESC LIMIT ?`, ...params, opts.limit ?? 100)
    .map(rowToOrder)
}

export function getOrder(db: Db, storeId: string, orderId: string): Order | null {
  const row = db.one('SELECT * FROM orders WHERE store_id = ? AND (id = ? OR display_id = ?)', storeId, orderId, Number(orderId) || -1)
  return row ? rowToOrder(row) : null
}

export class CheckoutError extends Error {}

/**
 * Completing a cart is the one place inventory, promotions, the customer
 * record and the order all move together. It runs in a single transaction: a
 * payment that fails after inventory came down would otherwise leave a store
 * short of stock it still has on the shelf.
 */
export function completeCart(
  db: Db,
  storeId: string,
  cartId: string,
  input: { email: string; name?: string; address?: Address; marketing?: boolean; paymentMethod?: string },
): Order {
  const cart = getCart(db, storeId, cartId)
  if (!cart) throw new CheckoutError('No cart')
  if (cart.orderId) return getOrder(db, storeId, cart.orderId) as Order
  if (!cart.items.length) throw new CheckoutError('Your cart is empty')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new CheckoutError('Enter a valid email address')

  const priorOrders = db.one<{ c: number }>('SELECT COUNT(*) c FROM orders WHERE store_id = ? AND email = ? COLLATE NOCASE', storeId, input.email)?.c ?? 0
  const amounts = computeTotals(db, storeId, cart, { isFirstOrder: priorOrders === 0 })

  const orderId = id('order')
  const timestamp = now()
  return db.tx(() => {
    const reserved: LineItem[] = []
    for (const item of cart.items) {
      if (!reserveInventory(db, item.variantId, item.quantity)) {
        for (const done of reserved) releaseInventory(db, done.variantId, done.quantity)
        throw new CheckoutError(`${item.title} — ${item.variantTitle} is out of stock`)
      }
      reserved.push(item)
    }
    const nextDisplay = (db.one<{ max: number | null }>('SELECT MAX(display_id) max FROM orders WHERE store_id = ?', storeId)?.max ?? 1000) + 1
    const customer = upsertCustomer(db, storeId, {
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.marketing === undefined ? {} : { marketing: input.marketing }),
    })
    db.insert('orders', {
      id: orderId,
      store_id: storeId,
      display_id: nextDisplay,
      email: input.email.toLowerCase(),
      customer_id: customer.id,
      items: cart.items,
      currency: amounts.currency,
      subtotal_cents: amounts.subtotalCents,
      discount_cents: amounts.discountCents,
      shipping_cents: amounts.shippingCents,
      tax_cents: amounts.taxCents,
      total_cents: amounts.totalCents,
      discount_code: cart.discountCode,
      status: 'completed',
      // The demo captures on completion; a live deployment flips this to
      // `awaiting` and lets the Stripe webhook move it to `captured`.
      payment_status: 'captured',
      fulfillment_status: 'unfulfilled',
      address: input.address ?? {},
      fulfillments: [],
      refunds: [],
      created_at: timestamp,
      updated_at: timestamp,
    })
    recordPurchase(db, customer.id, amounts.totalCents)
    recordPromotionUse(db, amounts.appliedPromotions.map((entry) => entry.id))
    db.update('carts', cart.id, { order_id: orderId, email: input.email, updated_at: timestamp })
    return getOrder(db, storeId, orderId) as Order
  })
}

export function fulfillOrder(db: Db, storeId: string, orderId: string, input: { provider?: string; tracking?: string } = {}): Order {
  const order = getOrder(db, storeId, orderId)
  if (!order) throw new Error('No order')
  const fulfillments = [
    ...order.fulfillments,
    { id: id('ful'), provider: input.provider ?? 'manual', tracking: input.tracking ?? '', createdAt: now() },
  ]
  db.update('orders', order.id, { fulfillments, fulfillment_status: 'fulfilled', updated_at: now() })
  return getOrder(db, storeId, order.id) as Order
}

export function refundOrder(db: Db, storeId: string, orderId: string, input: { amountCents?: number; reason?: string } = {}): Order {
  const order = getOrder(db, storeId, orderId)
  if (!order) throw new Error('No order')
  const alreadyRefunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const amount = Math.min(input.amountCents ?? order.totalCents - alreadyRefunded, order.totalCents - alreadyRefunded)
  if (amount <= 0) throw new Error('Nothing left to refund on this order')
  const refunds = [...order.refunds, { id: id('ref'), amountCents: amount, reason: input.reason ?? '', createdAt: now() }]
  const total = alreadyRefunded + amount
  db.update('orders', order.id, {
    refunds,
    payment_status: total >= order.totalCents ? 'refunded' : 'partially_refunded',
    updated_at: now(),
  })
  return getOrder(db, storeId, order.id) as Order
}

export function cancelOrder(db: Db, storeId: string, orderId: string): Order {
  const order = getOrder(db, storeId, orderId)
  if (!order) throw new Error('No order')
  if (order.status === 'cancelled') return order
  db.tx(() => {
    for (const item of order.items) releaseInventory(db, item.variantId, item.quantity)
    db.update('orders', order.id, { status: 'cancelled', fulfillment_status: 'unfulfilled', updated_at: now() })
  })
  return getOrder(db, storeId, order.id) as Order
}

export function returnOrder(db: Db, storeId: string, orderId: string, reason = ''): Order {
  const order = getOrder(db, storeId, orderId)
  if (!order) throw new Error('No order')
  db.tx(() => {
    for (const item of order.items) releaseInventory(db, item.variantId, item.quantity)
    db.update('orders', order.id, { fulfillment_status: 'returned', updated_at: now() })
  })
  return refundOrder(db, storeId, orderId, { reason: reason || 'Return accepted' })
}

export function salesSummary(db: Db, storeId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const rows = db.all<{ day: string; orders: number; revenue: number }>(
    `SELECT substr(created_at, 1, 10) day, COUNT(*) orders, SUM(total_cents) revenue
     FROM orders WHERE store_id = ? AND created_at >= ? AND status != 'cancelled'
     GROUP BY day ORDER BY day`,
    storeId,
    since,
  )
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const orders = rows.reduce((sum, row) => sum + row.orders, 0)
  return { series: rows, revenueCents: revenue, orders, aovCents: orders ? Math.round(revenue / orders) : 0 }
}

export type { Cart }
