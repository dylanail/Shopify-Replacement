import type { Db } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { relocateUploads } from '../lib/uploads.ts'
import { clonePage, type CloneResult } from '../pages/clone.ts'
import { createPage, updatePage, type Page } from '../pages/store.ts'
import { seedDefaultRegion } from '../domain/regions.ts'
import { upsertFunnel } from '../domain/funnels.ts'
import { seedTodos } from './todos.ts'
import { createStore, setTheme, type Store } from './stores.ts'
import { setBuildMode, setSiteShape } from './build.ts'

export type AssetKind = Store['kind']

export function createBlankAsset(db: Db, ownerId: string, input: { name: string; kind: AssetKind; currency?: string }): Store {
  const name = input.name.trim()
  if (name.length < 2) throw new Error('Give the asset a name')
  const currency = (input.currency ?? 'USD').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter code')
  const store = createStore(db, ownerId, { name, kind: input.kind, currency, prompt: input.kind === 'funnel' ? `A conversion funnel for ${name}` : `An online store for ${name}` })
  seedDefaultRegion(db, store.id, currency)
  seedTodos(db, store.id)
  setBuildMode(db, store.id, 'own-product')
  setSiteShape(db, store.id, { shape: input.kind })
  setTheme(db, store.id, input.kind === 'funnel' ? { nav: [], sections: [] } : {}, { build: `Created blank ${input.kind}` })
  return store
}

export async function importAssetFromUrl(
  db: Db,
  ownerId: string,
  input: { url: string; name?: string; kind: AssetKind; currency?: string; fetchImpl?: typeof fetch },
): Promise<{ store: Store; page: Page; pages: Page[]; clone: CloneResult }> {
  const url = input.url.trim()
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Paste a full URL starting with https://')
  const pendingId = id('import')
  const cloneOptions = { storeId: pendingId, keepScripts: false, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}) }
  const homeClone = await clonePage(url, cloneOptions)
  const documents: CloneResult[] = [homeClone]
  if (input.kind === 'store') {
    for (const linked of discoverStoreUrls(homeClone.html, homeClone.sourceUrl).slice(0, 7)) {
      try {
        documents.push(await clonePage(linked, { ...cloneOptions, maxImages: 12 }))
      } catch (error) {
        homeClone.notes.push(`Skipped ${linked}: ${error instanceof Error ? error.message : 'could not read it'}`)
      }
    }
  }
  const inferredName = homeClone.title.split(/\s+[|–—]\s+/)[0]?.trim() || new URL(homeClone.sourceUrl).hostname.replace(/^www\./, '')
  const store = createBlankAsset(db, ownerId, {
    name: input.name?.trim() || inferredName.slice(0, 80),
    kind: input.kind,
    currency: input.currency,
  })
  relocateUploads(pendingId, store.id)
  const pages = documents.map((document, index) => {
    const path = new URL(document.sourceUrl).pathname
    const created = createPage(db, store.id, {
      title: index === 0 ? input.kind === 'store' ? 'Imported home page' : 'Imported sales page' : document.title || path.split('/').filter(Boolean).at(-1) || 'Imported page',
      kind: input.kind === 'funnel' ? 'landing' : path.startsWith('/products/') ? 'product' : 'custom',
      role: input.kind === 'funnel' ? 'offer' : path.startsWith('/products/') ? 'pdp' : 'page',
      mode: 'html',
      rawHtml: document.html.split(`/_uploads/${pendingId}/`).join(`/_uploads/${store.id}/`),
      seo: { title: document.title, description: document.description },
      status: 'draft',
      sourceUrl: document.sourceUrl,
    })
    return index === 0 && input.kind === 'store' ? updatePage(db, store.id, created.id, { isHome: true }) : created
  })
  const page = pages[0] as Page
  if (input.kind === 'store') {
    const routes = pages.slice(1).map((created, offset) => ({ source: documents[offset + 1]?.sourceUrl ?? '', target: `/pages/${created.handle}` }))
    routes.push({ source: documents[0]?.sourceUrl ?? '', target: '/' })
    pages.forEach((created) => {
      let rawHtml = created.rawHtml
      for (const route of routes) {
        if (!route.source) continue
        rawHtml = rawHtml.split(route.source).join(route.target)
        rawHtml = rawHtml.split(route.source.replace(/\/$/, '')).join(route.target)
      }
      updatePage(db, store.id, created.id, { rawHtml })
    })
  } else upsertFunnel(db, store.id, { name: `${store.name} funnel`, offerPageId: page.id, status: 'active' })
  const stylesheets = documents.reduce((sum, document) => sum + document.stylesheets, 0)
  const imagesLocalized = documents.reduce((sum, document) => sum + document.imagesLocalized, 0)
  db.update('stores', store.id, { reference_url: homeClone.sourceUrl })
  setTheme(db, store.id, {}, { build: `Cloned ${documents.length} pages from ${homeClone.sourceUrl}; ${stylesheets} stylesheets and ${imagesLocalized} images localized` })
  const freshPages = pages.map((created) => updatePage(db, store.id, created.id, {}))
  return {
    store: { ...store, referenceUrl: homeClone.sourceUrl },
    page: freshPages[0] as Page,
    pages: freshPages,
    clone: { ...homeClone, html: freshPages[0]?.rawHtml ?? homeClone.html, stylesheets, imagesLocalized, notes: [...new Set(documents.flatMap((document) => document.notes))] },
  }
}

function discoverStoreUrls(html: string, sourceUrl: string): string[] {
  const source = new URL(sourceUrl)
  const urls = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)/gi)) {
    try {
      const candidate = new URL(match[1] as string, source)
      if (candidate.origin !== source.origin || !/^\/(?:products|collections|pages|blogs)\//i.test(candidate.pathname)) continue
      candidate.hash = ''
      candidate.search = ''
      const normalized = candidate.toString()
      if (normalized !== sourceUrl) urls.add(normalized)
    } catch { /* malformed source links are ignored */ }
  }
  return [...urls]
}
