/**
 * The pricing engine: turns cart lines + promotions + shipping option + region into totals.
 * Pure over its inputs so it is unit-testable without a database.
 */
import type { CartItem } from "@kiln/shared";

export interface PromoLike {
  id: string;
  code: string | null;
  kind: string;
  type: string;
  value: number;
  minSubtotalCents: number;
  minQuantity: number;
  maxDiscountCents: number | null;
  appliesTo: { productIds?: string[]; collectionIds?: string[]; variantIds?: string[] };
  bogo: { buyQuantity: number; getQuantity: number; getPercentOff: number } | null;
  bundle: { tiers: { quantity: number; percentOff: number }[] } | null;
  regionIds: string[];
  usageLimit: number | null;
  usageCount: number;
  stackable: boolean;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface ShippingLike {
  id: string;
  name: string;
  type: string;
  amountCents: number;
  thresholdCents: number | null;
  rules: { from: number; to: number | null; amountCents: number }[];
  enabled: boolean;
}

export interface PricingInput {
  items: CartItem[];
  promotions: PromoLike[];
  appliedCodes: string[];
  shippingOption?: ShippingLike | null;
  region?: { id: string; taxRateBps: number; taxInclusive: boolean; freeShippingThresholdCents: number | null } | null;
  /** product id → collection ids, for collection-scoped promotions */
  productCollections?: Record<string, string[]>;
  totalWeightGrams?: number;
  giftCardCents?: number;
  now?: Date;
}

export interface AppliedPromotion {
  id: string;
  code: string | null;
  type: string;
  discountCents: number;
  label: string;
}

export interface PricingResult {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  giftCardCents: number;
  totalCents: number;
  itemCount: number;
  applied: AppliedPromotion[];
  rejectedCodes: { code: string; reason: string }[];
  freeShippingThresholdCents: number | null;
  freeShippingGapCents: number | null;
}

const lineTotal = (i: CartItem) => i.unitPriceCents * i.quantity;

function isEligible(item: CartItem, p: PromoLike, productCollections: Record<string, string[]>) {
  const a = p.appliesTo ?? {};
  const scoped = (a.productIds?.length ?? 0) + (a.variantIds?.length ?? 0) + (a.collectionIds?.length ?? 0) > 0;
  if (!scoped) return true;
  if (a.productIds?.includes(item.productId)) return true;
  if (a.variantIds?.includes(item.variantId)) return true;
  if (a.collectionIds?.some((c) => productCollections[item.productId]?.includes(c))) return true;
  return false;
}

function promoAvailable(p: PromoLike, now: Date, regionId?: string): string | null {
  if (p.status !== "active" && p.status !== "scheduled") return "This code is no longer active";
  if (p.startsAt && p.startsAt > now) return "This code isn't active yet";
  if (p.endsAt && p.endsAt < now) return "This code has expired";
  if (p.usageLimit != null && p.usageCount >= p.usageLimit) return "This code has reached its usage limit";
  if (p.regionIds.length && regionId && !p.regionIds.includes(regionId)) return "This code isn't valid in your region";
  return null;
}

function computeDiscount(p: PromoLike, items: CartItem[], subtotal: number, productCollections: Record<string, string[]>): { cents: number; reason?: string } {
  const eligible = items.filter((i) => isEligible(i, p, productCollections));
  const eligibleSubtotal = eligible.reduce((s, i) => s + lineTotal(i), 0);
  const eligibleQty = eligible.reduce((s, i) => s + i.quantity, 0);
  if (subtotal < p.minSubtotalCents) return { cents: 0, reason: `Requires a subtotal of at least ${(p.minSubtotalCents / 100).toFixed(2)}` };
  if (eligibleQty < p.minQuantity) return { cents: 0, reason: `Requires at least ${p.minQuantity} eligible items` };
  if (eligible.length === 0 && p.type !== "free_shipping") return { cents: 0, reason: "No eligible items in cart" };
  let cents = 0;
  switch (p.type) {
    case "percentage":
      cents = Math.round((eligibleSubtotal * p.value) / 100);
      break;
    case "fixed":
      cents = Math.min(p.value, eligibleSubtotal);
      break;
    case "free_shipping":
      cents = 0;
      break;
    case "bogo": {
      const b = p.bogo ?? { buyQuantity: 1, getQuantity: 1, getPercentOff: 100 };
      const units = eligible.flatMap((i) => Array.from({ length: i.quantity }, () => i.unitPriceCents)).sort((x, y) => y - x);
      const group = b.buyQuantity + b.getQuantity;
      for (let g = 0; g + group <= units.length; g += group) {
        const free = units.slice(g + b.buyQuantity, g + group);
        cents += Math.round((free.reduce((s, u) => s + u, 0) * b.getPercentOff) / 100);
      }
      break;
    }
    case "bundle": {
      const tiers = [...(p.bundle?.tiers ?? [])].sort((a, b) => b.quantity - a.quantity);
      const tier = tiers.find((t) => eligibleQty >= t.quantity);
      cents = tier ? Math.round((eligibleSubtotal * tier.percentOff) / 100) : 0;
      if (!tier) return { cents: 0, reason: "Add more items to unlock bundle pricing" };
      break;
    }
  }
  if (p.maxDiscountCents != null) cents = Math.min(cents, p.maxDiscountCents);
  return { cents };
}

export function shippingCost(opt: ShippingLike | null | undefined, subtotalAfterDiscount: number, weightGrams = 0): number {
  if (!opt) return 0;
  switch (opt.type) {
    case "flat":
    case "live":
      return opt.amountCents;
    case "free_above":
      return opt.thresholdCents != null && subtotalAfterDiscount >= opt.thresholdCents ? 0 : opt.amountCents;
    case "pickup":
    case "local_delivery":
      return opt.amountCents;
    case "weight": {
      const r = opt.rules.find((r) => weightGrams >= r.from && (r.to == null || weightGrams < r.to));
      return r?.amountCents ?? opt.amountCents;
    }
    case "price": {
      const r = opt.rules.find((r) => subtotalAfterDiscount >= r.from && (r.to == null || subtotalAfterDiscount < r.to));
      return r?.amountCents ?? opt.amountCents;
    }
    default:
      return opt.amountCents;
  }
}

export function priceCart(input: PricingInput): PricingResult {
  const now = input.now ?? new Date();
  const productCollections = input.productCollections ?? {};
  const subtotalCents = input.items.reduce((s, i) => s + lineTotal(i), 0);
  const itemCount = input.items.reduce((s, i) => s + i.quantity, 0);
  const rejectedCodes: { code: string; reason: string }[] = [];
  const candidates: { p: PromoLike; cents: number }[] = [];
  let freeShipping = false;

  const consider = (p: PromoLike, fromCode: boolean) => {
    const unavailable = promoAvailable(p, now, input.region?.id);
    if (unavailable) {
      if (fromCode) rejectedCodes.push({ code: p.code!, reason: unavailable });
      return;
    }
    const d = computeDiscount(p, input.items, subtotalCents, productCollections);
    if (d.reason) {
      if (fromCode) rejectedCodes.push({ code: p.code!, reason: d.reason });
      return;
    }
    if (p.type === "free_shipping") {
      freeShipping = true;
      candidates.push({ p, cents: 0 });
      return;
    }
    if (d.cents > 0) candidates.push({ p, cents: d.cents });
  };

  for (const code of input.appliedCodes) {
    const p = input.promotions.find((x) => x.kind === "code" && x.code?.toUpperCase() === code.toUpperCase());
    if (!p) rejectedCodes.push({ code, reason: "Unknown code" });
    else consider(p, true);
  }
  for (const p of input.promotions.filter((x) => x.kind === "automatic")) consider(p, false);

  // Stacking: all stackable promos + the single best non-stackable one.
  const stackable = candidates.filter((c) => c.p.stackable || c.p.type === "free_shipping");
  const exclusive = candidates.filter((c) => !c.p.stackable && c.p.type !== "free_shipping").sort((a, b) => b.cents - a.cents)[0];
  const chosen = exclusive ? [...stackable, exclusive] : stackable;
  const applied: AppliedPromotion[] = [];
  let discountCents = 0;
  for (const c of chosen) {
    const cents = Math.min(c.cents, subtotalCents - discountCents);
    discountCents += cents;
    applied.push({ id: c.p.id, code: c.p.code, type: c.p.type, discountCents: cents, label: c.p.type === "free_shipping" ? "Free shipping" : c.p.code ?? "Automatic discount" });
  }
  const afterDiscount = subtotalCents - discountCents;
  const regionThreshold = input.region?.freeShippingThresholdCents ?? null;
  if (regionThreshold != null && afterDiscount >= regionThreshold && itemCount > 0) freeShipping = true;
  const shippingCents = freeShipping || input.shippingOption?.type === "pickup" ? (input.shippingOption?.type === "pickup" ? input.shippingOption.amountCents : 0) : shippingCost(input.shippingOption, afterDiscount, input.totalWeightGrams);
  const rate = input.region?.taxRateBps ?? 0;
  const taxCents = input.region?.taxInclusive ? Math.round(afterDiscount - afterDiscount / (1 + rate / 10000)) : Math.round((afterDiscount * rate) / 10000);
  const preGift = afterDiscount + shippingCents + (input.region?.taxInclusive ? 0 : taxCents);
  const giftCardCents = Math.min(input.giftCardCents ?? 0, preGift);
  const threshold = regionThreshold ?? input.shippingOption?.thresholdCents ?? null;
  return {
    subtotalCents, discountCents, shippingCents, taxCents, giftCardCents, totalCents: Math.max(0, preGift - giftCardCents), itemCount, applied, rejectedCodes,
    freeShippingThresholdCents: threshold, freeShippingGapCents: threshold != null ? Math.max(0, threshold - afterDiscount) : null,
  };
}
