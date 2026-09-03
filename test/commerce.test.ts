import assert from 'node:assert/strict'
import test from 'node:test'
import { fresh } from './helpers.ts'
import { createStore } from '../src/control/stores.ts'
import { createProduct, getVariant, listProducts } from '../src/domain/catalog.ts'
import { seedDefaultRegion } from '../src/domain/regions.ts'
import { createPromotion } from '../src/domain/promotions.ts'
import { addToCart, applyCode, createCart, totals } from '../src/domain/cart.ts'
import { cancelOrder, CheckoutError, completeCart, refundOrder } from '../src/domain/orders.ts'

function shop() {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Test Store' })
  seedDefaultRegion(db, store.id, 'USD')
  const product = createProduct(db, store.id, {
    title: 'The Glove',
    status: 'published',
    variants: [{ title: '16oz', priceCents: 10000, inventory: 3 }],
  })
  return { db, store, product, variant: product.variants[0]! }
}

test('totals apply a percentage code and a free-shipping threshold together', () => {
  const { db, store, variant } = shop()
  createPromotion(db, store.id, { title: '10% off', kind: 'percentage', value: 10, code: 'TEN' })
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 3)
  applyCode(db, store.id, cart.id, 'TEN')
  const amounts = totals(db, store.id, { ...cart, discountCode: 'TEN' })
  assert.equal(amounts.subtotalCents, 30000)
  assert.equal(amounts.discountCents, 3000)
  // 27000 clears the 20000 free-shipping threshold seeded with the region.
  assert.equal(amounts.shippingCents, 0)
  assert.equal(amounts.totalCents, 27000)
})

test('the free-shipping gap is reported until the threshold is cleared', () => {
  const { db, store, variant } = shop()
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 1)
  const amounts = totals(db, store.id, cart)
  assert.equal(amounts.shippingCents, 900)
  assert.equal(amounts.freeShippingGapCents, 10000)
})

test('bogo discounts the cheapest qualifying units, not the dearest', () => {
  const { db, store, product } = shop()
  const cheap = createProduct(db, store.id, { title: 'Wrap', status: 'published', variants: [{ title: 'One', priceCents: 2000, inventory: 10 }] })
  createPromotion(db, store.id, { title: 'Buy 2 get 1', kind: 'bogo', rules: { buyQuantity: 2, getQuantity: 1 } })
  let cart = addToCart(db, store.id, createCart(db, store.id).id, product.variants[0]!.id, 2)
  cart = addToCart(db, store.id, cart.id, cheap.variants[0]!.id, 1)
  const amounts = totals(db, store.id, cart)
  assert.equal(amounts.discountCents, 2000)
})

test('a tiered promotion picks the highest tier the quantity reaches', () => {
  const { db, store, variant } = shop()
  createPromotion(db, store.id, {
    title: 'Buy more',
    kind: 'tiered',
    rules: { tiers: [{ quantity: 2, percent: 10 }, { quantity: 3, percent: 20 }] },
  })
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 3)
  assert.equal(totals(db, store.id, cart).discountCents, 6000)
})

test('a first-order-only promotion is skipped for a returning customer', () => {
  const { db, store, variant } = shop()
  createPromotion(db, store.id, { title: 'Welcome', kind: 'percentage', value: 10, code: 'WELCOME10', rules: { firstOrderOnly: true } })
  const first = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 1)
  applyCode(db, store.id, first.id, 'WELCOME10')
  assert.equal(totals(db, store.id, { ...first, discountCode: 'WELCOME10' }, { isFirstOrder: true }).discountCents, 1000)
  assert.equal(totals(db, store.id, { ...first, discountCode: 'WELCOME10' }, { isFirstOrder: false }).discountCents, 0)
})

test('checkout moves inventory, the customer record and the order together', () => {
  const { db, store, variant } = shop()
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 2)
  const order = completeCart(db, store.id, cart.id, { email: 'buyer@example.com', name: 'Buyer' })
  assert.equal(order.totalCents, 20000)
  assert.equal(getVariant(db, store.id, variant.id)?.inventory, 1)
  const customer = db.one<{ orders_count: number; spend_cents: number }>('SELECT orders_count, spend_cents FROM customers WHERE store_id = ?', store.id)
  assert.equal(customer?.orders_count, 1)
  assert.equal(customer?.spend_cents, 20000)
})

test('completing the same cart twice returns the first order rather than charging again', () => {
  const { db, store, variant } = shop()
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 1)
  const first = completeCart(db, store.id, cart.id, { email: 'buyer@example.com' })
  const second = completeCart(db, store.id, cart.id, { email: 'buyer@example.com' })
  assert.equal(first.id, second.id)
  assert.equal(getVariant(db, store.id, variant.id)?.inventory, 2)
})

test('an oversell is refused and leaves inventory untouched', () => {
  const { db, store, variant } = shop()
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 9)
  assert.throws(() => completeCart(db, store.id, cart.id, { email: 'buyer@example.com' }), CheckoutError)
  assert.equal(getVariant(db, store.id, variant.id)?.inventory, 3)
})

test('a partly reserved order rolls back every reservation it made', () => {
  const { db, store, product } = shop()
  const scarce = createProduct(db, store.id, { title: 'Scarce', status: 'published', variants: [{ title: 'Only', priceCents: 1000, inventory: 0 }] })
  let cart = addToCart(db, store.id, createCart(db, store.id).id, product.variants[0]!.id, 1)
  cart = addToCart(db, store.id, cart.id, scarce.variants[0]!.id, 1)
  assert.throws(() => completeCart(db, store.id, cart.id, { email: 'buyer@example.com' }), CheckoutError)
  assert.equal(getVariant(db, store.id, product.variants[0]!.id)?.inventory, 3)
})

test('cancelling an order returns its stock', () => {
  const { db, store, variant } = shop()
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 2)
  const order = completeCart(db, store.id, cart.id, { email: 'buyer@example.com' })
  cancelOrder(db, store.id, order.id)
  assert.equal(getVariant(db, store.id, variant.id)?.inventory, 3)
})

test('refunds cannot exceed the order total', () => {
  const { db, store, variant } = shop()
  const cart = addToCart(db, store.id, createCart(db, store.id).id, variant.id, 1)
  const order = completeCart(db, store.id, cart.id, { email: 'buyer@example.com' })
  const partial = refundOrder(db, store.id, order.id, { amountCents: 4000 })
  assert.equal(partial.paymentStatus, 'partially_refunded')
  const full = refundOrder(db, store.id, order.id, {})
  assert.equal(full.paymentStatus, 'refunded')
  assert.equal(full.refunds.reduce((sum, refund) => sum + refund.amountCents, 0), order.totalCents)
  assert.throws(() => refundOrder(db, store.id, order.id, {}), /Nothing left to refund/)
})

test('a draft product cannot be added to a cart', () => {
  const { db, store } = shop()
  const draft = createProduct(db, store.id, { title: 'Hidden', status: 'draft', variants: [{ title: 'One', priceCents: 1000 }] })
  assert.throws(() => addToCart(db, store.id, createCart(db, store.id).id, draft.variants[0]!.id, 1), /not available/)
})

test('handles stay unique inside a store', () => {
  const { db, store } = shop()
  createProduct(db, store.id, { title: 'The Glove', variants: [{ title: 'a', priceCents: 1 }] })
  const handles = listProducts(db, store.id, {}).map((product) => product.handle)
  assert.equal(new Set(handles).size, handles.length)
})
