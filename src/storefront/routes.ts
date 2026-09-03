import { getDb } from '../lib/db.ts'
import { badRequest, escapeHtml, html, notFound, redirect, Raw, Router, setCookie, type Ctx } from '../lib/http.ts'
import { addToCart, applyCode, attachPaymentIntent, createCart, getCart, saveCheckoutDraft, setQuantity, setShipping, totals } from '../domain/cart.ts'
import { getRegion, defaultRegion } from '../domain/regions.ts'
import { orderByPaymentIntent, recordUpsell, setPaymentStatus } from '../domain/orders.ts'
import { getPage, homePage, liveCheckoutPage } from '../pages/store.ts'
import { stripeFor, verifyWebhookSignature } from '../payments/stripe.ts'
import { upsertCustomer } from '../domain/customers.ts'
import { logger } from '../lib/log.ts'
import type { LineItem } from '../domain/types.ts'
import { askQuestion, requestStockAlert, trackingFor } from '../domain/ops.ts'
import { funnelEntry, funnelForProducts, pickFunnel, resolveBump, resolveOffer } from '../domain/funnels.ts'
import { privacyHtml, shippingHtml, termsHtml } from './legal.ts'
import { BEHAVIOUR_EVENTS } from '../analytics/events.ts'
import { recordDownsell } from '../domain/orders.ts'
import { pickPdpVersion } from '../pages/versions.ts'
import { canReserve, getCollection, getProduct, listCollections, listProducts } from '../domain/catalog.ts'
import { findArticle, listBlogs } from '../domain/content.ts'
import { CheckoutError, completeCart, getOrder } from '../domain/orders.ts'
import { createReview, listReviews, statsFor } from '../domain/reviews.ts'
import { environment, getStore, type Store } from '../control/stores.ts'
import { activeStorefrontConfig } from '../control/plugins.ts'
import { companionsFor, sessionFor as analyticsSession, track } from '../analytics/events.ts'
import { orderContext, sendEmail } from '../email/send.ts'
import { findRedirect, llmsTxt, robots, sitemap } from '../seo/schema.ts'
import * as view from './render.ts'
import type { CheckoutInput, StoreView } from './render.ts'

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
    const sessionKey = current.preview ? '' : analyticsSession(current.db, current.store.id, { ip: ctx.ip, userAgent: String(ctx.req.headers['user-agent'] ?? '') })
    const version = ctx.query.get('version') ? getPage(current.db, current.store.id, ctx.query.get('version') as string) : pickPdpVersion(current.db, current.store.id, product, sessionKey)
    record(ctx, current, 'view.product', { productId: product.id, meta: { pageId: version?.id ?? 'default' } })
    if (version && version.productId === product.id) return html(view.blockPage(current, version))
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
    // The button on this form says "Submit for moderation" and createReview
    // defaults to 'approved' unless a thin heuristic objects — so anyone on
    // the internet could put a one-star review on a product page and into its
    // Google aggregateRating, instantly. Anything arriving from the storefront
    // waits for the merchant, which is what the Reviews tab is for.
    createReview(current.db, current.store.id, {
      productId: product.id,
      rating: Number(body.rating ?? 5),
      body: String(body.body ?? ''),
      author: String(body.author ?? 'Anonymous'),
      status: 'pending',
    })
    record(ctx, current, 'review.submit', { productId: product.id })
    return redirect(`${current.base}/products/${product.handle}#review`)
  })

  router.post('/products/:handle/questions', async (ctx) => {
    const current = open(ctx)
    const product = getProduct(current.db, current.store.id, ctx.params.handle as string)
    if (!product) throw notFound('No such product')
    const body = await ctx.body()
    if (String(body.question ?? '').trim().length < 4) return redirect(`${current.base}/products/${product.handle}`)
    askQuestion(current.db, current.store.id, { productId: product.id, question: String(body.question), asker: String(body.asker ?? ''), email: String(body.email ?? '') })
    return html(view.simplePage(current, 'Thanks for asking', '<p>We answer every question. If you left an email, the answer goes there too, and it appears on the page for the next person.</p>'))
  })

  router.post('/products/:handle/notify', async (ctx) => {
    const current = open(ctx)
    const product = getProduct(current.db, current.store.id, ctx.params.handle as string)
    if (!product) throw notFound('No such product')
    const body = await ctx.body()
    const email = String(body.email ?? '')
    if (email.includes('@')) requestStockAlert(current.db, current.store.id, String(body.variantId ?? product.variants[0]?.id ?? ''), email)
    return html(view.simplePage(current, 'You are on the list', '<p>One email when it is back. Nothing else.</p>'))
  })

  router.get('/track', (ctx) => {
    const current = withTotals(open(ctx))
    const number = ctx.query.get('order')?.replace('#', '').trim() ?? ''
    const email = ctx.query.get('email')?.trim().toLowerCase() ?? ''
    const related = listProducts(current.db, current.store.id, { status: 'published', limit: 3 })
    if (!number) return html(view.trackPage(current, { related }))
    const order = getOrder(current.db, current.store.id, number)
    // A display number is four digits and guessable, so it is only good with
    // the email on the order. The internal id is not guessable, and it is what
    // the confirmation page links with — which is why "Track this order" used
    // to land on "No order matches that number and email" every time.
    const byOwnId = !!order && order.id === number
    const wrong = !order || (email ? order.email !== email : !byOwnId && !current.preview)
    if (wrong) {
      return html(view.trackPage(current, { error: 'No order matches that number and email.', related, number }))
    }
    return html(view.trackPage(current, { tracking: trackingFor(current.db, current.store.id, order), related }))
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
    const resumed = ctx.query.get('resume')
    let current = open(ctx)
    if (resumed) {
      const cart = getCart(current.db, current.store.id, resumed)
      if (cart && !cart.orderId) {
        setCookie(ctx.res, `${CART_COOKIE}_${current.store.id}`, cart.id, { maxAge: 60 * 60 * 24 * 30 })
        current = { ...current, cart }
      }
    }
    current = withTotals(current)
    ensureCart(ctx, current)
    return html(view.cartPage(current, current.totals!))
  })

  router.get('/checkout', (ctx) => {
    const current = withTotals(open(ctx))
    if (!current.cart?.items.length) return redirect(`${current.base}/cart`)
    record(ctx, current, 'checkout.start', { amountCents: current.totals?.totalCents ?? 0 })
    return html(renderCheckout(current, checkoutInputFor(current)))
  })

  /**
   * The no-provider path: the same form, a demo order, then the offer.
   *
   * It is refused outright once Stripe is connected. This route writes an
   * order with payment `captured` and never speaks to a payment provider, so
   * on a store that takes real money it is a way to get the goods for free —
   * by posting the form directly, or simply by having js.stripe.com blocked,
   * which makes the pay button fall back to a native form submit.
   */
  router.post('/checkout', async (ctx) => {
    const current = withTotals(open(ctx))
    const cart = current.cart
    if (!cart) return redirect(`${current.base}/cart`)
    if (stripeFor(current.db, current.store.id)) {
      log.warn('demo checkout refused: this store takes real payments')
      return html(
        renderCheckout(current, checkoutInputFor(current, { error: 'Payment could not start. Reload the page and try again — nothing has been charged.' })),
        409,
      )
    }
    const body = await ctx.body()
    const draft = readCheckoutForm(body)
    if (body.shippingOptionId) setShipping(current.db, current.store.id, cart.id, String(body.shippingOptionId))
    if (body.bumpVariantId && !cart.items.some((item) => item.variantId === body.bumpVariantId)) {
      const bump = checkoutInputFor(current).bump
      const priced = bump && bump.variantId === String(body.bumpVariantId) ? bump.priceCents : undefined
      addToCart(current.db, current.store.id, cart.id, String(body.bumpVariantId), 1, 'order-bump', priced)
    }
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
        return html(renderCheckout(refreshed, checkoutInputFor(refreshed, { stripe: null, error: error.message })), 400)
      }
      throw error
    }
  })

  router.get('/orders/:id', (ctx) => {
    const current = withTotals(open(ctx))
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    const inOrder = new Set(order.items.map((item) => item.productId))
    const related = listProducts(current.db, current.store.id, { status: 'published', limit: 6 }).filter((product) => !inOrder.has(product.id)).slice(0, 3)
    return html(view.orderPage(current, order, related))
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
      if (built.role === 'checkout' && built.mode === 'blocks') {
        // The checkout page at its own address. A sample line keeps the editor
        // preview from being blank; on the live storefront it put a fabricated
        // order, a real Pay now button and the words "Sample order — the
        // editor preview" in front of a customer, so out there an empty cart
        // goes where the built-in checkout sends it.
        const sample = !current.cart?.items.length
        if (sample && !current.preview) return redirect(`${current.base}/cart`)
        const shown = sample ? withSampleCart(current) : current
        return html(view.checkoutBlockPage(shown, built, checkoutInputFor(shown), { sample }))
      }
      return html(built.mode === 'html' ? view.htmlPage(current, built) : view.blockPage(current, built))
    }
    const copy: Record<string, string> = {
      about: `<p>${escapeHtml(current.store.brand.description ?? '')}</p><p>${escapeHtml(current.store.brand.voice ?? '')}</p>`,
      privacy: privacyHtml(current.db, current.store),
      terms: termsHtml(current.db, current.store),
      shipping: shippingHtml(current.db, current.store),
    }
    if (!copy[slug]) throw notFound('No such page')
    const titles: Record<string, string> = { about: 'About', shipping: 'Shipping & returns', privacy: 'Privacy policy', terms: 'Terms of sale' }
    return html(view.simplePage(current, titles[slug] ?? slug, copy[slug]))
  })

  /* The page reports what happened on it: scroll depth, sections seen, buttons pressed, popup and quiz events. Preview traffic is dropped. */
  router.post('/_t', async (ctx) => {
    const current = open(ctx)
    if (current.preview) return undefined
    const body = await ctx.body()
    const events = Array.isArray(body.e) ? (body.e as Array<{ t?: string; m?: Record<string, unknown> }>).slice(0, 40) : []
    const path = typeof body.p === 'string' ? body.p.slice(0, 200) : ctx.url.pathname
    for (const event of events) {
      const type = String(event.t ?? '') as (typeof BEHAVIOUR_EVENTS)[number]
      if (!BEHAVIOUR_EVENTS.includes(type)) continue
      const meta = event.m && typeof event.m === 'object' ? Object.fromEntries(Object.entries(event.m).slice(0, 8).map(([key, value]) => [key.slice(0, 32), typeof value === 'string' ? value.slice(0, 120) : typeof value === 'number' ? value : String(value).slice(0, 120)])) : {}
      record(ctx, current, type, { path, meta })
    }
    return undefined
  })

  /* A funnel split test starts here: the visitor is assigned a funnel by weight and sent to its first page. */
  router.get('/go/:group', (ctx) => {
    const current = open(ctx)
    const group = ctx.params.group as string
    const sessionId = current.preview ? `preview-${Date.now()}` : analyticsSession(current.db, current.store.id, { ip: ctx.ip, userAgent: String(ctx.req.headers['user-agent'] ?? ''), referrer: String(ctx.req.headers.referer ?? '') })
    const funnel = pickFunnel(current.db, current.store.id, group, sessionId)
    if (!funnel) throw notFound('No funnel is running under that name')
    if (!current.preview) track(current.db, current.store.id, sessionId, 'funnel.enter', { path: ctx.url.pathname, meta: { funnelId: funnel.id, group } })
    return redirect(`${current.base}${funnelEntry(current.db, current.store.id, funnel)}`)
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

  /** The order bump: one checkbox, one line in the cart. */
  router.post('/checkout/bump', async (ctx) => {
    const current = open(ctx)
    const cart = ensureCart(ctx, current)
    const body = await ctx.body()
    const variantId = String(body.variantId ?? '')
    // The bump's price comes from the funnel, and it is the number the
    // checkout printed next to the tick box. Pricing the line from the catalog
    // instead charged whatever the product happened to cost.
    const bump = resolveBump(current.db, current.store.id, funnelForProducts(current.db, current.store.id, cart.items.map((item) => item.productId)))
    const priced = bump && bump.variantId === variantId ? bump.priceCents : undefined
    const updated = body.on ? addToCart(current.db, current.store.id, cart.id, variantId, 1, 'order-bump', priced) : setQuantity(current.db, current.store.id, cart.id, variantId, 0)
    const amounts = totals(current.db, current.store.id, updated)
    return { ...amounts, totalsHtml: view.totalsBlock({ ...current, cart: updated, totals: amounts }, amounts) }
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
      return html(renderCheckout(current, checkoutInputFor(current, { error: 'The payment did not go through. Try another method.' })), 400)
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
      if (error instanceof CheckoutError) return html(renderCheckout(current, checkoutInputFor(current, { error: error.message })), 400)
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

  /** The one-click offer after payment. Shown once; declined or accepted, never again. Declined → the downsell, once. */
  router.get('/orders/:id/offer', (ctx) => {
    const current = withTotals(open(ctx))
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    if (order.upsell.offered) return redirect(`${current.base}/orders/${order.id}${order.upsell.accepted || order.downsell.offered ? '' : '/downsell'}`)
    const funnel = funnelForProducts(current.db, current.store.id, order.items.map((item) => item.productId))
    const offer = resolveOffer(current.db, current.store.id, funnel?.upsell, () => { const picked = pickOffer(current, order); return picked ? { product: picked.product, variantId: picked.variantId } : null }, 20)
    if (!offer) return redirect(`${current.base}/orders/${order.id}`)
    return html(view.offerPage(current, order, offer, 'upsell'))
  })

  router.get('/orders/:id/downsell', (ctx) => {
    const current = withTotals(open(ctx))
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    if (order.downsell.offered || order.upsell.accepted) return redirect(`${current.base}/orders/${order.id}`)
    const funnel = funnelForProducts(current.db, current.store.id, order.items.map((item) => item.productId))
    if (!funnel?.downsell || (!funnel.downsell.variantId && !funnel.downsell.discountPercent)) return redirect(`${current.base}/orders/${order.id}`)
    const offer = resolveOffer(current.db, current.store.id, funnel.downsell, () => { const picked = pickOffer(current, order); return picked ? { product: picked.product, variantId: picked.variantId } : null }, 35)
    if (!offer) return redirect(`${current.base}/orders/${order.id}`)
    return html(view.offerPage(current, order, offer, 'downsell'))
  })

  router.post('/orders/:id/downsell', async (ctx) => {
    const current = open(ctx)
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    if (order.downsell.offered) return redirect(`${current.base}/orders/${order.id}`)
    const body = await ctx.body()
    const funnel = funnelForProducts(current.db, current.store.id, order.items.map((item) => item.productId))
    const offer = resolveOffer(current.db, current.store.id, funnel?.downsell, () => { const picked = pickOffer(current, order); return picked ? { product: picked.product, variantId: picked.variantId } : null }, 35)
    // Checked before the card is charged, not after: the offer used to take
    // the money and then append a line for stock that was not there.
    if (body.accept === 'yes' && offer && !canReserve(current.db, offer.variantId, 1)) {
      recordDownsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: false })
      return redirect(`${current.base}/orders/${order.id}?offer=soldout`)
    }
    if (body.accept !== 'yes' || !offer) {
      recordDownsell(current.db, current.store.id, order.id, { offered: offer?.variantId ?? 'none', accepted: false })
      return redirect(`${current.base}/orders/${order.id}`)
    }
    const price = Math.round(offer.priceCents * (1 - offer.discountPercent / 100))
    const paid = await chargeSaved(current, order, price, { downsell: 'true' })
    if (!paid.ok) {
      recordDownsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: false })
      return redirect(`${current.base}/orders/${order.id}?offer=failed`)
    }
    const variant = offer.product.variants.find((entry) => entry.id === offer.variantId)!
    recordDownsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: true, line: { variantId: variant.id, productId: offer.product.id, title: offer.product.title, variantTitle: variant.title, image: variant.image || offer.product.heroImage, unitCents: price, quantity: 1, source: 'downsell' }, amountCents: price })
    record(ctx, current, 'checkout.complete', { productId: offer.product.id, amountCents: price, meta: { downsell: true } })
    return redirect(`${current.base}/orders/${order.id}`)
  })

  router.post('/orders/:id/offer', async (ctx) => {
    const current = open(ctx)
    const order = getOrder(current.db, current.store.id, ctx.params.id as string)
    if (!order) throw notFound('No such order')
    if (order.upsell.offered) return redirect(`${current.base}/orders/${order.id}`)
    const body = await ctx.body()
    const funnel = funnelForProducts(current.db, current.store.id, order.items.map((item) => item.productId))
    const offer = resolveOffer(current.db, current.store.id, funnel?.upsell, () => { const picked = pickOffer(current, order); return picked ? { product: picked.product, variantId: picked.variantId } : null }, 20)
    if (body.accept === 'yes' && offer && !canReserve(current.db, offer.variantId, 1)) {
      recordUpsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: false })
      return redirect(`${current.base}/orders/${order.id}/downsell`)
    }
    if (body.accept !== 'yes' || !offer) {
      recordUpsell(current.db, current.store.id, order.id, { offered: offer?.variantId ?? 'none', accepted: false })
      return redirect(`${current.base}/orders/${order.id}/downsell`)
    }
    const price = Math.round(offer.priceCents * (1 - offer.discountPercent / 100))
    const paid = await chargeSaved(current, order, price, { upsell: 'true' })
    if (!paid.ok) {
      recordUpsell(current.db, current.store.id, order.id, { offered: offer.variantId, accepted: false })
      return redirect(`${current.base}/orders/${order.id}?offer=failed`)
    }
    const paymentIntentId = paid.intentId
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

