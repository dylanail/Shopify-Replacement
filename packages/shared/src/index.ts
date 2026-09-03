/**
 * @kiln/shared — domain types, constants and small helpers shared by every Kiln surface.
 * Zero runtime dependencies beyond zod, safe to import from browser and server code.
 */
import { z } from "zod";

export const KILN = {
  name: "Kiln",
  tagline: "Say what you sell. Kiln fires the store.",
  version: "0.1.0",
} as const;

// ───────────────────────────── primitives ─────────────────────────────
export const Money = z.number().int().nonnegative();
export type Money = z.infer<typeof Money>;

export const Address = z.object({
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  company: z.string().optional(),
  line1: z.string().default(""),
  line2: z.string().optional(),
  city: z.string().default(""),
  province: z.string().optional(),
  postalCode: z.string().default(""),
  country: z.string().length(2).default("US"),
  phone: z.string().optional(),
});
export type Address = z.infer<typeof Address>;

export const MediaItem = z.object({
  url: z.string(),
  alt: z.string().default(""),
  kind: z.enum(["image", "video"]).default("image"),
  sort: z.number().int().default(0),
  generated: z.boolean().optional(),
  preset: z.string().optional(),
});
export type MediaItem = z.infer<typeof MediaItem>;

export const ProductOption = z.object({
  name: z.string().min(1),
  values: z.array(z.string().min(1)).min(1),
});
export type ProductOption = z.infer<typeof ProductOption>;

export const Seo = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  jsonLd: z.record(z.string(), z.unknown()).optional(),
});
export type Seo = z.infer<typeof Seo>;

export const SubscriptionConfig = z.object({
  enabled: z.boolean().default(false),
  cadences: z.array(z.enum(["weekly", "monthly", "quarterly", "annual"])).default(["monthly"]),
  discountPercent: z.number().min(0).max(100).default(0),
  trialDays: z.number().int().min(0).default(0),
});
export type SubscriptionConfig = z.infer<typeof SubscriptionConfig>;

export const Brand = z.object({
  name: z.string(),
  slogan: z.string().default(""),
  description: z.string().default(""),
  primaryColor: z.string().default("#1a1a1a"),
  secondaryColor: z.string().default("#b8552f"),
  backgroundColor: z.string().default("#faf6f2"),
  textColor: z.string().default("#1a1a1a"),
  displayFont: z.string().default("Playfair Display"),
  bodyFont: z.string().default("Inter"),
  logoUrl: z.string().optional(),
  wordmark: z.string().optional(),
  heroImageUrl: z.string().optional(),
  tone: z.string().default("warm, confident, specific"),
  announcement: z.string().optional(),
});
export type Brand = z.infer<typeof Brand>;

export const CartItem = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string(),
  title: z.string(),
  variantTitle: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: Money,
  imageUrl: z.string().optional(),
  subscriptionCadence: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CartItem = z.infer<typeof CartItem>;

export const OrderItem = CartItem.extend({
  fulfilledQuantity: z.number().int().default(0),
  returnedQuantity: z.number().int().default(0),
});
export type OrderItem = z.infer<typeof OrderItem>;

// ───────────────────────────── theme / storefront ─────────────────────────────
/** Named storefront slots that plugins and merchants can inject components into. */
export const STOREFRONT_SLOTS = [
  "rootProviders",
  "headEnd",
  "bodyEnd",
  "announcement",
  "headerEnd",
  "homeHero",
  "homeSections",
  "collectionTop",
  "pdpGallery",
  "pdpAboveTitle",
  "pdpBelowPrice",
  "pdpBelowAddToCart",
  "pdpAnalytics",
  "pdpBelowDescription",
  "pdpEnd",
  "cartDrawerEnd",
  "cartUpdate",
  "checkoutStart",
  "checkoutSummaryEnd",
  "thankYouEnd",
  "accountOverview",
  "footerEnd",
] as const;
export type StorefrontSlot = (typeof STOREFRONT_SLOTS)[number];

export const ThemeSection = z.object({
  id: z.string(),
  type: z.enum([
    "hero",
    "featured-products",
    "collection-grid",
    "rich-text",
    "image-with-text",
    "testimonials",
    "newsletter",
    "trust-strip",
    "faq",
    "custom-html",
  ]),
  settings: z.record(z.string(), z.unknown()).default({}),
  hidden: z.boolean().default(false),
});
export type ThemeSection = z.infer<typeof ThemeSection>;

export const ThemeConfig = z.object({
  template: z.string().default("atelier"),
  sections: z.array(ThemeSection).default([]),
  brand: Brand.partial().default({}),
  slots: z.record(z.string(), z.array(z.object({ component: z.string(), pluginId: z.string().optional(), props: z.record(z.string(), z.unknown()).optional() }))).default({}),
  customCss: z.string().default(""),
  files: z.record(z.string(), z.string()).default({}),
});
export type ThemeConfig = z.infer<typeof ThemeConfig>;

export const THEME_TEMPLATES = [
  { id: "atelier", name: "Atelier", description: "Editorial heritage — serif display, parchment tones, strong trust strip.", screenshots: ["/themes/atelier-1.svg", "/themes/atelier-2.svg", "/themes/atelier-3.svg"] },
  { id: "studio", name: "Studio", description: "Minimal white gallery for design-led products.", screenshots: ["/themes/studio-1.svg", "/themes/studio-2.svg", "/themes/studio-3.svg"] },
  { id: "bazaar", name: "Bazaar", description: "Dense, colorful, conversion-first for large catalogs.", screenshots: ["/themes/bazaar-1.svg", "/themes/bazaar-2.svg", "/themes/bazaar-3.svg"] },
] as const;

