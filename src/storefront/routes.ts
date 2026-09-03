import { getDb } from '../lib/db.ts'
import { badRequest, escapeHtml, html, notFound, redirect, Raw, Router, setCookie, type Ctx } from '../lib/http.ts'
import { addToCart, applyCode, attachPaymentIntent, createCart, getCart, saveCheckoutDraft, setQuantity, setShipping, totals } from '../domain/cart.ts'
import { getRegion, defaultRegion } from '../domain/regions.ts'
import { orderByPaymentIntent, recordUpsell, setPaymentStatus } from '../domain/orders.ts'
import { getPage, homePage } from '../pages/store.ts'
import { stripeFor, verifyWebhookSignature } from '../payments/stripe.ts'
import { upsertCustomer } from '../domain/customers.ts'
import { logger } from '../lib/log.ts'
import type { LineItem } from '../domain/types.ts'
import { getCollection, getProduct, listCollections, listProducts } from '../domain/catalog.ts'
import { findArticle, listBlogs } from '../domain/content.ts'
import { CheckoutError, completeCart, getOrder } from '../domain/orders.ts'
import { createReview, listReviews, statsFor } from '../domain/reviews.ts'
import { environment, getStore, type Store } from '../control/stores.ts'
import { activeStorefrontConfig } from '../control/plugins.ts'
import { companionsFor, sessionFor as analyticsSession, track } from '../analytics/events.ts'
import { orderContext, sendEmail } from '../email/send.ts'
import { findRedirect, llmsTxt, robots, sitemap } from '../seo/schema.ts'
import * as view from './render.ts'
import type { StoreView } from './render.ts'

const CART_COOKIE = 'amboras_cart'
const log = logger('checkout')

/**
 * The storefront is served for a store resolved from the host (or from a
 * `/preview/:slug` path in development). `preview` is threaded all the way to
 * the plugin slots so pixels never fire against the admin's own iframe.
 */
export function storeViewFor(ctx: Ctx, store: Store, opts: { preview?: boolean } = {}): StoreView {
  const db = getDb()
  const env = environment(db, store.id, opts.preview ? 'draft' : store.status === 'live' ? 'live' : 'draft')
  const cartId = ctx.cookies[`${CART_COOKIE}_${store.id}`]
  const cart = cartId ? getCart(db, store.id, cartId) : null
  const base = process.env.AMBORAS_STOREFRONT_HOST && !opts.preview ? '' : `${opts.preview ? '/preview' : '/s'}/${store.slug}`
  return {
    db,
    store,
    env,
    base,
    preview: opts.preview ?? false,
    cart: cart && !cart.orderId ? cart : null,
    totals: null,
  }
}

function withTotals(current: StoreView): StoreView {
  const cart = current.cart ?? createCart(current.db, current.store.id)
  return { ...current, cart, totals: totals(current.db, current.store.id, cart) }
}

function ensureCart(ctx: Ctx, current: StoreView) {
  const cart = current.cart ?? createCart(current.db, current.store.id)
  if (!current.cart) {
    setCookie(ctx.res, `${CART_COOKIE}_${current.store.id}`, cart.id, { maxAge: 60 * 60 * 24 * 30 })
  }
  return cart
}

function record(ctx: Ctx, current: StoreView, type: Parameters<typeof track>[3], detail: Parameters<typeof track>[4] = {}) {
  if (current.preview) return
  const session = analyticsSession(current.db, current.store.id, {
    ip: ctx.ip,
    userAgent: String(ctx.req.headers['user-agent'] ?? ''),
    referrer: String(ctx.req.headers.referer ?? ''),
  })
  track(current.db, current.store.id, session, type, { path: ctx.url.pathname, ...detail })
}

