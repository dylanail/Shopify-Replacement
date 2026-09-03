/**
 * Deterministic content generators. They power onboarding and tools when no model key is set and
 * act as the structured fallback/scaffold the model refines when one is.
 */
import type { Brand, ProductOption } from "@kiln/shared";
import { slugify } from "@kiln/shared";

export interface GeneratedProduct {
  title: string;
  subtitle: string;
  description: string;
  priceCents: number;
  compareAtCents?: number;
  options: ProductOption[];
  tags: string[];
  productType: string;
  imagePrompt: string;
}

interface Category {
  key: string;
  match: RegExp;
  nouns: string[];
  suffixes: string[];
  palette: Partial<Brand>;
  products: Omit<GeneratedProduct, "description">[];
  descriptors: string[];
  collections: { title: string; tags: string[] }[];
}

const heritage = { primaryColor: "#5a1f1f", secondaryColor: "#b8552f", backgroundColor: "#f4ead9", textColor: "#221a14", displayFont: "Playfair Display", bodyFont: "Inter", tone: "heritage, exacting, warm" };
const minimal = { primaryColor: "#111111", secondaryColor: "#6b6b6b", backgroundColor: "#ffffff", textColor: "#111111", displayFont: "Manrope", bodyFont: "Inter", tone: "calm, precise, quiet confidence" };
const botanical = { primaryColor: "#2f4a3a", secondaryColor: "#c9a86a", backgroundColor: "#f6f3ec", textColor: "#1f2a24", displayFont: "Cormorant Garamond", bodyFont: "Inter", tone: "gentle, honest, unhurried" };
const bold = { primaryColor: "#0f172a", secondaryColor: "#f59e0b", backgroundColor: "#fafafa", textColor: "#0f172a", displayFont: "Space Grotesk", bodyFont: "Inter", tone: "direct, energetic, specific" };

