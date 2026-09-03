import { getDb } from '../lib/db.ts'
import { badRequest, forbidden, html, notFound, redirect, Router, setCookie, sse, unauthorized, type Ctx } from '../lib/http.ts'
import { endSession, login, register, requireRole, requireUser, SESSION_COOKIE, startSession, userFor, inviteTeammate } from '../control/auth.ts'
import { environment, getStore, listStores, publish, publishState, rollback, setTheme, updateStore, verifyDomain, type Store } from '../control/stores.ts'
import { attachDomain, checkDomain, removeDomain, type DomainMode } from '../control/domains.ts'
import { deleteAd, draftAds, getAd, reviseAd, saveAd, saveInspiration, deleteInspiration, readInspiration, type AdPlatform } from '../agent/ads.ts'
import { deleteAvatar, saveAvatar, suggestAvatars } from '../agent/avatars.ts'
import { applyCompetitor, deleteCompetitor, getCompetitor, readCompetitor, saveCompetitor, type AngleKind } from '../agent/angles.ts'
import * as growth from './growth-pages.ts'
import { install, invalidateStorefrontConfig, uninstall } from '../control/plugins.ts'
import { catalog, modelFor, parseChoice, TASKS, type Task } from '../agent/models.ts'
import { listTodos, recordAudit, refreshTodos, seedTodos } from '../control/todos.ts'
import { createCollection, listProducts, updateProduct, updateVariant } from '../domain/catalog.ts'
import { fulfillOrder, refundOrder } from '../domain/orders.ts'
import { setPromotionStatus } from '../domain/promotions.ts'
import { moderate } from '../domain/reviews.ts'
import { getSend } from '../email/send.ts'
import { ask, history } from '../agent/chat.ts'
import { execute } from '../agent/registry.ts'
import { saveUpload, UploadError } from '../lib/uploads.ts'
import { createPage, deletePage, duplicatePage, getPage, pageTemplate, updatePage } from '../pages/store.ts'
import { clonePage, extractBlocks } from '../pages/clone.ts'
import { blockDefinition } from '../pages/blocks.ts'
import { removeBundle, upsertBundle, type BundleTier } from '../domain/bundles.ts'
import { latestResearch } from '../agent/research.ts'
import { getProduct } from '../domain/catalog.ts'
import { editorPage } from './editor.ts'
import { stripeFor } from '../payments/stripe.ts'
import { getOrder, markDelivered, recordSupplierOrder } from '../domain/orders.ts'
import { answerQuestion, hideQuestion, importReviews, markStockAlertsNotified, pendingStockAlerts, recordAdSpend } from '../domain/ops.ts'
import { deleteFunnel, upsertFunnel } from '../domain/funnels.ts'
import { generateVersions, setVersionWeight } from '../pages/versions.ts'
import { sendEmail, orderContext } from '../email/send.ts'
import { getVariant } from '../domain/catalog.ts'
import { onActivity, recentActivity } from '../agent/events.ts'
import { onboard } from '../agent/onboarding.ts'
import * as pages from './pages.ts'
import { shell } from './shell.ts'
import { authPage, onboardingPage } from './auth-pages.ts'
import { accountShell, storesHub } from './account.ts'
import * as plan from './plan-pages.ts'
import { modeById, QUESTIONS, saveAnswers, setBuildMode, setSiteShape, skipStep, type BuildMode } from '../control/build.ts'
import { deleteDoc, runAdPlan, runAnalysis, runOverview, saveLoop, suggestSubAvatars, updatePlanRow, type AdPlanRow } from '../agent/market.ts'
import { deleteQueueItem, getQueueItem, PAGE_GOALS, queuePhotoBriefs, queueUgcConcepts, setQueueStatus, suggestBlocks, type PageGoal } from '../creative/briefs.ts'
import { approveGif, makeProductGif } from '../creative/product-gif.ts'
import { ripToPage } from '../pages/rip.ts'
import { newBlock } from '../pages/store.ts'
import { customCatalog, customDefinitions, deleteCustomBlock, upsertCustomBlock } from '../pages/custom-blocks.ts'
import type { CustomField } from '../pages/blocks.ts'
import { listAvatars, getAvatar } from '../agent/avatars.ts'
import { saveLegal } from '../storefront/legal.ts'

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
      modelLabel: (() => {
        const choice = modelFor(db, current.store.id, 'planner')
        return choice ? `Answering with ${choice.model}` : 'No model key set: a short list of patterns answers instead'
      })(),
    }),
  )
}

function storeUrl(ctx: Ctx, store: Store): string {
  const root = process.env.AMBORAS_STOREFRONT_HOST
  if (root) return `${ctx.url.protocol}//${store.slug}.${root}`
  return `/s/${store.slug}`
}

