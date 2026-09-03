import { and, eq, desc, count, emailTemplates, emailSends, stores } from "@kiln/db";
import { renderTemplate, sendWithRetry, templateByKey, htmlToText, TEMPLATES } from "@kiln/email";
import type { AppDeps } from "../context.js";
import { storefrontUrl } from "./stores.js";
import { notFound } from "../lib/errors.js";

export async function sendTemplated(deps: AppDeps, storeId: string, key: string, to: string, ctx: Record<string, unknown>) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  if (!store) return null;
  const [override] = await deps.db.select().from(emailTemplates).where(and(eq(emailTemplates.storeId, storeId), eq(emailTemplates.key, key)));
  const base = templateByKey(key);
  const subjectSrc = override?.subject ?? base?.subject;
  const htmlSrc = override?.html ?? base?.html;
  if (!subjectSrc || !htmlSrc) return null;
  if (override && !override.enabled) return null;
  const storeUrl = storefrontUrl(deps, store);
  const rendered = renderTemplate(subjectSrc, htmlSrc, { brand: store.brand, storeUrl, ...ctx, orderUrl: typeof ctx.orderUrl === "string" && ctx.orderUrl.startsWith("/") ? storeUrl + ctx.orderUrl : ctx.orderUrl });
  const [log] = await deps.db.insert(emailSends).values({ storeId, templateKey: key, to, subject: rendered.subject }).returning();
  const from = `${store.brand.name} <${(store.settings.senderEmail as string | undefined) ?? deps.env.emailFrom.replace(/^.*<|>$/g, "")}>`;
  const result = await sendWithRetry(deps.email, { to, from, subject: rendered.subject, html: rendered.html, text: htmlToText(rendered.html), tags: { store: storeId, template: key } });
  await deps.db.update(emailSends).set({ status: result.ok ? "sent" : "failed", providerId: result.providerId ?? null, attempts: result.attempts, error: result.error ?? null }).where(eq(emailSends.id, log!.id));
  return result;
}

export async function listTemplates(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select().from(emailTemplates).where(eq(emailTemplates.storeId, storeId));
  return TEMPLATES.map((t) => {
    const o = rows.find((r) => r.key === t.key);
    return { key: t.key, name: t.name, trigger: t.trigger, subject: o?.subject ?? t.subject, html: o?.html ?? t.html, enabled: o?.enabled ?? true, delayMinutes: o?.delayMinutes ?? t.delayMinutes, customized: !!o && (o.subject !== t.subject || o.html !== t.html) };
  });
}

export async function updateTemplate(deps: AppDeps, storeId: string, key: string, patch: { subject?: string; html?: string; enabled?: boolean; delayMinutes?: number }) {
  const base = templateByKey(key);
  if (!base) throw notFound("Template");
  const [row] = await deps.db.insert(emailTemplates).values({ storeId, key, subject: patch.subject ?? base.subject, html: patch.html ?? base.html, enabled: patch.enabled ?? true, delayMinutes: patch.delayMinutes ?? base.delayMinutes }).onConflictDoUpdate({ target: [emailTemplates.storeId, emailTemplates.key], set: patch }).returning();
  return row!;
}

export async function previewTemplate(deps: AppDeps, storeId: string, key: string, override?: { subject?: string; html?: string }) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const [o] = await deps.db.select().from(emailTemplates).where(and(eq(emailTemplates.storeId, storeId), eq(emailTemplates.key, key)));
  const base = templateByKey(key)!;
  const sample = {
    customer: { firstName: "Franz", lastName: "Keller" },
    order: { number: 1042, currency: store?.defaultCurrency ?? "USD", items: [{ title: "The Sparring 16oz", variantTitle: "16oz / Oxblood", quantity: 1, unitPriceCents: 34000 }, { title: "Oxblood Wraps", variantTitle: "180in", quantity: 2, unitPriceCents: 2800 }], subtotalCents: 39600, discountCents: 3960, shippingCents: 0, taxCents: 0, totalCents: 35640, shippingAddress: { line1: "12 Calle Durango", city: "Mexico City", postalCode: "06700" } },
    fulfillment: { provider: "Shippo", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://track.kiln.store/1Z999AA10123456784" },
    refund: { amountCents: 2800 }, cart: { items: [{ title: "The Sparring 16oz", quantity: 1 }] }, firstItemTitle: "The Sparring 16oz", incentiveCode: "THANKS10", welcomeCode: "WELCOME10", attempt: 1, reason: "Requested by customer",
    orderUrl: "#", resetUrl: "#", cartUrl: "#", reviewUrl: "#", portalUrl: "#",
  };
  return renderTemplate(override?.subject ?? o?.subject ?? base.subject, override?.html ?? o?.html ?? base.html, { brand: store!.brand, storeUrl: storefrontUrl(deps, store!), ...sample });
}

export async function sendLog(deps: AppDeps, storeId: string, limit = 50) {
  const rows = await deps.db.select().from(emailSends).where(eq(emailSends.storeId, storeId)).orderBy(desc(emailSends.createdAt)).limit(limit);
  const [stats] = await deps.db.select({ total: count(), sent: count(emailSends.providerId) }).from(emailSends).where(eq(emailSends.storeId, storeId));
  return { items: rows, stats: { total: Number(stats?.total ?? 0), sent: Number(stats?.sent ?? 0) } };
}
