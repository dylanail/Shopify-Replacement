import { describe, it, expect } from "vitest";
import { priceCart, type PromoLike } from "../src/services/pricing.js";
import { analyse, assignVariant } from "../src/services/experiments.js";
import { parseCsv, detectSource, rowsToProducts } from "../src/services/migration.js";
import { fakeScore } from "../src/services/reviews.js";
import { lintTheme } from "../src/services/theme.js";
import { generateBrandName, generatePalette, generateProducts, detectCategory } from "../src/ai/generators.js";
import { renderArt } from "../src/ai/images.js";
import { encryptSecret, decryptSecret, hashPassword, verifyPassword } from "../src/lib/crypto.js";
import { conditionsMatch } from "../src/services/workflows.js";
import { ThemeConfig } from "@kiln/shared";

const item = (id: string, price: number, qty = 1, productId = `p_${id}`) => ({ id, productId, variantId: `v_${id}`, title: id, variantTitle: "", quantity: qty, unitPriceCents: price });
const promo = (p: Partial<PromoLike>): PromoLike => ({ id: "x", code: null, kind: "automatic", type: "percentage", value: 0, minSubtotalCents: 0, minQuantity: 0, maxDiscountCents: null, appliesTo: {}, bogo: null, bundle: null, regionIds: [], usageLimit: null, usageCount: 0, stackable: false, status: "active", startsAt: null, endsAt: null, ...p });

describe("pricing engine", () => {
  it("applies percentage codes, rejects unknown, stacks free shipping", () => {
    const r = priceCart({ items: [item("a", 10000), item("b", 5000, 2)], promotions: [promo({ id: "w", code: "WELCOME10", kind: "code", value: 10 }), promo({ id: "fs", type: "free_shipping", minSubtotalCents: 15000, stackable: true })], appliedCodes: ["WELCOME10", "NOPE"], shippingOption: { id: "s", name: "Std", type: "flat", amountCents: 800, thresholdCents: null, rules: [], enabled: true }, region: { id: "r", taxRateBps: 0, taxInclusive: false, freeShippingThresholdCents: null } });
    expect(r.subtotalCents).toBe(20000);
    expect(r.discountCents).toBe(2000);
    expect(r.shippingCents).toBe(0);
    expect(r.rejectedCodes).toEqual([{ code: "NOPE", reason: "Unknown code" }]);
    expect(r.totalCents).toBe(18000);
  });
  it("picks the single best non-stackable promotion", () => {
    const r = priceCart({ items: [item("a", 10000)], promotions: [promo({ id: "a", value: 10 }), promo({ id: "b", value: 25 }), promo({ id: "c", type: "fixed", value: 1500, stackable: true })], appliedCodes: [] });
    expect(r.applied.map((a) => a.id).sort()).toEqual(["b", "c"]);
    expect(r.discountCents).toBe(4000);
  });
  it("computes BOGO, bundle tiers, caps and tax", () => {
    const bogo = priceCart({ items: [item("a", 3000, 3)], promotions: [promo({ id: "b", type: "bogo", bogo: { buyQuantity: 2, getQuantity: 1, getPercentOff: 100 } })], appliedCodes: [] });
    expect(bogo.discountCents).toBe(3000);
    const bundle = priceCart({ items: [item("a", 3000, 2), item("b", 2000)], promotions: [promo({ id: "t", type: "bundle", minQuantity: 2, bundle: { tiers: [{ quantity: 2, percentOff: 10 }, { quantity: 3, percentOff: 15 }] } })], appliedCodes: [] });
    expect(bundle.discountCents).toBe(1200);
    const capped = priceCart({ items: [item("a", 100000)], promotions: [promo({ id: "c", value: 50, maxDiscountCents: 5000 })], appliedCodes: [], region: { id: "r", taxRateBps: 825, taxInclusive: false, freeShippingThresholdCents: null } });
    expect(capped.discountCents).toBe(5000);
    expect(capped.taxCents).toBe(Math.round(95000 * 0.0825));
    const scoped = priceCart({ items: [item("a", 1000), item("b", 9000)], promotions: [promo({ id: "s", value: 50, appliesTo: { productIds: ["p_a"] } })], appliedCodes: [] });
    expect(scoped.discountCents).toBe(500);
    const expired = priceCart({ items: [item("a", 1000)], promotions: [promo({ id: "e", code: "OLD", kind: "code", value: 50, endsAt: new Date(Date.now() - 1000) })], appliedCodes: ["OLD"] });
    expect(expired.rejectedCodes[0]!.reason).toMatch(/expired/);
    expect(expired.freeShippingGapCents).toBe(null);
  });
  it("weight and price tiered shipping", () => {
    const opt = { id: "w", name: "Weight", type: "weight", amountCents: 999, thresholdCents: null, rules: [{ from: 0, to: 1000, amountCents: 500 }, { from: 1000, to: null, amountCents: 1500 }], enabled: true };
    expect(priceCart({ items: [item("a", 1000)], promotions: [], appliedCodes: [], shippingOption: opt, totalWeightGrams: 200 }).shippingCents).toBe(500);
    expect(priceCart({ items: [item("a", 1000)], promotions: [], appliedCodes: [], shippingOption: opt, totalWeightGrams: 2000 }).shippingCents).toBe(1500);
  });
});

