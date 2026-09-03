// First, before any module that reads its settings at import time.
import './lib/env.ts'
import { createServer } from 'node:http'
import { getDb } from './lib/db.ts'
import { HttpError, makeCtx, Raw, redirect, send, sendError, type Ctx } from './lib/http.ts'
import { logger } from './lib/log.ts'
import { renderSvg } from './agent/images.ts'
import { readUpload } from './lib/uploads.ts'
import { recoverRuns, resumeQueuedRuns } from './agent/runtime.ts'
import { sweepAbandonedCarts } from './email/abandoned.ts'
import { sweepReviewRequests } from './email/reviews.ts'
import './agent/tools/index.ts'
import { adminRouter, NoStores } from './admin/routes.ts'
import { redirectFor, storeFromSlug, storefrontRouter } from './storefront/routes.ts'
import { storeForHost, type Store } from './control/stores.ts'
import { tlsAllowed } from './control/domains.ts'

const log = logger('server')
const PORT = Number(process.env.PORT ?? 4100)
// Railway hands every service a public hostname; if no origin was configured
// by hand, that is the one abandoned-cart emails and ad links should carry.
if (!process.env.AMBORAS_PUBLIC_ORIGIN && process.env.RAILWAY_PUBLIC_DOMAIN) process.env.AMBORAS_PUBLIC_ORIGIN = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
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
  // A custom domain is looked up whether or not a storefront root is
  // configured. Returning early here meant that on a deployment without
  // AMBORAS_STOREFRONT_HOST — which is what Railway's own instructions
  // describe — a verified custom domain got a certificate from /_edge/tls-ask
  // and then served the admin login page.
  const store = storeForHost(getDb(), ctx.hostname, ROOT_DOMAIN)
  return store ? { store, preview: false, rest: path } : null
}

/** What a visitor gets at the address of a store that is not open. */
function closedStorefront(store: Store): Raw {
  const paused = store.status === 'paused'
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${paused ? 'Temporarily closed' : 'Not open yet'}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf7f3;color:#1c1a17;
font:15px/1.6 ui-sans-serif,system-ui,sans-serif;padding:2rem;text-align:center}
p{color:#7d746a;max-width:34rem}a{color:#7a4a2b}</style></head><body><div>
<h1 style="font-weight:500">${paused ? 'Temporarily closed' : 'Not open yet'}</h1>
<p>${paused ? 'This shop is paused. It will be back.' : 'This shop has not opened yet.'}</p>
<p style="font-size:13px">If this is your store, it is waiting to be published — open it from <a href="/admin">your admin</a>, or look at the draft at <code>/preview/${store.slug}</code>.</p>
</div></body></html>`
  return new Raw(body, 'text/html; charset=utf-8', { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }, 503)
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
      await send(res, new Raw(renderSvg(ctx.url.searchParams), 'image/svg+xml; charset=utf-8', { 'Cache-Control': 'public, max-age=31536000, immutable' }), req)
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
    // Caddy asks here before issuing a certificate on demand. Only names this
    // deployment actually serves get one: the admin host, the storefront root
    // and its subdomains, and custom domains that have verified as hosted.
    if (ctx.url.pathname === '/_edge/tls-ask') {
      const domain = (ctx.query.get('domain') ?? '').trim().toLowerCase()
      if (domain && tlsAllowed(getDb(), domain, ROOT_DOMAIN)) {
        await send(res, { ok: true, domain })
        return
      }
      throw new HttpError(404, 'Not a hostname this deployment serves')
    }

    const store = resolveStorefront(ctx)
    // A storefront is open when it has been published, and not before. The
    // resolver used to serve any store by slug and quietly fall back to the
    // draft environment, so a store that had never been published was already
    // public, crawlable and buyable at its live address — publishing changed
    // nothing, and pausing was impossible. The merchant's own view of unopened
    // work is /preview/:slug, which is what this points them at.
    if (store && !store.preview && store.store.status !== 'live') {
      await send(res, closedStorefront(store.store), req)
      return
    }
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
        await send(res, await match.handler(scoped), req)
        return
      }
    }

    const adminMatch = admin.match(req.method ?? 'GET', ctx.url.pathname)
    if (adminMatch) {
      await send(res, await adminMatch.handler(makeCtx(req, res, adminMatch.params)), req)
      return
    }

    // This deployment is one person's: there is nothing to sell at the root. It is the admin.
    if (ctx.url.pathname === '/') {
      await send(res, redirect('/admin'), req)
      return
    }
    throw new HttpError(404, 'Nothing here')
  } catch (error) {
    // Signing in with no store yet is an account with nothing in it, not a
    // wizard: the hub says so and offers the one button that fixes it.
    if (error instanceof NoStores) {
      await send(res, redirect('/admin/stores'))
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
// Re-queue what the last process was in the middle of, then actually run it:
// a crash during onboarding used to leave a half-built store and a run marked
// 'queued' that nothing would ever pick up.
recoverRuns(db)
resumeQueuedRuns(db)
// Abandoned carts are swept every ten minutes; the four-hour wait is the
// window the review-app crowd settled on.
const origin = process.env.AMBORAS_PUBLIC_ORIGIN ?? `http://localhost:${PORT}`
setInterval(() => void sweepAbandonedCarts(db, { hours: 4, origin }).catch(() => undefined), 10 * 60_000).unref()
// And the review request the admin promises a week after delivery, which had
// no scheduler behind it at all. Hourly is fine for a seven-day delay.
setInterval(() => void sweepReviewRequests(db).catch(() => undefined), 60 * 60_000).unref()
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
