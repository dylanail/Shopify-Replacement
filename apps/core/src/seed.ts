/**
 * Seed a demo workspace: user franz@kiln.local / kiln-demo, an org, and the "Ironjaw & Co." store
 * generated through the real onboarding pipeline, plus sample traffic, orders and reviews so the
 * dashboard, analytics and experiments have data on first open.
 */
import { createDeps } from "./deps.js";
import { hashPassword } from "./lib/crypto.js";
import { eq, users, organizations } from "@kiln/db";
import { runOnboarding } from "./ai/onboarding.js";
import { createCart, addToCart, updateCart } from "./services/carts.js";
import { checkout, fulfillOrder } from "./services/orders.js";
import { track } from "./services/analytics.js";
import { createReview } from "./services/reviews.js";
import { listProducts } from "./services/products.js";
import { createExperiment, setStatus, record, generateVariants } from "./services/experiments.js";
import { upsertKeyword } from "./services/seo.js";
import { trackPrompt, checkPrompts, updateKnowledgeCard } from "./services/geo.js";
import { rebuildAffinity } from "./services/merch.js";
import { listShippingOptions } from "./services/shipping.js";
import { storefrontUrl } from "./services/stores.js";

export async function seed(opts: { dataDir?: string; quiet?: boolean } = {}) {
  const deps = await createDeps({ dataDir: opts.dataDir });
  const log = (m: string) => { if (!opts.quiet) console.log(`[seed] ${m}`); };
  const email = "franz@kiln.local";
  let user = await deps.db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) [user] = await deps.db.insert(users).values({ email, passwordHash: await hashPassword("kiln-demo"), name: "Franz" }).returning();
  let org = await deps.db.query.organizations.findFirst({ where: eq(organizations.ownerUserId, user!.id) });
  if (!org) [org] = await deps.db.insert(organizations).values({ name: "Ironjaw Workshop", ownerUserId: user!.id, planSlug: "starter" }).returning();
  const existing = await deps.db.query.stores.findFirst({ where: eq((await import("@kiln/db")).stores.orgId, org!.id) });
  if (existing) { log(`store already seeded: ${existing.name} (${existing.slug})`); await deps.close(); return { storeId: existing.id, slug: existing.slug, email }; }

  log("running onboarding: Ironjaw & Co.");
  const res = await runOnboarding(deps, { orgId: org!.id, prompt: "Create me a high-converting hand-stitched boxing-gear store called Ironjaw & Co. in the style of a 1920s heritage leather atelier in Mexico City — sepia parchment tones, deep burgundy accents, vintage serif typography", country: "US", currency: "USD", productCount: 5, publish: true, actorId: user!.id });
  if (res.error) throw new Error(res.error);
  const storeId = res.storeId;
  log(`store live: ${res.name} → ${res.previewUrl}`);

  const prods = (await listProducts(deps, storeId, { page: 1, pageSize: 50, status: "published" })).items;
  const { adjustInventory } = await import("./services/products.js");
  for (const p of prods) for (const v of p.variants) await adjustInventory(deps, storeId, v.id, 400, "seed restock", "system");
  const ship = await listShippingOptions(deps, storeId);
  const names = [["Ana", "Ruiz"], ["Marcus", "Lee"], ["Priya", "Natarajan"], ["Tom", "Becker"], ["Sofia", "Almeida"], ["Jonas", "Weber"], ["Mei", "Chen"], ["Diego", "Torres"], ["Hannah", "Cole"], ["Luis", "Ortega"]];
  const cities = [["US", "Austin"], ["US", "Brooklyn"], ["MX", "Mexico City"], ["DE", "Berlin"], ["GB", "London"], ["FR", "Paris"], ["US", "Los Angeles"], ["CA", "Toronto"]];
  let orderCount = 0;
  // 28 days of traffic + orders
  for (let day = 27; day >= 0; day--) {
    const sessionsToday = 40 + ((day * 7919) % 45);
    for (let i = 0; i < sessionsToday; i++) {
      const [country, city] = cities[(day + i) % cities.length]!;
      const fp = `seed-${day}-${i}`;
      const t = await track(deps, storeId, { fingerprint: fp, kind: "view.page", path: "/", country, city, userAgent: i % 3 === 0 ? "Mobile Safari" : "Chrome" });
      const sid = t!.sessionId;
      const p = prods[(i + day) % prods.length]!;
      if (i % 2 === 0) await track(deps, storeId, { sessionId: sid, kind: "view.product", path: `/products/${p.handle}`, productId: p.id });
      if (i % 5 === 0) await track(deps, storeId, { sessionId: sid, kind: "cart.add", productId: p.id, variantId: p.variants[0]!.id, valueCents: p.variants[0]!.priceCents });
      if (i % 11 === 0) await track(deps, storeId, { sessionId: sid, kind: "checkout.start", path: "/checkout" });
      if (i % 17 === 0) {
        const [first, last] = names[(i + day) % names.length]!;
        const cart = await createCart(deps, storeId, { sessionId: sid });
        await addToCart(deps, storeId, cart.id, p.variants[0]!.id, 1 + (i % 2));
        if (i % 34 === 0) await addToCart(deps, storeId, cart.id, prods[(i + day + 1) % prods.length]!.variants[0]!.id, 1);
        await updateCart(deps, storeId, cart.id, { email: `${first!.toLowerCase()}.${last!.toLowerCase()}${(i + day) % 7}@example.com`, shippingAddress: { firstName: first!, lastName: last!, line1: "12 Calle Durango", city: city!, postalCode: "06700", country: country!, province: "" }, shippingOptionId: ship[0]!.id, discountCodes: i % 51 === 0 ? ["WELCOME10"] : [] });
        const o = await checkout(deps, storeId, cart.id, { email: `${first!.toLowerCase()}.${last!.toLowerCase()}${(i + day) % 7}@example.com`, paymentProvider: "test", paymentRef: `pi_seed_${day}_${i}`, acceptsMarketing: i % 2 === 0 });
        const { orders } = await import("@kiln/db");
        await deps.db.update(orders).set({ createdAt: new Date(Date.now() - day * 864e5 - i * 60e3) }).where(eq(orders.id, o.id));
        if (day > 3) await fulfillOrder(deps, storeId, o.id, { provider: "Shippo", trackingNumber: `1Z999AA1012345${(orderCount + 1000).toString().slice(-4)}` });
        orderCount++;
      }
    }
    const { sessions } = await import("@kiln/db");
    const { sql } = await import("@kiln/db");
    await deps.db.execute(sql`update ${sessions} set first_seen = first_seen - (${day} || ' days')::interval, last_seen = last_seen - (${day} || ' days')::interval where store_id = ${storeId} and fingerprint like ${`seed-${day}-%`}`);
    const { events } = await import("@kiln/db");
    await deps.db.execute(sql`update ${events} set created_at = created_at - (${day} || ' days')::interval where store_id = ${storeId} and session_id in (select id from ${sessions} where store_id = ${storeId} and fingerprint like ${`seed-${day}-%`})`);
  }
  log(`${orderCount} orders across 28 days`);

  const reviewCopy = ["Hand-stitched exactly as described. The leather broke in after two weeks of sparring and the wrist support is excellent.", "Ordered the 16oz in oxblood. Build quality is on another level — the stitching is tight and the padding is dense but not stiff.", "Took 14 days to ship as stated. Worth it. Best gloves I've owned in twelve years of training.", "Great gloves, slightly narrow in the hand for me. Customer service sorted an exchange in a day.", "Fine.", "The wraps are long enough and don't slip. Simple, good.", "Stunning craftsmanship. My coach asked where I got them.", "Bag is beautiful but I wish it had one more pocket.", "AMAZING PRODUCT BEST PURCHASE", "Solid build, arrived on time, smells like a real workshop."];
  for (const [i, body] of reviewCopy.entries()) {
    const p = prods[i % Math.min(3, prods.length)]!;
    const [first, last] = names[i]!;
    await createReview(deps, storeId, { productId: p.id, authorName: `${first} ${last![0]}.`, email: `${first!.toLowerCase()}.${last!.toLowerCase()}${i % 7}@example.com`, rating: body.length < 10 ? 3 : body.includes("wish") || body.includes("narrow") ? 4 : 5, body, title: i % 2 ? "Worth the wait" : "" }, { autoApprove: true });
  }
  log("reviews seeded");

  const hero = prods[0]!;
  const exp = await createExperiment(deps, storeId, { name: "PDP CTA copy", surface: "cta", target: `/products/${hero.handle}`, hypothesis: "An ownership-framed CTA lifts add-to-cart.", variants: generateVariants("cta", { label: "Add to cart" }) });
  await setStatus(deps, storeId, exp.id, "running");
  for (let i = 0; i < 130; i++) { await record(deps, storeId, exp.id, "A", "exposure"); if (i % 9 === 0) await record(deps, storeId, exp.id, "A", "conversion", hero.variants[0]!.priceCents); }
  for (let i = 0; i < 130; i++) { await record(deps, storeId, exp.id, "B", "exposure"); if (i % 5 === 0) await record(deps, storeId, exp.id, "B", "conversion", hero.variants[0]!.priceCents); }
  const exp2 = await createExperiment(deps, storeId, { name: "Homepage headline", surface: "headline", hypothesis: "Specific beats abstract.", variants: generateVariants("headline", { headline: "Hand-stitched in Mexico City" }) });
  await setStatus(deps, storeId, exp2.id, "running");
  for (let i = 0; i < 90; i++) { const v = ["A", "B", "C"][i % 3]!; await record(deps, storeId, exp2.id, v, "exposure"); if (i % 14 === 0) await record(deps, storeId, exp2.id, v, "conversion"); }

  for (const [q, page, pos] of [["hand stitched boxing gloves", `/products/${hero.handle}`, 4.2], ["mexican boxing gloves", `/products/${hero.handle}`, 7.8], ["leather sparring gloves 16oz", `/products/${hero.handle}`, 3.1], ["boxing hand wraps 180", "/products/oxblood-wraps-180in", 11.5], ["heritage boxing gear", "/", 15.2]] as const) await upsertKeyword(deps, storeId, q, page, pos);
  await updateKnowledgeCard(deps, storeId, { brandName: res.name, categories: ["boxing gloves", "boxing gear", "hand-stitched leather goods"], differentiators: ["Hand-stitched in Mexico City", "Full-grain leather, 14-day build", "Lifetime repairs"], locations: ["Mexico City"], founders: ["Franz Keller"], comparisons: [{ competitor: "Mass-market gloves", points: ["Hand-stitched vs. machine", "Repairable vs. disposable"] }] });
  for (const p of ["best hand-stitched boxing gloves", "boxing gloves made in Mexico", "heritage boxing brands"]) await trackPrompt(deps, storeId, p);
  await checkPrompts(deps, storeId);
  await rebuildAffinity(deps, storeId);
  log(`done · login ${email} / kiln-demo · store ${res.slug} · ${storefrontUrl(deps, { slug: res.slug })}`);
  await deps.close();
  return { storeId, slug: res.slug, email };
}

if (process.argv[1]?.endsWith("seed.ts")) await seed();
