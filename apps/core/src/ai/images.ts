/**
 * Image lanes. With OPENAI_API_KEY set, `generate` calls the Images API and stores the result on
 * disk (S3/R2 in production via IMAGE_STORE); without it, Kiln renders branded SVG art on the fly,
 * so every generated store still has real, distinct product imagery.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Env } from "../env.js";

export const IMAGE_PRESETS = {
  white_seamless: { label: "White seamless", bg: "#ffffff", fg: "#111111", accent: "#e5e5e5", prompt: "on a seamless white studio backdrop, soft shadow, 3-point lighting" },
  lifestyle: { label: "Lifestyle", bg: "#efe6d8", fg: "#2b241d", accent: "#c9a86a", prompt: "in a warm lifestyle setting with natural window light" },
  dark_luxury: { label: "Dark luxury", bg: "#0e0e0e", fg: "#f3ede2", accent: "#c9a86a", prompt: "on black velvet with a single dramatic key light" },
  flat_lay: { label: "Flat lay", bg: "#f4f1ea", fg: "#1f1f1f", accent: "#8a8a8a", prompt: "as a top-down flat lay with complementary props" },
  golden_hour: { label: "Golden hour", bg: "#f6d8a8", fg: "#3a2410", accent: "#e0913a", prompt: "outdoors at golden hour with long soft shadows" },
  studio_3point: { label: "Studio 3-point", bg: "#d9d9d9", fg: "#111111", accent: "#ffffff", prompt: "with classic 3-point studio lighting and a gradient sweep" },
} as const;
export type ImagePreset = keyof typeof IMAGE_PRESETS;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hash = (s: string) => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);

/** Deterministic, brand-coloured SVG "product still": abstract silhouette + label. 1024² sRGB. */
export function renderArt(opts: { title: string; preset?: ImagePreset; primary?: string; secondary?: string; seed?: string; wordmark?: string }): string {
  const preset = IMAGE_PRESETS[opts.preset ?? "white_seamless"];
  const seed = hash(opts.seed ?? opts.title);
  const primary = opts.primary ?? preset.fg;
  const secondary = opts.secondary ?? preset.accent;
  const shapes: string[] = [];
  const n = 3 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const s = hash(`${seed}-${i}`);
    const cx = 260 + (s % 500), cy = 300 + ((s >> 3) % 380), r = 90 + ((s >> 6) % 180);
    const rot = (s >> 9) % 360;
    const kind = i % 3;
    const fill = i === 0 ? primary : i === 1 ? secondary : `${primary}33`;
    if (kind === 0) shapes.push(`<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${Math.round(r * 1.3)}" fill="${fill}" transform="rotate(${rot} ${cx} ${cy})"/>`);
    else if (kind === 1) shapes.push(`<rect x="${cx - r}" y="${cy - r / 2}" width="${r * 2}" height="${r}" rx="${Math.round(r / 4)}" fill="${fill}" transform="rotate(${rot % 25} ${cx} ${cy})"/>`);
    else shapes.push(`<path d="M${cx} ${cy - r} q${r} ${r} 0 ${r * 2} q-${r} -${r} 0 -${r * 2}z" fill="${fill}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${esc(opts.title)}">
<defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${preset.bg}"/><stop offset="1" stop-color="${preset.accent}" stop-opacity="0.55"/></radialGradient><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs>
<rect width="1024" height="1024" fill="url(#g)"/>
<ellipse cx="512" cy="820" rx="300" ry="40" fill="#000" opacity="0.18" filter="url(#s)"/>
${shapes.join("\n")}
<text x="512" y="960" text-anchor="middle" font-family="Georgia, 'Playfair Display', serif" font-size="40" fill="${preset.fg}" opacity="0.85">${esc(opts.title)}</text>
${opts.wordmark ? `<text x="64" y="90" font-family="Georgia, serif" font-size="30" letter-spacing="6" fill="${preset.fg}" opacity="0.7">${esc(opts.wordmark.toUpperCase())}</text>` : ""}
</svg>`;
}

/** Brand hero: wordmark + subhead in the brand palette. */
export function renderHero(opts: { name: string; slogan: string; primary: string; secondary: string; bg: string; text: string; font?: string }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${esc(opts.name)}">
<rect width="1600" height="900" fill="${opts.bg}"/>
<circle cx="800" cy="450" r="360" fill="${opts.secondary}" opacity="0.16"/>
<circle cx="920" cy="540" r="200" fill="${opts.primary}" opacity="0.10"/>
<text x="800" y="430" text-anchor="middle" font-family="${esc(opts.font ?? "Georgia")}, Georgia, serif" font-size="${opts.name.length > 14 ? 72 : 104}" letter-spacing="8" fill="${opts.text}">${esc(opts.name.toUpperCase())}</text>
<text x="800" y="505" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="40" fill="${opts.primary}">${esc(opts.slogan)}</text>
<rect x="690" y="560" width="220" height="4" fill="${opts.secondary}"/>
</svg>`;
}

/** Logo: monogram tile + wordmark. */
export function renderLogo(opts: { name: string; primary: string; bg: string; text: string }) {
  const initials = opts.name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160" viewBox="0 0 640 160" role="img" aria-label="${esc(opts.name)} logo">
<rect x="8" y="8" width="144" height="144" rx="12" fill="${opts.primary}"/>
<text x="80" y="104" text-anchor="middle" font-family="Georgia, serif" font-size="72" fill="${opts.bg}">${esc(initials)}</text>
<text x="180" y="98" font-family="Georgia, serif" font-size="54" letter-spacing="3" fill="${opts.text}">${esc(opts.name.toUpperCase())}</text>
</svg>`;
}

export function artUrl(env: Env, q: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  return `${env.publicCoreUrl}/api/v1/public/art.svg?${p.toString()}`;
}

export interface GeneratedImage {
  url: string;
  preset: ImagePreset;
  provider: "openai" | "svg";
  lane: number;
}

/** Four parallel render lanes, ~32s with OpenAI, instant with SVG. */
export async function generateLanes(env: Env, opts: { title: string; brief?: string; preset: ImagePreset; primary: string; secondary: string; wordmark?: string; lanes?: number; referenceImage?: string }): Promise<GeneratedImage[]> {
  const lanes = opts.lanes ?? 4;
  if (env.openaiApiKey) {
    const prompt = `Product photograph of ${opts.title}${opts.brief ? `, ${opts.brief}` : ""}, ${IMAGE_PRESETS[opts.preset].prompt}. Photorealistic, e-commerce hero image, no text.`;
    const results = await Promise.all(
      Array.from({ length: lanes }, async (_, lane) => {
        try {
          const res = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${env.openaiApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", n: 1, quality: "medium" }) });
          if (!res.ok) throw new Error(await res.text());
          const body = (await res.json()) as { data: { b64_json: string }[] };
          const url = await storeImage(env, Buffer.from(body.data[0]!.b64_json, "base64"), "png");
          return { url, preset: opts.preset, provider: "openai" as const, lane };
        } catch {
          return { url: artUrl(env, { t: opts.title, p: opts.preset, c: opts.primary, a: opts.secondary, s: `${opts.title}-${lane}`, w: opts.wordmark }), preset: opts.preset, provider: "svg" as const, lane };
        }
      }),
    );
    return results;
  }
  return Array.from({ length: lanes }, (_, lane) => ({ url: artUrl(env, { t: opts.title, p: opts.preset, c: opts.primary, a: opts.secondary, s: `${opts.title}-${lane}`, w: opts.wordmark }), preset: opts.preset, provider: "svg" as const, lane }));
}

export async function storeImage(env: Env, bytes: Buffer, ext: string) {
  const dir = path.resolve(env.dataDir ?? ".data", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await writeFile(path.join(dir, name), bytes);
  return `${env.publicCoreUrl}/uploads/${name}`;
}