function publicUrl(ctx: Ctx, store: Store): string {
  const url = storeUrl(ctx, store)
  return url.startsWith('http') ? url : `${process.env.AMBORAS_PUBLIC_ORIGIN ?? ctx.url.origin}${url}`
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
    return html(onboardingPage(user.name || user.email, ctx.query.get('error'), listStores(db(), user.id).length))
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
      ...(referenceImage ? { referenceImage } : {}),
      ...(siteUrl ? { referenceUrl: siteUrl } : {}),
    })
    setCookie(ctx.res, STORE_COOKIE, result.store.id, { maxAge: 60 * 60 * 24 * 365 })
    const mode = modeById(String(body.mode ?? 'own-product')) ?? modeById('own-product')
    if (mode) setBuildMode(db(), result.store.id, mode.id)
    return redirect('/admin?flash=' + encodeURIComponent(`${result.store.name} is built — ${result.summaries.length} steps ran. The Build page has the order of work from here; publish when it looks right.`))
  })

  /* ------------------------------------------------------------------ pages */

  router.get('/admin', (ctx) => {
    const current = session(ctx)
    setCookie(ctx.res, STORE_COOKIE, current.store.id, { maxAge: 60 * 60 * 24 * 365 })
    return page(ctx, current, 'dashboard', 'Dashboard', pages.dashboard(ctxFor(current, ctx), range(ctx)))
  })

  /**
   * The account's own page, not a store's: it has to answer for a user with
   * no stores at all, so it deliberately does not go through session().
   */
  router.get('/admin/stores', (ctx) => {
    const user = requireUser(db(), ctx)
    const stores = listStores(db(), user.id)
    const name = user.name || user.email.split('@')[0] || 'there'
    return html(
      accountShell({
        userName: name,
        title: 'Your stores',
        body: storesHub({
          db: db(),
          stores,
          userName: name,
          origin: process.env.AMBORAS_PUBLIC_ORIGIN ?? ctx.url.origin,
          ...(ctx.query.get('flash') ? { flash: ctx.query.get('flash') as string } : {}),
        }),
      }),
    )
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
    const template = pageTemplate(String(body.template ?? 'blank'))
    const created = createPage(db(), current.store.id, {
      title: String(body.title ?? '').trim() || template.title(input),
      kind: template.kind,
      role: template.role,
      blocks: template.build(input),
      ...(product && template.role !== 'checkout' ? { productId: product.id } : {}),
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
    return html(editorPage({ page: found, storeSlug: current.store.slug, products, custom: customDefinitions(db(), current.store.id) }))
  })

  /* A block the store defines for itself: fields as "key|label|type" lines, a template, its css. */
  router.post('/admin/blocks', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const fields: CustomField[] = String(body.fields ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [key = '', label = '', type = 'string', fallback = ''] = line.split('|').map((part) => part.trim())
      const kind = type === 'number' ? 'number' : type === 'boolean' ? 'boolean' : 'string'
      return { key, label: label || key, type: kind, ...(type === 'text' ? { multiline: true } : {}), ...(fallback ? { default: kind === 'number' ? Number(fallback) : kind === 'boolean' ? fallback === 'true' : fallback } : {}) }
    })
    try {
      const block = upsertCustomBlock(db(), current.store.id, { type: String(body.type ?? '').trim() || undefined, name: String(body.name ?? '').trim(), description: String(body.description ?? ''), icon: String(body.icon ?? '✚'), fields, template: String(body.template ?? ''), css: String(body.css ?? ''), js: String(body.js ?? ''), source: 'owner' })
      return back(ctx, `Block "${block.name}" saved as ${block.type}. It is in the builder palette under Custom.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : String(error)}`)
    }
  })

  router.post('/admin/blocks/:type/delete', (ctx) => {
    const current = session(ctx)
    deleteCustomBlock(db(), current.store.id, ctx.params.type as string)
    return back(ctx, 'Block removed. Pages that used it show a note where it was until you replace it.')
  })

  router.post('/admin/pages/:id/save', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const blocks = Array.isArray(body.blocks) ? (body.blocks as Array<{ id?: string; type: string; settings?: Record<string, unknown> }>) : []
    const custom = new Set(customDefinitions(db(), current.store.id).map((definition) => definition.type))
    const unknown = blocks.find((block) => !blockDefinition(block.type) && !custom.has(block.type))
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

  /* ------------------------------------------------- dropshipping ops */

  router.post('/admin/products/import', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const result = await execute('import_product_from_url', { url: String(body.url ?? ''), markup: Number(body.markup ?? 2.5), asSupplier: body.asSupplier === 'true' }, { db: db(), storeId: current.store.id, actor: { type: 'user', id: current.user.id }, page: 'products' })
      const productId = (result.data as { id?: string })?.id
      return redirect(productId ? `/admin/products/${productId}?flash=${encodeURIComponent(result.summary)}` : `/admin/products?flash=${encodeURIComponent(result.summary)}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Import failed'}`)
    }
  })

  router.post('/admin/products/:id/supplier', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const number = (key: string) => (body[key] === undefined || body[key] === '' ? undefined : Number(body[key]))
    updateProduct(db(), current.store.id, ctx.params.id as string, {
      supplier: { name: String(body.name ?? ''), url: String(body.url ?? ''), sku: String(body.sku ?? ''), costCents: number('costCents'), shippingCents: number('shippingCents'), processingDays: number('processingDays'), shippingDaysMin: number('shippingDaysMin'), shippingDaysMax: number('shippingDaysMax') },
      metadata: { sizeChart: String(body.sizeChart ?? '') },
    })
    return back(ctx, 'Supplier saved. Margins and delivery estimates use it now.')
  })

  router.post('/admin/products/:id/versions', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const picked = (Array.isArray(body.formats) ? body.formats : body.formats ? [body.formats] : []) as string[]
    const kind = body.kind === 'advertorial' ? 'advertorial' : 'pdp'
    const formats = picked.filter((entry) => entry.startsWith(`${kind}:`)).map((entry) => entry.split(':')[1] as string)
    try {
      const pages = await generateVersions(db(), current.store, { productId: ctx.params.id as string, kind, formats, direction: String(body.direction ?? ''), avatarId: String(body.avatarId ?? ''), count: Number(body.count ?? 3) || 3, publish: body.publish === 'true' })
      recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'generate_versions', target: ctx.params.id as string, diff: { kind, formats, direction: body.direction, pages: pages.map((page) => page.id) } })
      return back(ctx, `Generated ${pages.length} ${kind === 'pdp' ? 'product page version' : 'advertorial'}${pages.length === 1 ? '' : 's'}: ${pages.map((page) => page.format).join(', ')}.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not generate'}`)
    }
  })

  router.post('/admin/versions/:id/weight', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const page = setVersionWeight(db(), current.store.id, ctx.params.id as string, Number(body.weight ?? 0))
    return back(ctx, page.weight > 0 ? `${page.title} is in the test at weight ${page.weight}.` : `${page.title} is out of the test.`)
  })

  router.post('/admin/orders/:id/supplier', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const number = (key: string) => (body[key] === undefined || body[key] === '' ? undefined : Number(body[key]))
    const order = recordSupplierOrder(db(), current.store.id, ctx.params.id as string, { supplier: String(body.supplier ?? ''), orderId: String(body.orderId ?? ''), costCents: number('costCents'), shippingCents: number('shippingCents'), ...(body.tracking ? { tracking: String(body.tracking) } : {}), ...(body.carrier ? { carrier: String(body.carrier) } : {}) })
    if (body.tracking) {
      const shipment = order.fulfillments.at(-1)
      void sendEmail(db(), current.store.id, { template: 'order_shipped', to: order.email, context: { ...orderContext(order, ctx.url.origin + storeUrl(ctx, current.store)), tracking: shipment?.tracking ?? '' } }).catch(() => undefined)
    }
    return back(ctx, body.tracking ? 'Saved and marked shipped; the customer has the tracking link.' : 'Supplier order saved.')
  })

  router.post('/admin/orders/:id/delivered', (ctx) => {
    const current = session(ctx)
    const order = markDelivered(db(), current.store.id, ctx.params.id as string)
    void sendEmail(db(), current.store.id, { template: 'order_delivered', to: order.email, context: orderContext(order, ctx.url.origin + storeUrl(ctx, current.store)) }).catch(() => undefined)
    return back(ctx, 'Marked delivered. The review request goes out a week from now.')
  })

  router.get('/admin/profit', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'profit', 'Profit', pages.profitPage(ctxFor(current, ctx), Number(ctx.query.get('days') ?? 30) || 30))
  })

  router.post('/admin/profit/spend', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    recordAdSpend(db(), current.store.id, {
      day: String(body.day ?? new Date().toISOString()),
      platform: String(body.platform ?? 'Other'),
      amountCents: Math.round(Number(body.amountCents ?? 0)),
      clicks: Math.round(Number(body.clicks ?? 0)) || 0,
      note: String(body.note ?? ''),
    })
    return back(ctx, 'Logged.')
  })

  router.get('/admin/funnels', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'funnels', 'Funnels', pages.funnelsPage(ctxFor(current, ctx)))
  })

  router.post('/admin/funnels', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const number = (key: string) => (body[key] === undefined || body[key] === '' ? undefined : Number(body[key]))
    upsertFunnel(db(), current.store.id, {
      ...(body.id ? { id: String(body.id) } : {}),
      name: String(body.name ?? 'Funnel'),
      productId: String(body.productId ?? ''),
      advertorialPageId: String(body.advertorialPageId ?? ''),
      offerPageId: String(body.offerPageId ?? ''),
      bump: { variantId: String(body.bumpVariantId ?? ''), label: String(body.bumpLabel ?? ''), priceCents: number('bumpPriceCents'), enabled: true },
      upsell: { variantId: String(body.upsellVariantId ?? ''), discountPercent: number('upsellDiscount') ?? 20, headline: String(body.upsellHeadline ?? '') },
      downsell: { variantId: String(body.downsellVariantId ?? ''), discountPercent: number('downsellDiscount'), headline: String(body.downsellHeadline ?? '') },
      testGroup: String(body.testGroup ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      weight: Number(body.weight ?? 0) || 0,
    })
    return back(ctx, 'Funnel saved.')
  })

  router.post('/admin/funnels/:id/delete', (ctx) => {
    const current = session(ctx)
    deleteFunnel(db(), current.store.id, ctx.params.id as string)
    return back(ctx, 'Funnel deleted.')
  })

  router.post('/admin/questions/:id', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    if (body.hide === 'true') hideQuestion(db(), current.store.id, ctx.params.id as string)
    else answerQuestion(db(), current.store.id, ctx.params.id as string, String(body.answer ?? ''))
    return back(ctx, body.hide === 'true' ? 'Hidden.' : 'Answered; it is on the product page.')
  })

  router.post('/admin/reviews/import', async (ctx) => {
    const current = session(ctx)
    const files = await ctx.files()
    const body = await ctx.body()
    if (!files.csv) return back(ctx, '!Choose a CSV first.')
    const result = importReviews(db(), current.store.id, files.csv.data.toString('utf8'), { ...(body.productId ? { productId: String(body.productId) } : {}) })
    return back(ctx, `Imported ${result.imported} reviews across ${result.products} products; ${result.skipped} rows skipped.`)
  })

  router.post('/admin/stock-alerts/notify', async (ctx) => {
    const current = session(ctx)
    const alerts = pendingStockAlerts(db(), current.store.id)
    const sent: string[] = []
    for (const alert of alerts) {
      const variant = getVariant(db(), current.store.id, alert.variant_id)
      if (!variant || (variant.inventory <= 0 && !variant.allowBackorder)) continue
      await sendEmail(db(), current.store.id, { template: 'welcome', to: alert.email, context: { storeUrl: ctx.url.origin + storeUrl(ctx, current.store), heading: 'It is back in stock' } })
      sent.push(alert.id)
    }
    markStockAlertsNotified(db(), sent)
    return back(ctx, `Emailed ${sent.length} of ${alerts.length}; the rest are still out of stock.`)
  })

  router.get('/admin/switch', (ctx) => {
    const current = session(ctx)
    setCookie(ctx.res, STORE_COOKIE, current.store.id, { maxAge: 60 * 60 * 24 * 365 })
    // `to` lets the hub open a store straight onto a page — Build, say — but it
    // is a path on this admin and nothing else.
    const to = ctx.query.get('to') ?? ''
    return redirect(/^\/admin(\/|$)/.test(to) && !to.startsWith('//') ? to : '/admin')
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
    return page(ctx, current, 'store', 'Store designer', pages.storePage(ctxFor(current, ctx), history(db(), current.store.id, 10), ctx.query.get('health') === '1'))
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

  router.post('/admin/theme/code', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    setTheme(db(), current.store.id, { customCss: String(body.customCss ?? ''), customJs: String(body.customJs ?? '') }, { build: 'Store-wide css and js edited' })
    return back(ctx, 'Custom code saved to the draft. Publish to make it live.')
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

  router.get('/admin/domains', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'domains', 'Domains', growth.domainsPage(ctxFor(current, ctx)))
  })

  router.post('/admin/domains', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const record = attachDomain(db(), current.store.id, { hostname: String(body.hostname ?? ''), mode: (body.mode === 'forward' ? 'forward' : 'host') as DomainMode, registrar: String(body.registrar ?? 'other') })
      recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'attach_domain', target: record.hostname, diff: { mode: record.mode, registrar: record.registrar } })
      return redirect(`/admin/domains?flash=${encodeURIComponent(`${record.hostname} attached. Add the records below at your registrar, then check.`)}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not attach that domain'}`)
    }
  })

  router.post('/admin/domains/check', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const check = await checkDomain(db(), current.store.id, String(body.hostname ?? ''), publicUrl(ctx, current.store))
      if (check.verified) refreshTodos(db(), current.store.id)
      return back(ctx, `${check.verified ? '' : '!'}${check.reason}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not check'}`)
    }
  })

  router.post('/admin/domains/verify', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      verifyDomain(db(), current.store.id, String(body.hostname ?? ''))
      refreshTodos(db(), current.store.id)
      return back(ctx, 'Marked verified without a lookup. If the name does not resolve here, visitors will not arrive.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not verify'}`)
    }
  })

  router.post('/admin/domains/remove', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    removeDomain(db(), current.store.id, String(body.hostname ?? ''))
    return back(ctx, 'Detached.')
  })

  /* ---------------------------------------------------------------- ads */

  router.get('/admin/ads', async (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'ads', 'Ads', await growth.adsPage(ctxFor(current, ctx), { ...(ctx.query.get('q') ? { q: ctx.query.get('q') as string } : {}), ...(ctx.query.get('country') ? { country: ctx.query.get('country') as string } : {}) }))
  })

  router.post('/admin/ads/draft', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const formats = (Array.isArray(body.formats) ? body.formats : body.formats ? [body.formats] : []) as string[]
    try {
      const ads = await draftAds(db(), current.store, { productId: String(body.productId ?? ''), platform: String(body.platform ?? 'meta') as AdPlatform, formats, direction: String(body.direction ?? ''), ...(body.avatarId ? { avatarId: String(body.avatarId) } : {}), count: Number(body.count ?? 3) || 3 })
      recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'draft_ads', target: String(body.productId ?? ''), diff: { formats: ads.map((ad) => ad.format), direction: body.direction } })
      return redirect(`/admin/ads?flash=${encodeURIComponent(`Drafted ${ads.length} ad${ads.length === 1 ? '' : 's'}: ${ads.map((ad) => ad.format).join(', ')}.`)}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not draft'}`)
    }
  })

  router.get('/admin/ads/:id', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'ads', 'Ad', growth.adDetail(ctxFor(current, ctx), ctx.params.id as string))
  })

  router.post('/admin/ads/:id/save', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const ad = getAd(db(), current.store.id, ctx.params.id as string)
    if (!ad) return notFound('No such ad')
    const linesOf = (value: unknown) => String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    const scriptCount = Number(body.script_count ?? 0) || 0
    const script = Array.from({ length: scriptCount }, (_, index) => ({ beat: String(body[`script_beat_${index}`] ?? ''), seconds: String(body[`script_seconds_${index}`] ?? ''), line: String(body[`script_line_${index}`] ?? ''), visual: String(body[`script_visual_${index}`] ?? '') }))
    saveAd(db(), current.store.id, {
      id: ad.id,
      name: String(body.name ?? ad.name),
      status: (['draft', 'ready', 'archived'].includes(String(body.status)) ? String(body.status) : ad.status) as 'draft',
      body: {
        hooks: linesOf(body.hooks),
        primaryText: body.primaryText !== undefined ? String(body.primaryText) : ad.body.primaryText,
        headline: String(body.headline ?? ad.body.headline),
        description: String(body.description ?? ad.body.description),
        cta: String(body.cta ?? ad.body.cta),
        ...(body.headlines !== undefined ? { headlines: linesOf(body.headlines) } : {}),
        ...(body.descriptions !== undefined ? { descriptions: linesOf(body.descriptions) } : {}),
        ...(scriptCount ? { script } : {}),
      },
    })
    return back(ctx, 'Saved.')
  })

  router.post('/admin/ads/:id/revise', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const ad = await reviseAd(db(), current.store, ctx.params.id as string, String(body.direction ?? ''))
      return back(ctx, `Revised: "${ad.body.hooks[0] ?? ad.body.headline}".`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not revise'}`)
    }
  })

  router.post('/admin/ads/:id/duplicate', (ctx) => {
    const current = session(ctx)
    const ad = getAd(db(), current.store.id, ctx.params.id as string)
    if (!ad) return notFound('No such ad')
    const copy = saveAd(db(), current.store.id, { productId: ad.productId, platform: ad.platform, format: ad.format, name: `${ad.name} (copy)`, direction: ad.direction, avatarId: ad.avatarId, body: ad.body, status: 'draft' })
    return redirect(`/admin/ads/${copy.id}?flash=${encodeURIComponent('Duplicated. This is the copy.')}`)
  })

  router.post('/admin/ads/:id/delete', (ctx) => {
    const current = session(ctx)
    deleteAd(db(), current.store.id, ctx.params.id as string)
    return redirect(`/admin/ads?flash=${encodeURIComponent('Deleted.')}`)
  })

  router.post('/admin/ads/inspiration/keep', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const saved = saveInspiration(db(), current.store.id, { hook: String(body.hook ?? ''), brand: String(body.brand ?? ''), url: String(body.url ?? ''), primaryText: String(body.primaryText ?? ''), source: String(body.source ?? 'paste') as 'paste' })
      return back(ctx, `Kept "${saved.hook.slice(0, 60)}".`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not keep that'}`)
    }
  })

  router.post('/admin/ads/inspiration/read', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const read = await readInspiration({ url: String(body.url ?? ''), text: String(body.text ?? ''), brand: String(body.brand ?? '') }, undefined, modelFor(db(), current.store.id, 'extraction'))
      const saved = saveInspiration(db(), current.store.id, read)
      return back(ctx, `Kept "${saved.hook.slice(0, 60)}" (${saved.angle}).${saved.notes ? ` ${saved.notes}` : ''}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not read that'}`)
    }
  })

  router.post('/admin/ads/inspiration/:id/delete', (ctx) => {
    const current = session(ctx)
    deleteInspiration(db(), current.store.id, ctx.params.id as string)
    return back(ctx, 'Removed from the swipe file.')
  })

  /* -------------------------------------------------------------- build */

  router.get('/admin/build', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'build', 'Build', plan.buildPage(ctxFor(current, ctx)))
  })

  router.post('/admin/build/mode', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const mode = modeById(String(body.mode ?? ''))
    if (!mode) return back(ctx, '!No such build mode.')
    setBuildMode(db(), current.store.id, mode.id)
    return back(ctx, `Building as "${mode.name}". First step: ${mode.steps[0]?.label}.`)
  })

  router.post('/admin/build/shape', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const doors = Array.isArray(body.doors) ? body.doors.map(String) : body.doors ? [String(body.doors)] : []
    try {
      const state = setSiteShape(db(), current.store.id, { ...(body.shape ? { shape: String(body.shape) } : {}), doors, popup: String(body.popup ?? '') })
      return back(ctx, `Shape saved: ${state.shape || 'undecided'}${state.doors.length ? ` with ${state.doors.join(' and ')} in front` : ''}. The page plan is below.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : String(error)}`)
    }
  })

  router.post('/admin/build/answers', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const state = saveAnswers(db(), current.store.id, Object.fromEntries(QUESTIONS.map((question) => [question.key, { value: String(body[question.key] ?? ''), unknown: body[`${question.key}_unknown`] === 'true' }])))
    const unknown = Object.values(state.answers).filter((answer) => answer.unknown).length
    return back(ctx, `Answers saved.${unknown ? ` ${unknown} marked "I don't know" — the market analysis will fill them in and label them as assumed.` : ''}`)
  })

  router.post('/admin/build/skip', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    skipStep(db(), current.store.id, String(body.key ?? ''), body.skipped !== 'false')
    return back(ctx, body.skipped !== 'false' ? 'Step skipped. It stays on the list so you can come back to it.' : 'Step is back in the plan.')
  })

  /* ------------------------------------------------------------- market */

  router.get('/admin/market', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'market', 'Market', plan.marketPage(ctxFor(current, ctx)))
  })

  router.post('/admin/market/analysis', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const doc = await runAnalysis(db(), current.store.id, { ...(body.notes ? { notes: String(body.notes) } : {}) })
      return back(ctx, `Market analysis ${doc.source === 'rules' ? 'written from the research by rules; set a model key for the real read' : `written by ${doc.model}`}. ${doc.body.standOut.found ? `Stand out via ${doc.body.standOut.via}.` : 'No way to stand out has been found yet — read the recommendation.'}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not write the analysis'}`)
    }
  })

  router.post('/admin/market/overview', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const doc = await runOverview(db(), current.store.id, String(body.productId ?? ''), current.store.currency)
      return back(ctx, `Product overview written for ${doc.body.name} (${doc.source}). Everything in it is assumed until you confirm it.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not write the overview'}`)
    }
  })

  router.post('/admin/market/plan', async (ctx) => {
    const current = session(ctx)
    try {
      const doc = await runAdPlan(db(), current.store.id)
      return back(ctx, `Ad plan: ${doc.body.rows.length} rows (${doc.source}).`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not write the plan'}`)
    }
  })

  router.post('/admin/market/plan/:index', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const status = ['idea', 'working', 'learning', 'done'].includes(String(body.status)) ? (String(body.status) as AdPlanRow['status']) : 'idea'
    try {
      updatePlanRow(db(), current.store.id, Number(ctx.params.index), { angle: String(body.angle ?? ''), variations: String(body.variations ?? '').split('\n').map((line) => line.trim()).filter(Boolean), status: status === 'done' && !String(body.learnings ?? '').trim() ? 'learning' : status, result: String(body.result ?? ''), learnings: String(body.learnings ?? '') })
      return back(ctx, status === 'done' && !String(body.learnings ?? '').trim() ? 'Saved as learning: a row is not done until its learnings are written.' : 'Row saved.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not save'}`)
    }
  })

  router.post('/admin/market/loop', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const linesOf = (value: unknown) => String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    saveLoop(db(), current.store.id, { ...(body.id ? { id: String(body.id) } : {}), failing: String(body.failing ?? ''), working: String(body.working ?? ''), hypotheses: linesOf(body.hypotheses), actions: linesOf(body.actions), outcome: String(body.outcome ?? '') })
    return back(ctx, 'Feedback loop saved.')
  })

  router.post('/admin/market/docs/:id/delete', (ctx) => {
    const current = session(ctx)
    deleteDoc(db(), current.store.id, ctx.params.id as string)
    return back(ctx, 'Deleted.')
  })

  router.post('/admin/avatars/:id/subs', async (ctx) => {
    const current = session(ctx)
    try {
      const subs = await suggestSubAvatars(db(), current.store.id, ctx.params.id as string)
      return back(ctx, `${subs.length} sub-avatars on file under that core avatar. Turn on the ones to write to.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not suggest'}`)
    }
  })

  /* ----------------------------------------------------------- creative */

  router.get('/admin/creative', (ctx) => {
    const current = session(ctx)
    return page(ctx, current, 'creative', 'Creative', plan.creativePage(ctxFor(current, ctx)))
  })

  router.post('/admin/creative/briefs', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const product = getProduct(db(), current.store.id, String(body.productId ?? ''))
    if (!product) return back(ctx, '!No such product.')
    const briefs = queuePhotoBriefs(db(), current.store.id, product)
    return back(ctx, `${briefs.length} photo briefs on the queue for ${product.title}.`)
  })

  router.post('/admin/creative/ugc', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const product = getProduct(db(), current.store.id, String(body.productId ?? ''))
    if (!product) return back(ctx, '!No such product.')
    const avatar = body.avatarId ? getAvatar(db(), current.store.id, String(body.avatarId)) : listAvatars(db(), current.store.id).find((entry) => entry.selected) ?? null
    try {
      const items = await queueUgcConcepts(db(), current.store.id, product, avatar, latestResearch(db(), current.store.id), modelFor(db(), current.store.id, 'ads'))
      return back(ctx, `${items.length} concepts queued for vetting. They are briefs for a real person to film, never reviews.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not write concepts'}`)
    }
  })

  router.post('/admin/creative/gif', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const item = makeProductGif(db(), current.store.id, { productId: String(body.productId ?? ''), delay: Number(body.delay ?? 70) || 70, maxSide: Number(body.maxSide ?? 480) || 480 })
      return back(ctx, `${item.title} is on the queue; approve it to add it to the product.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not make the GIF'}`)
    }
  })

  router.post('/admin/creative/:id/status', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const itemId = ctx.params.id as string
    const item = getQueueItem(db(), current.store.id, itemId)
    if (!item) return back(ctx, '!No such item.')
    const status = String(body.status ?? '')
    if (status === 'delete') { deleteQueueItem(db(), current.store.id, itemId); return back(ctx, 'Deleted.') }
    if (status === 'approved' && item.kind === 'gif') { approveGif(db(), current.store.id, itemId); return back(ctx, 'Approved and added to the product\'s media.') }
    if (status === 'approved' || status === 'rejected') { setQueueStatus(db(), current.store.id, itemId, status, String(body.note ?? '')); return back(ctx, status === 'approved' ? 'Approved.' : 'Rejected.') }
    return back(ctx, '!Unknown action.')
  })

  /* -------------------------------------------------------- pages: rip, suggest */

  router.post('/admin/pages/rip', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const result = await ripToPage(db(), current.store, { url: String(body.url ?? '').trim(), html: String(body.html ?? ''), productId: String(body.productId ?? ''), keepAngle: body.keepAngle !== 'false', direction: String(body.direction ?? ''), avatarId: String(body.avatarId ?? '') })
      recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'rip_funnel', target: result.page.id, diff: { sourceUrl: result.rip.sourceUrl, sections: result.rip.sections.length } })
      return redirect(`/admin/pages/${result.page.id}/edit?flash=${encodeURIComponent(`Built from ${result.rip.sections.length} sections; ${result.rip.imageBriefs.length} image briefs are in the alt text of the image blocks. ${result.source === 'model' ? 'The copy is written.' : 'No model is configured, so the copy is placeholders that say what each section did.'}`)}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not read that page'}`)
    }
  })

  router.post('/admin/pages/suggest', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const goal = (PAGE_GOALS.includes(String(body.goal) as PageGoal) ? String(body.goal) : 'offer') as PageGoal
    const product = body.productId ? getProduct(db(), current.store.id, String(body.productId)) : null
    const avatar = body.avatarId ? getAvatar(db(), current.store.id, String(body.avatarId)) : listAvatars(db(), current.store.id).find((entry) => entry.selected) ?? null
    const suggestion = await suggestBlocks(modelFor(db(), current.store.id, 'pages'), { goal, product, research: latestResearch(db(), current.store.id), avatar, direction: String(body.direction ?? ''), custom: customCatalog(db(), current.store.id) })
    const created = createPage(db(), current.store.id, { title: `${product ? `${product.title} — ` : ''}${goal} page (suggested)`, kind: goal === 'advertorial' ? 'advertorial' : goal === 'checkout' ? 'checkout' : goal === 'pdp' ? 'product' : 'landing', role: goal === 'checkout' ? 'checkout' : 'page', blocks: suggestion.blocks.map((block) => newBlock(block.type, block.settings ?? {})), ...(product && goal !== 'checkout' ? { productId: product.id } : {}) })
    return redirect(`/admin/pages/${created.id}/edit?flash=${encodeURIComponent(`${suggestion.blocks.length} blocks laid out (${suggestion.source}). ${suggestion.note}`)}`)
  })

  /* -------------------------------------------------------- popup, legal */

  router.post('/admin/popup', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const trigger = ['exit', 'delay', 'scroll'].includes(String(body.trigger)) ? (String(body.trigger) as 'exit') : 'exit'
    const kind = (['email', 'offer', 'quiz'] as const).find((entry) => entry === String(body.kind ?? '')) ?? 'email'
    setTheme(db(), current.store.id, { popup: { enabled: body.enabled === 'true', trigger, after: Number(body.after ?? 20) || 20, kind, headline: String(body.headline ?? ''), text: String(body.text ?? ''), code: String(body.code ?? '').trim(), buttonLabel: String(body.buttonLabel ?? 'Send it'), href: String(body.href ?? '#offer').trim() || '#offer', validDays: Math.max(0, Number(body.validDays ?? 0) || 0), image: String(body.image ?? '').trim(), dismissDays: Number(body.dismissDays ?? 7) || 7 } }, { build: 'Popup edited' })
    return back(ctx, body.enabled === 'true' ? 'Popup saved to the draft. Publish to make it live.' : 'Popup is off in the draft.')
  })

  router.post('/admin/legal', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    saveLegal(db(), current.store.id, { company: String(body.company ?? ''), email: String(body.email ?? ''), address: String(body.address ?? ''), country: String(body.country ?? ''), returnsDays: Number(body.returnsDays ?? 30) || 30, guaranteeDays: Number(body.guaranteeDays ?? 30) || 30, privacyExtra: String(body.privacyExtra ?? ''), termsExtra: String(body.termsExtra ?? '') })
    return back(ctx, 'Legal details saved. The privacy and terms pages read them now.')
  })

  /* ------------------------------------------------------------ avatars */

  router.post('/admin/avatars/suggest', async (ctx) => {
    const current = session(ctx)
    const avatars = await suggestAvatars(db(), current.store.id)
    return back(ctx, avatars.length ? `${avatars.length} avatars on file.` : '!Run research first; avatars are suggested from it.')
  })

  router.post('/admin/avatars/save', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    if (body.toggle === 'true' && body.id) {
      const avatar = saveAvatar(db(), current.store.id, { id: String(body.id), name: String(body.name ?? ''), selected: body.selected === 'true' })
      return back(ctx, `${avatar.name} is ${avatar.selected ? 'on' : 'off'}.`)
    }
    try {
      const avatar = saveAvatar(db(), current.store.id, {
        ...(body.id ? { id: String(body.id) } : {}),
        name: String(body.name ?? ''),
        who: String(body.who ?? ''),
        wants: String(body.wants ?? ''),
        fears: String(body.fears ?? ''),
        buysWhen: String(body.buysWhen ?? ''),
        share: (Number(body.share ?? 0) || 0) / 100,
        angle: String(body.angle ?? ''),
        hooks: String(body.hooks ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
        tone: String(body.tone ?? 'plain') as 'plain',
        objection: String(body.objection ?? ''),
        answer: String(body.answer ?? ''),
        selected: body.selected === 'true',
        ...(body.desire !== undefined ? { desire: String(body.desire ?? ''), experience: String(body.experience ?? ''), emotion: String(body.emotion ?? ''), behaviour: String(body.behaviour ?? ''), demographic: String(body.demographic ?? ''), label: String(body.label ?? ''), tier: (['niche', 'mid', 'mass'].includes(String(body.tier)) ? String(body.tier) : '') as 'niche', parentId: String(body.parentId ?? '') } : {}),
        ...(body.id ? {} : { source: 'manual' as const }),
      })
      return back(ctx, `Saved ${avatar.name}.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not save'}`)
    }
  })

  router.post('/admin/avatars/:id/delete', (ctx) => {
    const current = session(ctx)
    deleteAvatar(db(), current.store.id, ctx.params.id as string)
    return back(ctx, 'Avatar deleted.')
  })

  /* -------------------------------------------------------- competitors */

  router.post('/admin/competitors/read', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const angle = await readCompetitor({ url: String(body.url ?? ''), html: String(body.html ?? '') }, undefined, modelFor(db(), current.store.id, 'extraction'))
      const record = saveCompetitor(db(), current.store.id, { productId: String(body.productId ?? ''), angle })
      return back(ctx, `${record.brand || 'The page'} runs the ${record.angle} angle${record.headline ? `: "${record.headline.slice(0, 70)}"` : ''}. Edit what was pulled below.${record.notes.length ? ` ${record.notes.join(' ')}` : ''}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not read that page'}`)
    }
  })

  router.post('/admin/competitors/:id/save', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const linesOf = (value: unknown) => String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    saveCompetitor(db(), current.store.id, {
      id: ctx.params.id as string,
      productId: String(body.productId ?? ''),
      angle: {
        brand: String(body.brand ?? ''),
        url: String(body.url ?? ''),
        angle: String(body.angle ?? 'benefit') as AngleKind,
        headline: String(body.headline ?? ''),
        subheadline: String(body.subheadline ?? ''),
        hooks: linesOf(body.hooks),
        benefits: linesOf(body.benefits),
        offer: { price: String(body.price ?? ''), comparePrice: String(body.comparePrice ?? ''), discount: String(body.discount ?? ''), shipping: String(body.shipping ?? ''), guarantee: String(body.guarantee ?? ''), bundle: String(body.bundle ?? '') },
        proof: { reviewCount: String(body.reviewCount ?? ''), rating: String(body.rating ?? ''), badges: String(body.badges ?? '').split(',').map((line) => line.trim()).filter(Boolean) },
        audience: String(body.audience ?? ''),
        ctas: String(body.ctas ?? '').split('|').map((line) => line.trim()).filter(Boolean),
        take: String(body.take ?? ''),
      },
    })
    return back(ctx, 'Saved.')
  })

  router.post('/admin/competitors/:id/apply', (ctx) => {
    const current = session(ctx)
    try {
      const research = applyCompetitor(db(), current.store.id, ctx.params.id as string)
      return back(ctx, `Folded in. The research now lists ${research.competitors.length} competitors and ${research.triggers.length} triggers.`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not apply'}`)
    }
  })

  router.post('/admin/competitors/:id/versions', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const record = getCompetitor(db(), current.store.id, ctx.params.id as string)
    if (!record?.productId) return back(ctx, '!Pick which product this competes with first.')
    try {
      const pages = await generateVersions(db(), current.store, { productId: record.productId, kind: 'pdp', direction: String(body.direction ?? ''), count: 2 })
      return redirect(`/admin/products/${record.productId}?flash=${encodeURIComponent(`Generated ${pages.length} versions from the ${record.angle} angle.`)}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not generate'}`)
    }
  })

  router.post('/admin/competitors/:id/ads', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const record = getCompetitor(db(), current.store.id, ctx.params.id as string)
    if (!record?.productId) return back(ctx, '!Pick which product this competes with first.')
    try {
      const ads = await draftAds(db(), current.store, { productId: record.productId, direction: String(body.direction ?? ''), count: 3 })
      return redirect(`/admin/ads?flash=${encodeURIComponent(`Drafted ${ads.length} ads from the ${record.angle} angle.`)}`)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not draft'}`)
    }
  })

  router.post('/admin/competitors/:id/delete', (ctx) => {
    const current = session(ctx)
    deleteCompetitor(db(), current.store.id, ctx.params.id as string)
    return back(ctx, 'Deleted.')
  })

  /* -------------------------------------------------------------- images */

  router.post('/admin/products/:id/regenerate', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    try {
      const result = await execute(
        'regenerate_product_image',
        { productId: ctx.params.id as string, direction: String(body.direction ?? ''), preset: String(body.preset ?? 'white-seamless'), provider: String(body.provider ?? 'auto'), lanes: Math.min(4, Math.max(1, Number(body.lanes ?? 3) || 3)) },
        { db: db(), storeId: current.store.id, actor: { type: 'user', id: current.user.id }, page: 'products' },
      )
      return back(ctx, result.summary)
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not render'}`)
    }
  })

  router.post('/admin/products/:id/use-image', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const product = getProduct(db(), current.store.id, ctx.params.id as string)
    if (!product) return notFound('No such product')
    const url = String(body.url ?? '')
    if (!url) return back(ctx, '!No image chosen.')
    const alt = `${product.title}`
    if (body.as === 'hero') updateProduct(db(), current.store.id, product.id, { heroImage: url, media: [{ url, alt }, ...product.media.filter((entry) => entry.url !== url)].slice(0, 8) })
    else updateProduct(db(), current.store.id, product.id, { media: [...product.media.filter((entry) => entry.url !== url), { url, alt }].slice(0, 8) })
    return back(ctx, body.as === 'hero' ? 'That is the hero image now.' : 'Added to the gallery.')
  })

  router.post('/admin/team', async (ctx) => {
    const current = session(ctx)
    requireRole(db(), current.user.id, current.store.id, 'owner')
    const body = await ctx.body()
    try {
      const result = inviteTeammate(db(), current.store.id, String(body.email ?? ''), String(body.role ?? 'member') as 'member')
      return back(ctx, result.joined ? 'They already had an account and now have access.' : 'Invite created.')
    } catch (error) {
      return back(ctx, `!${error instanceof Error ? error.message : 'Could not invite'}`)
    }
  })

  /** Which model writes what, per store. Empty means the environment default. */
  router.post('/admin/settings/models', async (ctx) => {
    const current = session(ctx)
    const body = await ctx.body()
    const models: Partial<Record<Task, string>> = {}
    for (const task of TASKS) {
      const value = String(body[task.id] ?? '')
      const choice = parseChoice(value)
      if (choice && catalog().some((entry) => entry.provider === choice.provider && entry.model === choice.model)) models[task.id] = value
    }
    updateStore(db(), current.store.id, { models })
    recordAudit(db(), { storeId: current.store.id, actorType: 'user', actorId: current.user.id, action: 'set_models', diff: models })
    return back(ctx, 'Model choices saved for this store.')
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
