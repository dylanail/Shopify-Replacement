import { and, eq, desc, campaigns, customers, products, stores } from "@kiln/db";
import { z } from "zod";
import { renderTemplate, sendWithRetry, htmlToText } from "@kiln/email";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import { storefrontUrl } from "./stores.js";

export const CampaignInput = z.object({ name: z.string().min(1), brief: z.string().optional(), subject: z.string().optional(), html: z.string().optional(), segment: z.string().optional(), scheduledAt: z.coerce.date().nullable().optional() });

/** The "AI editor": drafts an issue from a brief using the store's live products; three subject candidates. */
export async function draftCampaign(deps: AppDeps, storeId: string, brief: string) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const prods = await deps.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.status, "published"))).orderBy(desc(products.createdAt)).limit(3);
  const brand = store!.brand;
  const subjects = [`${brand.name}: ${brief}`.slice(0, 70), `${brief.charAt(0).toUpperCase()}${brief.slice(1)} — from the workshop`.slice(0, 70), `A note on ${brief.toLowerCase()}`.slice(0, 70)];
  const cards = prods.map((p) => `<td width="33%" style="padding:8px;vertical-align:top"><a href="{{storeUrl}}/products/${p.handle}" style="text-decoration:none;color:${brand.textColor}">${p.media[0] ? `<img src="${p.media[0].url}" alt="${p.media[0].alt}" width="100%" style="display:block;border:1px solid #eee">` : ""}<p style="margin:8px 0 0;font-weight:600">${p.title}</p><p style="margin:2px 0 0;color:#7a6f66;font-size:13px">${p.subtitle || ""}</p></a></td>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:${brand.backgroundColor};font-family:${brand.bodyFont},Helvetica,Arial,sans-serif;color:${brand.textColor}"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:600px;background:#fff;border:1px solid #e9e2d9"><tr><td style="padding:28px 32px;font-family:${brand.displayFont},Georgia,serif;font-size:22px">${brand.name}</td></tr><tr><td style="padding:0 32px 8px"><h1 style="font-family:${brand.displayFont},Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;margin:0 0 12px">${brief}</h1><p style="font-size:15px;line-height:1.6">${brand.description || "A few things we've been working on."} Here's what's new, in the ${brand.tone} voice you know us for.</p></td></tr><tr><td style="padding:8px 24px"><table role="presentation" width="100%"><tr>${cards}</tr></table></td></tr><tr><td style="padding:16px 32px 32px"><a href="{{storeUrl}}" style="display:inline-block;background:${brand.primaryColor};color:#fff;text-decoration:none;padding:12px 20px;font-weight:600">Shop now</a></td></tr><tr><td style="padding:16px 32px;background:#faf6f2;font-size:12px;color:#7a6f66">${brand.name} · <a href="{{unsubscribeUrl}}" style="color:#7a6f66">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`;
  const [row] = await deps.db.insert(campaigns).values({ storeId, name: brief.slice(0, 60), brief, subject: subjects[0]!, subjectVariants: subjects, html, status: "draft" }).returning();
  return row!;
}

export async function listCampaigns(deps: AppDeps, storeId: string) {
  return deps.db.select().from(campaigns).where(eq(campaigns.storeId, storeId)).orderBy(desc(campaigns.createdAt));
}
export async function updateCampaign(deps: AppDeps, storeId: string, id: string, patch: Partial<z.infer<typeof CampaignInput>>) {
  const [row] = await deps.db.update(campaigns).set({ ...patch, ...(patch.scheduledAt ? { status: "scheduled" } : {}) }).where(and(eq(campaigns.id, id), eq(campaigns.storeId, storeId))).returning();
  if (!row) throw notFound("Campaign");
  return row;
}

/** Send to the segment (all marketing opt-ins by default). Per-recipient send-time optimisation = a delay bucket by local hour. */
export async function sendCampaign(deps: AppDeps, storeId: string, id: string) {
  const c = await deps.db.query.campaigns.findFirst({ where: and(eq(campaigns.id, id), eq(campaigns.storeId, storeId)) });
  if (!c) throw notFound("Campaign");
  if (c.status === "sent") throw badRequest("Already sent");
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const recipients = await deps.db.select().from(customers).where(and(eq(customers.storeId, storeId), eq(customers.acceptsMarketing, true)));
  await deps.db.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, id));
  let sent = 0;
  const storeUrl = storefrontUrl(deps, store!);
  for (const [i, r] of recipients.entries()) {
    const subject = c.subjectVariants.length > 1 ? c.subjectVariants[i % c.subjectVariants.length]! : c.subject;
    const rendered = renderTemplate(subject, c.html, { brand: store!.brand, storeUrl, customer: r });
    const res = await sendWithRetry(deps.email, { to: r.email, from: `${store!.brand.name} <${deps.env.emailFrom.replace(/^.*<|>$/g, "")}>`, subject: rendered.subject, html: rendered.html, text: htmlToText(rendered.html), tags: { campaign: id } });
    if (res.ok) sent++;
  }
  const [row] = await deps.db.update(campaigns).set({ status: "sent", sentAt: new Date(), stats: { ...c.stats, sent } }).where(eq(campaigns.id, id)).returning();
  return row!;
}
export async function deleteCampaign(deps: AppDeps, storeId: string, id: string) {
  await deps.db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.storeId, storeId)));
  return { deleted: true };
}