const CATEGORIES: Category[] = [
  {
    key: "boxing", match: /box(ing)?|glove|fight|sparring|mma|gym|wrap/i, nouns: ["Ironjaw", "Southpaw", "Cornerman", "Tenth Round", "Oxblood"], suffixes: ["& Co.", "Athletic", "Supply", "Works"], palette: heritage,
    descriptors: ["hand-stitched", "full-grain leather", "built for real rounds", "14-day build", "lifetime repairs"],
    products: [
      { title: "The Sparring 16oz", subtitle: "For real rounds. For real partners.", priceCents: 34000, compareAtCents: 38000, options: [{ name: "Weight", values: ["12oz", "14oz", "16oz", "18oz"] }, { name: "Leather", values: ["Oxblood", "Saddle", "Black"] }], tags: ["gloves", "sparring", "hero"], productType: "Gloves", imagePrompt: "pair of oxblood leather boxing gloves on cream, studio light" },
      { title: "Oxblood Wraps 180in", subtitle: "Mexican-style, slight stretch, no slip.", priceCents: 2800, options: [{ name: "Length", values: ["120in", "180in"] }], tags: ["wraps", "essentials"], productType: "Wraps", imagePrompt: "rolled oxblood hand wraps on parchment" },
      { title: "The Corner Bag", subtitle: "Waxed canvas. Fits gloves, wraps, and the week.", priceCents: 12500, options: [], tags: ["bags"], productType: "Bags", imagePrompt: "waxed canvas gym duffel bag with leather handles" },
      { title: "Bag Mitts 12oz", subtitle: "Dense foam for heavy bag sessions.", priceCents: 18500, options: [{ name: "Size", values: ["S/M", "L/XL"] }], tags: ["gloves", "bag"], productType: "Gloves", imagePrompt: "black leather bag mitts on dark wood" },
      { title: "Groin Guard Pro", subtitle: "Steel cup, full-grain leather shell.", priceCents: 9500, options: [{ name: "Size", values: ["S", "M", "L"] }], tags: ["protection"], productType: "Protection", imagePrompt: "leather groin guard product shot" },
    ],
    collections: [{ title: "Gloves", tags: ["gloves"] }, { title: "The Essentials", tags: ["essentials", "wraps"] }, { title: "The Workshop", tags: ["hero"] }],
  },
  {
    key: "skincare", match: /skin ?care|serum|moisturi[sz]er|face|beauty|cosmetic|cream/i, nouns: ["Undertone", "Meridian", "Halcyon", "Sable", "Verdure"], suffixes: ["Skin", "Lab", "Botanica", "Studio"], palette: botanical,
    descriptors: ["dermatologist-formulated", "fragrance-free", "cold-processed", "glass-bottled", "third-party tested"],
    products: [
      { title: "Barrier Repair Serum", subtitle: "Ceramides, niacinamide, nothing else that matters.", priceCents: 5800, options: [{ name: "Size", values: ["30ml", "50ml"] }], tags: ["serum", "hero"], productType: "Serum", imagePrompt: "amber glass dropper bottle on stone" },
      { title: "Daily Mineral SPF 40", subtitle: "Zinc, tinted, no white cast.", priceCents: 3600, options: [{ name: "Tint", values: ["Fair", "Medium", "Deep"] }], tags: ["spf", "essentials"], productType: "Sunscreen", imagePrompt: "white sunscreen tube on sand" },
      { title: "The Cleansing Balm", subtitle: "Melts sunscreen, keeps the barrier.", priceCents: 3200, options: [], tags: ["cleanser", "essentials"], productType: "Cleanser", imagePrompt: "frosted glass jar of balm with wooden lid" },
    ],
    collections: [{ title: "The Routine", tags: ["essentials"] }, { title: "Serums", tags: ["serum"] }],
  },
  {
    key: "candles", match: /candle|scent|fragrance|wax|home fragrance/i, nouns: ["Hearthline", "Ninth Hour", "Low Ember", "Wick & Fold"], suffixes: ["Candle Co.", "Studio", "Atelier"], palette: minimal,
    descriptors: ["hand-poured", "coconut-soy wax", "cotton wick", "60-hour burn", "small-batch"],
    products: [
      { title: "Cedar & Smoke", subtitle: "A cabin at 2am.", priceCents: 4200, options: [{ name: "Size", values: ["8oz", "14oz"] }], tags: ["candle", "hero"], productType: "Candle", imagePrompt: "black glass candle with cedar sprig" },
      { title: "Fig Leaf", subtitle: "Green, milky, late summer.", priceCents: 4200, options: [{ name: "Size", values: ["8oz", "14oz"] }], tags: ["candle"], productType: "Candle", imagePrompt: "white ceramic candle with fig leaf" },
      { title: "The Trio", subtitle: "Three 4oz votives. Choose your season.", priceCents: 5800, options: [], tags: ["gift", "bundle"], productType: "Gift set", imagePrompt: "three small candles in a kraft box" },
    ],
    collections: [{ title: "Signature scents", tags: ["candle"] }, { title: "Gifts", tags: ["gift"] }],
  },
  {
    key: "coffee", match: /coffee|roast|espresso|beans|tea|matcha/i, nouns: ["Third Wave", "Long Pull", "Eleven Degrees", "Copper Kettle"], suffixes: ["Roasters", "Coffee", "Supply"], palette: bold,
    descriptors: ["roasted to order", "single-origin", "direct trade", "roast-dated", "ships within 48 hours"],
    products: [
      { title: "Kiln Blend", subtitle: "Chocolate, cherry, a long finish.", priceCents: 1900, options: [{ name: "Size", values: ["250g", "1kg"] }, { name: "Grind", values: ["Whole bean", "Filter", "Espresso"] }], tags: ["coffee", "hero"], productType: "Coffee", imagePrompt: "kraft coffee bag with black label on wood" },
      { title: "Ethiopia Guji", subtitle: "Bergamot, blueberry, tea-like.", priceCents: 2400, options: [{ name: "Size", values: ["250g", "1kg"] }, { name: "Grind", values: ["Whole bean", "Filter"] }], tags: ["coffee", "single-origin"], productType: "Coffee", imagePrompt: "white coffee bag with red stamp" },
      { title: "The Pour-Over Kit", subtitle: "Dripper, filters, and 250g to start.", priceCents: 4800, options: [], tags: ["gear", "gift"], productType: "Gear", imagePrompt: "ceramic pour-over dripper with kettle" },
    ],
    collections: [{ title: "Coffee", tags: ["coffee"] }, { title: "Gear & Gifts", tags: ["gear", "gift"] }],
  },
  {
    key: "apparel", match: /apparel|clothing|t-?shirt|hoodie|jacket|denim|streetwear|fashion|dress|knit/i, nouns: ["Northline", "Standard Issue", "Elder", "Ferro"], suffixes: ["Goods", "Apparel", "Studio", "Supply"], palette: minimal,
    descriptors: ["garment-dyed", "heavyweight", "made in small runs", "true to size", "repairs for life"],
    products: [
      { title: "The Heavyweight Tee", subtitle: "280gsm. Boxy. Won't twist.", priceCents: 4800, options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }, { name: "Color", values: ["Bone", "Ink", "Moss"] }], tags: ["tees", "hero"], productType: "Tops", imagePrompt: "folded heavyweight bone t-shirt on grey" },
      { title: "Field Jacket", subtitle: "Waxed cotton, four pockets, storm flap.", priceCents: 24000, options: [{ name: "Size", values: ["S", "M", "L", "XL"] }], tags: ["outerwear"], productType: "Outerwear", imagePrompt: "olive waxed cotton field jacket on hanger" },
      { title: "Selvedge Straight", subtitle: "14oz Japanese denim, raw.", priceCents: 18500, options: [{ name: "Waist", values: ["30", "32", "34", "36"] }], tags: ["denim"], productType: "Bottoms", imagePrompt: "raw selvedge denim folded showing cuff" },
    ],
    collections: [{ title: "Tops", tags: ["tees"] }, { title: "Outerwear & Denim", tags: ["outerwear", "denim"] }],
  },
  {
    key: "jewelry", match: /jewel|ring|necklace|earring|gold|silver|bracelet/i, nouns: ["Aurelia", "Second Sun", "Quiet Metal", "Lumen"], suffixes: ["Jewelry", "Fine", "Atelier"], palette: { ...minimal, secondaryColor: "#b08d57" },
    descriptors: ["recycled 14k gold", "hand-set stones", "made to order", "lifetime polish", "ethically sourced"],
    products: [
      { title: "Signet Ring", subtitle: "Solid 14k, hand-engraved on request.", priceCents: 42000, options: [{ name: "Size", values: ["5", "6", "7", "8", "9"] }, { name: "Metal", values: ["Yellow gold", "Sterling"] }], tags: ["rings", "hero"], productType: "Rings", imagePrompt: "gold signet ring on black marble" },
      { title: "Thread Chain", subtitle: "1.2mm, 18in, clasps you won't feel.", priceCents: 16500, options: [{ name: "Length", values: ["16in", "18in", "20in"] }], tags: ["necklaces"], productType: "Necklaces", imagePrompt: "delicate gold chain necklace on linen" },
      { title: "Drop Hoops", subtitle: "Sterling, 22mm, everyday weight.", priceCents: 9800, options: [], tags: ["earrings"], productType: "Earrings", imagePrompt: "silver hoop earrings on ceramic dish" },
    ],
    collections: [{ title: "Rings", tags: ["rings"] }, { title: "Everyday", tags: ["necklaces", "earrings"] }],
  },
  {
    key: "pet", match: /pet|dog|cat|puppy|kitten|treat|leash/i, nouns: ["Good Boy", "Wagline", "Marrow", "Fetch & Field"], suffixes: ["Pet Co.", "Supply", "Goods"], palette: bold,
    descriptors: ["vet-formulated", "human-grade", "made in small batches", "field-tested", "no fillers"],
    products: [
      { title: "Field Leash", subtitle: "Climbing rope, brass clip, 6ft.", priceCents: 4500, options: [{ name: "Color", values: ["Orange", "Forest", "Black"] }], tags: ["walk", "hero"], productType: "Leashes", imagePrompt: "orange climbing rope dog leash with brass clip" },
      { title: "Marrow Bites", subtitle: "Single-ingredient training treats.", priceCents: 1600, options: [{ name: "Size", values: ["150g", "400g"] }], tags: ["treats", "essentials"], productType: "Treats", imagePrompt: "kraft pouch of dog treats" },
      { title: "The Den Bed", subtitle: "Washable, orthopedic, chew-resistant.", priceCents: 12900, options: [{ name: "Size", values: ["S", "M", "L"] }], tags: ["home"], productType: "Beds", imagePrompt: "grey orthopedic dog bed on wood floor" },
    ],
    collections: [{ title: "Walk", tags: ["walk"] }, { title: "Treats", tags: ["treats"] }],
  },
  {
    key: "home", match: /home|ceramic|pottery|vase|kitchen|furniture|decor|linen|towel|cookware|knife/i, nouns: ["Slowform", "Tablewright", "Clay & Ash", "Hearth"], suffixes: ["Studio", "Home", "Goods", "Atelier"], palette: heritage,
    descriptors: ["thrown by hand", "stoneware", "food-safe glaze", "dishwasher-safe", "made in the studio"],
    products: [
      { title: "The Stoneware Mug", subtitle: "12oz. Thick walls. Holds heat.", priceCents: 3800, options: [{ name: "Glaze", values: ["Ash", "Oat", "Iron"] }], tags: ["tableware", "hero"], productType: "Tableware", imagePrompt: "stoneware mug with ash glaze on oak" },
      { title: "Tall Vase", subtitle: "For one branch, or twelve stems.", priceCents: 9800, options: [], tags: ["vessels"], productType: "Vessels", imagePrompt: "tall matte ceramic vase on black plinth" },
      { title: "Serving Platter", subtitle: "34cm, shallow lip, family-sized.", priceCents: 12500, options: [{ name: "Glaze", values: ["Ash", "Oat"] }], tags: ["tableware"], productType: "Tableware", imagePrompt: "large ceramic platter with bread" },
    ],
    collections: [{ title: "Tableware", tags: ["tableware"] }, { title: "Vessels", tags: ["vessels"] }],
  },
];

