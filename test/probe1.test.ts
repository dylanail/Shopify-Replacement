import test from 'node:test'
import { fresh } from './helpers.ts'
import { createStore } from '../src/control/stores.ts'
import { createProduct } from '../src/domain/catalog.ts'
import { setBuildMode, setSiteShape, pagePlan, buildProgress, saveAnswers, QUESTIONS } from '../src/control/build.ts'
import { createPage, pageTemplate, getPage } from '../src/pages/store.ts'
import { latestResearch } from '../src/agent/research.ts'

test('probe', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Probe Co', prompt: 'a probe' })
  const product = createProduct(db, store.id, { title: 'Widget', subtitle: 's', description: 'd', status: 'published', variants: [{ title: 'One', priceCents: 1000, inventory: 5 }] })
  setBuildMode(db, store.id, 'own-product')
  console.log('after setBuildMode only:', JSON.stringify(buildProgress(db, store.id).steps.map(s=>`${s.key}:${s.status}(${s.why})`), null, 0))
  setSiteShape(db, store.id, { shape: 'funnel', doors: ['advertorial','quiz'], popup: 'yes' })
  const plan0 = pagePlan(db, store.id)
  console.log('BEFORE', plan0.pages.map(p=>`${p.key}=${p.status}`).join(' '))
  // create quiz exactly as POST /admin/pages/new does
  const t = pageTemplate('quiz')
  const input = { storeName: store.name, product: { id: product.id, title: product.title, image: product.heroImage, subtitle: product.subtitle }, research: null }
  const created = createPage(db, store.id, { title: t.title(input as any), kind: t.kind, role: t.role, blocks: t.build(input as any), productId: product.id })
  console.log('created page status:', getPage(db, store.id, created.id)!.status, 'kind', created.kind, 'role', created.role)
  const plan1 = pagePlan(db, store.id)
  console.log('AFTER ', plan1.pages.map(p=>`${p.key}=${p.status}(${p.why}) href=${p.href}`).join(' | '))
  console.log('steps:', buildProgress(db, store.id).steps.map(s=>`${s.key}:${s.status}(${s.why})`).join(' | '))
})