export function storefrontRouter(resolve: (ctx: Ctx) => { store: Store; preview: boolean } | null): Router {
  const router = new Router()

  const open = (ctx: Ctx) => {
    const resolved = resolve(ctx)
    if (!resolved) throw notFound('No store at this address')
    return storeViewFor(ctx, resolved.store, { preview: resolved.preview })
  }

  router.get('/', (ctx) => {
    const current = withTotals(open(ctx))
    record(ctx, current, 'view.page')
    const custom = homePage(current.db, current.store.id)
    if (custom) return html(custom.mode === 'html' ? view.htmlPage(current, custom) : view.blockPage(current, custom))
    const featured = listProducts(current.db, current.store.id, { status: 'published', limit: 6 })
    const collections = listCollections(current.db, current.store.id).filter((collection) => collection.productIds.length)
    return html(view.home(current, { featured, collections }))
  })

  router.get('/collections/:handle', (ctx) => {
    const current = withTotals(open(ctx))
    const handle = ctx.params.handle as string
    record(ctx, current, 'view.collection')
    if (handle === 'all') {
      const products = listProducts(current.db, current.store.id, { status: 'published', limit: 100 })
      return html(view.collectionPage(current, { title: 'Everything', description: `All ${products.length} products.` }, products))
    }
    const collection = getCollection(current.db, current.store.id, handle)
    if (!collection) throw notFound('No such collection')
    const products = listProducts(current.db, current.store.id, { status: 'published', collectionId: collection.id, limit: 100 })
    return html(view.collectionPage(current, collection, products))
  })

  router.get('/products/:handle', (ctx) => {
    const current = withTotals(open(ctx))
    const product = getProduct(current.db, current.store.id, ctx.params.handle as string)
    if (!product || product.status !== 'published') throw notFound('No such product')
    record(ctx, current, 'view.product', { productId: product.id })
    const stats = statsFor(current.db, current.store.id, product.id)
    const reviews = listReviews(current.db, current.store.id, { productId: product.id, status: 'approved', limit: 12 })
    const companions = companionsFor(current.db, current.store.id, product.id, 2)
      .map((productId) => getProduct(current.db, current.store.id, productId))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.status === 'published')
    return html(view.productPage(current, { product, stats, reviews, companions }))
  })

  router.post('/products/:handle/reviews', async (ctx) => {
    const current = open(ctx)
    const product = getProduct(current.db, current.store.id, ctx.params.handle as string)
    if (!product) throw notFound('No such product')
    const body = await ctx.body()
    createReview(current.db, current.store.id, {
      productId: product.id,
      rating: Number(body.rating ?? 5),
      body: String(body.body ?? ''),
      author: String(body.author ?? 'Anonymous'),
    })
    record(ctx, current, 'review.submit', { productId: product.id })
    return redirect(`${current.base}/products/${product.handle}#review`)
  })

  router.post('/cart/add', async (ctx) => {
    const current = open(ctx)
    const cart = ensureCart(ctx, current)
    const body = await ctx.body()
    const variantId = String(body.variantId ?? '')
    const quantity = Math.max(1, Number(body.quantity ?? 1))
    const updated = addToCart(current.db, current.store.id, cart.id, variantId, quantity, body.source ? String(body.source) : undefined)
    const line = updated.items.find((item) => item.variantId === variantId)
    record(ctx, current, 'cart.add', { productId: line?.productId, amountCents: (line?.unitCents ?? 0) * quantity })
    return redirect(`${current.base}/cart`)
  })

  router.post('/cart/update', async (ctx) => {
    const current = open(ctx)
    const cart = ensureCart(ctx, current)
    const body = await ctx.body()
    setQuantity(current.db, current.store.id, cart.id, String(body.variantId ?? ''), Math.max(0, Number(body.quantity ?? 0)))
    return redirect(`${current.base}/cart`)
  })

  router.post('/cart/code', async (ctx) => {
    const current = open(ctx)
    const cart = ensureCart(ctx, current)
    const body = await ctx.body()
    applyCode(current.db, current.store.id, cart.id, String(body.code ?? ''))
    return redirect(`${current.base}/cart`)
  })

  router.get('/cart', (ctx) => {
    const current = withTotals(open(ctx))
    ensureCart(ctx, current)
    return html(view.cartPage(current, current.totals!))
  })

  router.get('/checkout', (ctx) => {
    const current = withTotals(open(ctx))
    if (!current.cart?.items.length) return redirect(`${current.base}/cart`)
    record(ctx, current, 'checkout.start', { amountCents: current.totals?.totalCents ?? 0 })
    const stripe = stripeFor(current.db, current.store.id)
    return html(view.checkoutPage(current, { totals: current.totals!, region: regionOf(current), stripe: stripe ? { publishableKey: stripe.config.publishableKey } : null }))
  })

  /** The no-provider path: the same form, a demo order, then the offer. */
  router.post('/checkout', async (ctx) => {
    const current = withTotals(open(ctx))
    const cart = current.cart
    if (!cart) return redirect(`${current.base}/cart`)
    const body = await ctx.body()
    const draft = readCheckoutForm(body)
    if (body.shippingOptionId) setShipping(current.db, current.store.id, cart.id, String(body.shippingOptionId))
    try {
      const order = completeCart(current.db, current.store.id, cart.id, {
        email: draft.email ?? '',
        ...(draft.name ? { name: draft.name } : {}),
        ...(draft.address ? { address: draft.address } : {}),
        marketing: draft.marketing ?? false,
        payment: { provider: 'demo', status: 'captured' },
      })
      afterOrder(ctx, current, order)
      return redirect(`${current.base}/orders/${order.id}/offer`)
    } catch (error) {
      if (error instanceof CheckoutError) {
        saveCheckoutDraft(current.db, current.store.id, cart.id, draft)
        const refreshed = withTotals({ ...current, cart: getCart(current.db, current.store.id, cart.id) })
        return html(view.checkoutPage(refreshed, { totals: refreshed.totals!, region: regionOf(current), error: error.message }), 400)
      }
      throw error
    }
  })

  router.get('/orders/:id', (ctx) => {
    const current = withTotals(open(ctx))
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    return html(view.orderPage(current, order))
  })

  router.post('/subscribe', async (ctx) => {
    const current = open(ctx)
    const body = await ctx.body()
    const email = String(body.email ?? '')
    if (!email.includes('@')) throw badRequest('Enter a valid email address')
    const { upsertCustomer } = await import('../domain/customers.ts')
    upsertCustomer(current.db, current.store.id, { email, marketing: true })
    record(ctx, current, 'signup')
    void sendEmail(current.db, current.store.id, { template: 'welcome', to: email, context: { storeUrl: `${ctx.url.origin}${current.base}` } }).catch(() => undefined)
    return html(view.simplePage(current, 'You are on the list', '<p>One email when there is something to say. Nothing else.</p>'))
  })

  router.get('/blogs/:blog', (ctx) => {
    const current = withTotals(open(ctx))
    const blog = listBlogs(current.db, current.store.id).find((entry) => entry.handle === ctx.params.blog)
    if (!blog) throw notFound('No such blog')
    const published = blog.articles.filter((article) => article.status === 'published')
    return html(
      view.simplePage(
        current,
        blog.title,
        published.length
          ? published
              .map(
                (article) =>
                  `<article style="margin-bottom:2rem"><h3><a href="${current.base}/blogs/${blog.handle}/${article.handle}">${escapeHtml(article.title)}</a></h3>
                   <p class="micro">${escapeHtml(article.publishedAt?.slice(0, 10) ?? '')}</p><p>${escapeHtml(article.excerpt)}</p></article>`,
              )
              .join('')
          : '<p>Nothing published yet.</p>',
      ),
    )
  })

  router.get('/blogs/:blog/:article', (ctx) => {
    const current = withTotals(open(ctx))
    const found = findArticle(current.db, current.store.id, ctx.params.blog as string, ctx.params.article as string)
    if (!found) throw notFound('No such article')
    record(ctx, current, 'view.page')
    return html(
      view.simplePage(
        current,
        found.article.title,
        found.article.body
          .split(/\n{2,}/)
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join(''),
      ),
    )
  })

  router.get('/pages/:slug', (ctx) => {
    const current = withTotals(open(ctx))
    const slug = ctx.params.slug as string
    const built = getPage(current.db, current.store.id, slug)
    if (built && (built.status === 'published' || current.preview)) {
      record(ctx, current, 'view.page')
      return html(built.mode === 'html' ? view.htmlPage(current, built) : view.blockPage(current, built))
    }
    const copy: Record<string, string> = {
      about: `<p>${escapeHtml(current.store.brand.description ?? '')}</p><p>${escapeHtml(current.store.brand.voice ?? '')}</p>`,
      shipping:
        '<p>Everything is built to order. Stock builds ship in fourteen days; custom work takes about three weeks.</p>' +
        '<p>Free shipping over 200. Returns are free for thirty days as long as the item has not been used in a fight.</p>',
    }
    if (!copy[slug]) throw notFound('No such page')
    return html(view.simplePage(current, slug === 'about' ? 'About' : 'Shipping & returns', copy[slug]))
  })

  router.post('/contact', async (ctx) => {
    const current = open(ctx)
    const body = await ctx.body()
    const email = String(body.email ?? '')
    if (email.includes('@')) upsertCustomer(current.db, current.store.id, { email, name: String(body.name ?? '') })
    const { recordAudit } = await import('../control/todos.ts')
    recordAudit(current.db, { storeId: current.store.id, actorType: 'system', action: 'contact_form', target: email, diff: { message: String(body.message ?? '').slice(0, 2000) } })
    return html(view.simplePage(current, 'Thanks', '<p>A person will read that and reply.</p>'))
  })

  /* ------------------------------------------------------------- checkout */

  /** Buy now: a fresh cart with this line, straight to checkout. */
  router.post('/checkout/buy', async (ctx) => {
    const current = open(ctx)
    const body = await ctx.body()
    const cart = createCart(current.db, current.store.id)
    setCookie(ctx.res, `${CART_COOKIE}_${current.store.id}`, cart.id, { maxAge: 60 * 60 * 24 * 30 })
    addToCart(current.db, current.store.id, cart.id, String(body.variantId ?? ''), Math.max(1, Number(body.quantity ?? 1)), 'buy-now')
    const line = getCart(current.db, current.store.id, cart.id)?.items[0]
    record(ctx, current, 'cart.add', { ...(line ? { productId: line.productId } : {}), amountCents: (line?.unitCents ?? 0) * (line?.quantity ?? 1) })
    return redirect(`${current.base}/checkout`)
  })

  router.post('/checkout/shipping', async (ctx) => {
    const current = open(ctx)
    const cart = ensureCart(ctx, current)
    const body = await ctx.body()
    const updated = setShipping(current.db, current.store.id, cart.id, String(body.shippingOptionId ?? ''))
    const amounts = totals(current.db, current.store.id, updated)
    return { ...amounts, totalsHtml: view.totalsBlock({ ...current, cart: updated, totals: amounts }, amounts) }
  })

  /** Saves the contact and address before Stripe confirms, so the order can be written when the payment returns. */
  router.post('/checkout/prepare', async (ctx) => {
    const current = open(ctx)
    const cart = ensureCart(ctx, current)
    const body = await ctx.body()
    const draft = readCheckoutForm(body)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email ?? '')) return { ok: false, error: 'Enter a valid email address' }
    if (!draft.address?.line1 || !draft.address.city || !draft.address.postal) return { ok: false, error: 'Fill in the delivery address' }
    saveCheckoutDraft(current.db, current.store.id, cart.id, draft)
    if (body.shippingOptionId) setShipping(current.db, current.store.id, cart.id, String(body.shippingOptionId))
    return { ok: true }
  })

  /** A PaymentIntent for the cart as it stands. Re-used if the amount has not moved. */
  router.post('/checkout/intent', async (ctx) => {
    const current = open(ctx)
    const cart = ensureCart(ctx, current)
    const stripe = stripeFor(current.db, current.store.id)
    if (!stripe) return { error: 'No payment provider is connected' }
    const amounts = totals(current.db, current.store.id, cart)
    const draft = cart.checkout
    try {
      let customerId = ''
      if (draft.email && stripe.config.captureMode !== 'manual') {
        customerId = (await stripe.client.customers.create({ email: draft.email, ...(draft.name ? { name: draft.name } : {}) })).id
      }
      const intent = await stripe.client.paymentIntents.create({
        amountCents: amounts.totalCents,
        currency: amounts.currency,
        ...(customerId ? { customerId } : {}),
        saveForLater: Boolean(customerId),
        ...(draft.email ? { receiptEmail: draft.email } : {}),
        metadata: { storeId: current.store.id, cartId: cart.id },
      })
      attachPaymentIntent(current.db, current.store.id, cart.id, intent.id)
      return { clientSecret: intent.client_secret, intentId: intent.id, publishableKey: stripe.config.publishableKey }
    } catch (error) {
      log.warn(`intent failed: ${error instanceof Error ? error.message : String(error)}`)
      return { error: error instanceof Error ? error.message : 'Could not start the payment' }
    }
  })

  /** Stripe returns here. The order is written only once the intent reports success. */
  router.get('/checkout/complete', async (ctx) => {
    const current = withTotals(open(ctx))
    const cart = current.cart
    const stripe = stripeFor(current.db, current.store.id)
    const intentId = ctx.query.get('payment_intent') ?? cart?.paymentIntentId ?? ''
    if (!cart || !stripe || !intentId) return redirect(`${current.base}/checkout`)
    const existing = orderByPaymentIntent(current.db, current.store.id, intentId)
    if (existing) return redirect(`${current.base}/orders/${existing.id}/offer`)
    const intent = await stripe.client.paymentIntents.retrieve(intentId)
    if (intent.status !== 'succeeded' && intent.status !== 'processing') {
      return html(view.checkoutPage(current, { totals: current.totals!, region: regionOf(current), error: 'The payment did not go through. Try another method.', stripe: { publishableKey: stripe.config.publishableKey } }), 400)
    }
    try {
      const order = completeCart(current.db, current.store.id, cart.id, {
        email: cart.checkout.email ?? '',
        ...(cart.checkout.name ? { name: cart.checkout.name } : {}),
        ...(cart.checkout.address ? { address: cart.checkout.address } : {}),
        marketing: cart.checkout.marketing ?? false,
        payment: { provider: 'stripe', intentId: intent.id, customerId: intent.customer ?? '', methodId: intent.payment_method ?? '', status: 'captured' },
      })
      afterOrder(ctx, current, order)
      return redirect(`${current.base}/orders/${order.id}/offer`)
    } catch (error) {
      if (error instanceof CheckoutError) return html(view.checkoutPage(current, { totals: current.totals!, region: regionOf(current), error: error.message, stripe: { publishableKey: stripe.config.publishableKey } }), 400)
      throw error
    }
  })

  /** Stripe's second opinion: a refund or dispute moves the order; a success we already wrote is ignored. */
  router.post('/webhooks/stripe', async (ctx) => {
    const current = open(ctx)
    const stripe = stripeFor(current.db, current.store.id)
    if (!stripe) throw notFound('No Stripe on this store')
    const payload = (await ctx.raw()).toString('utf8')
    const signature = String(ctx.req.headers['stripe-signature'] ?? '')
    if (!stripe.config.webhookSecret || !verifyWebhookSignature(payload, signature, stripe.config.webhookSecret)) throw badRequest('Bad signature')
    const event = JSON.parse(payload) as { type: string; data: { object: { id: string; payment_intent?: string; amount_refunded?: number; amount?: number } } }
    const intentId = event.data.object.payment_intent ?? event.data.object.id
    const order = orderByPaymentIntent(current.db, current.store.id, intentId)
    if (order) {
      if (event.type === 'charge.refunded') {
        const refunded = event.data.object.amount_refunded ?? 0
        setPaymentStatus(current.db, current.store.id, order.id, refunded >= order.totalCents ? 'refunded' : 'partially_refunded')
      }
      if (event.type === 'payment_intent.succeeded' && order.paymentStatus === 'awaiting') setPaymentStatus(current.db, current.store.id, order.id, 'captured')
    }
    return { received: true, matched: Boolean(order) }
  })

  /** The one-click offer after payment. Shown once; declined or accepted, never again. */
  router.get('/orders/:id/offer', (ctx) => {
    const current = withTotals(open(ctx))
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    if (order.upsell.offered) return redirect(`${current.base}/orders/${order.id}`)
    const offer = pickOffer(current, order)
    if (!offer) return redirect(`${current.base}/orders/${order.id}`)
    return html(view.upsellPage(current, order, offer))
  })

  router.post('/orders/:id/offer', async (ctx) => {
    const current = open(ctx)
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    if (order.upsell.offered) return redirect(`${current.base}/orders/${order.id}`)
    const body = await ctx.body()
    const offer = pickOffer(current, order)
    if (body.accept !== 'yes' || !offer) {
      recordUpsell(current.db, current.store.id, order.id, { offered: offer?.variantId ?? 'none', accepted: false })
      return redirect(`${current.base}/orders/${order.id}`)
    }
    const price = Math.round(offer.priceCents * (1 - offer.discountPercent / 100))
    let paymentIntentId = ''
    if (order.paymentProvider === 'stripe') {
      const stripe = stripeFor(current.db, current.store.id)
      if (!stripe || !order.paymentCustomerId || !order.paymentMethodId) {
        recordUpsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: false })
        return redirect(`${current.base}/orders/${order.id}`)
      }
      try {
        const intent = await stripe.client.paymentIntents.chargeOffSession({ amountCents: price, currency: order.currency, customerId: order.paymentCustomerId, paymentMethodId: order.paymentMethodId, metadata: { storeId: current.store.id, orderId: order.id, upsell: 'true' } })
        if (intent.status !== 'succeeded' && intent.status !== 'processing') throw new Error(`Payment ${intent.status}`)
        paymentIntentId = intent.id
      } catch (error) {
        log.warn(`upsell charge failed: ${error instanceof Error ? error.message : String(error)}`)
        recordUpsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: false })
        return redirect(`${current.base}/orders/${order.id}?offer=failed`)
      }
    }
    const variant = offer.product.variants.find((entry) => entry.id === offer.variantId)!
    const line: LineItem = { variantId: variant.id, productId: offer.product.id, title: offer.product.title, variantTitle: variant.title, image: variant.image || offer.product.heroImage, unitCents: price, quantity: 1, source: 'post-purchase' }
    recordUpsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: true, line, amountCents: price, ...(paymentIntentId ? { paymentIntentId } : {}) })
    record(ctx, current, 'checkout.complete', { productId: offer.product.id, amountCents: price, meta: { upsell: true } })
    return redirect(`${current.base}/orders/${order.id}`)
  })

  /* ----------------------------------------------------------- machine routes */

  router.get('/robots.txt', (ctx) => {
    const current = open(ctx)
    return new Raw(robots(`${ctx.url.origin}${current.base}`), 'text/plain; charset=utf-8')
  })

  router.get('/sitemap.xml', (ctx) => {
    const current = open(ctx)
    const products = listProducts(current.db, current.store.id, { status: 'published', limit: 500 })
    const collections = listCollections(current.db, current.store.id)
    return new Raw(
      sitemap(`${ctx.url.origin}${current.base}`, [
        { path: '/' },
        { path: '/collections/all' },
        ...collections.map((collection) => ({ path: `/collections/${collection.handle}` })),
        ...products.map((product) => ({ path: `/products/${product.handle}`, updated: product.updatedAt })),
      ]),
      'application/xml; charset=utf-8',
    )
  })

  /** The knowledge card, in the form a generative engine can actually read. */
  router.get('/llms.txt', (ctx) => {
    const current = open(ctx)
    const products = listProducts(current.db, current.store.id, { status: 'published', limit: 50 })
    return new Raw(llmsTxt(current.store, products), 'text/plain; charset=utf-8')
  })

  router.get('/store/integrations/active', (ctx) => {
    const current = open(ctx)
    return activeStorefrontConfig(current.db, current.store.id)
  })

  return router
}

