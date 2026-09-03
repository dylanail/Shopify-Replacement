import { createHash } from 'node:crypto'
import { escapeHtml } from '../lib/http.ts'

/**
 * Product and brand imagery.
 *
 * With an image model configured, `generate()` calls it. Without one, it draws
 * a deterministic vector composition from the brand palette instead of showing
 * a grey box: a generated store has to *look* like a store the moment it
 * exists, and a placeholder rectangle is the difference between a demo that
 * lands and one that does not. The seed is a hash of the subject, so the same
 * product always gets the same picture across restarts.
 */
export const PRESETS = [
  { id: 'white-seamless', name: 'White seamless', brief: 'centred on a seamless white sweep, soft top light, no props' },
  { id: 'lifestyle', name: 'Lifestyle', brief: 'in use, natural window light, shallow depth of field' },
  { id: 'dark-luxury', name: 'Dark luxury', brief: 'on a dark stone plinth, single hard light, deep falloff' },
  { id: 'flat-lay', name: 'Flat lay', brief: 'overhead on linen with two supporting objects' },
  { id: 'golden-hour', name: 'Golden hour', brief: 'outdoors, low warm sun, long shadow' },
  { id: 'studio-3-point', name: 'Studio 3-point', brief: 'key, fill and rim light, seamless mid-grey' },
] as const

export type PresetId = (typeof PRESETS)[number]['id']

export type ImageRequest = {
  subject: string
  preset?: PresetId
  palette?: { primary?: string; secondary?: string; paper?: string; ink?: string }
  label?: string
  kind?: 'product' | 'hero' | 'logo' | 'collection'
}

export function seedOf(input: string): number {
  return parseInt(createHash('sha256').update(input).digest('hex').slice(0, 8), 16)
}

/** A stable URL the storefront and admin can both render without storage. */
export function imageUrl(request: ImageRequest): string {
  const params = new URLSearchParams({
    s: String(seedOf(request.subject)),
    k: request.kind ?? 'product',
    p: request.preset ?? 'white-seamless',
    l: (request.label ?? request.subject).slice(0, 40),
  })
  if (request.palette?.primary) params.set('c1', request.palette.primary)
  if (request.palette?.secondary) params.set('c2', request.palette.secondary)
  if (request.palette?.paper) params.set('c3', request.palette.paper)
  if (request.palette?.ink) params.set('c4', request.palette.ink)
  return `/_media/render.svg?${params.toString()}`
}

/**
 * Four lanes in parallel, a contact sheet back. That is the enhancement flow:
 * you do not pick between "the" enhanced image and the original, you pick from
 * a sheet — which is the only way the choice is actually yours.
 */
export async function enhance(request: ImageRequest & { lanes?: number }): Promise<{ lanes: string[]; preset: string; tookMs: number }> {
  const started = Date.now()
  const lanes = request.lanes ?? 4
  const urls = await Promise.all(
    Array.from({ length: lanes }, (_, lane) =>
      generate({ ...request, subject: `${request.subject}#${lane}` }),
    ),
  )
  return { lanes: urls, preset: request.preset ?? 'white-seamless', tookMs: Date.now() - started }
}

export async function generate(request: ImageRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return imageUrl(request)
  const preset = PRESETS.find((entry) => entry.id === (request.preset ?? 'white-seamless'))
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AMBORAS_IMAGE_MODEL ?? 'gpt-image-1',
        prompt: `Commercial product photograph of ${request.subject}, ${preset?.brief ?? ''}. No text, no watermark.`,
        size: '1024x1024',
        n: 1,
      }),
    })
    if (!response.ok) return imageUrl(request)
    const payload = (await response.json()) as { data?: Array<{ url?: string; b64_json?: string }> }
    const first = payload.data?.[0]
    if (first?.url) return first.url
    if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`
    return imageUrl(request)
  } catch {
    return imageUrl(request)
  }
}

/* --------------------------------------------------------------- vector draw */

type Palette = { primary: string; secondary: string; paper: string; ink: string }

function rng(seed: number) {
  let state = seed || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 10000) / 10000
  }
}

function mix(a: string, b: string, amount: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '')
    const full = clean.length === 3 ? clean.split('').map((character) => character + character).join('') : clean
    return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16))
  }
  const [r1, g1, b1] = parse(a) as [number, number, number]
  const [r2, g2, b2] = parse(b) as [number, number, number]
  const channel = (x: number, y: number) => Math.round(x + (y - x) * amount).toString(16).padStart(2, '0')
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`
}

