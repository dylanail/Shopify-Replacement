import assert from 'node:assert/strict'
import test from 'node:test'
import { fresh } from './helpers.ts'
import { open, seal, verifyPassword, hashPassword, fingerprint } from '../src/lib/crypto.ts'
import { check, validate, ValidationError } from '../src/lib/validate.ts'
import { Router } from '../src/lib/http.ts'
import { createStore, environment, getStore, publish, publishState, rollback, setTheme, storeForHost, addDomain, verifyDomain } from '../src/control/stores.ts'
import { requireRole, register, inviteTeammate, acceptInvite } from '../src/control/auth.ts'
import { planBySlug, requirePlan, PlanLimitError } from '../src/control/plans.ts'
import { getInstalled, install, readCredentials, renderSlot, setSlot, uninstall } from '../src/control/plugins.ts'
import { directoryEntries } from '../src/control/catalog-plugins.ts'
import { createProduct } from '../src/domain/catalog.ts'
import { createReview, flagsFor, statsFor } from '../src/domain/reviews.ts'
import { seedDefaultRegion } from '../src/domain/regions.ts'
import { funnel, kpis, sessionFor, track } from '../src/analytics/events.ts'
import { render } from '../src/email/templates.ts'
import { productJsonLd, validateProductSchema } from '../src/seo/schema.ts'

/* ------------------------------------------------------------------ platform */

test('passwords verify and sealed credentials round-trip', () => {
  const stored = hashPassword('a-long-enough-password')
  assert.ok(verifyPassword('a-long-enough-password', stored))
  assert.ok(!verifyPassword('a-long-enough-passwore', stored))
  const sealed = seal(JSON.stringify({ apiToken: 'shippo_live_secret' }))
  assert.ok(!sealed.includes('shippo_live_secret'))
  assert.equal(open(sealed), '{"apiToken":"shippo_live_secret"}')
  assert.equal(open('not.a.sealed'), null)
})

test('visitor fingerprints are stable within a day and not reversible', () => {
  const a = fingerprint('1.2.3.4', 'agent', '2026-09-03')
  assert.equal(a, fingerprint('1.2.3.4', 'agent', '2026-09-03'))
  assert.notEqual(a, fingerprint('1.2.3.4', 'agent', '2026-09-04'))
  assert.ok(!a.includes('1.2.3.4'))
})

test('the validator coerces, defaults and reports every issue at once', () => {
  const schema = {
    title: { type: 'string', required: true },
    count: { type: 'number', integer: true, min: 1 },
    live: { type: 'boolean', default: true },
    mode: { type: 'string', enum: ['a', 'b'] },
  } as const
  const value = validate(schema as never, { title: 'x', count: '3', mode: 'a' })
  assert.deepEqual(value, { title: 'x', count: 3, live: true, mode: 'a' })
  const bad = check(schema as never, { count: 0.5, mode: 'z' })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.issues.length, 4)
  assert.throws(() => validate(schema as never, {}), ValidationError)
})

test('the router matches params and wildcards and respects mounts', () => {
  const inner = new Router().get('/:id', () => 'one')
  const router = new Router().get('/a/:x/b', () => 'x').mount('/store', inner).get('/files/*', () => 'file')
  assert.deepEqual(router.match('GET', '/a/7/b')?.params, { x: '7' })
  assert.deepEqual(router.match('GET', '/store/42')?.params, { id: '42' })
  assert.equal(router.match('GET', '/files/deep/path')?.params.wildcard, 'deep/path')
  assert.equal(router.match('GET', '/a/7'), null)
  assert.equal(router.match('POST', '/a/7/b'), null)
})

/* -------------------------------------------------------------- control plane */

test('draft and live are separate, and publish and rollback move between them', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Split' })
  createProduct(db, store.id, { title: 'A product', status: 'published', variants: [{ title: 'One', priceCents: 100 }] })
  setTheme(db, store.id, { heroHeadline: 'DRAFT ONLY' })
  assert.equal(environment(db, store.id, 'live').theme.heroHeadline, undefined)
  assert.equal(publishState(db, store.id).ready, true)

  publish(db, store.id)
  assert.equal(environment(db, store.id, 'live').theme.heroHeadline, 'DRAFT ONLY')
  assert.equal(getStore(db, store.id)?.status, 'live')
  assert.equal(publishState(db, store.id).label, 'Store is live')

  setTheme(db, store.id, { heroHeadline: 'CHANGED' })
  assert.equal(publishState(db, store.id).label, 'Publish changes')
  rollback(db, store.id)
  assert.equal(environment(db, store.id, 'draft').theme.heroHeadline, 'DRAFT ONLY')
})

