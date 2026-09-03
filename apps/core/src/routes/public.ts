/**
 * Public storefront API — what the Next.js storefront (and any headless client) talks to.
 * Scoped by store slug or custom hostname. No auth; carts are bearer-by-id, customers by token.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, asc, inArray, products, productVariants, collections, collectionProducts, contactSubmissions, exitIntentResponses, redirects, customers, orders, desc } from "@kiln/db";
import type { AppDeps } from "../context.js";
import { parseBody, sse } from "../lib/http.js";
import { notFound, badRequest } from "../lib/errors.js";
import { getStoreBySlugOrHost, storefrontUrl } from "../services/stores.js";
import { getEnvironment } from "../services/theme.js";
import { getProduct, listProducts } from "../services/products.js";
import { getCollection, listCollections } from "../services/collections.js";
import { createCart, addToCart, updateCartItem, updateCart, applyDiscountCode, cartWithPricing } from "../services/carts.js";
import { checkout, CheckoutInput, getOrder } from "../services/orders.js";
import { track } from "../services/analytics.js";
import { fingerprint } from "../lib/crypto.js";
import { createReview, listReviews, productReviewStats, askQuestion, listQuestions } from "../services/reviews.js";
import { storefrontPluginConfig } from "../services/plugins.js";
import { recommend, listMerch } from "../services/merch.js";
import { activeAssignments, record } from "../services/experiments.js";
import { listRegions, listShippingOptions, regionForCountry } from "../services/shipping.js";
import { renderArt, renderHero, renderLogo, type ImagePreset } from "../ai/images.js";
import { sitemap, robots } from "../services/seo.js";
import { renderLlmsTxt } from "../services/geo.js";
import { listArticles, getArticle, rss } from "../services/blog.js";
import { upsertCustomer, customerLogin } from "../services/customers.js";
import { listSubscriptions, portalAction } from "../services/subscriptions.js";
import { signAccessToken, verifyAccessToken } from "../lib/auth.js";
import { PLANS, Address } from "@kiln/shared";
import { CATALOG, catalogCategories } from "@kiln/plugins";

type Vars = { store: NonNullable<Awaited<ReturnType<typeof getStoreBySlugOrHost>>>; sessionId?: string };

export function publicRoutes(deps: AppDeps) {
  const r = new Hono();
  r.get("/plans", (c) => c.json({ items: PLANS }));
  r.get("/plugins", (c) => { const q = c.req.query("q")?.toLowerCase(); const cat = c.req.query("category"); return c.json({ items: CATALOG.filter((p) => (!q || `${p.name} ${p.description}`.toLowerCase().includes(q)) && (!cat || p.category === cat)), categories: catalogCategories() }); });
  r.get("/art.svg", (c) => c.body(renderArt({ title: c.req.query("t") ?? "Kiln", preset: (c.req.query("p") as ImagePreset) ?? "white_seamless", primary: c.req.query("c") ?? undefined, secondary: c.req.query("a") ?? undefined, seed: c.req.query("s") ?? undefined, wordmark: c.req.query("w") ?? undefined }), 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" }));

  const s = new Hono<{ Variables: Vars }>();
  s.use("*", async (c, next) => {
    const store = await getStoreBySlugOrHost(deps, c.req.param("store")!);
    if (!store) throw notFound("Store");
    c.set("store", store);
    await next();
  });
  const st = (c: { get: (k: "store") => Vars["store"] }) => c.get("store");
  const sessionFor = async (c: { get: (k: "store") => Vars["store"]; req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined } }, kind: string, extra: Record<string, unknown> = {}) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "127.0.0.1";
    const ua = c.req.header("user-agent") ?? "";
    const preview = c.req.query("env") === "draft";
    if (preview) return null;
    return track(deps, st(c).id, { fingerprint: fingerprint(ip, ua, st(c).id), kind, country: c.req.header("x-vercel-ip-country") ?? c.req.header("cf-ipcountry") ?? undefined, city: c.req.header("x-vercel-ip-city") ?? undefined, referrer: c.req.header("referer") ?? undefined, userAgent: ua, ...extra });
  };

  /** Everything the storefront needs to render a page shell in one call. */
  s.get("/", async (c) => {
    const store = st(c);
    const envKind = c.req.query("env") === "draft" ? "draft" : "live";
    const env = await getEnvironment(deps, store.id, envKind);
    const [cols, plugins, regionsAll, merch] = await Promise.all([listCollections(deps, store.id), storefrontPluginConfig(deps, store.id, envKind === "draft"), listRegions(deps, store.id), listMerch(deps, store.id)]);
    const region = regionForCountry(regionsAll, c.req.header("x-vercel-ip-country") ?? c.req.header("cf-ipcountry"));
    const rds = await deps.db.select().from(redirects).where(eq(redirects.storeId, store.id));
    return c.json({ id: store.id, name: store.name, slug: store.slug, status: store.status, brand: { ...store.brand, ...env.theme.brand }, theme: env.theme, version: env.version, environment: envKind, url: storefrontUrl(deps, store), collections: cols.map((x) => ({ id: x.id, handle: x.handle, title: x.title, productCount: x.productCount })), plugins, merch: merch.filter((m) => m.enabled), region: region ? { id: region.id, currency: region.currency, countries: region.countries, freeShippingThresholdCents: region.freeShippingThresholdCents, taxRateBps: region.taxRateBps } : null, regions: regionsAll.map((x) => ({ id: x.id, name: x.name, currency: x.currency, countries: x.countries })), redirects: rds.map((x) => ({ from: x.fromPath, to: x.toPath, code: x.code })), stripePublishable: process.env.STRIPE_PUBLISHABLE_KEY ?? null, paymentMode: deps.stripe && store.stripeAccountId ? "stripe" : "test" });
  });
  s.get("/products", async (c) => {
    const col = c.req.query("collection");
    const colId = col ? (await getCollection(deps, st(c).id, col).catch(() => null))?.id : undefined;
    if (col && !colId) return c.json({ items: [], total: 0, page: 1, pageSize: 24 });
    const ids = (c.req.query("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const r = await listProducts(deps, st(c).id, { page: Number(c.req.query("page") ?? 1), pageSize: Math.min(48, Number(c.req.query("pageSize") ?? 24)), q: c.req.query("q"), status: "published", collectionId: colId, sort: c.req.query("sort"), ids: ids.length ? ids : undefined });
    return c.json(r);
  });
  s.get("/products/:handle", async (c) => {
    const p = await getProduct(deps, st(c).id, c.req.param("handle"));
    if (p.status !== "published" && c.req.query("env") !== "draft") throw notFound("Product");
    const [stats, recs, sess] = await Promise.all([productReviewStats(deps, st(c).id, p.id), recommend(deps, st(c).id, p.id, (c.req.query("cart") ?? "").split(",").filter(Boolean)), sessionFor(c, "view.product", { path: `/products/${p.handle}`, productId: p.id })]);
    const experiments = sess ? await activeAssignments(deps, st(c).id, sess.sessionId, `/products/${p.handle}`) : {};
    for (const [id, a] of Object.entries(experiments)) void record(deps, st(c).id, id, a.variant, "exposure", 0, sess?.sessionId);
    return c.json({ ...p, reviews: stats, recommendations: recs, experiments, sessionId: sess?.sessionId });
  });
  s.get("/collections", async (c) => c.json({ items: await listCollections(deps, st(c).id) }));
  s.get("/collections/:handle", async (c) => {
    const col = c.req.param("handle") === "all" ? { id: undefined, handle: "all", title: "All products", description: "", imageUrl: null } : await getCollection(deps, st(c).id, c.req.param("handle"));
    const sess = await sessionFor(c, "view.collection", { path: `/collections/${col.handle}` });
    const prods = await listProducts(deps, st(c).id, { page: Number(c.req.query("page") ?? 1), pageSize: 24, status: "published", collectionId: col.id, sort: c.req.query("sort") });
    return c.json({ collection: col, products: prods, sessionId: sess?.sessionId });
  });
  s.post("/track", async (c) => {
    const b = await parseBody(c, z.object({ kind: z.string(), path: z.string().optional(), productId: z.string().optional(), valueCents: z.number().optional(), sessionId: z.string().optional(), meta: z.record(z.string(), z.unknown()).optional() }));
    const res = b.sessionId ? await track(deps, st(c).id, { ...b }) : await sessionFor(c, b.kind, b);
    return c.json({ sessionId: res?.sessionId ?? null });
  });
  s.get("/live", (c) => sse(c, (send) => deps.bus.subscribe((e) => { if (e.storeId === st(c).id && e.channel === "analytics") send("event", e.event); })));

  // Cart & checkout
  s.post("/cart", async (c) => { const b = await parseBody(c, z.object({ sessionId: z.string().optional(), country: z.string().optional(), regionId: z.string().optional() })); return c.json(await cartWithPricing(deps, st(c).id, (await createCart(deps, st(c).id, b)).id), 201); });
  s.get("/cart/:id", async (c) => c.json(await cartWithPricing(deps, st(c).id, c.req.param("id"))));
  s.post("/cart/:id/items", async (c) => {
    const b = await parseBody(c, z.object({ variantId: z.string(), quantity: z.number().int().positive().default(1), subscriptionCadence: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(), sessionId: z.string().optional() }));
    const cart = await addToCart(deps, st(c).id, c.req.param("id"), b.variantId, b.quantity, { subscriptionCadence: b.subscriptionCadence, metadata: b.metadata });
    const sid = b.sessionId ?? cart.sessionId ?? undefined;
    if (sid) { await track(deps, st(c).id, { sessionId: sid, kind: "cart.add", variantId: b.variantId, valueCents: cart.items.find((i) => i.variantId === b.variantId)?.unitPriceCents }); if (!cart.sessionId) await updateCart(deps, st(c).id, cart.id, { }); }
    return c.json(await cartWithPricing(deps, st(c).id, cart.id));
  });
  s.patch("/cart/:id/items/:lineId", async (c) => { await updateCartItem(deps, st(c).id, c.req.param("id"), c.req.param("lineId"), (await parseBody(c, z.object({ quantity: z.number().int().min(0) }))).quantity); return c.json(await cartWithPricing(deps, st(c).id, c.req.param("id"))); });
  s.patch("/cart/:id", async (c) => {
    const b = await parseBody(c, z.object({ email: z.string().email().optional(), shippingAddress: z.record(z.string(), z.unknown()).optional(), billingAddress: z.record(z.string(), z.unknown()).optional(), shippingOptionId: z.string().nullable().optional(), giftCardCodes: z.array(z.string()).optional(), regionId: z.string().optional(), sessionId: z.string().optional(), experimentVariants: z.record(z.string(), z.string()).optional() }));
    const { sessionId, ...patch } = b;
    const cart = await updateCart(deps, st(c).id, c.req.param("id"), patch as never);
    if (sessionId && !cart.sessionId) await deps.db.update((await import("@kiln/db")).carts).set({ sessionId }).where(eq((await import("@kiln/db")).carts.id, cart.id));
    if (b.shippingAddress && (sessionId ?? cart.sessionId)) await track(deps, st(c).id, { sessionId: sessionId ?? cart.sessionId!, kind: "checkout.start", path: "/checkout" });
    return c.json(await cartWithPricing(deps, st(c).id, cart.id));
  });
  s.post("/cart/:id/discount", async (c) => { const { pricing } = await applyDiscountCode(deps, st(c).id, c.req.param("id"), (await parseBody(c, z.object({ code: z.string().min(1) }))).code); return c.json({ ...(await cartWithPricing(deps, st(c).id, c.req.param("id"))), pricing }); });
  s.get("/shipping-options", async (c) => c.json({ items: await listShippingOptions(deps, st(c).id, c.req.query("regionId"), true) }));
  /** Stripe PaymentIntent for the cart total (Connect: on behalf of the store's account). Test mode returns a fake client secret. */
  s.post("/cart/:id/payment-intent", async (c) => {
    const cart = await cartWithPricing(deps, st(c).id, c.req.param("id"));
    if (deps.stripe && st(c).stripeAccountId) {
      const pi = await deps.stripe.paymentIntents.create({ amount: cart.pricing.totalCents, currency: cart.currency.toLowerCase(), automatic_payment_methods: { enabled: true }, application_fee_amount: Math.round(cart.pricing.totalCents * 0.01), transfer_data: { destination: st(c).stripeAccountId! }, metadata: { cartId: cart.id, storeId: st(c).id } });
      return c.json({ clientSecret: pi.client_secret, id: pi.id, mode: "stripe" });
    }
    return c.json({ clientSecret: `test_${cart.id}`, id: `pi_test_${cart.id}`, mode: "test" });
  });
  s.post("/cart/:id/checkout", async (c) => {
    const b = await parseBody(c, CheckoutInput.extend({ sessionId: z.string().optional() }));
    if (b.paymentProvider === "test" && st(c).status !== "live" && c.req.query("env") !== "draft") { /* allowed: test checkouts are fine pre-launch */ }
    const order = await checkout(deps, st(c).id, c.req.param("id"), b);
    return c.json({ order, thankYouUrl: `/orders/${order.id}?email=${encodeURIComponent(order.email)}` }, 201);
  });
  s.get("/orders/:id", async (c) => { const o = await getOrder(deps, st(c).id, c.req.param("id")); if (o.email !== (c.req.query("email") ?? "").toLowerCase()) throw notFound("Order"); const recs = o.items[0] ? await recommend(deps, st(c).id, o.items[0].productId, o.items.map((i) => i.productId), 2) : []; return c.json({ ...o, postPurchaseOffers: recs }); });
  s.post("/orders/:id/upsell", async (c) => {
    // One-click post-checkout upsell: charged to the same payment method (same PaymentIntent customer) — test mode creates a follow-on order.
    const o = await getOrder(deps, st(c).id, c.req.param("id"));
    const b = await parseBody(c, z.object({ variantId: z.string(), email: z.string().email() }));
    if (o.email !== b.email.toLowerCase()) throw badRequest("Email mismatch");
    const cart = await createCart(deps, st(c).id, { regionId: o.regionId ?? undefined, sessionId: o.sessionId ?? undefined });
    await addToCart(deps, st(c).id, cart.id, b.variantId, 1);
    await updateCart(deps, st(c).id, cart.id, { email: o.email, shippingAddress: o.shippingAddress ?? undefined, billingAddress: o.billingAddress ?? undefined, shippingOptionId: null });
    const follow = await checkout(deps, st(c).id, cart.id, { email: o.email, paymentProvider: o.paymentProvider, paymentRef: o.paymentRef ?? undefined });
    return c.json({ order: follow }, 201);
  });

  // Reviews & Q&A
  s.get("/products/:handle/reviews", async (c) => { const p = await getProduct(deps, st(c).id, c.req.param("handle")); return c.json({ ...(await listReviews(deps, st(c).id, { page: Number(c.req.query("page") ?? 1), pageSize: 12, status: "approved", productId: p.id, rating: c.req.query("rating"), withPhoto: c.req.query("withPhoto"), verified: c.req.query("verified") })), stats: await productReviewStats(deps, st(c).id, p.id), questions: await listQuestions(deps, st(c).id, p.id) }); });
  s.post("/products/:handle/reviews", async (c) => { const p = await getProduct(deps, st(c).id, c.req.param("handle")); const b = await parseBody(c, z.object({ authorName: z.string().min(1), email: z.string().email().optional(), rating: z.number().int().min(1).max(5), title: z.string().optional(), body: z.string().min(1), media: z.array(z.object({ url: z.string(), alt: z.string().default(""), kind: z.enum(["image", "video"]).default("image"), sort: z.number().default(0) })).optional(), sessionId: z.string().optional() })); const cfg = (await storefrontPluginConfig(deps, st(c).id)).find((x) => x.id === "product-reviews"); return c.json(await createReview(deps, st(c).id, { ...b, productId: p.id }, { autoApprove: !!cfg?.settings.autoApprove }), 201); });
  s.post("/products/:handle/questions", async (c) => { const p = await getProduct(deps, st(c).id, c.req.param("handle")); const b = await parseBody(c, z.object({ question: z.string().min(3), askedBy: z.string().optional() })); return c.json(await askQuestion(deps, st(c).id, p.id, b.question, b.askedBy), 201); });

  // Plugin endpoints (contact form, exit intent)
  s.post("/contact", async (c) => { const b = await parseBody(c, z.object({ name: z.string().min(1), email: z.string().email(), message: z.string().min(1) })); const [row] = await deps.db.insert(contactSubmissions).values({ storeId: st(c).id, ...b }).returning(); const cfg = (await storefrontPluginConfig(deps, st(c).id)).find((x) => x.id === "contact-form"); if (cfg?.settings.notifyEmail) { const { sendWithRetry } = await import("@kiln/email"); void sendWithRetry(deps.email, { to: String(cfg.settings.notifyEmail), from: deps.env.emailFrom, subject: `New message from ${b.name}`, html: `<p>${b.message}</p><p>${b.email}</p>` }); } return c.json({ id: row!.id }, 201); });
  s.post("/exit-intent", async (c) => { const b = await parseBody(c, z.object({ email: z.string().email().optional(), offer: z.string(), converted: z.boolean().default(false) })); const [row] = await deps.db.insert(exitIntentResponses).values({ storeId: st(c).id, email: b.email ?? null, offer: b.offer, converted: b.converted }).returning(); return c.json({ id: row!.id }, 201); });
  s.post("/newsletter", async (c) => { const b = await parseBody(c, z.object({ email: z.string().email() })); const { customer, created } = await upsertCustomer(deps, st(c).id, { email: b.email, acceptsMarketing: true }); if (created) { const { sendTemplated } = await import("../services/emails.js"); void sendTemplated(deps, st(c).id, "welcome", customer.email, { customer, welcomeCode: "WELCOME10" }); } await sessionFor(c, "signup"); return c.json({ ok: true }); });

  // Customer accounts
  s.post("/account/register", async (c) => { const b = await parseBody(c, z.object({ email: z.string().email(), password: z.string().min(8), firstName: z.string().optional(), lastName: z.string().optional() })); const { customer } = await upsertCustomer(deps, st(c).id, b); return c.json({ token: await signAccessToken(deps.env.jwtSecret, `cus:${customer.id}`), customer: { id: customer.id, email: customer.email, firstName: customer.firstName } }, 201); });
  s.post("/account/login", async (c) => { const b = await parseBody(c, z.object({ email: z.string().email(), password: z.string() })); const customer = await customerLogin(deps, st(c).id, b.email, b.password); return c.json({ token: await signAccessToken(deps.env.jwtSecret, `cus:${customer.id}`), customer: { id: customer.id, email: customer.email, firstName: customer.firstName } }); });
  const customerFrom = async (c: { req: { header: (k: string) => string | undefined } }, storeId: string) => { const h = c.req.header("authorization") ?? ""; const sub = h.startsWith("Bearer ") ? await verifyAccessToken(deps.env.jwtSecret, h.slice(7)) : null; if (!sub?.startsWith("cus:")) throw notFound("Account"); const cu = await deps.db.query.customers.findFirst({ where: and(eq(customers.id, sub.slice(4)), eq(customers.storeId, storeId)) }); if (!cu) throw notFound("Account"); return cu; };
  s.get("/account", async (c) => { const cu = await customerFrom(c, st(c).id); const os = await deps.db.select().from(orders).where(and(eq(orders.storeId, st(c).id), eq(orders.customerId, cu.id))).orderBy(desc(orders.createdAt)).limit(20); return c.json({ customer: { id: cu.id, email: cu.email, firstName: cu.firstName, lastName: cu.lastName, addresses: cu.addresses, acceptsMarketing: cu.acceptsMarketing }, orders: os, subscriptions: await listSubscriptions(deps, st(c).id, cu.id) }); });
  s.patch("/account", async (c) => {
    const cu = await customerFrom(c, st(c).id);
    const b = await parseBody(c, z.object({ firstName: z.string().optional(), lastName: z.string().optional(), phone: z.string().optional(), acceptsMarketing: z.boolean().optional(), addresses: z.array(Address).optional(), password: z.string().min(8).optional() }));
    const { customer } = await upsertCustomer(deps, st(c).id, { email: cu.email, ...b });
    return c.json({ customer: { id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, addresses: customer.addresses, acceptsMarketing: customer.acceptsMarketing } });
  });
  s.post("/account/subscriptions/:id/:action", async (c) => { const cu = await customerFrom(c, st(c).id); const subs = await listSubscriptions(deps, st(c).id, cu.id); if (!subs.some((x) => x.id === c.req.param("id"))) throw notFound("Subscription"); return c.json(await portalAction(deps, st(c).id, c.req.param("id"), c.req.param("action") as never, (await parseBody(c, z.object({ cadence: z.string().optional() }))).cadence)); });

  // Brand assets & SEO/GEO files
  s.get("/logo.svg", (c) => c.body(renderLogo({ name: st(c).brand.name, primary: st(c).brand.primaryColor, bg: st(c).brand.backgroundColor, text: st(c).brand.textColor }), 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" }));
  s.get("/hero.svg", (c) => c.body(renderHero({ name: st(c).brand.name, slogan: st(c).brand.slogan, primary: st(c).brand.primaryColor, secondary: st(c).brand.secondaryColor, bg: st(c).brand.backgroundColor, text: st(c).brand.textColor, font: st(c).brand.displayFont }), 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" }));
  s.get("/preview.svg", async (c) => {
    const env = await getEnvironment(deps, st(c).id, c.req.query("env") === "draft" ? "draft" : "live");
    const b = { ...st(c).brand, ...env.theme.brand };
    const hero = env.theme.sections.find((x) => x.type === "hero");
    const prods = await deps.db.select({ title: products.title }).from(products).where(and(eq(products.storeId, st(c).id), eq(products.status, "published"))).limit(3);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return c.body(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="${b.backgroundColor}"/><rect width="1200" height="36" fill="${b.primaryColor}"/><text x="600" y="24" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#fff" letter-spacing="2">${esc((b.announcement ?? b.slogan).toUpperCase())}</text><text x="60" y="90" font-family="Georgia,serif" font-size="26" letter-spacing="4" fill="${b.textColor}">${esc(b.name.toUpperCase())}</text><text x="60" y="260" font-family="Georgia,serif" font-size="56" fill="${b.textColor}">${esc(String(hero?.settings.headline ?? b.slogan)).slice(0, 34)}</text><rect x="60" y="300" width="200" height="48" fill="${b.primaryColor}"/><text x="160" y="331" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#fff">Shop the collection</text>${prods.map((p, i) => `<rect x="${60 + i * 370}" y="440" width="340" height="260" fill="${b.secondaryColor}" opacity="0.25"/><text x="${60 + i * 370}" y="740" font-family="Georgia,serif" font-size="22" fill="${b.textColor}">${esc(p.title)}</text>`).join("")}</svg>`, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" });
  });
  s.get("/sitemap.xml", async (c) => c.body(await sitemap(deps, st(c).id, storefrontUrl(deps, st(c))), 200, { "Content-Type": "application/xml" }));
  s.get("/robots.txt", async (c) => c.text(await robots(deps, st(c).id, storefrontUrl(deps, st(c)))));
  s.get("/llms.txt", async (c) => c.text(await renderLlmsTxt(deps, st(c).id, storefrontUrl(deps, st(c)))));
  s.get("/blog", async (c) => c.json({ items: await listArticles(deps, st(c).id, { publishedOnly: true }) }));
  s.get("/blog/rss.xml", async (c) => c.body(rss(st(c), storefrontUrl(deps, st(c)), await listArticles(deps, st(c).id, { publishedOnly: true })), 200, { "Content-Type": "application/rss+xml" }));
  s.get("/blog/:handle", async (c) => { const a = await getArticle(deps, st(c).id, c.req.param("handle")); if (a.status !== "published") throw notFound("Article"); return c.json(a); });
  s.get("/search", async (c) => { const q = c.req.query("q") ?? ""; await sessionFor(c, "search", { meta: { q } }); return c.json(await listProducts(deps, st(c).id, { page: 1, pageSize: 12, q, status: "published" })); });
  s.get("/variants", async (c) => { const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean); if (!ids.length) return c.json({ items: [] }); const vs = await deps.db.select().from(productVariants).where(and(eq(productVariants.storeId, st(c).id), inArray(productVariants.id, ids))); return c.json({ items: vs }); });
  s.post("/experiments/:id/convert", async (c) => { const b = await parseBody(c, z.object({ variant: z.string(), valueCents: z.number().int().default(0), sessionId: z.string().optional() })); return c.json({ analysis: await record(deps, st(c).id, c.req.param("id"), b.variant, "conversion", b.valueCents, b.sessionId) }); });

  r.route("/stores/:store", s);
  void collections; void collectionProducts; void asc;
  return r;
}
