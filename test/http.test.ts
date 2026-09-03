import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The whole thing, over HTTP, with no mocks: register, onboard from one
 * sentence, walk the admin, drive the assistant, then buy something from the
 * generated storefront and watch the order land in the admin.
 */
const dir = mkdtempSync(join(tmpdir(), 'amboras-test-'))
process.env.AMBORAS_DB = join(dir, 'test.db')
process.env.PORT = '0'
process.env.AMBORAS_LOG_LEVEL = 'error'

const { server } = await import('../src/main.ts')
await new Promise<void>((resolve) => (server.listening ? resolve() : server.once('listening', () => resolve())))
const address = server.address()
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`

after(() => {
  server.close()
  rmSync(dir, { recursive: true, force: true })
})

const jar = new Map<string, string>()

async function call(path: string, init: { method?: string; form?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }
  let body: string | undefined
  if (init.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(init.form).toString()
  }
  const response = await fetch(`${base}${path}`, { method: init.method ?? (init.form ? 'POST' : 'GET'), headers, ...(body ? { body } : {}), redirect: 'manual' })
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';')
    const [name, value = ''] = (pair ?? '').split('=')
    if (name) jar.set(name.trim(), decodeURIComponent(value))
  }
  return { status: response.status, location: response.headers.get('location') ?? '', text: await response.text() }
}

let slug = ''

test('the marketing page, login and register are served', async () => {
  assert.equal((await call('/')).status, 200)
  assert.match((await call('/')).text, /AI-native/)
  assert.equal((await call('/login')).status, 200)
  assert.equal((await call('/healthz')).status, 200)
  assert.equal((await call('/nope')).status, 404)
})

test('an unauthenticated admin request is sent to the login page', async () => {
  const response = await fetch(`${base}/admin`, { headers: { accept: 'text/html' }, redirect: 'manual' })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), '/login')
})

test('registering lands on onboarding, and one sentence builds a store', async () => {
  const registered = await call('/register', { form: { email: 'franz@example.com', password: 'a-long-enough-password', name: 'Franz' } })
  assert.equal(registered.location, '/onboarding')
  assert.match((await call('/onboarding')).text, /What are you selling/)

  const short = await call('/onboarding', { form: { prompt: 'shoes' } })
  assert.match(short.location, /error=/, 'a two-word prompt is refused rather than guessed at')

  const built = await call('/onboarding', {
    form: { prompt: 'A hand-stitched boxing gear store called Ironjaw & Co, heritage leather atelier in Mexico City', planSlug: 'starter' },
  })
  assert.match(built.location, /^\/admin\?flash=/)
  assert.match(decodeURIComponent(built.location), /Ironjaw & Co is built/)

  const dashboard = await call('/admin')
  assert.equal(dashboard.status, 200)
  assert.match(dashboard.text, /Hello Franz/)
  assert.match(dashboard.text, /Ironjaw/)
  slug = /\/s\/([a-z0-9-]+)/.exec(dashboard.text)?.[1] ?? ''
  assert.ok(slug, 'the dashboard links a live preview')
})

test('every admin page renders', async () => {
  for (const path of [
    '/admin', '/admin/ai', '/admin/products', '/admin/orders', '/admin/customers', '/admin/collections',
    '/admin/promotions', '/admin/analytics', '/admin/reviews', '/admin/store', '/admin/marketing',
    '/admin/plugins', '/admin/settings',
  ]) {
    const response = await call(path)
    assert.equal(response.status, 200, `${path} responded ${response.status}`)
    assert.match(response.text, /Amboras Business Assistant/, `${path} carries the assistant panel`)
  }
})

test('the assistant executes a real change from the panel', async () => {
  const asked = await call('/admin/ask', { form: { text: 'Add a product called "The Road Bag" for $210', page: 'products' } })
  assert.equal(asked.status, 302)
  const products = await call('/admin/products')
  assert.match(products.text, /The Road Bag/)
  const ai = await call('/admin/ai')
  assert.match(ai.text, /Created The Road Bag/)
})

test('a risky action is refused from the panel until it is confirmed', async () => {
  const products = await call('/admin/products?search=Road')
  const productId = /prod_[a-z0-9]+/.exec(products.text)?.[0] ?? ''
  const refused = await call('/admin/ask', { form: { text: `delete product ${productId}`, page: 'products' } })
  assert.equal(refused.status, 302)
  assert.match((await call('/admin/products')).text, /The Road Bag/, 'still there')
})

test('the generated storefront serves a home page, a PDP and its structured data', async () => {
  const home = await call(`/s/${slug}/`)
  assert.equal(home.status, 200)
  assert.match(home.text, /Ironjaw/)
  assert.ok(!home.text.includes('DRAFT PREVIEW'), 'the live path is not a draft preview')
  assert.match((await call(`/preview/${slug}/`)).text, /DRAFT PREVIEW/, 'the draft path says so plainly')

  const handle = /\/products\/([a-z0-9-]+)/.exec(home.text)?.[1] ?? ''
  const pdp = await call(`/s/${slug}/products/${handle}`)
  assert.equal(pdp.status, 200)
  assert.match(pdp.text, /application\/ld\+json/)
  assert.match(pdp.text, /"@type":"Product"/)
  assert.match(pdp.text, /"@type":"BreadcrumbList"/)
  assert.match(pdp.text, /Add to cart/)
  assert.match(pdp.text, /class="pill"|class="swatch"/, 'options render as pills or swatches')

  assert.match((await call(`/s/${slug}/sitemap.xml`)).text, /<urlset/)
  assert.match((await call(`/s/${slug}/robots.txt`)).text, /Sitemap:/)
  assert.match((await call(`/s/${slug}/llms.txt`)).text, /## What we sell/)
})

test('a visitor can buy something, and the order shows up in the admin', async () => {
  const collection = await call(`/s/${slug}/collections/all`)
  const handle = /\/products\/([a-z0-9-]+)/.exec(collection.text)?.[1] ?? ''
  const pdp = await call(`/s/${slug}/products/${handle}`)
  const variantId = /id="pdp-variant" value="(var_[a-z0-9]+)"/.exec(pdp.text)?.[1] ?? ''
  assert.ok(variantId)

  await call(`/s/${slug}/cart/add`, { form: { variantId, quantity: '2' } })
  await call(`/s/${slug}/cart/code`, { form: { code: 'WELCOME10' } })
  const cart = await call(`/s/${slug}/cart`)
  assert.match(cart.text, /Welcome offer/)
  assert.match(cart.text, /Buy two, save 15%/, 'the automatic bundle stacks with the code')

  const bad = await call(`/s/${slug}/checkout`, { form: { email: 'not-an-email', name: 'X' } })
  assert.equal(bad.status, 400)
  assert.match(bad.text, /valid email/)

  const placed = await call(`/s/${slug}/checkout`, {
    form: { email: 'buyer@example.com', name: 'A Buyer', line1: '1 Road', city: 'Austin', postal: '78701', country: 'US' },
  })
  assert.match(placed.location, /\/orders\/order_/)
  const confirmation = await call(placed.location.replace(base, ''))
  assert.match(confirmation.text, /Thank you/)

  const orders = await call('/admin/orders')
  assert.match(orders.text, /buyer@example.com/)
  const analytics = await call('/admin/analytics')
  assert.match(analytics.text, /checkout.complete/)
})

test('publishing takes the draft live', async () => {
  const published = await call('/admin/publish', { form: {} })
  assert.equal(published.status, 302)
  assert.match(published.location.replace(/\+/g, ' '), /Published v\d/)
})

test('generated imagery is served and cached hard', async () => {
  const response = await fetch(`${base}/_media/render.svg?s=1&k=product&l=Test`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8')
  assert.match(response.headers.get('cache-control') ?? '', /immutable/)
  assert.match(await response.text(), /^<svg/)
})

test('the activity stream is a long-lived response the router does not step on', async () => {
  const controller = new AbortController()
  const response = await fetch(`${base}/admin/activity`, {
    headers: { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') },
    signal: controller.signal,
  })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/)
  controller.abort()
  // The server has to still be answering afterwards: a stream that crashes the
  // process on close is how a whole admin goes down.
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal((await fetch(`${base}/healthz`)).status, 200)
})
