/** Small color helpers used to derive rules/tints from the brand palette and to map option values to swatches. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return a;
  return `#${toHex(ra[0] + (rb[0] - ra[0]) * t)}${toHex(ra[1] + (rb[1] - ra[1]) * t)}${toHex(ra[2] + (rb[2] - ra[2]) * t)}`;
}
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrastText = (bg: string) => (luminance(bg) > 0.45 ? "#1a1a1a" : "#ffffff");

const NAMED: Record<string, string> = {
  black: "#111111", ink: "#1b1b1f", jet: "#2a2a2a", charcoal: "#3a3a3a", graphite: "#4b4b4b", slate: "#5b6470", grey: "#8a8a8a", gray: "#8a8a8a", ash: "#a7a39b", stone: "#b9b1a3", silver: "#c9c9c9", bone: "#ebe4d5", cream: "#f3ecdc", ivory: "#f7f3e8", white: "#ffffff", oat: "#e6d9bf", sand: "#d9c39b", tan: "#c9a271", saddle: "#8b5a2b", camel: "#b98a52", cognac: "#9a4f22", chestnut: "#6f3a1f", brown: "#5b3a21", chocolate: "#3f2416", walnut: "#4a2f1b", espresso: "#3b2418", tobacco: "#7a5230", oxblood: "#5a1f1f", burgundy: "#6b1f2c", wine: "#722f37", maroon: "#6a1a2c", red: "#b3261e", crimson: "#a3162e", scarlet: "#c62828", cherry: "#9d1b30", rust: "#a4441f", terracotta: "#b8552f", brick: "#a24a34", orange: "#e0731d", amber: "#d69323", gold: "#c9a227", "yellow gold": "#d4af37", sterling: "#c0c4c9", "sterling silver": "#c0c4c9", "rose gold": "#d9a08a", brass: "#b5a642", copper: "#b87333", bronze: "#8c6d3d", mustard: "#c99a1e", yellow: "#e6c229", olive: "#6b6b2a", moss: "#5c6b3a", forest: "#2f4a3a", green: "#2f7a4f", sage: "#9aa88e", mint: "#a8d5ba", teal: "#1f6f78", navy: "#1c2a44", blue: "#2f5da8", cobalt: "#1e4ea1", indigo: "#3b3b8f", denim: "#3f5d8a", sky: "#8fb9e0", lavender: "#b7a6d6", purple: "#6a3d9a", plum: "#5b2c5a", lilac: "#c8a2c8", pink: "#e2a4b9", blush: "#e8c2c2", rose: "#c96b7e", coral: "#e97a6e", iron: "#5f5f63", pewter: "#8e8e93", clay: "#b06f4f", natural: "#d9c8a9", nude: "#e3c7ad", "off white": "#f4f1ea", "off-white": "#f4f1ea", khaki: "#a89b6c", beige: "#e0d3b8", taupe: "#8b7d6b", mocha: "#6c4a3a", caramel: "#b5773d", honey: "#d9a441", peach: "#f2b48c", lime: "#a4c639", emerald: "#2e8b57", jade: "#3e9c7a", turquoise: "#39a6a3", aqua: "#5fc4c4", cyan: "#2ab7ca", magenta: "#c0399b", fuchsia: "#c433a8", violet: "#7f4dd1", tortoise: "#6b4423", tortoiseshell: "#6b4423", smoke: "#7d7a76", fog: "#c9c6c0", cloud: "#e7e7e7", midnight: "#151a2d", obsidian: "#0c0c0f", onyx: "#0f0f10", pearl: "#f1ede4", "matte black": "#1a1a1a", "gloss black": "#0d0d0d", raw: "#c8b89a", unfinished: "#d8ccb4", oak: "#b48a5a", walnut_oil: "#4a2f1b", cedar: "#a0522d", pine: "#dcbf8b", maple: "#e0c39a", ebony: "#2a211c", mahogany: "#4e2728", teak: "#a5713f", dark: "#2a2a2a", light: "#e9e4d9",
};
const isHex = (s: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
/** Map an option value like "Oxblood" or "Matte Black" to a CSS color; null when unknown (render a neutral labelled swatch). */
export function swatchColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (isHex(v)) return v;
  if (NAMED[v]) return NAMED[v]!;
  const words = v.split(/[\s/_-]+/);
  for (const w of [...words].reverse()) if (NAMED[w]) return NAMED[w]!;
  return null;
}
export const isSwatchOption = (name: string) => /^(colou?r|leather|finish|glaze|metal|shade|hue|tone)$/i.test(name.trim());
