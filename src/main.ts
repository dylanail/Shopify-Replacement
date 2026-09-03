import { createServer } from 'node:http'
import { getDb } from './lib/db.ts'
import { escapeHtml, html, HttpError, makeCtx, Raw, redirect, Router, send, sendError, type Ctx } from './lib/http.ts'
import { logger } from './lib/log.ts'
import { renderSvg } from './agent/images.ts'
import { readUpload } from './lib/uploads.ts'
import { recoverRuns } from './agent/runtime.ts'
import './agent/tools/index.ts'
import { adminRouter, NoStores } from './admin/routes.ts'
import { redirectFor, storeFromSlug, storefrontRouter } from './storefront/routes.ts'
import { storeForHost, type Store } from './control/stores.ts'
import { marketingHome } from './marketing.ts'

const log = logger('server')
const PORT = Number(process.env.PORT ?? 4100)
const ROOT_DOMAIN = process.env.AMBORAS_STOREFRONT_HOST ?? ''

/**
 * One process, three surfaces.
 *
 * Which one answers a request is decided by the host: a storefront domain (or
 * a subdomain of the configured root) gets the generated storefront, and
 * everything else gets the control plane. Two path prefixes make the whole
 * thing work on localhost with no DNS at all, and they are deliberately
 * different things:
 *
 *   /s/:slug        the live storefront, tracked, plugins firing — a customer
 *   /preview/:slug  the draft environment, untracked, pixels suppressed — the
 *                   merchant looking at their own unpublished work
 *
 * Collapsing those two would either count the merchant's own dashboard visits
 * as traffic or leave a host-less deployment with no analytics at all.
 */
function resolveStorefront(ctx: Ctx): { store: Store; preview: boolean; rest: string } | null {
  const path = ctx.url.pathname
  for (const [prefix, preview] of [['/preview/', true], ['/s/', false]] as const) {
    if (!path.startsWith(prefix)) continue
    const [slug = '', ...rest] = path.slice(prefix.length).split('/')
    const store = storeFromSlug(slug)
    if (!store) return null
    return { store, preview, rest: `/${rest.join('/')}` }
  }
  if (!ROOT_DOMAIN) return null
  const store = storeForHost(getDb(), ctx.hostname, ROOT_DOMAIN)
  return store ? { store, preview: false, rest: path } : null
}

const admin = adminRouter()
const storefront = storefrontRouter((ctx) => {
  const resolved = (ctx as Ctx & { storefront?: { store: Store; preview: boolean } }).storefront
  return resolved ?? null
})

const server = createServer(async (req, res) => {
  const ctx = makeCtx(req, res, {})
  const wantsHtml = String(req.headers.accept ?? '').includes('text/html')
  try {
    // Generated imagery is deterministic, so it can be cached hard and served
    // without touching the database at all.
    if (ctx.url.pathname === '/_media/render.svg') {
      await send(res, new Raw(renderSvg(ctx.url.searchParams), 'image/svg+xml; charset=utf-8', { 'Cache-Control': 'public, max-age=31536000, immutable' }))
      return
    }
    if (ctx.url.pathname.startsWith('/_uploads/')) {
      const found = readUpload(ctx.url.pathname)
      if (!found) throw new HttpError(404, 'No such upload')
      await send(res, new Raw(found.data, found.type, { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }))
      return
    }
    if (ctx.url.pathname === '/healthz') {
      await send(res, { ok: true, uptime: Math.round(process.uptime()) })
      return
    }

    const store = resolveStorefront(ctx)
    if (store) {
      const moved = redirectFor(store.store, store.rest)
      if (moved) {
        await send(res, redirect(`${ROOT_DOMAIN && !store.preview ? '' : `${store.preview ? '/preview' : '/s'}/${store.store.slug}`}${moved.target}`, moved.code))
        return
      }
      const match = storefront.match(req.method ?? 'GET', store.rest)
      if (match) {
        const scoped = makeCtx(req, res, match.params) as Ctx & { storefront: { store: Store; preview: boolean } }
        scoped.storefront = { store: store.store, preview: store.preview }
        await send(res, await match.handler(scoped))
        return
      }
    }

    const adminMatch = admin.match(req.method ?? 'GET', ctx.url.pathname)
    if (adminMatch) {
      await send(res, await adminMatch.handler(makeCtx(req, res, adminMatch.params)))
      return
    }

    if (ctx.url.pathname === '/') {
      await send(res, html(marketingHome()))
      return
    }
    throw new HttpError(404, 'Nothing here')
  } catch (error) {
    if (error instanceof NoStores) {
      await send(res, redirect('/onboarding'))
      return
    }
    if (error instanceof HttpError && error.status === 401 && wantsHtml) {
      await send(res, redirect('/login'))
      return
    }
    sendError(res, error, wantsHtml)
  }
})

const db = getDb()
recoverRuns(db)
server.listen(PORT, () => {
  log.info(`amboras on http://localhost:${PORT}`)
  log.info(ROOT_DOMAIN ? `storefronts on *.${ROOT_DOMAIN}` : 'storefronts on /preview/:slug (set AMBORAS_STOREFRONT_HOST for subdomains)')
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info(`${signal} — closing`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}

export { server }