// ───────────────────────────── plans ─────────────────────────────
export interface PlanDef {
  slug: string;
  name: string;
  tagline: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  platformFeeBps: number;
  cardRateBps: number;
  maxStores: number;
  maxTeamMembers: number;
  baseCreditsPerMonth: number | null;
  isPopular: boolean;
  ctaLabel: string;
  customDomain: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  agenticCro: boolean;
  autonomousCro: boolean;
  multiRegion: boolean;
  displayFeatures: string[];
}

/** Plans are config-driven on purpose — pricing has been re-cut three times in two months upstream. */
export const PLANS: PlanDef[] = [
  { slug: "free", name: "Free", tagline: "Kick the tires.", monthlyPriceCents: 0, yearlyPriceCents: 0, platformFeeBps: 300, cardRateBps: 290, maxStores: 1, maxTeamMembers: 1, baseCreditsPerMonth: 200, isPopular: false, ctaLabel: "Start free", customDomain: false, advancedAnalytics: false, prioritySupport: false, agenticCro: false, autonomousCro: false, multiRegion: false, displayFeatures: ["1 store", "AI assistant (200 credits/mo)", "kiln.store subdomain", "3% platform fee"] },
  { slug: "launch", name: "Basic", tagline: "Everything to open.", monthlyPriceCents: 4900, yearlyPriceCents: 46800, platformFeeBps: 100, cardRateBps: 290, maxStores: 1, maxTeamMembers: 1, baseCreditsPerMonth: null, isPopular: false, ctaLabel: "Get started", customDomain: true, advancedAnalytics: true, prioritySupport: false, agenticCro: false, autonomousCro: false, multiRegion: false, displayFeatures: ["Unlimited AI", "Custom domain", "Advanced analytics", "10 transactional emails", "1% platform fee"] },
  { slug: "starter", name: "Grow", tagline: "For stores that are working.", monthlyPriceCents: 10500, yearlyPriceCents: 114000, platformFeeBps: 100, cardRateBps: 270, maxStores: 5, maxTeamMembers: 10, baseCreditsPerMonth: null, isPopular: true, ctaLabel: "Grow with Kiln", customDomain: true, advancedAnalytics: true, prioritySupport: true, agenticCro: true, autonomousCro: false, multiRegion: false, displayFeatures: ["5 stores, 10 seats", "Agentic A/B testing", "Klaviyo + Meta CAPI", "Cohort reporting", "Priority support"] },
  { slug: "scale", name: "Advanced", tagline: "Autonomy on.", monthlyPriceCents: 39900, yearlyPriceCents: 432000, platformFeeBps: 50, cardRateBps: 250, maxStores: 20, maxTeamMembers: 20, baseCreditsPerMonth: null, isPopular: false, ctaLabel: "Scale up", customDomain: true, advancedAnalytics: true, prioritySupport: true, agenticCro: true, autonomousCro: true, multiRegion: true, displayFeatures: ["20 stores, 20 seats", "Autonomous CRO loop", "Multi-region + live rates", "Brand-voice fine-tune", "0.5% platform fee"] },
  { slug: "enterprise", name: "Enterprise", tagline: "Your terms.", monthlyPriceCents: 0, yearlyPriceCents: 0, platformFeeBps: 0, cardRateBps: 250, maxStores: 9999, maxTeamMembers: 9999, baseCreditsPerMonth: null, isPopular: false, ctaLabel: "Contact us", customDomain: true, advancedAnalytics: true, prioritySupport: true, agenticCro: true, autonomousCro: true, multiRegion: true, displayFeatures: ["SOC 2, SCIM, audit export", "B2B / net terms", "White-label", "Sandbox clone"] },
];
export const planBySlug = (slug: string) => PLANS.find((p) => p.slug === slug) ?? PLANS[0]!;

// ───────────────────────────── admin nav ─────────────────────────────
export const ADMIN_AREAS = ["dashboard", "ai", "designer", "products", "collections", "orders", "customers", "promotions", "analytics", "experiments", "reviews", "seo", "geo", "emails", "blog", "plugins", "settings"] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

// ───────────────────────────── analytics ─────────────────────────────
export const EVENT_KINDS = ["view.page", "view.product", "view.collection", "cart.add", "cart.remove", "checkout.start", "checkout.complete", "signup", "search", "review.submit"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

// ───────────────────────────── helpers ─────────────────────────────
export function formatMoney(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
}

/** Cryptographically unguessable slug suffix for preview URLs. */
export function randomSuffix(len = 6): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  (globalThis.crypto ?? require("node:crypto").webcrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 10000) / 100;
}

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };

export type AgentEvent =
  | { type: "run.started"; runId: string }
  | { type: "text"; runId: string; delta: string }
  | { type: "tool.started"; runId: string; tool: string; input: unknown; area?: AdminArea; callId: string }
  | { type: "tool.finished"; runId: string; tool: string; output: unknown; ok: boolean; area?: AdminArea; callId: string }
  | { type: "todo.updated"; runId: string; todos: { title: string; status: string }[] }
  | { type: "question"; runId: string; question: string }
  | { type: "run.finished"; runId: string; status: "completed" | "failed" | "paused" | "cancelled"; summary?: string; error?: string };
