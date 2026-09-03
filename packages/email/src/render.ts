import Handlebars from "handlebars";
import { formatMoney, type Brand } from "@kiln/shared";

const hb = Handlebars.create();
hb.registerHelper("money", (cents: number, currency: string) => formatMoney(Number(cents ?? 0), typeof currency === "string" ? currency : "USD"));
hb.registerHelper("eq", (a: unknown, b: unknown) => a === b);

export interface RenderContext {
  brand: Brand;
  storeUrl: string;
  unsubscribeUrl?: string;
  [key: string]: unknown;
}

const cache = new Map<string, HandlebarsTemplateDelegate>();
function compile(src: string) {
  let t = cache.get(src);
  if (!t) {
    t = hb.compile(src, { noEscape: false });
    cache.set(src, t);
  }
  return t;
}

export function renderTemplate(subject: string, html: string, ctx: RenderContext) {
  const data = {
    unsubscribeUrl: `${ctx.storeUrl}/account/preferences`,
    ...ctx,
    order: enrichOrder(ctx.order as Record<string, unknown> | undefined),
  };
  return { subject: compile(subject)(data).trim(), html: compile(html)(data) };
}

function enrichOrder(order?: Record<string, unknown>) {
  if (!order) return order;
  const items = Array.isArray(order.items) ? (order.items as Record<string, unknown>[]) : [];
  return { ...order, items: items.map((i) => ({ ...i, lineTotal: Number(i.unitPriceCents ?? 0) * Number(i.quantity ?? 1) })) };
}

/** Very small HTML → text fallback for the plain-text part. */
export function htmlToText(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
