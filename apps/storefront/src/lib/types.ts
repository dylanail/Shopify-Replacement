import type { Brand, ThemeConfig, CartItem, Address, MediaItem, ProductOption, Seo, SubscriptionConfig } from "@kiln/shared";

export type { Brand, ThemeConfig, CartItem, Address, MediaItem, ProductOption, Seo, SubscriptionConfig };

export interface ShellCollection { id: string; handle: string; title: string; productCount: number }
export interface PluginComponentDecl { id: string; placement: "fixed" | "merchant_choice" | "payment_registry"; slot?: string; validSlots?: string[]; defaultSlot?: string; propsFromConfig: string[]; propsFromContext: string[] }
export interface PluginScriptDecl { src?: string; inline?: string; position: "head" | "bodyEnd" }
export interface ShellPlugin { id: string; name: string; settings: Record<string, unknown>; components: PluginComponentDecl[]; scripts: PluginScriptDecl[]; capabilities: { id: string; type: string }[] }
export interface MerchConfig { id: string; kind: "upsell" | "bundle" | "cross_sell"; component: string; placement: string; title: string; productIds: string[]; rules: Record<string, unknown> & { tiers?: { quantity: number; percentOff: number }[] }; promotionId: string | null; enabled: boolean }
export interface ShellRegion { id: string; name?: string; currency: string; countries: string[] }
export interface Shell {
  id: string; name: string; slug: string; status: string;
  brand: Brand;
  theme: ThemeConfig;
  version: number;
  environment: "draft" | "live";
  url: string;
  collections: ShellCollection[];
  plugins: ShellPlugin[];
  merch: MerchConfig[];
  region: ShellRegion | null;
  regions: ShellRegion[];
  redirects: { from: string; to: string; code: number }[];
  stripePublishable: string | null;
  paymentMode: "stripe" | "test";
}

export interface Variant { id: string; productId: string; title: string; sku: string | null; options: Record<string, string>; priceCents: number; compareAtCents: number | null; inventoryQty: number; allowBackorder: boolean; imageUrl: string | null; metadata?: Record<string, unknown> }
export interface BuildOption { id: string; title: string; description?: string; priceDeltaCents?: number }
export interface Product {
  id: string; handle: string; title: string; subtitle: string; description: string; status: string;
  options: ProductOption[]; media: MediaItem[]; tags: string[]; vendor?: string | null; productType?: string | null;
  seo: Seo; metadata: Record<string, unknown> & { buildOptions?: BuildOption[]; microcopy?: string; trust?: string[] };
  subscription?: SubscriptionConfig | null; variants: Variant[]; collectionIds?: string[];
}
export interface ReviewStats { total: number; average: number; distribution: { rating: number; count: number }[]; summary: string[] }
export interface Recommendation { id: string; handle: string; title: string; media: MediaItem[]; variant: Variant | null; reason: string }
export interface ExperimentAssignment { variant: string; surface: string; payload: Record<string, unknown> }
export interface ProductDetail extends Product { reviews: ReviewStats; recommendations: Recommendation[]; experiments: Record<string, ExperimentAssignment>; sessionId?: string | null }
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number }
export interface CollectionInfo { id?: string; handle: string; title: string; description: string; imageUrl: string | null }
export interface CollectionResponse { collection: CollectionInfo; products: Paginated<Product>; sessionId?: string | null }

export interface AppliedPromotion { id: string; code: string | null; type: string; discountCents: number; label: string }
export interface Pricing { subtotalCents: number; discountCents: number; shippingCents: number; taxCents: number; giftCardCents: number; totalCents: number; itemCount: number; applied: AppliedPromotion[]; rejectedCodes: { code: string; reason: string }[]; freeShippingThresholdCents: number | null; freeShippingGapCents: number | null }
export interface ShippingOption { id: string; name: string; type: string; amountCents: number; thresholdCents: number | null; estimate: string; quotedCents: number; enabled?: boolean }
export interface Cart {
  id: string; storeId: string; regionId: string | null; sessionId: string | null; email: string | null; items: CartItem[];
  discountCodes: string[]; giftCardCodes: string[]; shippingAddress: Address | null; billingAddress: Address | null; shippingOptionId: string | null; status: string;
  experimentVariants: Record<string, string>;
  pricing: Pricing; currency: string; shippingOptions: ShippingOption[];
}

export interface OrderItem extends CartItem { fulfilledQuantity: number; returnedQuantity: number }
export interface Order {
  id: string; number: number; email: string; status: string; financialStatus: string; fulfillmentStatus: string; currency: string;
  items: OrderItem[]; subtotalCents: number; discountCents: number; shippingCents: number; taxCents: number; totalCents: number; refundedCents: number;
  shippingAddress: Address | null; billingAddress: Address | null; shippingMethod: string | null; paymentProvider: string; paymentRef: string | null; discountCodes: string[]; notes: string;
  metadata: Record<string, unknown>; createdAt: string;
  fulfillments?: { id: string; status: string; provider: string; trackingNumber: string | null; trackingUrl: string | null; shippedAt: string | null }[];
}
export interface OrderDetail extends Order { postPurchaseOffers: Recommendation[] }

export interface Review { id: string; authorName: string; rating: number; title: string; body: string; media: MediaItem[]; verified: boolean; reply: string | null; createdAt: string; status?: string; flags?: string[] }
export interface Question { id: string; question: string; answer: string | null; askedBy: string | null; answeredBy: string | null; status: string; createdAt: string }
export interface ReviewsResponse extends Paginated<Review> { stats: ReviewStats; questions: Question[] }

export interface Article { id: string; handle: string; title: string; body: string; excerpt: string; featuredImage: string | null; tags: string[]; seo: Seo; status: string; publishedAt: string | null }

export interface Customer { id: string; email: string; firstName: string; lastName?: string; addresses?: Address[]; acceptsMarketing?: boolean }
export interface Subscription { id: string; variantId: string; quantity: number; cadence: string; status: string; priceCents: number; currency: string; nextBillingAt: string | null; trialEndsAt: string | null }
export interface AccountResponse { customer: Customer; orders: Order[]; subscriptions: Subscription[] }

export type TemplateId = "atelier" | "studio" | "bazaar";
