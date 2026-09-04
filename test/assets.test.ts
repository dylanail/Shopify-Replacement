import assert from 'node:assert/strict'
import test from 'node:test'
import { fresh } from './helpers.ts'
import { createBlankAsset, importAssetFromUrl } from '../src/control/assets.ts'
import { getStore, listStores } from '../src/control/stores.ts'
import { buildState } from '../src/control/build.ts'
import { listFunnels } from '../src/domain/funnels.ts'
import { createProduct } from '../src/domain/catalog.ts'
import { createPage, newBlock } from '../src/pages/store.ts'
import { listStoreMedia } from '../src/control/media.ts'
import { storesPage } from '../src/admin/pages.ts'
import { shell } from '../src/admin/shell.ts'

test('stores and funnels are separate top-level assets', () => {
  const { db, user } = fresh()
  const store = createBlankAsset(db, user.id, { name: 'Catalog Brand', kind: 'store', currency: 'USD' })
  const funnel = createBlankAsset(db, user.id, { name: 'Focused Offer', kind: 'funnel', currency: 'EUR' })

  assert.equal(getStore(db, store.id)?.kind, 'store')
  assert.equal(getStore(db, funnel.id)?.kind, 'funnel')
  assert.equal(buildState(db, store.id).shape, 'store')
  assert.equal(buildState(db, funnel.id).shape, 'funnel')
  assert.equal(db.one<{ c: number }>('SELECT COUNT(*) c FROM regions WHERE store_id = ?', funnel.id)?.c, 1)

  const html = storesPage({ db, store, userName: 'Owner', storeUrl: `/s/${store.slug}` }, listStores(db, user.id))
  assert.match(html, /All assets/)
  assert.match(html, /Today/)
  assert.match(html, /30 days/)
  assert.match(html, /data-kind="store"/)
  assert.match(html, /data-kind="funnel"/)

  const funnelShell = shell({ store: funnel, stores: [store, funnel], active: 'funnels', title: 'Funnel', body: '', todos: [], messages: [], queue: [], publish: { label: 'Publish funnel', ready: false, reason: '' }, userName: 'Owner', storeUrl: `/s/${funnel.slug}` })
  assert.match(funnelShell, /Funnel pages/)
  assert.match(funnelShell, /Funnel flow/)
  assert.doesNotMatch(funnelShell, /Theme &amp; navigation/)
  const storeShell = shell({ store, stores: [store, funnel], active: 'store', title: 'Store', body: '', todos: [], messages: [], queue: [], publish: { label: 'Publish store', ready: false, reason: '' }, userName: 'Owner', storeUrl: `/s/${store.slug}` })
  assert.match(storeShell, /Theme &amp; navigation/)
  assert.doesNotMatch(storeShell, /Funnel flow/)
})

test('a URL creates an editable asset and strips source scripts', async () => {
  const { db, user } = fresh()
  const source = '<!doctype html><html><head><title>North Star | Shop</title><meta name="description" content="A useful shop"></head><body><h1>North Star</h1><a href="/products/widget?variant=2">Widget</a><script>window.tracker=true</script></body></html>'
  const fetchImpl = (async (input: string | URL | Request) => {
    const target = String(input)
    const body = target.includes('/products/widget') ? '<html><head><title>Widget | North Star</title></head><body><h1>Widget</h1></body></html>' : source
    const response = new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
    Object.defineProperty(response, 'url', { value: target })
    return response
  }) as typeof fetch

  const imported = await importAssetFromUrl(db, user.id, { url: 'https://northstar.example/', kind: 'funnel', fetchImpl })
  assert.equal(imported.store.kind, 'funnel')
  assert.equal(imported.page.mode, 'html')
  assert.equal(imported.page.role, 'offer')
  assert.equal(imported.page.sourceUrl, 'https://northstar.example/')
  assert.doesNotMatch(imported.page.rawHtml, /window\.tracker/)
  assert.equal(listFunnels(db, imported.store.id)[0]?.offerPageId, imported.page.id)

  const storeImport = await importAssetFromUrl(db, user.id, { url: 'https://northstar.example/', kind: 'store', fetchImpl })
  assert.equal(storeImport.pages.length, 2)
  assert.match(storeImport.page.rawHtml, new RegExp(`/pages/${storeImport.pages[1]?.handle}`))
  assert.doesNotMatch(storeImport.page.rawHtml, /northstar\.example\/products/)
})

test('the media library aggregates product and page imagery without duplicates', () => {
  const { db, user } = fresh()
  const store = createBlankAsset(db, user.id, { name: 'Media Brand', kind: 'store' })
  createProduct(db, store.id, {
    title: 'Hero Product',
    heroImage: 'https://cdn.example.com/hero.webp',
    media: [{ url: 'https://cdn.example.com/detail.jpg', alt: 'Detail' }],
    variants: [{ title: 'Default', priceCents: 2000, image: 'https://cdn.example.com/variant.png' }],
  })
  createPage(db, store.id, { title: 'Landing', blocks: [newBlock('image', { src: 'https://cdn.example.com/detail.jpg' }), newBlock('hero', { image: '/_media/render.svg?scene=hero' })] })

  const media = listStoreMedia(db, store.id)
  assert.ok(media.some((asset) => asset.url === 'https://cdn.example.com/hero.webp' && asset.source === 'Product'))
  assert.ok(media.some((asset) => asset.url === 'https://cdn.example.com/variant.png' && asset.source === 'Variant'))
  assert.ok(media.some((asset) => asset.url.startsWith('/_media/render.svg')))
  assert.equal(media.filter((asset) => asset.url === 'https://cdn.example.com/detail.jpg').length, 1)
})