test('a store with no published product is not publishable', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Empty' })
  const state = publishState(db, store.id)
  assert.equal(state.ready, false)
  assert.match(state.reason, /at least one published product/)
})

test('store slugs are unguessable and resolve by host', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Ironjaw & Co' })
  assert.match(store.slug, /^ironjaw-and-co-[0-9a-z]{5}$/)
  assert.equal(storeForHost(db, `${store.slug}.amboras.test`, 'amboras.test')?.id, store.id)
  assert.equal(storeForHost(db, 'ironjaw-and-co.amboras.test', 'amboras.test'), null)

  addDomain(db, store.id, 'https://Ironjaw.co/shop')
  assert.equal(storeForHost(db, 'ironjaw.co', 'amboras.test'), null, 'unverified domains do not resolve')
  verifyDomain(db, store.id, 'ironjaw.co')
  assert.equal(storeForHost(db, 'ironjaw.co', 'amboras.test')?.id, store.id)
})

test('access is owner-or-member with no global bypass', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Private' })
  const outsider = register(db, { email: 'outsider@example.com', password: 'a-long-enough-password' })
  assert.equal(requireRole(db, user.id, store.id), 'owner')
  assert.throws(() => requireRole(db, outsider.id, store.id), /do not have access/)

  inviteTeammate(db, store.id, 'outsider@example.com', 'member')
  assert.equal(requireRole(db, outsider.id, store.id), 'member')
  assert.throws(() => requireRole(db, outsider.id, store.id, 'admin'), /needs admin access/)
})

test('an invite only activates when it is accepted', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Invites' })
  const { invite, joined } = inviteTeammate(db, store.id, 'later@example.com', 'admin')
  assert.equal(joined, false)
  const newcomer = register(db, { email: 'later@example.com', password: 'a-long-enough-password' })
  assert.throws(() => requireRole(db, newcomer.id, store.id), /do not have access/, 'a matching email alone is not access')
  assert.equal(acceptInvite(db, newcomer.id, invite), true)
  assert.equal(requireRole(db, newcomer.id, store.id), 'admin')
  assert.equal(acceptInvite(db, newcomer.id, invite), false, 'an invite cannot be redeemed twice')
})

test('plan limits name the upgrade instead of just refusing', () => {
  assert.doesNotThrow(() => requirePlan('launch', 'customDomain', 'A custom domain'))
  try {
    requirePlan('free', 'customDomain', 'A custom domain')
    assert.fail('should have refused')
  } catch (error) {
    assert.ok(error instanceof PlanLimitError)
    assert.equal(error.upgradeTo?.slug, 'launch')
    assert.match(error.message, /Basic includes it/)
  }
  assert.equal(planBySlug('nonsense').slug, 'free')
})

/* -------------------------------------------------------------------- plugins */

test('plugin settings are validated, secrets are sealed away from settings', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Plugged' })
  assert.throws(() => install(db, store.id, 'stripe', { publishableKey: 'nope', secretKey: 'sk_test_x' }), /not valid/)

  install(db, store.id, 'stripe', { publishableKey: 'pk_test_abc', secretKey: 'sk_test_xyz' })
  const installed = getInstalled(db, store.id, 'stripe')!
  assert.equal(installed.settings.publishableKey, 'pk_test_abc')
  assert.equal(installed.settings.secretKey, undefined, 'the secret never sits in settings')
  assert.equal(readCredentials(db, store.id, 'stripe').secretKey, 'sk_test_xyz')

  const raw = db.one<{ sealed: string }>('SELECT sealed FROM store_plugin_credentials WHERE store_id = ?', store.id)!
  assert.ok(!raw.sealed.includes('sk_test_xyz'))

  uninstall(db, store.id, 'stripe')
  assert.deepEqual(readCredentials(db, store.id, 'stripe'), {}, 'uninstall takes the credentials with it')
})

test('a directory listing refuses to pretend it installs', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Directory' })
  const listing = directoryEntries()[0]!.id
  assert.throws(() => install(db, store.id, listing, {}), /directory listing/)
})

test('a plan-gated plugin refuses on a plan that does not include it', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Gated' })
  assert.throws(() => install(db, store.id, 'klaviyo', { apiKey: 'pk_x' }), /higher plan/)
})

test('slots render into the storefront and are suppressed in the admin preview', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Slots' })
  install(db, store.id, 'ga4', { measurementId: 'G-ABC123' })
  const live = renderSlot(db, store.id, 'headEnd', {}, { preview: false })
  assert.match(live, /G-ABC123/)
  assert.equal(renderSlot(db, store.id, 'headEnd', {}, { preview: true }), '', 'no pixel fires against the merchant own iframe')
})

