import { Hono } from "hono";
import { z } from "zod";
import { eq, fulfillments, orders } from "@kiln/db";
import type { AppDeps } from "../context.js";
import { parseBody } from "../lib/http.js";
import { requireOrchestrator } from "../lib/auth.js";
import { applyStripeSubscription, completeConnect } from "../services/billing.js";
import { markDelivered } from "../services/orders.js";
import { resolveCredential, storefrontPluginConfig } from "../services/plugins.js";
import { processDueSubscriptions } from "../services/subscriptions.js";
import { findAbandonedCarts } from "../services/carts.js";
import { sendTemplated } from "../services/emails.js";
import { rebuildAffinity } from "../services/merch.js";
import { checkPrompts } from "../services/geo.js";
import { stores, carts } from "@kiln/db";
import { badRequest } from "../lib/errors.js";

export function webhookRoutes(deps: AppDeps) {
  const r = new Hono();

  /** Stripe events: checkout completed (plan), payment succeeded, account updated. */
  r.post("/stripe", async (c) => {
    const raw = await c.req.text();
    let event: { type: string; data: { object: Record<string, unknown> } };
    if (deps.stripe && deps.env.stripeWebhookSecret) {
      const sig = c.req.header("stripe-signature") ?? "";
      try {
        event = deps.stripe.webhooks.constructEvent(raw, sig, deps.env.stripeWebhookSecret) as never;
      } catch (err) {
        throw badRequest(`Bad signature: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else event = JSON.parse(raw || "{}");
    const obj = event.data?.object ?? {};
    if (event.type === "checkout.session.completed" && obj.metadata) {
      const meta = obj.metadata as { orgId: string; planSlug: string; interval: string };
      await applyStripeSubscription(deps, meta, { customerId: obj.customer as string, subscriptionId: obj.subscription as string });
    }
    if (event.type === "account.updated" && typeof obj.id === "string") {
      const [s] = await deps.db.select().from(stores).where(eq(stores.stripeAccountId, obj.id));
      if (s) await completeConnect(deps, s.id, obj.id, !!obj.charges_enabled, !!obj.payouts_enabled);
    }
    return c.json({ received: true });
  });

  /** Stripe Connect OAuth callback. */
  r.get("/stripe/connect", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state || !deps.stripe) throw badRequest("Missing code/state");
    const { storeId } = JSON.parse(Buffer.from(state, "base64url").toString()) as { storeId: string };
    const res = await deps.stripe.oauth.token({ grant_type: "authorization_code", code });
    await completeConnect(deps, storeId, res.stripe_user_id!, true, true);
    return c.redirect(`${deps.env.adminUrl}/settings/payments?connected=1`);
  });

  /** Carrier/3PL tracking webhooks: POST /webhooks/:pluginId/:storeId with a per-tenant token. */
  r.post("/:pluginId/:storeId", async (c) => {
    const { pluginId, storeId } = c.req.param();
    const token = c.req.header("x-kiln-token") ?? c.req.query("token");
    const expected = await resolveCredential(deps, storeId, pluginId, "webhookToken");
    if (expected && token !== expected) throw badRequest("Bad webhook token");
    const b = await parseBody(c, z.object({ trackingNumber: z.string().optional(), status: z.string().optional(), orderNumber: z.number().int().optional(), trackingUrl: z.string().optional() }));
    if (b.trackingNumber && b.status) {
      const [f] = await deps.db.select().from(fulfillments).where(eq(fulfillments.trackingNumber, b.trackingNumber));
      if (f && /deliver/i.test(b.status)) await markDelivered(deps, storeId, f.id);
      else if (f) await deps.db.update(fulfillments).set({ status: b.status.toLowerCase(), trackingUrl: b.trackingUrl ?? f.trackingUrl }).where(eq(fulfillments.id, f.id));
    }
    return c.json({ ok: true, plugin: pluginId });
  });

  /** Internal orchestrator: cron-driven jobs. Protected by X-Orchestrator-Secret. */
  const o = new Hono();
  o.use("*", requireOrchestrator(deps));
  o.post("/cron/:job", async (c) => {
    const job = c.req.param("job");
    const all = await deps.db.select({ id: stores.id }).from(stores);
    const results: Record<string, unknown> = {};
    for (const s of all) {
      if (job === "abandoned-carts") {
        const abandoned = await findAbandonedCarts(deps, s.id, 4);
        for (const cart of abandoned) {
          await sendTemplated(deps, s.id, "abandoned_cart", cart.email!, { cart, cartUrl: `/cart?id=${cart.id}`, customer: { firstName: cart.shippingAddress?.firstName ?? "" } });
          await deps.db.update(carts).set({ abandonedEmailSentAt: new Date(), status: "abandoned" }).where(eq(carts.id, cart.id));
        }
        results[s.id] = abandoned.length;
      } else if (job === "subscriptions") results[s.id] = await processDueSubscriptions(deps, s.id);
      else if (job === "affinity") results[s.id] = await rebuildAffinity(deps, s.id);
      else if (job === "geo") results[s.id] = (await checkPrompts(deps, s.id)).length;
      else if (job === "review-requests") {
        const delivered = await deps.db.select().from(fulfillments).where(eq(fulfillments.status, "delivered"));
        let sent = 0;
        for (const f of delivered.filter((x) => x.storeId === s.id && x.deliveredAt && Date.now() - x.deliveredAt.getTime() > 7 * 864e5 && Date.now() - x.deliveredAt.getTime() < 8 * 864e5)) {
          const [ord] = await deps.db.select().from(orders).where(eq(orders.id, f.orderId));
          if (ord) { await sendTemplated(deps, s.id, "review_request", ord.email, { order: ord, firstItemTitle: ord.items[0]?.title ?? "your order", reviewUrl: `/products/${ord.items[0]?.productId}#review`, customer: { firstName: ord.shippingAddress?.firstName } }); sent++; }
        }
        results[s.id] = sent;
      }
    }
    return c.json({ job, results });
  });
  o.post("/plugin-settings/:storeId/:pluginId", async (c) => c.json({ ok: true, config: (await storefrontPluginConfig(deps, c.req.param("storeId"))).find((p) => p.id === c.req.param("pluginId")) ?? null }));
  r.route("/orchestrator", o);
  return r;
}