function readCheckoutForm(body: Record<string, unknown>) {
  const name = [body.firstName, body.lastName].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ') || String(body.name ?? '').trim()
  return {
    email: String(body.email ?? '').trim().toLowerCase(),
    name,
    phone: String(body.phone ?? '').trim(),
    marketing: body.marketing === 'true',
    address: { name, line1: String(body.line1 ?? '').trim(), city: String(body.city ?? '').trim(), postal: String(body.postal ?? '').trim(), country: String(body.country ?? 'US').trim().toUpperCase(), phone: String(body.phone ?? '').trim() },
  }
}

function regionOf(current: StoreView) {
  return current.cart?.regionId ? getRegion(current.db, current.store.id, current.cart.regionId) : defaultRegion(current.db, current.store.id)
}

function afterOrder(ctx: Ctx, current: StoreView, order: ReturnType<typeof completeCart>) {
  record(ctx, current, 'checkout.complete', { amountCents: order.totalCents })
  setCookie(ctx.res, `${CART_COOKIE}_${current.store.id}`, '', { maxAge: 0 })
  // The receipt is not allowed to fail the checkout: the order is already
  // written and paid for by the time this runs.
  void sendEmail(current.db, current.store.id, { template: 'order_confirmation', to: order.email, context: orderContext(order, `${ctx.url.origin}${current.base}`) }).catch(() => undefined)
}

