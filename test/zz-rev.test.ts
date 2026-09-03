import test from 'node:test'
import { fresh } from './helpers.ts'
import { createStore } from '../src/control/stores.ts'
import { createProduct } from '../src/domain/catalog.ts'
import { createReview, listReviews } from '../src/domain/reviews.ts'

test('checkout proof reviews', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'S', prompt: 'gloves' })
  const hero = createProduct(db, store.id, { title: 'Glove', status: 'published', variants: [{ title: 'One', priceCents: 5000 }] })
  const other = createProduct(db, store.id, { title: 'Wrap', status: 'published', variants: [{ title: 'One', priceCents: 1000 }] })
  for (let i = 0; i < 20; i++) createReview(db, store.id, { productId: hero.id, rating: 5, body: `hero review ${i}`, author: 'A', status: 'approved' })
  for (let i = 0; i < 3; i++) createReview(db, store.id, { productId: other.id, rating: 5, body: `wrap review ${i}`, author: 'B', status: 'approved' })
  db.run("UPDATE reviews SET created_at = '2026-01-01T00:00:00.000Z' WHERE product_id = ?", hero.id)
  db.run("UPDATE reviews SET created_at = '2026-09-01T00:00:00.000Z' WHERE product_id = ?", other.id)
  // exactly what checkoutParts does, with a cart holding only the hero glove
  const items = [{ productId: hero.id }]
  const proof = listReviews(db, store.id, { status: 'approved', limit: 3 }).filter((r) => items.some((i) => i.productId === r.productId)).slice(0, 3)
  console.log('hero has', listReviews(db, store.id, { productId: hero.id, status: 'approved', limit: 100 }).length, 'approved reviews')
  console.log('reviews the checkout would show under the form:', proof.length)
})
