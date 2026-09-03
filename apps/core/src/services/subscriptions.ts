import { and, eq, lte, desc, count, sum, customerSubscriptions, products, productVariants, orders, sql } from "@kiln/db";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import { sendTemplated } from "./emails.js";

const CADENCE_DAYS: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 91, annual: 365 };

export async function createSubscriptionsFromOrder(deps: AppDeps, order: typeof orders.$inferSelect) {
  for (const item of order.items) {
    if (!item.subscriptionCadence || !order.customerId) continue;
    const product = await deps.db.query.products.findFirst({ where: eq(products.id, item.productId) });
    if (!product?.subscription?.enabled) continue;
    const trialDays = product.subscription.trialDays;
    const [prior] = await deps.db.select({ n: count() }).from(customerSubscriptions).where(and(eq(customerSubscriptions.customerId, order.customerId), eq(customerSubscriptions.storeId, order.storeId)));
    const skipTrial = Number(prior?.n ?? 0) > 0; // returning customers skip the trial
    const days = CADENCE_DAYS[item.subscriptionCadence] ?? 30;
    const next = new Date(Date.now() + (trialDays && !skipTrial ? trialDays : days) * 864e5);
    await deps.db.insert(customerSubscriptions).values({ storeId: order.storeId, customerId: order.customerId, variantId: item.variantId, quantity: item.quantity, cadence: item.subscriptionCadence, status: trialDays && !skipTrial ? "trialing" : "active", priceCents: item.unitPriceCents, currency: order.currency, nextBillingAt: next, trialEndsAt: trialDays && !skipTrial ? next : null });
  }
}

export async function listSubscriptions(deps: AppDeps, storeId: string, customerId?: string) {
  return deps.db.select().from(customerSubscriptions).where(and(eq(customerSubscriptions.storeId, storeId), customerId ? eq(customerSubscriptions.customerId, customerId) : undefined)).orderBy(desc(customerSubscriptions.createdAt));
}

export async function subscriptionMetrics(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select({ status: customerSubscriptions.status, cadence: customerSubscriptions.cadence, n: count(), mrr: sum(sql`case ${customerSubscriptions.cadence} when 'weekly' then ${customerSubscriptions.priceCents} * ${customerSubscriptions.quantity} * 4.33 when 'monthly' then ${customerSubscriptions.priceCents} * ${customerSubscriptions.quantity} when 'quarterly' then ${customerSubscriptions.priceCents} * ${customerSubscriptions.quantity} / 3.0 else ${customerSubscriptions.priceCents} * ${customerSubscriptions.quantity} / 12.0 end`) }).from(customerSubscriptions).where(eq(customerSubscriptions.storeId, storeId)).groupBy(customerSubscriptions.status, customerSubscriptions.cadence);
  const active = rows.filter((r) => r.status === "active" || r.status === "trialing");
  const cancelled = rows.filter((r) => r.status === "cancelled").reduce((s, r) => s + Number(r.n), 0);
  const subscribers = active.reduce((s, r) => s + Number(r.n), 0);
  return { subscribers, mrrCents: Math.round(active.reduce((s, r) => s + Number(r.mrr ?? 0), 0)), churnRate: subscribers + cancelled ? Math.round((cancelled / (subscribers + cancelled)) * 1000) / 10 : 0, trialing: rows.filter((r) => r.status === "trialing").reduce((s, r) => s + Number(r.n), 0), byCadence: Object.fromEntries(active.map((r) => [r.cadence, Number(r.n)])) };
}

export async function portalAction(deps: AppDeps, storeId: string, id: string, action: "pause" | "resume" | "cancel" | "change_cadence", cadence?: string) {
  const [s] = await deps.db.select().from(customerSubscriptions).where(and(eq(customerSubscriptions.id, id), eq(customerSubscriptions.storeId, storeId)));
  if (!s) throw notFound("Subscription");
  const patch: Partial<typeof customerSubscriptions.$inferInsert> = {};
  if (action === "pause") patch.status = "paused";
  if (action === "resume") { patch.status = "active"; patch.nextBillingAt = new Date(Date.now() + (CADENCE_DAYS[s.cadence] ?? 30) * 864e5); }
  if (action === "cancel") patch.status = "cancelled";
  if (action === "change_cadence") {
    if (!cadence || !(cadence in CADENCE_DAYS)) throw badRequest("Invalid cadence");
    patch.cadence = cadence;
  }
  const [row] = await deps.db.update(customerSubscriptions).set(patch).where(eq(customerSubscriptions.id, id)).returning();
  return row!;
}

/** Dunning: charge due subscriptions; 3 failed attempts over 3 days → past_due + card-update email. Test provider always succeeds. */
export async function processDueSubscriptions(deps: AppDeps, storeId: string, charge: (s: typeof customerSubscriptions.$inferSelect) => Promise<boolean> = async () => true) {
  const due = await deps.db.select().from(customerSubscriptions).where(and(eq(customerSubscriptions.storeId, storeId), lte(customerSubscriptions.nextBillingAt, new Date()), sql`${customerSubscriptions.status} in ('active','trialing')`));
  let charged = 0, failed = 0;
  for (const s of due) {
    const ok = await charge(s);
    if (ok) {
      charged++;
      const variant = await deps.db.query.productVariants.findFirst({ where: eq(productVariants.id, s.variantId) });
      await deps.db.update(customerSubscriptions).set({ status: "active", failedAttempts: 0, nextBillingAt: new Date(Date.now() + (CADENCE_DAYS[s.cadence] ?? 30) * 864e5) }).where(eq(customerSubscriptions.id, s.id));
      void variant;
    } else {
      failed++;
      const attempts = s.failedAttempts + 1;
      await deps.db.update(customerSubscriptions).set({ failedAttempts: attempts, status: attempts >= 3 ? "past_due" : s.status, nextBillingAt: new Date(Date.now() + 864e5) }).where(eq(customerSubscriptions.id, s.id));
      const { customers } = await import("@kiln/db");
      const c = await deps.db.query.customers.findFirst({ where: eq(customers.id, s.customerId) });
      if (c) void sendTemplated(deps, storeId, "payment_failed", c.email, { attempt: attempts, customer: c, portalUrl: "/account/subscriptions" });
    }
  }
  return { due: due.length, charged, failed };
}
