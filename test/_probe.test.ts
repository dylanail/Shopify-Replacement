import test from 'node:test'
import { fresh } from './helpers.ts'
import { createStore } from '../src/control/stores.ts'
import { createProduct } from '../src/domain/catalog.ts'
import { seedDefaultRegion } from '../src/domain/regions.ts'
import { upsertBundle } from '../src/domain/bundles.ts'
import { addToCart, createCart, totals } from '../src/domain/cart.ts'
import { createPromotion } from '../src/domain/promotions.ts'

test('probe: gift variant cannot be bought', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'S' })
  seedDefaultRegion(db, store.id, 'USD')
  const glove = createProduct(db, store.id, { title: 'Glove', status: 'published', variants: [{ title: '16oz', priceCents: 10000, inventory: 50 }] })
  const wrap = createProduct(db, store.id, { title: 'Wrap', status: 'published', variants: [{ title: 'One', priceCents: 2000, inventory: 50 }] })
  upsertBundle(db, store.id, { productId: glove.id, tiers: [
    { quantity: 1, discountPercent: 0, label: 'Buy 1' },
    { quantity: 2, discountPercent: 15, label: 'Buy 2', giftVariantId: wrap.variants[0]!.id, giftLabel: 'free wraps' },
  ] })
  let cart = addToCart(db, store.id, createCart(db, store.id).id, glove.variants[0]!.id, 2)
  console.log('after 2 gloves:', JSON.stringify(cart.items.map(i => ({v:i.variantTitle,q:i.quantity,u:i.unitCents,g:i.giftOf}))))
  cart = addToCart(db, store.id, cart.id, wrap.variants[0]!.id, 3)
  console.log('after adding 3 PAID wraps:', JSON.stringify(cart.items.map(i => ({v:i.variantTitle,q:i.quantity,u:i.unitCents,g:i.giftOf}))))
  console.log('totals:', JSON.stringify(totals(db, store.id, cart)))
})

test('probe: stacking two automatic promos over-reports', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'S' })
  seedDefaultRegion(db, store.id, 'USD')
  const p = createProduct(db, store.id, { title: 'Glove', status: 'published', variants: [{ title: '16oz', priceCents: 10000, inventory: 50 }] })
  createPromotion(db, store.id, { title: 'Sixty', kind: 'percentage', value: 60, automatic: true })
  createPromotion(db, store.id, { title: 'Another sixty', kind: 'percentage', value: 60, automatic: true })
  const cart = addToCart(db, store.id, createCart(db, store.id).id, p.variants[0]!.id, 1)
  console.log('totals:', JSON.stringify(totals(db, store.id, cart), null, 1))
})

test('probe: bundle widget rounding vs cart engine', () => {
  for (const unit of [999, 1995, 2999, 3333, 4995, 1010, 1050, 3050]) {
    for (const [q, pct] of [[2,15],[3,25],[2,10],[3,15]] as Array<[number,number]>) {
      const full = unit * q
      const widget = Math.round(full * (1 - pct / 100))
      const engine = full - Math.round((full * pct) / 100)
      if (widget !== engine) console.log('MISMATCH', { unit, q, pct, full, widget, engine })
    }
  }
})
