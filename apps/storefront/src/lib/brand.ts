import type { Brand } from "@kiln/shared";

const clean = (s: string) => s.replace(/[.—–-]+$/g, "").replace(/\s+/g, " ").trim();
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Location mentioned in the brand description ("... in Mexico City.") */
export function brandLocation(description: string): string | null {
  const m = description.match(/\bin\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})/u);
  return m ? clean(m[1]!) : null;
}

/**
 * Short descriptors pulled out of the brand description. The generated description reads
 * "<Name> makes <noun> <d1> and <d2> in <Place>. Every piece is <d3> — ..." so we split on the joins;
 * for free-form descriptions we fall back to clause splitting.
 */
export function brandDescriptors(description: string, name = ""): string[] {
  if (!description) return [];
  const sentences = description.split(/(?<=[.!?])\s+/);
  const first = sentences[0] ?? description;
  let body = first;
  if (name) body = body.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(makes|crafts|builds|creates|is|are)\\s+`, "i"), "");
  body = body.replace(/^(makes|crafts|builds)\s+[a-z-]+\s+(gear|goods|things|products|pieces)?\s*/i, "");
  body = body.replace(/\bin\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2}\.?$/u, "");
  const parts = body.split(/\s+and\s+|,\s*|\s+—\s+|\s+•\s+|\s+·\s+/).map(clean).filter((p) => p.length > 2 && p.length < 40);
  const second = sentences[1]?.match(/every (?:piece|one|item|order) is ([^—.,]+)/i)?.[1];
  const all = [...parts, ...(second ? [clean(second)] : [])].map((p) => p.replace(/^(a|an|the)\s+/i, ""));
  // drop things that are the product noun itself ("boxing gear")
  return [...new Set(all)].filter((p) => !/^(things|goods|gear|products)$/i.test(p)).slice(0, 5);
}

/** "MEXICO CITY · HAND-STITCHED" style header line under the wordmark. */
export function brandTagline(brand: Pick<Brand, "description" | "slogan" | "name">): string {
  const loc = brandLocation(brand.description);
  const d = brandDescriptors(brand.description, brand.name);
  if (loc && d[0]) return `${loc} · ${d[0]}`.toUpperCase();
  if (loc) return loc.toUpperCase();
  if (d[0]) return d.slice(0, 2).join(" · ").toUpperCase();
  const firstClause = (brand.description || brand.slogan).split(/[.,;—]/)[0] ?? "";
  return clean(firstClause).slice(0, 48).toUpperCase();
}

/** "◆ HAND-STITCHED · FULL-GRAIN LEATHER" eyebrow above the PDP title. */
export function trustEyebrow(brand: Pick<Brand, "description" | "name" | "slogan">): string {
  const d = brandDescriptors(brand.description, brand.name);
  const picks = d.slice(0, 2);
  if (!picks.length) return clean(brand.slogan).toUpperCase();
  return picks.join(" · ").toUpperCase();
}

export function pdpMicrocopy(brand: Pick<Brand, "description" | "name">, metaMicrocopy?: unknown): string {
  if (typeof metaMicrocopy === "string" && metaMicrocopy.trim()) return metaMicrocopy.trim();
  const d = brandDescriptors(brand.description, brand.name);
  const loc = brandLocation(brand.description);
  const how = d[0] ? cap(d[0]) : "Made";
  return `Built to order. ${how} by ${brand.name}${loc ? ` in ${loc}` : ""}.`;
}

export function pdpTrustItems(brand: Pick<Brand, "description" | "name">, metaTrust?: unknown, freeShipLabel?: string | null): string[] {
  if (Array.isArray(metaTrust) && metaTrust.length) return metaTrust.slice(0, 3).map(String);
  const d = brandDescriptors(brand.description, brand.name).map(cap);
  const out = d.slice(0, 3);
  const defaults = [freeShipLabel ?? "Free shipping", "30-day returns", "Secure checkout"];
  for (const x of defaults) if (out.length < 3) out.push(x);
  return out;
}

/** Google Fonts stylesheet URL for the brand's display/body faces. */
export function googleFontsHref(display: string, body: string): string {
  const fam = (f: string, italics: boolean) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:${italics ? "ital,wght@0,400;0,500;0,600;0,700;1,400" : "wght@400;500;600;700"}`;
  const fams = [fam(display, true), ...(body !== display ? [fam(body, false)] : [])];
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}

const SERIF_HINT = /(playfair|garamond|cormorant|libre|baskerville|lora|merriweather|fraunces|serif|prata|dm serif|crimson|spectral|newsreader|literata|bodoni|didot|georgia|times)/i;
export const fontStack = (font: string) => `"${font}", ${SERIF_HINT.test(font) ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"}`;