const GENERIC: Category = {
  key: "generic", match: /.*/, nouns: ["Northfield", "Anvil", "Harbor", "Ledger", "Meridian"], suffixes: ["& Co.", "Goods", "Supply", "Studio"], palette: minimal,
  descriptors: ["made with intent", "small-batch", "built to last", "honest pricing", "ships fast"],
  products: [
    { title: "The Original", subtitle: "The one we started with.", priceCents: 6500, options: [{ name: "Size", values: ["S", "M", "L"] }], tags: ["hero"], productType: "Core", imagePrompt: "single product on cream backdrop" },
    { title: "The Companion", subtitle: "Goes with the Original.", priceCents: 3200, options: [], tags: ["essentials"], productType: "Accessory", imagePrompt: "small accessory on linen" },
    { title: "The Set", subtitle: "Both, boxed, and 15% off.", priceCents: 8200, compareAtCents: 9700, options: [], tags: ["bundle", "gift"], productType: "Set", imagePrompt: "two products in a gift box" },
  ],
  collections: [{ title: "Core", tags: ["hero", "essentials"] }, { title: "Gifts", tags: ["gift"] }],
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T>(arr: T[], seed: number, offset = 0) => arr[(seed + offset) % arr.length]!;

export function detectCategory(prompt: string) {
  return CATEGORIES.find((c) => c.match.test(prompt)) ?? GENERIC;
}

/** Short, brandable, no "Shop"/"Online". Honors an explicit "called X" in the prompt. */
export function generateBrandName(prompt: string) {
  const explicit = prompt.match(/(?:called|named|name it|brand(?:ed)?)\s+["“]?([A-Z][\w&' .-]{1,40}?)["”]?(?:[,.]|\s+(?:that|which|with|for|in|-)|$)/);
  if (explicit) {
    const name = explicit[1]!.trim();
    return /\b(Co|Inc|Ltd|Corp|Bros)$/.test(name) && prompt.includes(`${name}.`) ? `${name}.` : name;
  }
  const cat = detectCategory(prompt);
  const seed = hash(prompt);
  const noun = pick(cat.nouns, seed);
  const suffix = pick(cat.suffixes, seed, 3);
  return `${noun} ${suffix}`.replace(/\b(Shop|Online)\b/g, "").trim();
}

export function generatePalette(prompt: string): Partial<Brand> {
  const cat = detectCategory(prompt);
  const p: Partial<Brand> = { ...cat.palette };
  if (/sepia|parchment|heritage|vintage|1920|atelier|leather/i.test(prompt)) Object.assign(p, heritage);
  if (/minimal|clean|white|scandi|quiet/i.test(prompt)) Object.assign(p, minimal);
  if (/bold|neon|loud|street|punchy/i.test(prompt)) Object.assign(p, bold);
  if (/botanical|green|natural|organic|earth/i.test(prompt)) Object.assign(p, botanical);
  if (/dark|luxury|black|noir/i.test(prompt)) Object.assign(p, { primaryColor: "#c9a86a", secondaryColor: "#8a6d3b", backgroundColor: "#0e0e0e", textColor: "#f3ede2", displayFont: "Cormorant Garamond", tone: "hushed, luxurious, exact" });
  const hex = prompt.match(/#([0-9a-f]{6})/i);
  if (hex) p.secondaryColor = `#${hex[1]}`;
  return p;
}

export function generateSlogan(prompt: string, name: string) {
  const cat = detectCategory(prompt);
  const seed = hash(name);
  const d = cat.descriptors;
  const forms = [`${cap(pick(d, seed))}. ${cap(pick(d, seed, 1))}.`, `${cap(pick(d, seed, 2))}, since day one.`, `Made ${pick(d, seed, 3).replace(/^made /, "")}. Kept for years.`];
  return pick(forms, seed);
}

export function generateBrandDescription(prompt: string, name: string) {
  const cat = detectCategory(prompt);
  const seed = hash(prompt + name);
  const where = prompt.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/)?.[1];
  return `${name} makes ${cat.key === "generic" ? "things" : cat.key === "boxing" ? "boxing gear" : cat.key} ${pick(cat.descriptors, seed)} and ${pick(cat.descriptors, seed, 1)}${where ? ` in ${where}` : ""}. Every piece is ${pick(cat.descriptors, seed, 2)} — the kind of thing you buy once and repair rather than replace.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 150–200 word product description assembled from the category voice. */
export function generateDescription(p: Omit<GeneratedProduct, "description">, brand: { name: string; tone?: string }, prompt: string) {
  const cat = detectCategory(prompt);
  const seed = hash(p.title);
  const d = cat.descriptors;
  const opt = p.options[0];
  const paras = [
    `<p><strong>${p.title}</strong> — ${p.subtitle} Made by ${brand.name}, ${pick(d, seed)} and ${pick(d, seed, 1)}, because the details you can't see are the ones that decide whether something lasts.</p>`,
    `<p>We designed it for the way it actually gets used, not the way it photographs. That means ${pick(d, seed, 2)} construction, materials chosen for how they age, and a finish we're happy to put our name on. ${opt ? `Available in ${opt.values.length} ${opt.name.toLowerCase()} options (${opt.values.join(", ")}) so you can get the fit right the first time.` : "One version, done properly."}</p>`,
    `<p>Every order ships with care instructions and a straightforward promise: if it fails because of how we made it, we repair or replace it. ${pick(d, seed, 3).charAt(0).toUpperCase() + pick(d, seed, 3).slice(1)}. ${pick(d, seed, 4).charAt(0).toUpperCase() + pick(d, seed, 4).slice(1)}. No gimmicks, no seasonal restocks — just the thing, made well, in stock.</p>`,
    `<p><strong>Details:</strong> ${p.productType.toLowerCase()} · ${opt ? `${opt.values.length} ${opt.name.toLowerCase()} options` : "one size"} · ships within 48 hours from our workshop · free exchanges within 30 days. Questions about fit or care? Reply to your order email — a person answers every one, usually the same day.</p>`,
  ];
  return paras.join("\n");
}

