import { json, now, type Db, type Row } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { getProduct, getVariant } from './catalog.ts'
import { applyPromotions } from './promotions.ts'
import { defaultRegion, getRegion, rateFor } from './regions.ts'
import type { LineItem, Totals } from './types.ts'

export type Cart = {
  id: string
  storeId: string
  email: string
  items: LineItem[]
  discountCode: string
  regionId: string | null
  orderId: string | null
  createdAt: string
  updatedAt: string
}

function rowToCart(row: Row): Cart {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    email: row.email as string,
    items: json(row.items, [] as LineItem[]),
    discountCode: row.discount_code as string,
    regionId: (row.region_id as string | null) ?? null,
    orderId: (row.order_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function getCart(db: Db, storeId: string, cartId: string): Cart | null {
  const row = db.one('SELECT * FROM carts WHERE id = ? AND store_id = ?', cartId, storeId)
  return row ? rowToCart(row) : null
}

export function createCart(db: Db, storeId: string): Cart {
  const cartId = id('cart')
  const timestamp = now()
  const region = defaultRegion(db, storeId)
  db.insert('carts', {
    id: cartId,
    store_id: storeId,
    email: '',
    items: [],
    discount_code: '',
    region_id: region?.id ?? null,
    order_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  })
  return getCart(db, storeId, cartId) as Cart
}

export function addToCart(db: Db, storeId: string, cartId: string, variantId: string, quantity = 1, source?: string): Cart {
  const cart = getCart(db, storeId, cartId) ?? createCart(db, storeId)
  const variant = getVariant(db, storeId, variantId)
  if (!variant) throw new Error(`No variant ${variantId}`)
  const product = getProduct(db, storeId, variant.productId)
  if (!product || product.status !== 'published') throw new Error('That product is not available')

  const items = [...cart.items]
  const existing = items.find((item) => item.variantId === variantId)
  if (existing) existing.quantity += quantity
  else {
    items.push({
      variantId,
      productId: product.id,
      title: product.title,
      variantTitle: variant.title,
      image: variant.image || product.heroImage,
      unitCents: variant.priceCents,
      quantity,
      ...(source ? { source } : {}),
    })
  }
  db.update('carts', cart.id, { items, updated_at: now() })
  return getCart(db, storeId, cart.id) as Cart
}

export function setQuantity(db: Db, storeId: string, cartId: string, variantId: string, quantity: number): Cart {
  const cart = getCart(db, storeId, cartId)
  if (!cart) throw new Error('No cart')
  const items = cart.items
    .map((item) => (item.variantId === variantId ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0)
  db.update('carts', cart.id, { items, updated_at: now() })
  return getCart(db, storeId, cart.id) as Cart
}

export function applyCode(db: Db, storeId: string, cartId: string, code: string): Cart {
  const cart = getCart(db, storeId, cartId)
  if (!cart) throw new Error('No cart')
  db.update('carts', cart.id, { discount_code: code.trim().toUpperCase(), updated_at: now() })
  return getCart(db, storeId, cart.id) as Cart
}

/**
 * One calculation, used by the cart drawer, the checkout, the order that gets
 * written, and the free-shipping-gap upsell. There is no second implementation
 * of pricing anywhere in the platform — that is how the drawer and the receipt
 * are guaranteed to agree.
 */
export function totals(db: Db, storeId: string, cart: Cart, opts: { isFirstOrder?: boolean } = {}): Totals {
  const region = cart.regionId ? getRegion(db, storeId, cart.regionId) : defaultRegion(db, storeId)
  const currency = region?.currency ?? 'USD'
  const subtotalCents = cart.items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0)
  const promo = applyPromotions(db, storeId, cart.items, {
    code: cart.discountCode,
    subtotalCents,
    ...(opts.isFirstOrder === undefined ? {} : { isFirstOrder: opts.isFirstOrder }),
  })
  const discounted = Math.max(0, subtotalCents - promo.discountCents)
  const rate = rateFor(region, discounted, promo.freeShipping)
  const shippingCents = cart.items.length ? rate.amountCents : 0
  const taxCents = Math.round(discounted * (region?.taxRate ?? 0))
  return {
    subtotalCents,
    discountCents: promo.discountCents,
    shippingCents,
    taxCents,
    totalCents: discounted + shippingCents + taxCents,
    currency,
    appliedPromotions: promo.applied,
    freeShippingGapCents: cart.items.length ? rate.gapCents : null,
  }
}
