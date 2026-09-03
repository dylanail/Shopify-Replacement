import { logger } from '../lib/log.ts'
import { saveUpload } from '../lib/uploads.ts'

const log = logger('clone')

/**
 * Reference-page cloning.
 *
 * The merchant pastes a URL and gets that page back as a document they own:
 * stylesheets inlined, every relative URL made absolute, images copied into
 * their own uploads so the clone survives the source going away. Scripts are
 * dropped unless asked for — a competitor's pixel firing on your store is not
 * a feature — and nothing is "improved": what comes back is the page.
 *
 * It is then either edited as HTML, or read into blocks as a starting point.
 */
export type CloneOptions = {
  keepScripts?: boolean
  localizeImages?: boolean
  /** Store id the copied images are filed under. */
  storeId: string
  fetchImpl?: typeof fetch
  maxImages?: number
}

export type CloneResult = {
  html: string
  title: string
  description: string
  sourceUrl: string
  stylesheets: number
  imagesLocalized: number
  notes: string[]
}

const UA = 'Mozilla/5.0 (compatible; AmborasClone/1.0; +https://amboras.app)'

export async function clonePage(url: string, options: CloneOptions): Promise<CloneResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const notes: string[] = []
  const source = new URL(url)
  const response = await fetchImpl(source, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow' })
  if (!response.ok) throw new Error(`The page answered ${response.status}`)
  const finalUrl = new URL(response.url || url)
  let html = await response.text()
  if (html.length > 3_000_000) throw new Error('That page is over 3MB of HTML; clone something smaller')

  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? finalUrl.hostname
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html)?.[1]?.trim() ?? ''

  // <base> would re-root every relative URL on the clone; we resolve them ourselves.
  const base = /<base[^>]+href=["']([^"']+)/i.exec(html)?.[1]
  const root = base ? new URL(base, finalUrl) : finalUrl
  html = html.replace(/<base[^>]*>/gi, '')
  // A copied CSP would block the store's own scripts and fonts.
  html = html.replace(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi, '')

  const absolute = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || /^(data:|blob:|javascript:|#|mailto:|tel:)/i.test(trimmed)) return trimmed
    try {
      return new URL(trimmed, root).toString()
    } catch {
      return trimmed
    }
  }

  // Inline stylesheets so the page does not depend on the source host's CSS.
  let stylesheets = 0
  const linkPattern = /<link\b[^>]*>/gi
  const links = html.match(linkPattern) ?? []
  for (const tag of links) {
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue
    const href = /href=["']([^"']+)/i.exec(tag)?.[1]
    if (!href) continue
    const cssUrl = absolute(href)
    try {
      const cssResponse = await fetchImpl(cssUrl, { headers: { 'user-agent': UA } })
      if (!cssResponse.ok) throw new Error(String(cssResponse.status))
      let css = await cssResponse.text()
      css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_match, quote: string, target: string) => `url(${quote}${absoluteFrom(target, cssUrl)}${quote})`)
      css = css.replace(/@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?[^;]*;/g, (_match, target: string) => `/* @import ${absoluteFrom(target, cssUrl)} kept as link */`)
      html = html.replace(tag, `<style data-cloned-from="${cssUrl.replace(/"/g, '')}">${css}</style>`)
      stylesheets++
    } catch (error) {
      notes.push(`Kept a link to ${cssUrl} — it could not be fetched (${error instanceof Error ? error.message : 'error'})`)
      html = html.replace(tag, tag.replace(/href=["'][^"']+["']/i, `href="${cssUrl}"`))
    }
  }

  // Everything else that points somewhere becomes absolute.
  html = html.replace(/(\s(?:href|src|poster|action))=(["'])([^"']*)\2/gi, (_match, attribute: string, quote: string, value: string) => `${attribute}=${quote}${absolute(value)}${quote}`)
  html = html.replace(/(\ssrcset)=(["'])([^"']*)\2/gi, (_match, attribute: string, quote: string, value: string) =>
    `${attribute}=${quote}${value.split(',').map((candidate) => { const [target = '', size] = candidate.trim().split(/\s+/); return [absolute(target), size].filter(Boolean).join(' ') }).join(', ')}${quote}`)
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, css: string) => match.replace(css, css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, quote: string, target: string) => `url(${quote}${absolute(target)}${quote})`)))

  if (!options.keepScripts) {
    const count = (html.match(/<script\b/gi) ?? []).length
    html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/\son[a-z]+=(["'])[^"']*\1/gi, '')
    if (count) notes.push(`Dropped ${count} script${count === 1 ? '' : 's'} (tracking, chat widgets, the source's own app). Re-clone with "keep scripts" if the page needs them.`)
  }

  // Copy images in, so the clone does not depend on the source host staying up.
  let imagesLocalized = 0
  if (options.localizeImages !== false) {
    const seen = new Map<string, string>()
    const targets = [...new Set([...html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)].map((match) => match[1] as string))]
      .filter((target) => /^https?:/i.test(target))
      .slice(0, options.maxImages ?? 40)
    for (const target of targets) {
      try {
        const imageResponse = await fetchImpl(target, { headers: { 'user-agent': UA } })
        if (!imageResponse.ok) continue
        const type = (imageResponse.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
        const data = Buffer.from(await imageResponse.arrayBuffer())
        if (data.length > 6 * 1024 * 1024) continue
        const saved = saveUpload({ name: target.split('/').pop() ?? 'image', type, data }, options.storeId)
        seen.set(target, saved.url)
        imagesLocalized++
      } catch (error) {
        log.debug(`kept remote image ${target}: ${error instanceof Error ? error.message : error}`)
      }
    }
    for (const [remote, local] of seen) html = html.split(remote).join(local)
  }

  return { html, title, description, sourceUrl: finalUrl.toString(), stylesheets, imagesLocalized, notes }
}

function absoluteFrom(target: string, from: string): string {
  const trimmed = target.trim()
  if (/^(data:|blob:|#)/i.test(trimmed)) return trimmed
  try {
    return new URL(trimmed, from).toString()
  } catch {
    return trimmed
  }
}

/**
 * A rough read of a cloned page into blocks — headings, paragraphs and images
 * in document order — so it can be used as a template for the merchant's own
 * product rather than edited as a wall of markup. It is a starting point and
 * says so; nothing about a stranger's layout survives except the words and
 * the pictures.
 */
export function extractBlocks(html: string): Array<{ type: string; settings: Record<string, unknown> }> {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const cleaned = body.replace(/<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, '')
  const blocks: Array<{ type: string; settings: Record<string, unknown> }> = []
  const pattern = /<(h1|h2|h3|p|img|blockquote|li)\b([^>]*)>([\s\S]*?)<\/\1>|<img\b([^>]*)\/?>/gi
  let match: RegExpExecArray | null
  let paragraphs: string[] = []
  const flush = () => {
    if (paragraphs.length) blocks.push({ type: 'rich-text', settings: { text: paragraphs.join('\n\n') } })
    paragraphs = []
  }
  while ((match = pattern.exec(cleaned)) && blocks.length < 80) {
    const tag = (match[1] ?? 'img').toLowerCase()
    const attrs = match[2] ?? match[4] ?? ''
    const text = strip(match[3] ?? '')
    if (tag === 'img') {
      const src = /src=["']([^"']+)/i.exec(attrs)?.[1]
      if (src && !/\.(svg|gif)(\?|$)/i.test(src) && !/logo|icon|sprite/i.test(src)) {
        flush()
        blocks.push({ type: 'image', settings: { src, alt: /alt=["']([^"']*)/i.exec(attrs)?.[1] ?? '' } })
      }
      continue
    }
    if (!text || text.length < 3) continue
    if (tag === 'h1') { flush(); blocks.push({ type: 'headline', settings: { text, level: 'h1' } }) }
    else if (tag === 'h2' || tag === 'h3') { flush(); blocks.push({ type: 'headline', settings: { text, level: tag } }) }
    else if (tag === 'blockquote') { flush(); blocks.push({ type: 'pull-quote', settings: { quote: text } }) }
    else if (text.length > 20) paragraphs.push(text)
  }
  flush()
  return blocks
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}