describe("experiments", () => {
  it("assigns deterministically by split and analyses posteriors", () => {
    const exp = { id: "e", variants: [{ key: "A" }, { key: "B" }], trafficSplit: { A: 50, B: 50 } };
    const a = assignVariant(exp, "s1");
    expect(assignVariant(exp, "s1")).toBe(a);
    const counts = { A: 0, B: 0 };
    for (let i = 0; i < 1000; i++) counts[assignVariant(exp, `s${i}`) as "A" | "B"]++;
    expect(Math.abs(counts.A - counts.B)).toBeLessThan(120);
    const res = analyse({ variants: [{ key: "A" }, { key: "B" }], results: { A: { exposures: 1000, conversions: 30, revenueCents: 0 }, B: { exposures: 1000, conversions: 60, revenueCents: 0 } }, autoPromoteAt: 0.95 });
    expect(res.winner).toBe("B");
    expect(res.probability).toBeGreaterThan(0.95);
    expect(res.decision).toBe("promote");
    expect(res.liftPercent).toBe(100);
    const early = analyse({ variants: [{ key: "A" }, { key: "B" }], results: { A: { exposures: 10, conversions: 1, revenueCents: 0 }, B: { exposures: 10, conversions: 2, revenueCents: 0 } }, autoPromoteAt: 0.95 });
    expect(early.decision).toBe("continue");
  });
});

describe("migration", () => {
  it("parses quoted CSV and maps Shopify/Woo rows", () => {
    const rows = parseCsv('Handle,Title,Body (HTML),Variant Price,Option1 Name,Option1 Value,Image Src\nglove,"The Glove","<p>Says ""hi"", twice</p>",340,Weight,16oz,https://x/a.jpg\nglove,,,340,,18oz,\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]!["Body (HTML)"]).toBe('<p>Says "hi", twice</p>');
    expect(detectSource(Object.keys(rows[0]!))).toBe("shopify");
    const { products, issues } = rowsToProducts(rows, "shopify");
    expect(products).toHaveLength(1);
    expect(products[0]!.options).toEqual([{ name: "Weight", values: ["16oz", "18oz"] }]);
    expect(products[0]!.variants).toHaveLength(2);
    expect(issues).toEqual([]);
    const woo = parseCsv("Name,Slug,Regular price,Stock,Attribute 1 name,Attribute 1 value(s),Images\nMug,mug,18.5,4,Glaze,Ash | Oat,https://x/m.jpg\n");
    expect(detectSource(Object.keys(woo[0]!))).toBe("woocommerce");
    const w = rowsToProducts(woo, "woocommerce");
    expect(w.products[0]!.variants![0]!.priceCents).toBe(1850);
  });
});

describe("heuristics & generators", () => {
  it("scores fake reviews and lints themes", () => {
    expect(fakeScore({ body: "BEST PRODUCT", rating: 5, verified: false })).toBeGreaterThanOrEqual(0.5);
    expect(fakeScore({ body: "The stitching is tight and the padding is dense but not stiff. Wrist support is excellent after a month.", rating: 5, verified: true })).toBeLessThan(0.3);
    const t = ThemeConfig.parse({ sections: [{ id: "hero", type: "hero", settings: { headline: "" } }], customCss: "a { color: red " });
    const lint = lintTheme(t);
    expect(lint.ok).toBe(false);
    expect(lint.problems.map((p) => p.message)).toEqual(expect.arrayContaining([expect.stringMatching(/headline/), expect.stringMatching(/braces/)]));
  });
  it("generates coherent brand kits and products per category", () => {
    expect(generateBrandName("A skincare store called Undertone Lab that ships worldwide")).toBe("Undertone Lab");
    expect(detectCategory("hand-poured candles").key).toBe("candles");
    expect(generatePalette("minimal white studio").backgroundColor).toBe("#ffffff");
    const prods = generateProducts("coffee roaster in Portland", { name: "Long Pull" }, 5);
    expect(prods).toHaveLength(5);
    expect(new Set(prods.map((p) => p.title)).size).toBe(5);
    for (const p of prods) expect(p.description.split(/\s+/).length).toBeGreaterThan(120);
    const svg = renderArt({ title: "Kiln Blend", preset: "lifestyle" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("Kiln Blend");
  });
  it("crypto helpers round-trip", async () => {
    const enc = encryptSecret("shippo_live_123", "secret");
    expect(decryptSecret(enc.ciphertext, enc.iv, "secret")).toBe("shippo_live_123");
    expect(() => decryptSecret(enc.ciphertext, enc.iv, "other")).toThrow();
    const h = await hashPassword("kiln-demo");
    expect(await verifyPassword("kiln-demo", h)).toBe(true);
    expect(await verifyPassword("nope", h)).toBe(false);
  });
  it("workflow conditions", () => {
    expect(conditionsMatch([{ field: "order.totalCents", op: "gt", value: 5000 }, { field: "order.tags", op: "contains", value: "vip" }], { order: { totalCents: 9000, tags: ["vip"] } })).toBe(true);
    expect(conditionsMatch([{ field: "order.totalCents", op: "lt", value: 5000 }], { order: { totalCents: 9000 } })).toBe(false);
  });
});
