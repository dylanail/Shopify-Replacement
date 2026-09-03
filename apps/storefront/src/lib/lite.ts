import type { Product, ProductDetail, Recommendation, Variant, Shell, TemplateId } from "./types";
import type { ThemeConfig } from "@kiln/shared";
import type { StoreCtx } from "./store-path";
import { STRIPE_PK_OVERRIDE } from "./config";

/** A product trimmed for client-side slot components (no HTML description / SEO blobs). */
export interface ProductLite {
  id: string; handle: string; title: string; subtitle: string; imageUrl: string | null; imageAlt: string;
  options: Product["options"]; variants: Variant[]; tags: string[]; subscription?: Product["subscription"];
}

export function toLite(p: Product | ProductDetail): ProductLite {
  return { id: p.id, handle: p.handle, title: p.title, subtitle: p.subtitle ?? "", imageUrl: p.media[0]?.url ?? p.variants[0]?.imageUrl ?? null, imageAlt: p.media[0]?.alt ?? p.title, options: p.options, variants: p.variants, tags: p.tags, subscription: p.subscription ?? null };
}
export function recToLite(r: Recommendation): ProductLite | null {
  if (!r.variant) return null;
  return { id: r.id, handle: r.handle, title: r.title, subtitle: "", imageUrl: r.media[0]?.url ?? r.variant.imageUrl ?? null, imageAlt: r.media[0]?.alt ?? r.title, options: [], variants: [r.variant], tags: [], subscription: null };
}

/** First purchasable variant of a product (in stock or backorderable), else the first variant. */
export const defaultVariant = (p: Pick<ProductLite, "variants">): Variant | null => p.variants.find((v) => v.inventoryQty > 0 || v.allowBackorder) ?? p.variants[0] ?? null;
export const isAvailable = (v: Variant | null | undefined) => !!v && (v.inventoryQty > 0 || v.allowBackorder);
export const minPrice = (p: Pick<ProductLite, "variants">) => (p.variants.length ? Math.min(...p.variants.map((v) => v.priceCents)) : 0);

/** Everything client components need from the shell, serialisable and small. */
export interface StoreClient extends StoreCtx {
  id: string; name: string; slug: string; url: string;
  brand: Shell["brand"]; template: TemplateId;
  currency: string; region: Shell["region"]; regions: Shell["regions"];
  paymentMode: Shell["paymentMode"]; stripePublishable: string | null;
  plugins: Shell["plugins"]; merch: Shell["merch"]; slots: ThemeConfig["slots"];
  collections: Shell["collections"]; merchProducts: ProductLite[];
}

export const templateOf = (t: string | undefined): TemplateId => (t === "studio" || t === "bazaar" ? t : "atelier");

export function toStoreClient(shell: Shell, ctx: StoreCtx, merchProducts: ProductLite[]): StoreClient {
  return {
    ...ctx, id: shell.id, name: shell.name, slug: shell.slug, url: shell.url, brand: shell.brand, template: templateOf(shell.theme.template),
    currency: shell.region?.currency ?? shell.regions[0]?.currency ?? "USD", region: shell.region, regions: shell.regions,
    paymentMode: shell.paymentMode, stripePublishable: STRIPE_PK_OVERRIDE ?? shell.stripePublishable, plugins: shell.plugins, merch: shell.merch, slots: shell.theme.slots ?? {}, collections: shell.collections, merchProducts,
  };
}
