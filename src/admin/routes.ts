import { getDb } from '../lib/db.ts'
import { badRequest, forbidden, html, notFound, redirect, Router, setCookie, sse, unauthorized, type Ctx } from '../lib/http.ts'
import { endSession, login, register, requireRole, requireUser, SESSION_COOKIE, startSession, userFor, inviteTeammate } from '../control/auth.ts'
import { addDomain, environment, getStore, listStores, publish, publishState, rollback, setTheme, updateStore, verifyDomain, type Store } from '../control/stores.ts'
import { install, invalidateStorefrontConfig, uninstall } from '../control/plugins.ts'
import { PLANS, PlanLimitError, planBySlug } from '../control/plans.ts'
import { listTodos, recordAudit, refreshTodos, seedTodos } from '../control/todos.ts'
import { createCollection, listProducts, updateProduct, updateVariant } from '../domain/catalog.ts'
import { fulfillOrder, refundOrder } from '../domain/orders.ts'
import { setPromotionStatus } from '../domain/promotions.ts'
import { moderate } from '../domain/reviews.ts'
import { getSend } from '../email/send.ts'
import { ask, history } from '../agent/chat.ts'
import { execute } from '../agent/registry.ts'
import { saveUpload, UploadError } from '../lib/uploads.ts'
import { advertorialTemplate, blankTemplate, createPage, deletePage, duplicatePage, getPage, landingTemplate, updatePage } from '../pages/store.ts'
import { clonePage, extractBlocks } from '../pages/clone.ts'
import { blockDefinition } from '../pages/blocks.ts'
import { removeBundle, upsertBundle, type BundleTier } from '../domain/bundles.ts'
import { latestResearch } from '../agent/research.ts'
import { getProduct } from '../domain/catalog.ts'
import { editorPage } from './editor.ts'
import { stripeFor } from '../payments/stripe.ts'
import { getOrder } from '../domain/orders.ts'
import { onActivity, recentActivity } from '../agent/events.ts'
import { onboard } from '../agent/onboarding.ts'
import * as pages from './pages.ts'
import { shell } from './shell.ts'
import { authPage, onboardingPage } from './auth-pages.ts'

const STORE_COOKIE = 'amboras_store'

type Session = { user: { id: string; name: string; email: string }; store: Store; stores: Store[] }

function session(ctx: Ctx): Session {
  const db = getDb()
  const user = requireUser(db, ctx)
  const stores = listStores(db, user.id)
  if (!stores.length) throw new NoStores()
  const wanted = ctx.query.get('storeId') ?? ctx.cookies[STORE_COOKIE]
  const store = stores.find((entry) => entry.id === wanted) ?? (stores[0] as Store)
  requireRole(db, user.id, store.id)
  return { user, store, stores }
}

class NoStores extends Error {}

function page(ctx: Ctx, current: Session, active: string, title: string, body: string) {
  const db = getDb()
  seedTodos(db, current.store.id)
  refreshTodos(db, current.store.id)
  return html(
    shell({
      store: current.store,
      stores: current.stores,
      active,
      title,
      body,
      todos: listTodos(db, current.store.id),
      messages: history(db, current.store.id, 20),
      publish: publishState(db, current.store.id),
      userName: current.user.name || current.user.email.split('@')[0] || 'there',
      storeUrl: storeUrl(ctx, current.store),
    }),
  )
}

function storeUrl(ctx: Ctx, store: Store): string {
  const root = process.env.AMBORAS_STOREFRONT_HOST
  if (root) return `${ctx.url.protocol}//${store.slug}.${root}`
  return `/s/${store.slug}`
}

function back(ctx: Ctx, message?: string): ReturnType<typeof redirect> {
  const target = String(ctx.req.headers.referer ?? '/admin')
  const url = new URL(target, ctx.url.origin)
  if (message) url.searchParams.set('flash', message)
  return redirect(`${url.pathname}${url.search}`)
}