/**
 * The post-purchase offer is the best companion not already in the order,
 * at 20% off. It comes from the same affinity data the PDP uses, so the
 * thing offered is the thing people actually buy alongside.
 */
function pickOffer(current: StoreView, order: ReturnType<typeof completeCart>) {
  const inOrder = new Set(order.items.map((item) => item.productId))
  const first = order.items[0]
  if (!first) return null
  const candidates = companionsFor(current.db, current.store.id, first.productId, 4)
    .map((productId) => getProduct(current.db, current.store.id, productId))
    .filter((product): product is NonNullable<typeof product> => product !== null && product.status === 'published' && !inOrder.has(product.id))
  const product = candidates[0]
  const variant = product?.variants.find((entry) => entry.inventory > 0 || entry.allowBackorder) ?? product?.variants[0]
  if (!product || !variant) return null
  return { product, variantId: variant.id, priceCents: variant.priceCents, discountPercent: 20 }
}

/** 301s carried over from a migration are checked before the 404. */
export function redirectFor(store: Store, pathname: string) {
  return findRedirect(getDb(), store.id, pathname)
}

export function storeFromSlug(slug: string): Store | null {
  const db = getDb()
  const row = db.one<{ id: string }>('SELECT id FROM stores WHERE slug = ?', slug)
  return row ? getStore(db, row.id) : null
}