test('a merchant-choice component can only move to a slot it declares', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Placement' })
  install(db, store.id, 'upsells', {})
  setSlot(db, store.id, 'upsells', 'FrequentlyBoughtTogether', 'cartDrawer')
  assert.equal(getInstalled(db, store.id, 'upsells')?.slots.FrequentlyBoughtTogether, 'cartDrawer')
  assert.throws(() => setSlot(db, store.id, 'upsells', 'FrequentlyBoughtTogether', 'checkoutStart'), /cannot go in/)
})

/* -------------------------------------------------------------------- content */

test('reviews are flagged, never auto-rejected, and the summary quotes real reviewers', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Reviewed' })
  const product = createProduct(db, store.id, { title: 'Glove', status: 'published', variants: [{ title: 'One', priceCents: 100 }] })
  assert.deepEqual(flagsFor({ body: 'ok', author: 'A', rating: 5 }).sort(), ['thin five-star', 'very short'])
  assert.deepEqual(flagsFor({ body: 'Buy now at http://spam.example.com right now please', author: '', rating: 5 }).sort(), ['contains a link', 'no author'])

  const flagged = createReview(db, store.id, { productId: product.id, rating: 5, body: 'great', author: 'A' })
  assert.equal(flagged.status, 'pending', 'a flagged review waits for a human')

  for (const body of [
    'The stitching held up through four months of sparring and the leather darkened nicely.',
    'Stitching everywhere is doubled and the leather is genuinely excellent quality.',
    'Excellent leather, excellent stitching, and the wrist support has not softened at all.',
  ]) {
    createReview(db, store.id, { productId: product.id, rating: 5, body, author: 'Buyer', status: 'approved' })
  }
  const stats = statsFor(db, store.id, product.id)
  assert.equal(stats.count, 3)
  assert.equal(stats.average, 5)
  assert.ok(stats.summary.length > 0)
  assert.ok(stats.summary.every((line) => /reviewers mention/.test(line)))
})

test('structured data is complete once a product has reviews', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Schema Co' })
  const product = createProduct(db, store.id, {
    title: 'Glove',
    description: 'A real description that is long enough for a rich result.',
    heroImage: '/img.svg',
    status: 'published',
    variants: [{ title: 'One', priceCents: 34000 }, { title: 'Two', priceCents: 36000 }],
  })
  const bare = productJsonLd(getStore(db, store.id)!, product, 'https://example.com/p', statsFor(db, store.id, product.id))
  assert.equal((bare.offers as { lowPrice: string }).lowPrice, '340.00')
  assert.deepEqual(validateProductSchema(bare).map((issue) => issue.level), ['warning'])

  createReview(db, store.id, { productId: product.id, rating: 5, body: 'A proper review of reasonable length.', author: 'Buyer', status: 'approved' })
  const withRating = productJsonLd(getStore(db, store.id)!, product, 'https://example.com/p', statsFor(db, store.id, product.id))
  assert.deepEqual(validateProductSchema(withRating), [])
})

test('the email template language handles loops, conditionals and escaping', () => {
  const out = render(
    '{{#each items}}<i>{{title}}</i>{{/each}}{{#if code}}code {{code}}{{else}}no code{{/if}} {{customer.name}}',
    { items: [{ title: 'A' }, { title: '<b>' }], code: '', customer: { name: 'Ada & Co' } },
  )
  assert.equal(out, '<i>A</i><i>&lt;b&gt;</i>no code Ada &amp; Co')
})

/* ------------------------------------------------------------------ analytics */

test('kpis and the funnel are computed from real events', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Measured' })
  seedDefaultRegion(db, store.id, 'USD')
  for (let index = 0; index < 20; index++) {
    const session = sessionFor(db, store.id, { ip: `10.0.0.${index}`, userAgent: 'test' })
    track(db, store.id, session, 'view.page', { path: '/' })
    if (index < 8) track(db, store.id, session, 'cart.add')
    if (index < 4) track(db, store.id, session, 'checkout.start')
    if (index < 2) track(db, store.id, session, 'checkout.complete')
  }
  const stages = funnel(db, store.id, '7d')
  assert.deepEqual(stages.map((stage) => stage.count), [20, 8, 4, 2])
  assert.equal(stages[1]?.dropOff.toFixed(2), '0.60')
  assert.equal(kpis(db, store.id, '7d').sessions, 20)
})

test('one visitor across many requests is one session', () => {
  const { db, user } = fresh()
  const store = createStore(db, user.id, { name: 'Sessions' })
  const first = sessionFor(db, store.id, { ip: '10.0.0.1', userAgent: 'same' })
  const second = sessionFor(db, store.id, { ip: '10.0.0.1', userAgent: 'same' })
  assert.equal(first, second)
  assert.notEqual(first, sessionFor(db, store.id, { ip: '10.0.0.2', userAgent: 'same' }))
})