function ctxFor(current: Session, ctx: Ctx) {
  return {
    db: getDb(),
    store: current.store,
    userName: current.user.name || 'there',
    storeUrl: storeUrl(ctx, current.store),
    ...(ctx.query.get('flash') ? { flash: ctx.query.get('flash') as string } : {}),
  }
}

const range = (ctx: Ctx) => {
  const value = ctx.query.get('range') ?? '7d'
  return (['24h', '7d', '30d', '90d'] as const).includes(value as never) ? (value as '7d') : '7d'
}

export function adminRouter(): Router {
  const router = new Router()
  const db = () => getDb()

  /* ------------------------------------------------------------------- auth */

  router.get('/login', (ctx) => (userFor(db(), ctx) ? redirect('/admin') : html(authPage('login', ctx.query.get('error')))))
  router.get('/register', (ctx) => (userFor(db(), ctx) ? redirect('/admin') : html(authPage('register', ctx.query.get('error')))))

  router.post('/login', async (ctx) => {
    const body = await ctx.body()
    try {
      const user = login(db(), String(body.email ?? ''), String(body.password ?? ''))
      setCookie(ctx.res, SESSION_COOKIE, startSession(db(), user.id), { maxAge: 60 * 60 * 24 * 30 })
      return redirect('/admin')
    } catch (error) {
      return redirect(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : 'Could not sign in')}`)
    }
  })

  router.post('/register', async (ctx) => {
    const body = await ctx.body()
    try {
      const user = register(db(), { email: String(body.email ?? ''), password: String(body.password ?? ''), name: String(body.name ?? '') })
      setCookie(ctx.res, SESSION_COOKIE, startSession(db(), user.id), { maxAge: 60 * 60 * 24 * 30 })
      return redirect('/onboarding')
    } catch (error) {
      return redirect(`/register?error=${encodeURIComponent(error instanceof Error ? error.message : 'Could not register')}`)
    }
  })

  router.post('/logout', (ctx) => {
    const secret = ctx.cookies[SESSION_COOKIE]
    if (secret) endSession(db(), secret)
    setCookie(ctx.res, SESSION_COOKIE, '', { maxAge: 0 })
    return redirect('/login')
  })

  /* ------------------------------------------------------------- onboarding */

  router.get('/onboarding', (ctx) => {
    const user = requireUser(db(), ctx)
    return html(onboardingPage(user.name || user.email, ctx.query.get('error'), listStores(db(), user.id).length > 0))
  })

  router.post('/onboarding', async (ctx) => {
    const user = requireUser(db(), ctx)
    const body = await ctx.body()
    const files = await ctx.files()
    const prompt = String(body.prompt ?? '').trim()
    if (prompt.length < 12) return redirect(`/onboarding?error=${encodeURIComponent('Say a little more — one sentence about what you sell.')}`)
    const siteUrl = String(body.siteUrl ?? '').trim()
    if (siteUrl && !/^https?:\/\/[^\s]+$/i.test(siteUrl)) return redirect(`/onboarding?error=${encodeURIComponent('That site address does not look right — include https://')}`)
    // The upload is saved under a store id that does not exist yet; the store
    // row is created a moment later. Order does not matter for a disk path.
    const pendingStoreId = `pending_${user.id.slice(4, 12)}`
    let referenceImage: string | undefined
    try {
      if (files.photo) referenceImage = saveUpload(files.photo, pendingStoreId).url
    } catch (error) {
      if (error instanceof UploadError) return redirect(`/onboarding?error=${encodeURIComponent(error.message)}`)
      throw error
    }
    const result = await onboard(db(), {
      ownerId: user.id,
      prompt,
      ...(body.planSlug ? { planSlug: String(body.planSlug) } : {}),
      ...(referenceImage ? { referenceImage } : {}),
      ...(siteUrl ? { referenceUrl: siteUrl } : {}),
    })
    setCookie(ctx.res, STORE_COOKIE, result.store.id, { maxAge: 60 * 60 * 24 * 365 })
    return redirect('/admin?flash=' + encodeURIComponent(`${result.store.name} is built — ${result.summaries.length} steps ran. Publish when it looks right.`))
  })

  /* ------------------------------------------------------------------ pages */

  router.get('/admin', (ctx) => {
    const current = session(ctx)
    setCookie(ctx.res, STORE_COOKIE, current.store.id, { maxAge: 60 * 60 * 24 * 365 })
    return page(ctx, current, 'dashboard', 'Dashboard', pages.dashboard(ctxFor(current, ctx), range(ctx)))
  })

  router.get('/admin/stores', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'stores', 'Your stores', pages.storesPage(ctxFor(current, ctx), current.stores))
  })

  router.get('/admin/research', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'research', 'Customer research', pages.researchPage(ctxFor(current, ctx)))
  })

  router.post('/admin/research/run', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const result = await execute(
        'run_customer_research',
        { brief: String(body.brief ?? ''), siteUrl: String(body.siteUrl ?? ''), rewritePages: body.rewritePages === 'true' },
        { db: db(), storeId: current.store.id, actor: { type: 'user', id: current.user.id }, page: 'research' },
      )
      return back(ctx, result.summary)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Research failed'}`)
    }
  })

  router.post('/admin/products/:id/photo', async (ctx) => {
    const current = session(ctx)
    const files = await ctx.files()
    const body = await ctx.body()
    if (!files.photo) return back(ctx, '!Choose an image first.')
    try {
      const saved = saveUpload(files.photo, current.store.id)
      const result = await execute(
        'attach_product_photo',
        { productId: ctx.params.id as string, upload: saved.url, preset: String(body.preset ?? 'white-seamless') },
        { db: db(), storeId: current.store.id, actor: { type: 'user', id: current.user.id }, page: 'products' },
      )
      return back(ctx, result.summary)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Upload failed'}`)
    }
  })

  router.post('/admin/products/:id/rewrite', async (ctx) => {
    const current = session(ctx)
    const result = await execute(
      'write_product_page',
      { productId: ctx.params.id as string },
      { db: db(), storeId: current.store.id, actor: { type: 'user', id: current.user.id }, page: 'products' },
    )
    return back(ctx, result.summary)
  })

  /* ------------------------------------------------------------- pages */

  router.get('/admin/pages', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'pages', 'Pages & funnels', pages.pagesPage(ctxFor(current, ctx)))
  })

  router.post('/admin/pages/new', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const product = body.productId ? getProduct(db(), current.store.id, String(body.productId)) : null
    const research = latestResearch(db(), current.store.id)
    const input = {
      storeName: current.store.name,
      ...(product ? { product: { id: product.id, title: product.title, image: product.heroImage, subtitle: product.subtitle } } : {}),
      research: research ? { triggers: research.triggers, objections: research.objections, comparison: research.comparison, competitors: research.competitors } : null,
    }
    const template = String(body.template ?? 'blank')
    const blocks = template === 'advertorial' ? advertorialTemplate(input) : template === 'landing' ? landingTemplate(input) : blankTemplate()
    const created = createPage(db(), current.store.id, {
      title: String(body.title ?? '').trim() || (template === 'advertorial' ? `Why people are switching to ${product?.title ?? current.store.name}` : template === 'landing' ? `${product?.title ?? current.store.name} — offer` : 'New page'),
      kind: template === 'advertorial' ? 'advertorial' : 'landing',
      blocks,
    })
    return redirect(`/admin/pages/${created.id}/edit`)
  })

  router.post('/admin/pages/html', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const created = createPage(db(), current.store.id, { title: String(body.title ?? 'New page'), kind: 'custom', mode: 'html', rawHtml: String(body.html ?? '') })
    return redirect(`/admin/pages/${created.id}/edit`)
  })

  router.post('/admin/pages/clone', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const url = String(body.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) return back(ctx, '!Paste a full URL, starting with https://')
    try {
      const result = await clonePage(url, { storeId: current.store.id, keepScripts: body.keepScripts === 'true' })
      const created = createPage(db(), current.store.id, {
        title: result.title,
        kind: 'custom',
        mode: 'html',
        rawHtml: result.html,
        seo: { title: result.title, description: result.description },
        sourceUrl: result.sourceUrl,
      })
      recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'clone_page', target: result.sourceUrl, diff: { stylesheets: result.stylesheets, images: result.imagesLocalized, notes: result.notes } })
      return redirect(`/admin/pages/${created.id}/edit?flash=${encodeURIComponent(`Cloned. ${result.stylesheets} stylesheets inlined, ${result.imagesLocalized} images copied in.${result.notes.length ? ` ${result.notes[0]}` : ''}`)}`)
    } catch (error) {
      return back(ctx, `!Could not clone that page: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  })

  router.get('/admin/pages/:id/edit', (ctx) => {
    const current = session(ctx)
    const found = getPage(db(), current.store.id, ctx.params.id as string)
    if (!found) throw notFound('No such page')
    const products = listProducts(db(), current.store.id, { status: 'published', limit: 100 }).map((product) => ({ id: product.id, title: product.title }))
    return html(editorPage({ page: found, storeSlug: current.store.slug, products }))
  })

  router.post('/admin/pages/:id/save', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const blocks = Array.isArray(body.blocks) ? (body.blocks as Array<{ id?: string; type: string; settings?: Record<string, unknown> }>) : []
    const unknown = blocks.find((block) => !blockDefinition(block.type))
    if (unknown) return { error: `Unknown block type ${unknown.type}` }
    const seo = (body.seo ?? {}) as Record<string, unknown>
    const updated = updatePage(db(), current.store.id, ctx.params.id as string, {
      title: String(body.title ?? 'Untitled').trim() || 'Untitled',
      mode: body.mode === 'html' ? 'html' : 'blocks',
      blocks: blocks.map((block) => ({ id: block.id || `blk_${Math.random().toString(36).slice(2, 10)}`, type: block.type, settings: block.settings ?? {} })),
      rawHtml: String(body.rawHtml ?? ''),
      headHtml: String(body.headHtml ?? ''),
      status: body.status === 'published' ? 'published' : 'draft',
      isHome: body.isHome === true,
      seo: { title: String(seo.title ?? ''), description: String(seo.description ?? ''), image: String(seo.image ?? '') },
    })
    return { ok: true, handle: updated.handle, updatedAt: updated.updatedAt }
  })

  router.post('/admin/pages/:id/extract', (ctx) => {
    const current = session(ctx)
    const found = getPage(db(), current.store.id, ctx.params.id as string)
    if (!found) throw notFound('No such page')
    const blocks = extractBlocks(found.rawHtml).map((block) => ({ id: `blk_${Math.random().toString(36).slice(2, 10)}`, ...block }))
    return { blocks: [{ id: `blk_${Math.random().toString(36).slice(2, 10)}`, type: 'header', settings: {} }, ...blocks, { id: `blk_${Math.random().toString(36).slice(2, 10)}`, type: 'footer', settings: {} }] }
  })

  router.post('/admin/pages/:id/duplicate', (ctx) => {
    const current = session(ctx)
    const copy = duplicatePage(db(), current.store.id, ctx.params.id as string)
    return redirect(`/admin/pages/${copy.id}/edit`)
  })

  router.post('/admin/pages/:id/delete', (ctx) => {
    const current = session(ctx)
    deletePage(db(), current.store.id, ctx.params.id as string)
    return redirect('/admin/pages?flash=Deleted.')
  })

  /* ----------------------------------------------------------- bundles */

  router.get('/admin/bundles', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'bundles', 'Bundles', pages.bundlesPage(ctxFor(current, ctx)))
  })

  router.post('/admin/bundles', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const tiers: BundleTier[] = String(body.tiers ?? '')
      .split('\n')
      .map((line) => line.split('|').map((part) => part.trim()))
      .filter((parts) => parts[0])
      .map((parts) => ({
        quantity: Number(parts[0]),
        discountPercent: Number(parts[1] ?? 0),
        label: parts[2] || `Buy ${parts[0]}`,
        ...(parts[3] ? { badge: parts[3] } : {}),
        ...(parts[4] === 'ship' ? { freeShipping: true } : {}),
        ...(parts[5] ? { giftVariantId: parts[5], giftLabel: parts[6] ?? '' } : {}),
      }))
    if (body.giftVariantId && tiers.length) {
      const top = tiers[tiers.length - 1] as BundleTier
      top.giftVariantId = String(body.giftVariantId)
      top.giftLabel = String(body.giftLabel ?? 'free gift')
    }
    try {
      upsertBundle(db(), current.store.id, {
        productId: String(body.productId ?? ''),
        title: String(body.title ?? 'Bundle & save'),
        tiers,
        style: { layout: body.layout === 'row' ? 'row' : 'stacked', ...(body.accent ? { accent: String(body.accent) } : {}) },
      })
      return back(ctx, 'Bundle saved. It is live on the product page and enforced in the cart.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not save'}`)
    }
  })

  router.post('/admin/bundles/:id/delete', (ctx) => {
    const current = session(ctx)
    removeBundle(db(), current.store.id, ctx.params.id as string)
    return back(ctx, 'Bundle removed and its promotions disabled.')
  })

  router.get('/admin/settings/payments', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'settings', 'Payments', pages.paymentsPage(ctxFor(current, ctx)))
  })

  router.get('/admin/switch', (ctx) => {
    const current = session(ctx)
    setCookie(ctx.res, STORE_COOKIE, current.store.id, { maxAge: 60 * 60 * 24 * 365 })
    return redirect('/admin')
  })

  router.get('/admin/ai', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'ai', 'Assistant', pages.aiPage(ctxFor(current, ctx), history(db(), current.store.id, 60)))
  })

  router.get('/admin/products', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'products', 'Products', pages.productsPage(ctxFor(current, ctx), ctx.query.get('status') ?? 'all', ctx.query.get('search') ?? ''))
  })

  router.get('/admin/products/:id', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'products', 'Product', pages.productDetail(ctxFor(current, ctx), ctx.params.id as string))
  })

  router.post('/admin/products/:id', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    updateProduct(db(), current.store.id, ctx.params.id as string, {
      title: String(body.title ?? ''),
      subtitle: String(body.subtitle ?? ''),
      description: String(body.description ?? ''),
      status: String(body.status ?? 'draft') as 'draft',
    })
    recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'update_product', target: String(ctx.params.id) })
    return back(ctx, 'Saved.')
  })

  router.post('/admin/variants/:id', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    updateVariant(db(), current.store.id, ctx.params.id as string, {
      priceCents: Number(body.priceCents ?? 0),
      inventory: Number(body.inventory ?? 0),
    })
    return back(ctx, 'Variant updated.')
  })

  router.get('/admin/orders', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'orders', 'Orders', pages.ordersPage(ctxFor(current, ctx), ctx.query.get('status') ?? 'all'))
  })

  router.get('/admin/orders/:id', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'orders', 'Order', pages.orderDetail(ctxFor(current, ctx), ctx.params.id as string))
  })

  router.post('/admin/orders/:id/fulfill', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    fulfillOrder(db(), current.store.id, ctx.params.id as string, { provider: 'manual', tracking: String(body.tracking ?? '') })
    return back(ctx, 'Marked fulfilled.')
  })

  router.post('/admin/orders/:id/refund', async (ctx) => {
    const current = session(ctx)
    requireRole(db(), current.user.id, current.store.id, 'admin')
    const existing = getOrder(db(), current.store.id, ctx.params.id as string)
    if (!existing) throw notFound('No such order')
    if (existing.paymentProvider === 'stripe' && existing.paymentIntentId) {
      const stripe = stripeFor(db(), current.store.id)
      if (!stripe) return back(ctx, '!This order was paid through Stripe, which is no longer connected.')
      try {
        await stripe.client.refunds.create({ paymentIntentId: existing.paymentIntentId, reason: 'requested_by_customer' })
      } catch (error) {
        return back(ctx, `!Stripe refused the refund: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
    const order = refundOrder(db(), current.store.id, existing.id, { reason: 'Refunded from the admin' })
    return back(ctx, `Refunded${existing.paymentProvider === 'stripe' ? ' through Stripe' : ''}. Payment is now ${order.paymentStatus}.`)
  })

  router.get('/admin/customers', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'customers', 'Customers', pages.customersPage(ctxFor(current, ctx), ctx.query.get('search') ?? ''))
  })

  router.get('/admin/collections', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'collections', 'Collections', pages.collectionsPage(ctxFor(current, ctx)))
  })

  router.post('/admin/collections', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    createCollection(db(), current.store.id, { title: String(body.title ?? 'Untitled') })
    return back(ctx, 'Collection created.')
  })

  router.get('/admin/promotions', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'promotions', 'Promotions', pages.promotionsPage(ctxFor(current, ctx)))
  })

  router.post('/admin/promotions/:id/disable', (ctx) => {
    const current = session(ctx)
    setPromotionStatus(db(), current.store.id, ctx.params.id as string, 'disabled')
    return back(ctx, 'Promotion disabled.')
  })

  router.get('/admin/analytics', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'analytics', 'Analytics', pages.analyticsPage(ctxFor(current, ctx), range(ctx)))
  })

  router.get('/admin/reviews', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'reviews', 'Reviews', pages.reviewsPage(ctxFor(current, ctx), ctx.query.get('status') ?? 'pending'))
  })

  router.post('/admin/reviews/:id/:status', (ctx) => {
    const current = session(ctx)
    const status = ctx.params.status as 'approved' | 'rejected'
    if (status !== 'approved' && status !== 'rejected') throw badRequest('Unknown moderation action')
    moderate(db(), current.store.id, ctx.params.id as string, status)
    return back(ctx, `Review ${status}.`)
  })

  router.get('/admin/store', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'store', 'Store designer', pages.storePage(ctxFor(current, ctx), history(db(), current.store.id, 10)))
  })

  router.post('/admin/theme', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    setTheme(db(), current.store.id, {
      template: String(body.template ?? 'atelier'),
      radius: String(body.radius ?? '2px'),
      density: String(body.density ?? 'roomy') as 'roomy',
      heroHeadline: String(body.heroHeadline ?? ''),
    }, { build: 'Edited from the store designer' })
    updateStore(db(), current.store.id, { brand: { announcement: String(body.announcement ?? '') } })
    return back(ctx, 'Draft saved. Publish to make it live.')
  })

  router.post('/admin/publish', (ctx) => {
    const current = session(ctx)
    const state = publishState(db(), current.store.id)
    if (!state.ready) return back(ctx, `!${state.reason}`)
    const live = publish(db(), current.store.id)
    refreshTodos(db(), current.store.id)
    recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'publish_store', target: `v${live.version}` })
    return back(ctx, `Published v${live.version}.`)
  })

  router.post('/admin/rollback', (ctx) => {
    const current = session(ctx)
    rollback(db(), current.store.id)
    return back(ctx, 'Draft reset to what is live.')
  })

  router.get('/admin/marketing', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'marketing', 'Email & search', pages.marketingPage(ctxFor(current, ctx)))
  })

  router.get('/admin/emails/:id', (ctx) => {
    const current = session(ctx)
    const send = getSend(db(), current.store.id, ctx.params.id as string) as { html: string } | null
    if (!send) throw notFound('No such email')
    return html(send.html)
  })

  router.get('/admin/plugins', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'plugins', 'Integrations', pages.pluginsPage(ctxFor(current, ctx), ctx.query.get('category') ?? 'all', ctx.query.get('search') ?? ''))
  })

  router.post('/admin/plugins/:id/settings', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      install(db(), current.store.id, ctx.params.id as string, body)
      invalidateStorefrontConfig(current.store.id)
      refreshTodos(db(), current.store.id)
      return back(ctx, 'Saved.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not save'}`)
    }
  })

  router.post('/admin/plugins/:id/uninstall', (ctx) => {
    const current = session(ctx)
    requireRole(db(), current.user.id, current.store.id, 'admin')
    uninstall(db(), current.store.id, ctx.params.id as string)
    invalidateStorefrontConfig(current.store.id)
    return back(ctx, 'Removed, along with its credentials.')
  })

  router.get('/admin/settings', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'settings', 'Settings', pages.settingsPage(ctxFor(current, ctx)))
  })

  router.post('/admin/domains', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      if (!planBySlug(current.store.planSlug).customDomain) {
        throw new PlanLimitError('A custom domain', planBySlug(current.store.planSlug), PLANS.find((plan) => plan.customDomain))
      }
      addDomain(db(), current.store.id, String(body.hostname ?? ''))
      return back(ctx, 'Add the two DNS records below, then verify.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not attach that domain'}`)
    }
  })

  router.post('/admin/domains/verify', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      verifyDomain(db(), current.store.id, String(body.hostname ?? ''))
      refreshTodos(db(), current.store.id)
      return back(ctx, 'Verified and certificate issued.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not verify'}`)
    }
  })

  router.post('/admin/team', async (ctx) => {
    const current = session(ctx)
    requireRole(db(), current.user.id, current.store.id, 'owner')
    const body = await ctx.body()
    try {
      if (!planBySlug(current.store.planSlug).prioritySupport) {
        throw new PlanLimitError('Inviting teammates', planBySlug(current.store.planSlug), PLANS.find((plan) => plan.prioritySupport))
      }
      const result = inviteTeammate(db(), current.store.id, String(body.email ?? ''), String(body.role ?? 'member') as 'member')
      return back(ctx, result.joined ? 'They already had an account and now have access.' : 'Invite created.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not invite'}`)
    }
  })

  router.post('/admin/plan', async (ctx) => {
    const current = session(ctx)
    requireRole(db(), current.user.id, current.store.id, 'owner')
    const body = await ctx.body()
    updateStore(db(), current.store.id, { planSlug: String(body.planSlug ?? 'free') })
    return back(ctx, `Now on ${planBySlug(String(body.planSlug ?? 'free')).name}.`)
  })

  /* ------------------------------------------------------------- the agent */

  router.post('/admin/ask', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const text = String(body.text ?? '').trim()
    if (!text) return back(ctx)
    const result = await ask(db(), {
      storeId: current.store.id,
      userId: current.user.id,
      text,
      page: String(body.page ?? ''),
      confirmed: body.confirmed === 'true',
    })
    return back(ctx, result.failures.length ? `!${result.failures[0]}` : undefined)
  })

  /** The live activity stream behind the rail dots. */
  router.get('/admin/activity', (ctx) => {
    const current = session(ctx)
    const stream = sse(ctx)
    for (const event of recentActivity(current.store.id, 5)) stream.send('activity', event)
    const off = onActivity(current.store.id, (event) => stream.send('activity', event))
    ctx.req.on('close', off)
    return undefined
  })

  return router
}

export { NoStores, STORE_COOKIE, storeUrl }