export function generateProducts(prompt: string, brand: { name: string }, count = 3): GeneratedProduct[] {
  const cat = detectCategory(prompt);
  const seed = hash(prompt);
  const rotated = [...cat.products.slice(seed % cat.products.length), ...cat.products.slice(0, seed % cat.products.length)];
  const hero = rotated.find((p) => p.tags.includes("hero")) ?? rotated[0]!;
  const rest = rotated.filter((p) => p !== hero);
  const chosen = [hero, ...rest].slice(0, Math.max(1, Math.min(count, cat.products.length)));
  while (chosen.length < count) {
    const base = cat.products[chosen.length % cat.products.length]!;
    chosen.push({ ...base, title: `${base.title} ${["II", "Lite", "Pro", "Mini"][chosen.length % 4]}`, priceCents: Math.round(base.priceCents * (0.8 + (chosen.length % 3) * 0.15)) });
  }
  return chosen.map((p) => ({ ...p, description: generateDescription(p, brand, prompt) }));
}

export function generateCollections(prompt: string) {
  return detectCategory(prompt).collections;
}

export function generatePromotions(brand: { name: string }, prompt: string) {
  const cat = detectCategory(prompt);
  const threshold = cat.key === "jewelry" || cat.key === "boxing" ? 20000 : cat.key === "coffee" || cat.key === "pet" ? 5000 : 10000;
  return [
    { name: "Welcome 10%", code: "WELCOME10", kind: "code" as const, type: "percentage" as const, value: 10, perCustomerLimit: 1 },
    { name: `Free shipping over $${threshold / 100}`, kind: "automatic" as const, type: "free_shipping" as const, value: 0, minSubtotalCents: threshold },
    { name: "Bundle & save 15%", kind: "automatic" as const, type: "bundle" as const, value: 15, minQuantity: 2, bundle: { tiers: [{ quantity: 2, percentOff: 10 }, { quantity: 3, percentOff: 15 }] } },
  ];
}

export const handleFor = (title: string) => slugify(title);
