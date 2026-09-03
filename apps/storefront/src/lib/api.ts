/**
 * Server-side data access to the Kiln public API. Never called at build time: every page is force-dynamic.
 */
import { cache } from "react";
import { headers } from "next/headers";
import { SERVER_CORE_URL, publicApiBase, STRIPE_PK_OVERRIDE } from "./config";
import type { Shell, Product, ProductDetail, Paginated, CollectionResponse, Article, ReviewsResponse, OrderDetail, ShippingOption } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

const FORWARDED = ["x-forwarded-for", "x-real-ip", "user-agent", "referer", "cf-ipcountry", "x-vercel-ip-country", "x-vercel-ip-city", "accept-language"];

/** Forward visitor headers so the core attributes sessions (IP/UA fingerprint, geo) to the real visitor and not to the Next server. */
async function visitorHeaders(): Promise<Record<string, string>> {
  try {
    const h = await headers();
    const out: Record<string, string> = {};
    for (const k of FORWARDED) { const v = h.get(k); if (v) out[k] = v; }
    return out;
  } catch { return {}; }
}

export interface FetchOpts { env?: "draft" | "live"; revalidate?: number; query?: Record<string, string | number | undefined | null>; init?: RequestInit }

export async function coreFetch<T>(storeKey: string, path: string, opts: FetchOpts = {}): Promise<T> {
  const url = new URL(`${publicApiBase(SERVER_CORE_URL, storeKey)}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  if (opts.env === "draft") url.searchParams.set("env", "draft");
  const fwd = await visitorHeaders();
  const res = await fetch(url, { ...(opts.init ?? {}), headers: { Accept: "application/json", ...fwd, ...(opts.init?.headers as Record<string, string> | undefined) }, ...(opts.revalidate != null && opts.env !== "draft" ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" as const }) });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* text body */ }
  if (!res.ok) {
    const b = body as { error?: string; details?: unknown } | string;
    throw new ApiError(res.status, typeof b === "object" && b && "error" in b ? String(b.error) : `Request failed (${res.status})`, typeof b === "object" && b ? b.details : undefined);
  }
  return body as T;
}

export async function coreText(storeKey: string, path: string): Promise<{ status: number; body: string; contentType: string }> {
  const res = await fetch(`${publicApiBase(SERVER_CORE_URL, storeKey)}${path}`, { cache: "no-store" });
  return { status: res.status, body: await res.text(), contentType: res.headers.get("content-type") ?? "text/plain" };
}

/** Shell load, memoised per request. Returns a discriminated result so layouts can render an "unavailable" page. */
export const loadShell = cache(async (storeKey: string, env: "draft" | "live"): Promise<{ ok: true; shell: Shell } | { ok: false; status: number; message: string }> => {
  try {
    const shell = await coreFetch<Shell>(storeKey, "", { env, revalidate: env === "draft" ? undefined : 30 });
    if (STRIPE_PK_OVERRIDE) shell.stripePublishable = STRIPE_PK_OVERRIDE;
    return { ok: true, shell };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, message: err.message };
    return { ok: false, status: 0, message: err instanceof Error ? err.message : "Store unavailable" };
  }
});

export const getProducts = (key: string, env: "draft" | "live", q: { page?: number; pageSize?: number; q?: string; collection?: string; sort?: string } = {}) =>
  coreFetch<Paginated<Product>>(key, "/products", { env, query: q });
export const getProduct = (key: string, env: "draft" | "live", handle: string, cartProductIds: string[] = []) =>
  coreFetch<ProductDetail>(key, `/products/${encodeURIComponent(handle)}`, { env, query: { cart: cartProductIds.join(",") || undefined } });
export const getCollection = (key: string, env: "draft" | "live", handle: string, q: { page?: number; sort?: string } = {}) =>
  coreFetch<CollectionResponse>(key, `/collections/${encodeURIComponent(handle)}`, { env, query: q });
export const searchProducts = (key: string, env: "draft" | "live", q: string) => coreFetch<Paginated<Product>>(key, "/search", { env, query: { q } });
export const getReviews = (key: string, env: "draft" | "live", handle: string, q: { page?: number; rating?: string; withPhoto?: string; verified?: string } = {}) =>
  coreFetch<ReviewsResponse>(key, `/products/${encodeURIComponent(handle)}/reviews`, { env, query: q });
export const getArticles = (key: string, env: "draft" | "live") => coreFetch<{ items: Article[] }>(key, "/blog", { env });
export const getArticle = (key: string, env: "draft" | "live", handle: string) => coreFetch<Article>(key, `/blog/${encodeURIComponent(handle)}`, { env });
export const getOrder = (key: string, env: "draft" | "live", id: string, email: string) => coreFetch<OrderDetail>(key, `/orders/${encodeURIComponent(id)}`, { env, query: { email } });
export const getShippingOptions = (key: string, env: "draft" | "live", regionId?: string | null) => coreFetch<{ items: ShippingOption[] }>(key, "/shipping-options", { env, query: { regionId: regionId ?? undefined } });

/**
 * There is no public "products by ids" endpoint, so merch configs (which store product ids) are resolved by paging
 * the catalog. Catalogs are small for the stores Kiln generates; we cap at 4 pages (192 products).
 */
export const productsByIds = cache(async (key: string, env: "draft" | "live", ids: string[]): Promise<Product[]> => {
  const wanted = new Set(ids);
  if (!wanted.size) return [];
  const found: Product[] = [];
  for (let page = 1; page <= 4 && found.length < wanted.size; page++) {
    const res = await getProducts(key, env, { page, pageSize: 48 }).catch(() => null);
    if (!res) break;
    for (const p of res.items) if (wanted.has(p.id)) found.push(p);
    if (res.items.length < 48) break;
  }
  return ids.map((id) => found.find((p) => p.id === id)).filter((p): p is Product => !!p);
});
