import { and, eq, desc, stores, storeEnvironments, regions, shippingOptions, emailTemplates, flows, todos, aiCredits, counters, organizations, teamMembers, knowledgeCards, users } from "@kiln/db";
import { Brand, ThemeConfig, slugify, randomSuffix, type ThemeConfig as ThemeConfigT } from "@kiln/shared";
import { TEMPLATES } from "@kiln/email";
import type { AppDeps } from "../context.js";
import { notFound } from "../lib/errors.js";

export const DEFAULT_TODOS = [
  { key: "products", title: "Add your own products", description: "Swap the sample catalog for the real thing — paste a CSV or just describe them.", href: "/products", prompt: "Help me add my own products", sort: 1 },
  { key: "payments", title: "Set up payments", description: "Connect Stripe in two clicks. Payouts go straight to your bank.", href: "/settings/payments", prompt: "Set up payments", sort: 2 },
  { key: "domain", title: "Connect a domain", description: "Paste a domain you own; DNS, SSL and CDN are automatic.", href: "/settings/domains", prompt: "Connect my domain", sort: 3 },
  { key: "shipping", title: "Review shipping rates", description: "Flat, free-above-threshold, weight or live rates per region.", href: "/settings/shipping", prompt: "Show me how shipping works", sort: 4 },
  { key: "brand", title: "Review your brand kit", description: "Colours, fonts, logo and voice — all editable from the Designer.", href: "/designer", prompt: "Show me my brand kit", sort: 5 },
  { key: "publish", title: "Publish your store", description: "Push the draft live when you're happy with the preview.", href: "/designer", prompt: "Publish the store", sort: 6 },
];

export function defaultTheme(brand: Partial<Brand>, template = "atelier"): ThemeConfigT {
  return ThemeConfig.parse({
    template,
    brand,
    sections: [
      { id: "hero", type: "hero", settings: { headline: brand.slogan ?? `Welcome to ${brand.name ?? "our store"}`, subheadline: brand.description ?? "", ctaLabel: "Shop the collection", ctaHref: "/collections/all", imageUrl: brand.heroImageUrl ?? null } },
      { id: "trust", type: "trust-strip", settings: { items: ["Free shipping over $200", "30-day returns", "Secure checkout"] } },
      { id: "featured", type: "featured-products", settings: { title: "The essentials", limit: 6 } },
      { id: "story", type: "image-with-text", settings: { title: "Why we make this", body: brand.description ?? "", imageUrl: brand.heroImageUrl ?? null } },
      { id: "reviews", type: "testimonials", settings: { title: "What people say" } },
      { id: "newsletter", type: "newsletter", settings: { title: "Get first access", body: "New drops, workshop notes, and the occasional discount." } },
    ],
  });
}

export interface CreateStoreInput {
  orgId: string;
  name: string;
  prompt?: string;
  brand?: Partial<Brand>;
  currency?: string;
  country?: string;
  referenceImages?: string[];
  template?: string;
}

