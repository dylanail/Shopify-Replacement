import { getDb } from '../lib/db.ts'
import { badRequest, escapeHtml, html, notFound, redirect, Raw, Router, setCookie, type Ctx } from '../lib/http.ts'
import { addToCart, applyCode, createCart, getCart, setQuantity, totals } from '../domain/cart.ts'
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
    return html(view.checkoutPage(current, current.totals!))
  })

  router.post('/checkout', async (ctx) => {
    const current = withTotals(open(ctx))
    const cart = current.cart
    if (!cart) return redirect(`${current.base}/cart`)
    const body = await ctx.body()
    try {
      const order = completeCart(current.db, current.store.id, cart.id, {
        email: String(body.email ?? ''),
        name: String(body.name ?? ''),
        marketing: body.marketing === 'true',
        address: {
          name: String(body.name ?? ''),
          line1: String(body.line1 ?? ''),
          city: String(body.city ?? ''),
          postal: String(body.postal ?? ''),
          country: String(body.country ?? ''),
        },
      })
      record(ctx, current, 'checkout.complete', { amountCents: order.totalCents })
      setCookie(ctx.res, `${CART_COOKIE}_${current.store.id}`, '', { maxAge: 0 })
      // The receipt is not allowed to fail the checkout: the order is already
      // written and paid for by the time this runs.
      void sendEmail(current.db, current.store.id, {
        template: 'order_confirmation',
        to: order.email,
        context: orderContext(order, `${ctx.url.origin}${current.base}`),
      }).catch(() => undefined)
      return redirect(`${current.base}/orders/${order.id}`)
    } catch (error) {
      if (error instanceof CheckoutError) return html(view.checkoutPage(current, current.totals!, error.message), 400)
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
    const copy: Record<string, string> = {
      about: `<p>${escapeHtml(current.store.brand.description ?? '')}</p><p>${escapeHtml(current.store.brand.voice ?? '')}</p>`,
      shipping:
        '<p>Everything is built to order. Stock builds ship in fourteen days; custom work takes about three weeks.</p>' +
        '<p>Free shipping over 200. Returns are free for thirty days as long as the item has not been used in a fight.</p>',
    }
    if (!copy[slug]) throw notFound('No such page')
    return html(view.simplePage(current, slug === 'about' ? 'About' : 'Shipping & returns', copy[slug]))
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

/** 301s carried over from a migration are checked before the 404. */
export function redirectFor(store: Store, pathname: string) {
  return findRedirect(getDb(), store.id, pathname)
}

export function storeFromSlug(slug: string): Store | null {
  const db = getDb()
  const row = db.one<{ id: string }>('SELECT id FROM stores WHERE slug = ?', slug)
  return row ? getStore(db, row.id) : null
}
