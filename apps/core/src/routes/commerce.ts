import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { parseBody, parseQuery, Pagination } from "../lib/http.js";
import { requireUser, requireStore, type AuthVars } from "../lib/auth.js";
import { listOrders, getOrder, fulfillOrder, markDelivered, cancelOrder, refundOrder, createReturn, completeReturn, orderStats } from "../services/orders.js";
import { listCustomers, getCustomer, upsertCustomer, deleteCustomer, customerSegments, CustomerInput } from "../services/customers.js";
import { createPromotion, updatePromotion, listPromotions, deletePromotion, PromotionInput } from "../services/promotions.js";
import { listRegions, createRegion, updateRegion, deleteRegion, listShippingOptions, createShippingOption, updateShippingOption, deleteShippingOption, RegionInput, ShippingOptionInput, COUNTRY_CATALOG } from "../services/shipping.js";
import { listSubscriptions, subscriptionMetrics, portalAction, processDueSubscriptions } from "../services/subscriptions.js";
import { listMerch, createMerch, updateMerch, deleteMerch, rebuildAffinity, MerchInput, MERCH_COMPONENTS } from "../services/merch.js";
import { giftCards, and, eq } from "@kiln/db";
import { randomToken } from "../lib/crypto.js";

export function commerceRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: AuthVars }>();
  r.use("*", requireUser(deps), requireStore(deps));
  const sid = (c: { get: (k: "storeId") => string }) => c.get("storeId");

  r.get("/orders", async (c) => c.json(await listOrders(deps, sid(c), parseQuery(c, Pagination.extend({ customerId: z.string().optional(), financial: z.string().optional(), fulfillment: z.string().optional() })))));
  r.get("/orders/stats", async (c) => c.json(await orderStats(deps, sid(c))));
  r.get("/orders/:id", async (c) => c.json(await getOrder(deps, sid(c), c.req.param("id"))));
  r.post("/orders/:id/fulfill", async (c) => c.json(await fulfillOrder(deps, sid(c), c.req.param("id"), await parseBody(c, z.object({ items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).optional(), provider: z.string().optional(), trackingNumber: z.string().optional(), trackingUrl: z.string().optional(), labelUrl: z.string().optional() })))));
  r.post("/orders/:id/cancel", async (c) => c.json(await cancelOrder(deps, sid(c), c.req.param("id"), (await parseBody(c, z.object({ reason: z.string().default("") }))).reason, c.get("userId"))));
  r.post("/orders/:id/refund", async (c) => { const b = await parseBody(c, z.object({ amountCents: z.number().int().positive().optional(), reason: z.string().default("") })); return c.json(await refundOrder(deps, sid(c), c.req.param("id"), b.amountCents, b.reason, c.get("userId"))); });
  r.post("/orders/:id/returns", async (c) => c.json(await createReturn(deps, sid(c), c.req.param("id"), await parseBody(c, z.object({ items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive(), reason: z.string().default("") })), kind: z.enum(["refund", "exchange"]).optional(), reason: z.string().optional() }))), 201));
  r.post("/returns/:id/complete", async (c) => c.json(await completeReturn(deps, sid(c), c.req.param("id"), c.get("userId"))));
  r.post("/fulfillments/:id/delivered", async (c) => c.json(await markDelivered(deps, sid(c), c.req.param("id"))));

  r.get("/customers", async (c) => c.json(await listCustomers(deps, sid(c), parseQuery(c, Pagination.extend({ segment: z.string().optional(), marketing: z.string().optional() })))));
  r.get("/customers/segments", async (c) => c.json(await customerSegments(deps, sid(c))));
  r.post("/customers", async (c) => c.json(await upsertCustomer(deps, sid(c), await parseBody(c, CustomerInput)), 201));
  r.get("/customers/:id", async (c) => c.json(await getCustomer(deps, sid(c), c.req.param("id"))));
  r.patch("/customers/:id", async (c) => { const cu = await getCustomer(deps, sid(c), c.req.param("id")); return c.json(await upsertCustomer(deps, sid(c), { email: cu.email, ...(await parseBody(c, CustomerInput.partial())) })); });
  r.delete("/customers/:id", async (c) => c.json(await deleteCustomer(deps, sid(c), c.req.param("id"))));
  r.get("/customers/:id/subscriptions", async (c) => c.json({ items: await listSubscriptions(deps, sid(c), c.req.param("id")) }));

  r.get("/promotions", async (c) => c.json({ items: await listPromotions(deps, sid(c)) }));
  r.post("/promotions", async (c) => c.json(await createPromotion(deps, sid(c), await parseBody(c, PromotionInput)), 201));
  r.patch("/promotions/:id", async (c) => c.json(await updatePromotion(deps, sid(c), c.req.param("id"), await parseBody(c, PromotionInput.partial()))));
  r.delete("/promotions/:id", async (c) => c.json(await deletePromotion(deps, sid(c), c.req.param("id"))));

  r.get("/gift-cards", async (c) => c.json({ items: await deps.db.select().from(giftCards).where(eq(giftCards.storeId, sid(c))) }));
  r.post("/gift-cards", async (c) => { const b = await parseBody(c, z.object({ amountCents: z.number().int().positive(), currency: z.string().default("USD"), customerId: z.string().optional() })); const [g] = await deps.db.insert(giftCards).values({ storeId: sid(c), code: `KILN-${randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 8)}`, initialCents: b.amountCents, balanceCents: b.amountCents, currency: b.currency, customerId: b.customerId ?? null }).returning(); return c.json(g, 201); });
  r.delete("/gift-cards/:id", async (c) => { await deps.db.update(giftCards).set({ status: "disabled" }).where(and(eq(giftCards.id, c.req.param("id")), eq(giftCards.storeId, sid(c)))); return c.json({ ok: true }); });

  r.get("/regions", async (c) => c.json({ items: await listRegions(deps, sid(c)), countries: COUNTRY_CATALOG }));
  r.post("/regions", async (c) => c.json(await createRegion(deps, sid(c), await parseBody(c, RegionInput)), 201));
  r.patch("/regions/:id", async (c) => c.json(await updateRegion(deps, sid(c), c.req.param("id"), await parseBody(c, RegionInput.partial()))));
  r.delete("/regions/:id", async (c) => c.json(await deleteRegion(deps, sid(c), c.req.param("id"))));
  r.get("/shipping-options", async (c) => c.json({ items: await listShippingOptions(deps, sid(c), c.req.query("regionId")) }));
  r.post("/shipping-options", async (c) => c.json(await createShippingOption(deps, sid(c), await parseBody(c, ShippingOptionInput)), 201));
  r.patch("/shipping-options/:id", async (c) => c.json(await updateShippingOption(deps, sid(c), c.req.param("id"), await parseBody(c, ShippingOptionInput.partial()))));
  r.delete("/shipping-options/:id", async (c) => c.json(await deleteShippingOption(deps, sid(c), c.req.param("id"))));

  r.get("/subscriptions", async (c) => c.json({ items: await listSubscriptions(deps, sid(c)), metrics: await subscriptionMetrics(deps, sid(c)) }));
  r.post("/subscriptions/:id/:action", async (c) => c.json(await portalAction(deps, sid(c), c.req.param("id"), c.req.param("action") as never, (await parseBody(c, z.object({ cadence: z.string().optional() }))).cadence)));
  r.post("/subscriptions/process-due", async (c) => c.json(await processDueSubscriptions(deps, sid(c))));

  r.get("/merch", async (c) => c.json({ items: await listMerch(deps, sid(c), c.req.query("kind")), components: MERCH_COMPONENTS }));
  r.post("/merch", async (c) => c.json(await createMerch(deps, sid(c), await parseBody(c, MerchInput)), 201));
  r.patch("/merch/:id", async (c) => c.json(await updateMerch(deps, sid(c), c.req.param("id"), await parseBody(c, MerchInput.partial()))));
  r.delete("/merch/:id", async (c) => c.json(await deleteMerch(deps, sid(c), c.req.param("id"))));
  r.post("/merch/rebuild-affinity", async (c) => c.json(await rebuildAffinity(deps, sid(c))));
  return r;
}
