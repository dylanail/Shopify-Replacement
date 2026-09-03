import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDeps } from "../src/deps.js";
import { createApp } from "../src/app.js";

let deps: Awaited<ReturnType<typeof createDeps>>;
let app: ReturnType<typeof createApp>;
let token = "";
let orgId = "";
let storeId = "";
let slug = "";

const api = async (path: string, init: RequestInit & { json?: unknown; auth?: boolean } = {}) => {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.auth !== false && token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await app.fetch(new Request(`http://kiln.test/api/v1${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }));
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

beforeAll(async () => {
  deps = await createDeps({ dataDir: ":memory:", publicCoreUrl: "http://kiln.test", storefrontBaseDomain: "localhost:3001" });
  app = createApp(deps, { quiet: true });
}, 60000);
afterAll(async () => { await deps.close(); });

describe("kiln core end-to-end", () => {
  it("registers and logs in", async () => {
    const reg = await api("/auth/register", { method: "POST", json: { email: "franz@ironjaw.test", password: "kiln-demo-1", name: "Franz" }, auth: false });
    expect(reg.status).toBe(201);
    token = reg.body.accessToken;
    orgId = reg.body.org.id;
    const me = await api("/auth/me");
    expect(me.body.user.email).toBe("franz@ironjaw.test");
    const bad = await api("/auth/login", { method: "POST", json: { email: "franz@ironjaw.test", password: "wrong-password" }, auth: false });
    expect(bad.status).toBe(401);
  });

  it("turns one sentence into a live store", async () => {
    const r = await api("/stores/onboard", { method: "POST", json: { orgId, prompt: "Create a hand-stitched boxing-gear store called Ironjaw & Co. in the style of a 1920s heritage leather atelier in Mexico City", productCount: 3 } });
    storeId = r.body.storeId;
    slug = r.body.slug;
    expect(r.status).toBe(201);
    expect(r.body.error).toBeUndefined();
    expect(r.body.name).toBe("Ironjaw & Co.");
    expect(r.body.steps.every((s: any) => s.status === "done")).toBe(true);
    storeId = r.body.storeId;
    slug = r.body.slug;
    const store = await api(`/stores/${storeId}`);
    expect(store.body.status).toBe("live");
    expect(store.body.brand.primaryColor).toBe("#5a1f1f");
    const prods = await api(`/stores/${storeId}/products`);
    expect(prods.body.total).toBe(3);
    expect(prods.body.items[0].variants.length).toBeGreaterThan(0);
    expect(prods.body.items[0].description.length).toBeGreaterThan(300);
    const promos = await api(`/stores/${storeId}/promotions`);
    expect(promos.body.items.map((p: any) => p.code ?? p.type).sort()).toEqual(["WELCOME10", "bundle", "free_shipping"]);
    const todos = await api(`/stores/${storeId}/todos`);
    expect(todos.body.items.find((t: any) => t.key === "publish").status).toBe("done");
  }, 60000);

  it("serves the public storefront API and prices a cart with promotions", async () => {
    const shell = await api(`/public/stores/${slug}`, { auth: false });
    expect(shell.status).toBe(200);
    expect(shell.body.theme.sections.some((s: any) => s.type === "hero")).toBe(true);
    expect(shell.body.plugins.map((p: any) => p.id)).toContain("product-reviews");
    const list = await api(`/public/stores/${slug}/products`, { auth: false });
    const p = [...list.body.items].sort((a: any, b: any) => b.variants[0].priceCents - a.variants[0].priceCents)[0];
    expect(p.variants[0].priceCents).toBeGreaterThanOrEqual(10000);
    const pdp = await api(`/public/stores/${slug}/products/${p.handle}`, { auth: false });
    expect(pdp.body.recommendations.length).toBeGreaterThan(0);
    expect(pdp.body.sessionId).toBeTruthy();
    const cart = await api(`/public/stores/${slug}/cart`, { method: "POST", json: { sessionId: pdp.body.sessionId }, auth: false });
    expect(cart.status).toBe(201);
    const v = p.variants[0];
    const added = await api(`/public/stores/${slug}/cart/${cart.body.id}/items`, { method: "POST", json: { variantId: v.id, quantity: 2, sessionId: pdp.body.sessionId }, auth: false });
    expect(added.body.pricing.subtotalCents).toBe(v.priceCents * 2);
    expect(added.body.pricing.applied.some((a: any) => a.type === "bundle")).toBe(true); // 2 items → 10% tier
    const disc = await api(`/public/stores/${slug}/cart/${cart.body.id}/discount`, { method: "POST", json: { code: "WELCOME10" }, auth: false });
    expect(disc.status).toBe(200);
    expect(disc.body.pricing.applied.some((a: any) => a.code === "WELCOME10")).toBe(true);
    const badCode = await api(`/public/stores/${slug}/cart/${cart.body.id}/discount`, { method: "POST", json: { code: "NOPE" }, auth: false });
    expect(badCode.status).toBe(400);
    const opts = await api(`/public/stores/${slug}/shipping-options`, { auth: false });
    const std = opts.body.items.find((o: any) => o.name === "Standard");
    const upd = await api(`/public/stores/${slug}/cart/${cart.body.id}`, { method: "PATCH", json: { email: "ana@example.com", shippingAddress: { firstName: "Ana", lastName: "Ruiz", line1: "1 Calle", city: "CDMX", postalCode: "06600", country: "US" }, shippingOptionId: std.id, sessionId: pdp.body.sessionId }, auth: false });
    // subtotal 2×340 = 680 > free-ship threshold 200 → shipping 0
    expect(upd.body.pricing.shippingCents).toBe(0);
    const co = await api(`/public/stores/${slug}/cart/${cart.body.id}/checkout`, { method: "POST", json: { email: "ana@example.com", paymentProvider: "test", paymentRef: "pi_test" }, auth: false });
    expect(co.status).toBe(201);
    expect(co.body.order.number).toBe(1001);
    expect(co.body.order.financialStatus).toBe("paid");
    const again = await api(`/public/stores/${slug}/cart/${cart.body.id}/checkout`, { method: "POST", json: { email: "ana@example.com" }, auth: false });
    expect(again.status).toBe(400);
    const orders = await api(`/stores/${storeId}/orders`);
    expect(orders.body.total).toBe(1);
    const prod = await api(`/stores/${storeId}/products/${p.id}`);
    expect(prod.body.variants.find((x: any) => x.id === v.id).inventoryQty).toBe(v.inventoryQty - 2);
    const cust = await api(`/stores/${storeId}/customers`);
    expect(cust.body.items[0].ordersCount).toBe(1);
    const emails = await api(`/stores/${storeId}/emails/log`);
    expect(emails.body.items.some((e: any) => e.templateKey === "order_confirmation" && e.status === "sent")).toBe(true);
  }, 60000);

  it("fulfils, refunds and reports analytics", async () => {
    const orders = await api(`/stores/${storeId}/orders`);
    const o = orders.body.items[0];
    const f = await api(`/stores/${storeId}/orders/${o.id}/fulfill`, { method: "POST", json: { trackingNumber: "1Z999" } });
    expect(f.body.fulfillmentStatus).toBe("fulfilled");
    const rf = await api(`/stores/${storeId}/orders/${o.id}/refund`, { method: "POST", json: { amountCents: 1000, reason: "goodwill" } });
    expect(rf.body.financialStatus).toBe("partially_refunded");
    const s = await api(`/stores/${storeId}/analytics/summary?range=7d`);
    expect(s.body.kpis.orders.value).toBe(1);
    expect(s.body.kpis.sessions.value).toBeGreaterThan(0);
    const fn = await api(`/stores/${storeId}/analytics/funnel`);
    expect(fn.body.steps[3].sessions).toBe(1);
    const dash = await api(`/stores/${storeId}/dashboard`);
    expect(dash.body.publish.label).toMatch(/Live|Publish/);
  });

  it("runs the AI assistant through real tools (offline planner)", async () => {
    const run = await api(`/stores/${storeId}/ai/runs`, { method: "POST", json: { input: "Add a product called Oxblood Wraps 120in for $24 in sizes S, M, L", pageContext: "products" } });
    expect(run.status).toBe(202);
    for (let i = 0; i < 60; i++) {
      const r = await api(`/stores/${storeId}/ai/runs/${run.body.runId}`);
      if (r.body.status === "completed" || r.body.status === "failed") { expect(r.body.status).toBe("completed"); expect(r.body.result).toMatch(/Created the product/); break; }
      await new Promise((res) => setTimeout(res, 100));
    }
    const prods = await api(`/stores/${storeId}/products?q=Oxblood`);
    const created = prods.body.items.find((p: any) => p.title === "Oxblood Wraps 120in");
    expect(created).toBeTruthy();
    expect(created.variants.map((v: any) => v.title)).toEqual(["S", "M", "L"]);
    expect(created.variants[0].priceCents).toBe(2400);
    const promo = await api(`/stores/${storeId}/ai/runs`, { method: "POST", json: { input: "create discount code SUMMER20 for 20% off" } });
    await new Promise((res) => setTimeout(res, 600));
    const promos = await api(`/stores/${storeId}/promotions`);
    expect(promos.body.items.some((p: any) => p.code === "SUMMER20" && p.value === 20)).toBe(true);
    const risky = await api(`/stores/${storeId}/ai/runs`, { method: "POST", json: { input: "refund order #1001 $5" } });
    await new Promise((res) => setTimeout(res, 600));
    const rr = await api(`/stores/${storeId}/ai/runs/${risky.body.runId}`);
    expect(rr.body.status).toBe("paused");
    const resumed = await api(`/stores/${storeId}/ai/runs/${risky.body.runId}/resume`, { method: "POST", json: { answer: "refund order #1001 $5", confirm: true } });
    await new Promise((res) => setTimeout(res, 800));
    const done = await api(`/stores/${storeId}/ai/runs/${resumed.body.runId}`);
    expect(done.body.status).toBe("completed");
    const tools = await api(`/stores/${storeId}/ai/tools`);
    expect(tools.body.count).toBeGreaterThan(70);
    const msgs = await api(`/stores/${storeId}/ai/sessions/${run.body.sessionId}/messages`);
    expect(msgs.body.items.map((m: any) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    void promo;
  }, 30000);

  it("installs plugins with validated, encrypted settings and exposes them to the storefront", async () => {
    const bad = await api(`/stores/${storeId}/plugins/ga4/install`, { method: "POST", json: { settings: { measurementId: "nope" } } });
    expect(bad.status).toBe(400);
    const ok = await api(`/stores/${storeId}/plugins/ga4/install`, { method: "POST", json: { settings: { measurementId: "G-ABC1234" } } });
    expect(ok.status).toBe(201);
    const gated = await api(`/stores/${storeId}/plugins/meta-ads/install`, { method: "POST", json: {} });
    expect(gated.status).toBe(403);
    const shippo = await api(`/stores/${storeId}/plugins/shippo/install`, { method: "POST", json: { settings: { apiToken: "shippo_test_123" } } });
    expect(shippo.body.settings.apiToken).toBe("••••••••");
    const shell = await api(`/public/stores/${slug}`, { auth: false });
    expect(shell.body.plugins.find((p: any) => p.id === "ga4").settings.measurementId).toBe("G-ABC1234");
    expect(shell.body.plugins.find((p: any) => p.id === "shippo").settings.apiToken).toBeUndefined();
    const preview = await api(`/public/stores/${slug}?env=draft`, { auth: false });
    expect(preview.body.plugins.some((p: any) => p.id === "ga4")).toBe(false); // disableInPreview
  });

  it("designer: edits draft, lints, builds and publishes with rollback", async () => {
    const sec = await api(`/stores/${storeId}/environments/draft/sections`, { method: "POST", json: { type: "hero", settings: { headline: "" } } });
    expect(sec.status).toBe(200);
    const build = await api(`/stores/${storeId}/environments/draft/build`, { method: "POST" });
    expect(build.body.ok).toBe(false);
    const pub = await api(`/stores/${storeId}/publish`, { method: "POST" });
    expect(pub.status).toBe(400);
    await api(`/stores/${storeId}/environments/draft/sections`, { method: "POST", json: { type: "hero", settings: { headline: "Built for real rounds" } } });
    const pub2 = await api(`/stores/${storeId}/publish`, { method: "POST" });
    expect(pub2.status).toBe(200);
    expect(pub2.body.version).toBe(3);
    const live = await api(`/public/stores/${slug}`, { auth: false });
    expect(live.body.theme.sections.find((s: any) => s.type === "hero").settings.headline).toBe("Built for real rounds");
    const rb = await api(`/stores/${storeId}/rollback`, { method: "POST" });
    expect(rb.body.version).toBe(4);
    const state = await api(`/stores/${storeId}/publish-state`);
    expect(state.body.label).toBe("Publish changes");
  });

  it("reviews, experiments, seo, geo, csv import", async () => {
    const ordersRes = await api(`/stores/${storeId}/orders`);
    const p = await (await api(`/stores/${storeId}/products/${ordersRes.body.items[0].items[0].productId}`)).body;
    const rv = await api(`/public/stores/${slug}/products/${p.handle}/reviews`, { method: "POST", json: { authorName: "Ana R.", email: "ana@example.com", rating: 5, body: "Hand-stitched exactly as described; the wrist support is excellent and the leather broke in fast." }, auth: false });
    expect(rv.body.verified).toBe(true);
    const fake = await api(`/public/stores/${slug}/products/${p.handle}/reviews`, { method: "POST", json: { authorName: "x", rating: 5, body: "BEST PRODUCT" }, auth: false });
    expect(fake.body.flags).toContain("possible_fake");
    await api(`/stores/${storeId}/reviews/${rv.body.id}/approve`, { method: "POST", json: {} });
    const stats = await api(`/stores/${storeId}/reviews/stats/${p.id}`);
    expect(stats.body.total).toBe(1);
    expect(stats.body.summary[0]).toMatch(/1 approved/);
    const exp = await api(`/stores/${storeId}/experiments`, { method: "POST", json: { name: "CTA", surface: "cta", variants: [{ key: "A", label: "Control", payload: { label: "Add to cart" } }, { key: "B", label: "B", payload: { label: "Order your pair" } }] } });
    await api(`/stores/${storeId}/experiments/${exp.body.id}/running`, { method: "POST" });
    for (let i = 0; i < 240; i++) { const v = i % 2 ? "B" : "A"; await deps.db.insert((await import("@kiln/db")).experimentEvents).values({ experimentId: exp.body.id, variant: v, kind: "exposure" }); }
    const exps = await api(`/stores/${storeId}/experiments`);
    expect(exps.body.items[0].analysis.ladder.length).toBe(4);
    const scan = await api(`/stores/${storeId}/seo/scan`, { method: "POST" });
    expect(scan.body.scanned).toBeGreaterThan(3);
    const sitemap = await api(`/public/stores/${slug}/sitemap.xml`, { auth: false });
    expect(sitemap.body).toContain("<urlset");
    const llms = await api(`/public/stores/${slug}/llms.txt`, { auth: false });
    expect(llms.body).toContain("# Ironjaw");
    const csv = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Inventory Qty,Variant Price,Image Src\ncorner-stool,Corner Stool,"<p>Folding steel stool, ""ringside"" grade.</p>",Ironjaw,Gear,gear,TRUE,Color,Black,CS-BLK,10,89.00,https://example.com/a.jpg\ncorner-stool,,,,,,,,Red,CS-RED,5,89.00,\n`;
    const dry = await api(`/stores/${storeId}/import`, { method: "POST", json: { csv, dryRun: true } });
    expect(dry.body.source).toBe("shopify");
    expect(dry.body.counts.variants).toBe(2);
    const imp = await api(`/stores/${storeId}/import`, { method: "POST", json: { csv } });
    expect(imp.body.counts.products).toBe(1);
    const stool = await api(`/stores/${storeId}/products?q=Corner Stool`);
    expect(stool.body.items[0].variants.map((v: any) => v.sku).sort()).toEqual(["CS-BLK", "CS-RED"]);
    expect(stool.body.items[0].description).toContain('"ringside"');
  }, 30000);

  it("multi-region, domains, team, billing", async () => {
    const reg = await api(`/stores/${storeId}/regions`, { method: "POST", json: { name: "United Kingdom", currency: "gbp", countries: ["GB"] } });
    expect(reg.body.currency).toBe("GBP");
    const store = await api(`/stores/${storeId}`);
    expect(store.body.settings.currencyLocked).toBe(true);
    const dom = await api(`/stores/${storeId}/domains`, { method: "POST", json: { hostname: "shop.ironjaw.test" } });
    expect(dom.body.instructions[0].type).toBe("TXT");
    const ver = await api(`/stores/${storeId}/domains/${dom.body.id}/verify?force=1`, { method: "POST" });
    expect(ver.body.verified).toBe(true);
    const byHost = await api(`/public/stores/shop.ironjaw.test`, { auth: false });
    expect(byHost.body.slug).toBe(slug);
    const blocked = await api(`/stores/${storeId}/team/invite`, { method: "POST", json: { email: "mei@ironjaw.test", role: "member", permissions: ["orders"] } });
    expect(blocked.status).toBe(400); // Free plan: 1 seat
    const bill = await api(`/stores/${storeId}/billing`);
    expect(bill.body.plan.slug).toBe("free");
    const up = await api(`/stores/${storeId}/billing/plan`, { method: "POST", json: { planSlug: "starter", interval: "yearly" } });
    expect(up.body.planSlug).toBe("starter");
    const inv = await api(`/stores/${storeId}/team/invite`, { method: "POST", json: { email: "mei@ironjaw.test", role: "member", permissions: ["orders"] } });
    expect(inv.status).toBe(201);
    expect(inv.body.inviteUrl).toContain("/invite/");
    const meta = await api(`/stores/${storeId}/plugins/meta-ads/install`, { method: "POST", json: { settings: { pixelId: "1234567890123", accessToken: "tok" } } });
    expect(meta.status).toBe(201);
  });

  it("orchestrator cron endpoints are secret-protected", async () => {
    const no = await api(`/webhooks/orchestrator/cron/affinity`, { method: "POST", auth: false });
    expect(no.status).toBe(401);
    const res = await app.fetch(new Request("http://kiln.test/api/v1/webhooks/orchestrator/cron/affinity", { method: "POST", headers: { "x-orchestrator-secret": deps.env.orchestratorSecret } }));
    expect(res.status).toBe(200);
  });
});
