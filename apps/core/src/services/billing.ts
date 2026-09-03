import { eq, organizations, aiCredits, stores, sql } from "@kiln/db";
import { PLANS, planBySlug } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";

export function listPlans() {
  return PLANS.map((p) => ({ ...p, cardRateLabel: `${(p.cardRateBps / 100).toFixed(1)}% + 30¢`, creditsLabel: p.baseCreditsPerMonth == null ? "Unlimited AI" : `${p.baseCreditsPerMonth} credits/mo` }));
}

export async function getBilling(deps: AppDeps, orgId: string) {
  const org = await deps.db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) throw notFound("Organization");
  const plan = planBySlug(org.planSlug);
  const storeRows = await deps.db.select({ id: stores.id }).from(stores).where(eq(stores.orgId, orgId));
  return { org: { id: org.id, name: org.name, planSlug: org.planSlug, billingInterval: org.billingInterval, subscriptionStatus: org.subscriptionStatus, currentPeriodEnd: org.currentPeriodEnd, stripeCustomerId: org.stripeCustomerId }, plan, usage: { stores: storeRows.length, maxStores: plan.maxStores } };
}

/** With Stripe configured this returns a Checkout Session URL; otherwise it switches the plan directly. */
export async function changePlan(deps: AppDeps, orgId: string, planSlug: string, interval: "monthly" | "yearly", successUrl?: string) {
  const plan = PLANS.find((p) => p.slug === planSlug);
  if (!plan) throw badRequest("Unknown plan");
  if (plan.slug === "enterprise") throw badRequest("Enterprise is quoted — book a call");
  const org = await deps.db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) throw notFound("Organization");
  const storeRows = await deps.db.select({ id: stores.id }).from(stores).where(eq(stores.orgId, orgId));
  if (storeRows.length > plan.maxStores) throw badRequest(`${plan.name} allows ${plan.maxStores} store(s); you have ${storeRows.length}`);
  const price = interval === "yearly" ? plan.yearlyPriceCents : plan.monthlyPriceCents;
  if (deps.stripe && price > 0) {
    const session = await deps.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: org.stripeCustomerId ?? undefined,
      line_items: [{ price_data: { currency: "usd", recurring: { interval: interval === "yearly" ? "year" : "month" }, unit_amount: price, product_data: { name: `Kiln ${plan.name}` } }, quantity: 1 }],
      success_url: successUrl ?? `${deps.env.adminUrl}/settings/billing?success=1`,
      cancel_url: `${deps.env.adminUrl}/settings/billing`,
      metadata: { orgId, planSlug, interval },
    });
    return { checkoutUrl: session.url, pending: true };
  }
  await deps.db.update(organizations).set({ planSlug: plan.slug, billingInterval: interval, subscriptionStatus: "active", currentPeriodEnd: new Date(Date.now() + (interval === "yearly" ? 365 : 30) * 864e5) }).where(eq(organizations.id, orgId));
  for (const s of storeRows) await deps.db.update(aiCredits).set({ balance: plan.baseCreditsPerMonth ?? 1_000_000 }).where(eq(aiCredits.storeId, s.id));
  return { checkoutUrl: null, pending: false, planSlug: plan.slug };
}

export async function applyStripeSubscription(deps: AppDeps, meta: { orgId: string; planSlug: string; interval: string }, stripe: { customerId?: string; subscriptionId?: string; periodEnd?: number }) {
  await deps.db.update(organizations).set({ planSlug: meta.planSlug, billingInterval: meta.interval, subscriptionStatus: "active", stripeCustomerId: stripe.customerId ?? null, stripeSubscriptionId: stripe.subscriptionId ?? null, currentPeriodEnd: stripe.periodEnd ? new Date(stripe.periodEnd * 1000) : null }).where(eq(organizations.id, meta.orgId));
}

export async function credits(deps: AppDeps, storeId: string) {
  const [row] = await deps.db.select().from(aiCredits).where(eq(aiCredits.storeId, storeId));
  return row ?? { storeId, balance: 0, usedThisPeriod: 0, periodStart: new Date() };
}

/** Deduct credits; unlimited plans have a very large balance and never fail. */
export async function spendCredits(deps: AppDeps, storeId: string, n: number) {
  const [row] = await deps.db.update(aiCredits).set({ balance: sql`greatest(0, ${aiCredits.balance} - ${n})`, usedThisPeriod: sql`${aiCredits.usedThisPeriod} + ${n}` }).where(eq(aiCredits.storeId, storeId)).returning();
  return row;
}
export async function topUp(deps: AppDeps, storeId: string, n: number) {
  const [row] = await deps.db.update(aiCredits).set({ balance: sql`${aiCredits.balance} + ${n}` }).where(eq(aiCredits.storeId, storeId)).returning();
  return row;
}

/** Stripe Connect: OAuth link + account status sync. Without Stripe, a simulated "connected" account. */
export async function connectLink(deps: AppDeps, storeId: string) {
  if (deps.stripe && deps.env.stripeConnectClientId) {
    const state = Buffer.from(JSON.stringify({ storeId })).toString("base64url");
    return { url: `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${deps.env.stripeConnectClientId}&scope=read_write&state=${state}&redirect_uri=${encodeURIComponent(`${deps.env.publicCoreUrl}/api/v1/webhooks/stripe/connect`)}`, simulated: false };
  }
  return { url: `${deps.env.publicCoreUrl}/api/v1/stores/${storeId}/payments/stripe/simulate`, simulated: true };
}

export async function completeConnect(deps: AppDeps, storeId: string, accountId: string, charges = true, payouts = true) {
  const [row] = await deps.db.update(stores).set({ stripeAccountId: accountId, stripeChargesEnabled: charges, stripePayoutsEnabled: payouts }).where(eq(stores.id, storeId)).returning();
  const { setTodo } = await import("./todos.js");
  await setTodo(deps, storeId, "payments", "done");
  return row!;
}

export async function paymentStatus(deps: AppDeps, storeId: string) {
  const s = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  if (!s) throw notFound("Store");
  let live = null as null | { chargesEnabled: boolean; payoutsEnabled: boolean; requirements: string[] };
  if (deps.stripe && s.stripeAccountId) {
    try {
      const acct = await deps.stripe.accounts.retrieve(s.stripeAccountId);
      live = { chargesEnabled: !!acct.charges_enabled, payoutsEnabled: !!acct.payouts_enabled, requirements: acct.requirements?.currently_due ?? [] };
      await deps.db.update(stores).set({ stripeChargesEnabled: live.chargesEnabled, stripePayoutsEnabled: live.payoutsEnabled }).where(eq(stores.id, storeId));
    } catch { /* keep cached */ }
  }
  const mode = deps.stripe ? "stripe" : "test";
  return { provider: mode, accountId: s.stripeAccountId, chargesEnabled: live?.chargesEnabled ?? s.stripeChargesEnabled, payoutsEnabled: live?.payoutsEnabled ?? s.stripePayoutsEnabled, requirements: live?.requirements ?? [], captureMode: (s.settings.captureMode as string | undefined) ?? "automatic", methods: ["card", "apple_pay", "google_pay", "link", "paypal"], payoutTimeline: [{ day: 0, label: "Customer charged" }, { day: 1, label: "In transit" }, { day: 2, label: "Settled to your bank" }] };
}