/** Everything the checkout renders from, in one place: totals, region, the payment provider and the funnel's bump. */
function checkoutInputFor(current: StoreView, extra: Partial<CheckoutInput> = {}): CheckoutInput {
  const stripe = stripeFor(current.db, current.store.id)
  const funnel = funnelForProducts(current.db, current.store.id, (current.cart?.items ?? []).map((item) => item.productId))
  return { totals: current.totals!, region: regionOf(current), stripe: stripe ? { publishableKey: stripe.config.publishableKey } : null, bump: resolveBump(current.db, current.store.id, funnel), ...extra }
}

/** The checkout built from blocks when the store has published one; the built-in page otherwise. */
function renderCheckout(current: StoreView, input: CheckoutInput): string {
  const custom = liveCheckoutPage(current.db, current.store.id, { preview: current.preview })
  return custom ? view.checkoutBlockPage(current, custom, input) : view.checkoutPage(current, input)
}

/** The cart with one line from the first product, in memory only, so a checkout page can be previewed without buying anything. */
function withSampleCart(current: StoreView): StoreView {
  const product = listProducts(current.db, current.store.id, { status: 'published', limit: 1 })[0]
  const variant = product?.variants[0]
  if (!product || !variant || !current.cart) return current
  const cart = { ...current.cart, items: [{ variantId: variant.id, productId: product.id, title: product.title, variantTitle: variant.title, image: variant.image || product.heroImage, unitCents: variant.priceCents, quantity: 1 }] }
  return { ...current, cart, totals: totals(current.db, current.store.id, cart) }
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

/** Charges a saved card off-session on Stripe orders; demo orders just say yes. */
async function chargeSaved(current: StoreView, order: ReturnType<typeof completeCart>, amountCents: number, metadata: Record<string, string>): Promise<{ ok: boolean; intentId: string }> {
  if (order.paymentProvider !== 'stripe') return { ok: true, intentId: '' }
  const stripe = stripeFor(current.db, current.store.id)
  if (!stripe || !order.paymentCustomerId || !order.paymentMethodId) return { ok: false, intentId: '' }
  try {
    const intent = await stripe.client.paymentIntents.chargeOffSession({ amountCents, currency: order.currency, customerId: order.paymentCustomerId, paymentMethodId: order.paymentMethodId, metadata: { storeId: current.store.id, orderId: order.id, ...metadata } })
    if (intent.status !== 'succeeded' && intent.status !== 'processing') throw new Error(`Payment ${intent.status}`)
    return { ok: true, intentId: intent.id }
  } catch (error) {
    log.warn(`off-session charge failed: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, intentId: '' }
  }
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