/** Creates a store with everything a merchant expects to already exist: envs, region, shipping, emails, flows, to-dos, credits. */
export async function createStore(deps: AppDeps, input: CreateStoreInput) {
  const { db } = deps;
  const brand = Brand.parse({ name: input.name, ...(input.brand ?? {}) });
  const slug = `${slugify(input.name)}-${randomSuffix()}`;
  const [store] = await db
    .insert(stores)
    .values({ orgId: input.orgId, name: input.name, slug, brand, prompt: input.prompt ?? "", referenceImages: input.referenceImages ?? [], defaultCurrency: input.currency ?? "USD" })
    .returning();
  const storeId = store!.id;
  const [region] = await db.insert(regions).values({ storeId, name: input.country === "GB" ? "United Kingdom" : input.country === "MX" ? "Mexico" : "United States", currency: input.currency ?? "USD", countries: [input.country ?? "US"], taxRateBps: 0, freeShippingThresholdCents: 20000 }).returning();
  await db.update(stores).set({ defaultRegionId: region!.id }).where(eq(stores.id, storeId));
  const theme = defaultTheme(brand, input.template);
  await db.insert(storeEnvironments).values([
    { storeId, kind: "draft", theme },
    { storeId, kind: "live", theme },
  ]);
  await db.insert(shippingOptions).values([
    { storeId, regionId: region!.id, name: "Standard", type: "flat", amountCents: 800, estimate: "3–5 business days", sort: 0 },
    { storeId, regionId: region!.id, name: "Express", type: "flat", amountCents: 2200, estimate: "1–2 business days", sort: 1 },
    { storeId, regionId: region!.id, name: "Free shipping", type: "free_above", amountCents: 0, thresholdCents: 20000, estimate: "3–5 business days", sort: 2 },
    { storeId, regionId: region!.id, name: "In-store pickup", type: "pickup", amountCents: 0, estimate: "Ready in 2 hours", sort: 3, enabled: false },
  ]);
  await db.insert(emailTemplates).values(TEMPLATES.map((t) => ({ storeId, key: t.key, subject: t.subject, html: t.html, delayMinutes: t.delayMinutes })));
  await db.insert(flows).values([
    { storeId, key: "welcome", name: "Welcome series", trigger: "customer.created", steps: [{ delayHours: 0, templateKey: "welcome", subject: "Welcome to {{brand.name}}" }, { delayHours: 72, templateKey: "welcome", subject: "The story behind {{brand.name}}" }] },
    { storeId, key: "browse_abandon", name: "Browse abandonment", trigger: "view.product", steps: [{ delayHours: 24, templateKey: "abandoned_cart", subject: "Still looking?" }] },
    { storeId, key: "cart_abandon", name: "Cart abandonment", trigger: "cart.abandoned", steps: [{ delayHours: 4, templateKey: "abandoned_cart", subject: "You left something behind" }, { delayHours: 48, templateKey: "abandoned_cart", subject: "Last call on your cart" }] },
    { storeId, key: "post_purchase", name: "Post-purchase", trigger: "order.paid", steps: [{ delayHours: 168, templateKey: "review_request", subject: "How was it?" }] },
    { storeId, key: "win_back", name: "Win-back", trigger: "customer.inactive_60d", steps: [{ delayHours: 0, templateKey: "welcome", subject: "We miss you" }] },
  ]);
  await db.insert(todos).values(DEFAULT_TODOS.map((t) => ({ ...t, storeId })));
  await db.insert(aiCredits).values({ storeId, balance: 200 });
  await db.insert(counters).values({ storeId, key: "order_number", value: 1000 });
  await db.insert(knowledgeCards).values({ storeId, brandName: input.name, categories: [], differentiators: [], locations: [], founders: [] });
  return store!;
}

export async function getStore(deps: AppDeps, storeId: string) {
  const s = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  if (!s) throw notFound("Store");
  return s;
}

export async function getStoreBySlugOrHost(deps: AppDeps, key: string) {
  const s = await deps.db.query.stores.findFirst({ where: eq(stores.slug, key) });
  if (s) return s;
  const { domains } = await import("@kiln/db");
  const [d] = await deps.db.select().from(domains).where(eq(domains.hostname, key.toLowerCase()));
  if (d) return deps.db.query.stores.findFirst({ where: eq(stores.id, d.storeId) }) as Promise<typeof s>;
  return undefined;
}

export async function listStoresForUser(deps: AppDeps, userId: string) {
  const owned = await deps.db.select({ store: stores }).from(stores).innerJoin(organizations, eq(stores.orgId, organizations.id)).where(eq(organizations.ownerUserId, userId)).orderBy(desc(stores.createdAt));
  const member = await deps.db.select({ store: stores }).from(teamMembers).innerJoin(stores, eq(teamMembers.storeId, stores.id)).where(and(eq(teamMembers.userId, userId)));
  const seen = new Set<string>();
  return [...owned, ...member].map((r) => r.store).filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

export async function updateStore(deps: AppDeps, storeId: string, patch: Partial<{ name: string; brand: Partial<Brand>; settings: Record<string, unknown>; aiModel: string; status: string; onboardingStep: string; defaultCurrency: string }>) {
  const s = await getStore(deps, storeId);
  const [row] = await deps.db
    .update(stores)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.brand ? { brand: Brand.parse({ ...s.brand, ...patch.brand }) } : {}),
      ...(patch.settings ? { settings: { ...s.settings, ...patch.settings } } : {}),
      ...(patch.aiModel ? { aiModel: patch.aiModel } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.onboardingStep ? { onboardingStep: patch.onboardingStep } : {}),
      ...(patch.defaultCurrency ? { defaultCurrency: patch.defaultCurrency } : {}),
    })
    .where(eq(stores.id, storeId))
    .returning();
  return row!;
}

export function storefrontUrl(deps: AppDeps, store: { slug: string }) {
  const base = deps.env.storefrontBaseDomain;
  if (base.startsWith("localhost")) return `http://${base}/s/${store.slug}`;
  return `https://${store.slug}.${base}`;
}

export async function ensureUser(deps: AppDeps, email: string, name: string, passwordHash: string) {
  const [u] = await deps.db.insert(users).values({ email: email.toLowerCase(), name, passwordHash }).onConflictDoNothing().returning();
  return u ?? (await deps.db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) }))!;
}