/** Renders the composition for an `imageUrl()` back into SVG. */
export function renderSvg(params: URLSearchParams): string {
  const seed = Number(params.get('s') ?? 1)
  const kind = params.get('k') ?? 'product'
  const preset = params.get('p') ?? 'white-seamless'
  const label = params.get('l') ?? ''
  const palette: Palette = {
    primary: params.get('c1') ?? '#7a4a2b',
    secondary: params.get('c2') ?? '#5d1f28',
    paper: params.get('c3') ?? '#f3ece3',
    ink: params.get('c4') ?? '#1a1a1a',
  }
  const random = rng(seed)
  const dark = preset === 'dark-luxury'
  // A hero is a brand surface, not a product cut-out: it takes the brand's own
  // ground so the headline scrim over it reads as deliberate rather than grey.
  const ground =
    kind === 'hero'
      ? mix(palette.paper, palette.primary, 0.26)
      : dark
        ? mix(palette.ink, '#000000', 0.35)
        : preset === 'white-seamless'
          ? '#f7f4f0'
          : mix(palette.paper, palette.primary, 0.12)
  const warm = preset === 'golden-hour'

  const shapes: string[] = []
  if (kind === 'logo') {
    const initials = label.split(/\s+/).map((word) => word[0] ?? '').join('').slice(0, 2).toUpperCase()
    return svg(
      512,
      512,
      `<rect width="512" height="512" fill="${palette.primary}"/>
       <circle cx="256" cy="256" r="186" fill="none" stroke="${mix(palette.paper, '#ffffff', 0.4)}" stroke-width="6" opacity=".55"/>
       <text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif"
             font-size="188" letter-spacing="6" fill="${palette.paper}">${escapeHtml(initials)}</text>`,
    )
  }

  const width = kind === 'hero' ? 1600 : 1024
  const height = kind === 'hero' ? 900 : 1024
  shapes.push(`<rect width="${width}" height="${height}" fill="${ground}"/>`)
  shapes.push(
    `<radialGradient id="g" cx="${warm ? '78%' : '50%'}" cy="${warm ? '22%' : '34%'}" r="72%">
       <stop offset="0" stop-color="${mix(ground, warm ? '#ffd9a0' : '#ffffff', dark ? 0.18 : 0.55)}"/>
       <stop offset="1" stop-color="${ground}"/></radialGradient>
     <rect width="${width}" height="${height}" fill="url(#g)"/>`,
  )

  const centreX = width / 2
  const centreY = height * (kind === 'hero' ? 0.56 : 0.52)
  const scale = kind === 'hero' ? 1.15 : 1
  const bodyColor = mix(palette.primary, palette.secondary, 0.35 + random() * 0.3)

  // A soft contact shadow under the subject does most of the work of making a
  // flat composition read as a photograph of an object on a surface.
  shapes.push(
    `<ellipse cx="${centreX}" cy="${centreY + 210 * scale}" rx="${250 * scale}" ry="${34 * scale}" fill="${dark ? '#000' : palette.ink}" opacity="${dark ? 0.55 : 0.14}"/>`,
  )

  const petals = 3 + Math.floor(random() * 3)
  for (let index = 0; index < petals; index++) {
    const angle = (index / petals) * Math.PI * 2 + random()
    const offsetX = centreX + Math.cos(angle) * 96 * scale * (0.4 + random() * 0.6)
    const offsetY = centreY + Math.sin(angle) * 62 * scale * (0.4 + random() * 0.6)
    const radiusX = (110 + random() * 92) * scale
    const radiusY = (150 + random() * 110) * scale
    shapes.push(
      `<ellipse cx="${offsetX.toFixed(1)}" cy="${offsetY.toFixed(1)}" rx="${radiusX.toFixed(1)}" ry="${radiusY.toFixed(1)}"
        fill="${mix(bodyColor, index % 2 ? '#ffffff' : palette.ink, 0.1 + index * 0.07)}" opacity="${(0.82 - index * 0.09).toFixed(2)}"
        transform="rotate(${((random() - 0.5) * 34).toFixed(1)} ${offsetX.toFixed(1)} ${offsetY.toFixed(1)})"/>`,
    )
  }

  shapes.push(
    `<ellipse cx="${centreX - 62 * scale}" cy="${centreY - 96 * scale}" rx="${52 * scale}" ry="${86 * scale}"
       fill="#ffffff" opacity="${dark ? 0.12 : 0.3}" transform="rotate(-18 ${centreX} ${centreY})"/>`,
  )

  // Only collection art carries a word. A hero already has the theme's
  // headline laid over it, and two wordmarks in one image is a mistake you
  // only see once it is rendered.
  if (label && kind === 'collection') {
    shapes.push(
      `<text x="${centreX}" y="${height * 0.14}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
         font-size="${Math.round(width * 0.052)}" letter-spacing="${Math.round(width * 0.012)}" fill="${dark ? palette.paper : palette.ink}"
         opacity=".9">${escapeHtml(label.toUpperCase())}</text>`,
    )
  }

  // Fine grain keeps large flat fills from banding on wide gamut displays.
  shapes.push(
    `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 100}"/>
       <feColorMatrix type="saturate" values="0"/></filter>
     <rect width="${width}" height="${height}" filter="url(#grain)" opacity="${dark ? 0.07 : 0.05}"/>`,
  )

  return svg(width, height, shapes.join('\n'))
}

function svg(width: number, height: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${inner}</svg>`
}
