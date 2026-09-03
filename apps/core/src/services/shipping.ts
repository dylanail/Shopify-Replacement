import { and, eq, asc, regions, shippingOptions, stores } from "@kiln/db";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";

export const COUNTRY_CATALOG: { code: string; name: string; currency: string }[] = [
  { code: "US", name: "United States", currency: "USD" }, { code: "CA", name: "Canada", currency: "CAD" }, { code: "MX", name: "Mexico", currency: "MXN" }, { code: "GB", name: "United Kingdom", currency: "GBP" }, { code: "IE", name: "Ireland", currency: "EUR" },
  { code: "DE", name: "Germany", currency: "EUR" }, { code: "FR", name: "France", currency: "EUR" }, { code: "ES", name: "Spain", currency: "EUR" }, { code: "IT", name: "Italy", currency: "EUR" }, { code: "NL", name: "Netherlands", currency: "EUR" }, { code: "AT", name: "Austria", currency: "EUR" }, { code: "CH", name: "Switzerland", currency: "CHF" },
  { code: "SE", name: "Sweden", currency: "SEK" }, { code: "DK", name: "Denmark", currency: "DKK" }, { code: "NO", name: "Norway", currency: "NOK" }, { code: "PL", name: "Poland", currency: "PLN" }, { code: "TR", name: "Türkiye", currency: "TRY" },
  { code: "AU", name: "Australia", currency: "AUD" }, { code: "NZ", name: "New Zealand", currency: "NZD" }, { code: "JP", name: "Japan", currency: "JPY" }, { code: "SG", name: "Singapore", currency: "SGD" }, { code: "IN", name: "India", currency: "INR" }, { code: "VN", name: "Vietnam", currency: "VND" }, { code: "BR", name: "Brazil", currency: "BRL" }, { code: "NG", name: "Nigeria", currency: "NGN" }, { code: "ZA", name: "South Africa", currency: "ZAR" }, { code: "AE", name: "United Arab Emirates", currency: "AED" },
];

/** Static mid-market rates used for automatic currency conversion when no FX provider is configured. */
export const FX_USD: Record<string, number> = { USD: 1, CAD: 1.36, MXN: 17.2, GBP: 0.78, EUR: 0.92, CHF: 0.88, SEK: 10.6, DKK: 6.9, NOK: 10.8, PLN: 4.0, TRY: 33, AUD: 1.5, NZD: 1.64, JPY: 152, SGD: 1.35, INR: 83, VND: 25000, BRL: 5.1, NGN: 1500, ZAR: 18.5, AED: 3.67 };
export const convert = (cents: number, from: string, to: string) => (from === to ? cents : Math.round((cents / (FX_USD[from] ?? 1)) * (FX_USD[to] ?? 1)));

export const RegionInput = z.object({ name: z.string().min(1), currency: z.string().length(3), countries: z.array(z.string().length(2)).min(1), taxRateBps: z.number().int().min(0).max(5000).optional(), taxInclusive: z.boolean().optional(), paymentProviders: z.array(z.string()).optional(), freeShippingThresholdCents: z.number().int().nullable().optional() });

export async function listRegions(deps: AppDeps, storeId: string) {
  return deps.db.select().from(regions).where(eq(regions.storeId, storeId)).orderBy(asc(regions.createdAt));
}

/** Adding a second region locks the store's default currency and mirrors payment providers from the default region. */
export async function createRegion(deps: AppDeps, storeId: string, input: z.infer<typeof RegionInput>) {
  const existing = await listRegions(deps, storeId);
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const providers = input.paymentProviders ?? existing[0]?.paymentProviders ?? ["stripe"];
  const [row] = await deps.db.insert(regions).values({ storeId, name: input.name, currency: input.currency.toUpperCase(), countries: input.countries, taxRateBps: input.taxRateBps ?? 0, taxInclusive: input.taxInclusive ?? false, paymentProviders: providers, freeShippingThresholdCents: input.freeShippingThresholdCents ?? null }).returning();
  if (existing.length >= 1 && store) await deps.db.update(stores).set({ settings: { ...store.settings, currencyLocked: true, multiRegion: true } }).where(eq(stores.id, storeId));
  await deps.db.insert(shippingOptions).values({ storeId, regionId: row!.id, name: "Standard", type: "flat", amountCents: convert(800, "USD", row!.currency), estimate: "5–10 business days" });
  return row!;
}

export async function updateRegion(deps: AppDeps, storeId: string, id: string, input: Partial<z.infer<typeof RegionInput>>) {
  const [row] = await deps.db.update(regions).set({ ...input, ...(input.currency ? { currency: input.currency.toUpperCase() } : {}) }).where(and(eq(regions.id, id), eq(regions.storeId, storeId))).returning();
  if (!row) throw notFound("Region");
  return row;
}

export async function deleteRegion(deps: AppDeps, storeId: string, id: string) {
  const all = await listRegions(deps, storeId);
  if (all.length <= 1) throw badRequest("A store needs at least one region");
  await deps.db.delete(regions).where(and(eq(regions.id, id), eq(regions.storeId, storeId)));
  return { deleted: true };
}

export function regionForCountry<T extends { countries: string[] }>(all: T[], country?: string): T | undefined {
  return (country && all.find((r) => r.countries.includes(country.toUpperCase()))) || all[0];
}

export const ShippingOptionInput = z.object({ regionId: z.string().nullable().optional(), name: z.string().min(1), type: z.enum(["flat", "free_above", "weight", "price", "pickup", "local_delivery", "live"]).optional(), amountCents: z.number().int().nonnegative().optional(), thresholdCents: z.number().int().nullable().optional(), rules: z.array(z.object({ from: z.number(), to: z.number().nullable(), amountCents: z.number().int() })).optional(), provider: z.string().nullable().optional(), estimate: z.string().optional(), enabled: z.boolean().optional(), sort: z.number().int().optional() });

export async function listShippingOptions(deps: AppDeps, storeId: string, regionId?: string, onlyEnabled = false) {
  return deps.db.select().from(shippingOptions).where(and(eq(shippingOptions.storeId, storeId), regionId ? eq(shippingOptions.regionId, regionId) : undefined, onlyEnabled ? eq(shippingOptions.enabled, true) : undefined)).orderBy(asc(shippingOptions.sort));
}
export async function createShippingOption(deps: AppDeps, storeId: string, input: z.infer<typeof ShippingOptionInput>) {
  const [row] = await deps.db.insert(shippingOptions).values({ storeId, ...input, regionId: input.regionId ?? null }).returning();
  return row!;
}
export async function updateShippingOption(deps: AppDeps, storeId: string, id: string, input: Partial<z.infer<typeof ShippingOptionInput>>) {
  const [row] = await deps.db.update(shippingOptions).set(input as never).where(and(eq(shippingOptions.id, id), eq(shippingOptions.storeId, storeId))).returning();
  if (!row) throw notFound("Shipping option");
  return row;
}
export async function deleteShippingOption(deps: AppDeps, storeId: string, id: string) {
  await deps.db.delete(shippingOptions).where(and(eq(shippingOptions.id, id), eq(shippingOptions.storeId, storeId)));
  return { deleted: true };
}
