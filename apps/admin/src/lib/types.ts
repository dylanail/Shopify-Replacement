import type { Address, Brand, MediaItem, OrderItem, ProductOption, Seo, SubscriptionConfig, ThemeConfig } from "@kiln/shared";

export interface User { id: string; email: string; name: string; totpEnabled?: boolean }
export interface Org { id: string; name: string; planSlug: string; billingInterval?: string }
export interface StoreSummary { id: string; name: string; slug: string; status: string; orgId: string; brand: Brand; onboardingStep: string }
export interface Me { user: User; orgs: Org[]; stores: StoreSummary[] }

export interface PublishState { label: string; action: "publish" | "products" | "designer" | "wait" | "none" | string; dirty: boolean; reason: string }
export interface Credits { storeId: string; balance: number; usedThisPeriod: number; periodStart: string }
export interface Store extends StoreSummary {
  defaultCurrency: string;
  defaultRegionId: string | null;
  settings: Record<string, unknown>;
  prompt: string;
  aiModel: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  url: string;
  role: string;
  publish: PublishState;
  credits: Credits;
  createdAt: string;
}

export interface Variant { id: string; productId: string; title: string; sku: string | null; options: Record<string, string>; priceCents: number; compareAtCents: number | null; inventoryQty: number; allowBackorder: boolean; imageUrl: string | null; weightGrams?: number | null; reorderPoint?: number; sort: number }
export interface Product {
  id: string; handle: string; title: string; subtitle: string; description: string; status: "draft" | "published" | "archived"; options: ProductOption[]; media: MediaItem[]; tags: string[]; vendor: string | null; productType: string | null; seo: Seo; metadata: Record<string, unknown>; subscription: SubscriptionConfig | null; digital: { enabled: boolean; files: { name: string; url: string }[] } | null; weightGrams: number; variants: Variant[]; collectionIds?: string[]; createdAt: string; updatedAt: string;
}
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number }
export interface Collection { id: string; handle: string; title: string; description: string; imageUrl: string | null; kind: "manual" | "smart"; rules: { field: string; op: string; value: string }[]; productCount?: number; productIds?: string[]; sort: number }

export interface Order {
  id: string; number: number; customerId: string | null; email: string; status: string; financialStatus: string; fulfillmentStatus: string; currency: string; items: OrderItem[]; subtotalCents: number; discountCents: number; shippingCents: number; taxCents: number; totalCents: number; refundedCents: number; shippingAddress: Address | null; billingAddress: Address | null; shippingMethod: string | null; paymentProvider: string; discountCodes: string[]; tags: string[]; notes: string; createdAt: string;
  fulfillments?: Fulfillment[]; returns?: Return[]; refunds?: Refund[];
}
export interface Fulfillment { id: string; status: string; provider: string; trackingNumber: string | null; trackingUrl: string | null; items: { variantId: string; quantity: number }[]; shippedAt: string | null; deliveredAt: string | null; createdAt: string }
export interface Return { id: string; status: string; kind: string; items: { variantId: string; quantity: number; reason: string }[]; reason: string; refundCents: number; createdAt: string }
export interface Refund { id: string; amountCents: number; reason: string; actor: string; createdAt: string }

export interface Customer { id: string; email: string; firstName: string; lastName: string; phone: string | null; acceptsMarketing: boolean; addresses: Address[]; tags: string[]; segment: string; b2b: { priceListId?: string; netTermsDays?: number; gatedCatalog?: boolean } | null; metadata: Record<string, unknown>; ordersCount: number; totalSpentCents: number; lastOrderAt: string | null; createdAt: string; orders?: Order[] }
export interface Subscription { id: string; customerId: string; variantId: string; quantity: number; cadence: string; status: string; priceCents: number; currency: string; nextBillingAt: string | null; trialEndsAt: string | null; createdAt: string }

export interface Promotion { id: string; name: string; code: string | null; kind: "code" | "automatic"; type: "percentage" | "fixed" | "free_shipping" | "bogo" | "bundle"; value: number; minSubtotalCents: number; minQuantity: number; maxDiscountCents: number | null; appliesTo: { productIds?: string[]; collectionIds?: string[]; variantIds?: string[] }; bogo: { buyQuantity: number; getQuantity: number; getPercentOff: number } | null; bundle: { tiers: { quantity: number; percentOff: number }[] } | null; regionIds: string[]; usageLimit: number | null; perCustomerLimit: number | null; usageCount: number; stackable: boolean; status: string; startsAt: string | null; endsAt: string | null; createdAt: string }
export interface GiftCard { id: string; code: string; initialCents: number; balanceCents: number; currency: string; customerId: string | null; status: string; createdAt: string }
export interface MerchConfig { id: string; kind: "upsell" | "bundle" | "cross_sell"; component: string; placement: string; title: string; productIds: string[]; rules: Record<string, unknown>; promotionId: string | null; enabled: boolean; createdAt: string }

export interface Region { id: string; name: string; currency: string; countries: string[]; taxRateBps: number; taxInclusive: boolean; paymentProviders: string[]; freeShippingThresholdCents: number | null }
export interface ShippingOption { id: string; regionId: string | null; name: string; type: "flat" | "free_above" | "weight" | "price" | "pickup" | "local_delivery" | "live"; amountCents: number; thresholdCents: number | null; rules: { from: number; to: number | null; amountCents: number }[]; provider: string | null; estimate: string; enabled: boolean; sort: number }

export interface Todo { key: string; title: string; description: string; status: "todo" | "in_progress" | "waiting" | "done"; href: string | null; prompt: string | null; sort: number }
export interface ActivityItem { id?: string; area: string; status: string; message: string; runId?: string | null; createdAt: string }

export interface Dashboard {
  store: { id: string; name: string; slug: string; status: string; brand: Brand; url: string };
  kpis: { sessions: Kpi; totalSalesCents: Kpi; orders: Kpi; conversionRate: Kpi; aovCents: Kpi };
  range: { from: string; to: string; days: number };
  series: SeriesPoint[];
  todos: Todo[];
  activity: ActivityItem[];
  products: { total: number; published: number; drafts: number; outOfStock: number };
  orders: { total: number; revenueCents: number; unfulfilled: number };
  publish: PublishState;
  deployment: { version: number; publishedAt: string | null; buildStatus: string };
}
export interface Kpi { value: number; delta: number }
export interface SeriesPoint { day: string; sessions: number; orders: number; revenueCents: number; conversionRate: number }

export interface Environment { id: string; kind: "draft" | "live"; theme: ThemeConfig; version: number; buildStatus: string; buildLog: { at: string; level: string; message: string }[]; screenshotUrl: string | null; publishedAt: string | null; lint: { ok: boolean; problems: { level: "error" | "warning"; message: string; sectionId?: string }[] } }

export interface Review { id: string; productId: string; authorName: string; email: string | null; rating: number; title: string; body: string; media: MediaItem[]; status: string; verified: boolean; flags: string[]; fakeScore: number; reply: string | null; createdAt: string; product: { id: string; title: string; handle: string } | null }
export interface Question { id: string; productId: string; question: string; askedBy: string | null; answer: string | null; answeredBy: string | null; status: string; createdAt: string }

export interface Experiment { id: string; name: string; hypothesis: string; surface: string; target: string | null; status: string; variants: { key: string; label: string; payload: Record<string, unknown> }[]; trafficSplit: Record<string, number>; autoPromoteAt: number; winner: string | null; results: Record<string, { exposures: number; conversions: number; revenueCents: number }>; startedAt: string | null; endedAt: string | null; createdAt: string; analysis: { rates: { key: string; rate: number; exposures: number; conversions: number; revenueCents: number }[]; probabilities: { key: string; p: number }[]; winner: string; probability: number; liftPercent: number; decision: string; ladder: { threshold: number; reached: boolean }[]; minExposuresReached: boolean } }

export interface EmailTemplate { key: string; name: string; trigger: string; subject: string; html: string; enabled: boolean; delayMinutes: number; customized: boolean }
export interface EmailSend { id: string; templateKey: string; to: string; subject: string; status: string; attempts: number; error: string | null; createdAt: string }
export interface Flow { id: string; key: string; name: string; trigger: string; enabled: boolean; steps: { delayHours: number; templateKey: string; subject: string }[]; stats: { triggered: number; converted: number } }
export interface Campaign { id: string; name: string; brief: string; subject: string; subjectVariants: string[]; html: string; segment: string; status: string; scheduledAt: string | null; sentAt: string | null; stats: { sent: number; opened: number; clicked: number; revenueCents: number }; createdAt: string }

export interface Blog { id: string; handle: string; title: string; articleCount: number }
export interface Article { id: string; blogId: string; handle: string; title: string; body: string; excerpt: string; featuredImage: string | null; tags: string[]; status: "draft" | "scheduled" | "published"; publishedAt: string | null; createdAt: string }

export interface SeoOverview { keywords: { id: string; query: string; page: string; position: number | null; previousPosition: number | null; clicks28d: number[] }[]; issues: { id: string; path: string; severity: "red" | "amber" | "green"; issue: string; createdAt: string }[]; redirects: { id: string; fromPath: string; toPath: string; code: number }[]; series: { day: string; impressions: number; clicks: number }[]; takeoverIndex: number }
export interface GeoOverview { prompts: GeoPrompt[]; byModel: { model: string; mentions: number; tracked: number }[]; card: KnowledgeCard | null }
export interface GeoPrompt { id: string; prompt: string; model: string; placement: "recommended" | "cited" | "mentioned" | "not_cited"; snippet: string | null; history: number[]; checkedAt: string | null }
export interface KnowledgeCard { brandName: string; categories: string[]; differentiators: string[]; locations: string[]; founders: string[]; comparisons: { competitor: string; points: string[] }[] }

export interface SettingsField { type: "text" | "secret" | "boolean" | "number" | "select" | "textarea"; label: string; description?: string; placeholder?: string; pattern?: string; required?: boolean; options?: { value: string; label: string }[]; default?: unknown }
export interface PluginManifest { id: string; name: string; version: string; category: string; source: "first-party" | "third-party"; kind: string; regions: string[]; description: string; longDescription: string; website?: string; icon: string; featured: boolean; planGated: boolean; allowedPlanSlugs: string[] | null; installable: boolean; settingsSchema: Record<string, SettingsField>; aiTools: { name: string; description: string; example?: string }[]; storefront: { components: { id: string; placement: string; slot?: string; validSlots?: string[]; defaultSlot?: string }[] }; capabilities: { id: string; type: string }[]; adminRoutes: { path: string; label: string }[] }
export interface CatalogPlugin extends PluginManifest { installed: boolean; available: boolean }
export interface InstalledPlugin { id: string; pluginId: string; enabled: boolean; settings: Record<string, unknown>; manifest: PluginManifest | null }

export interface Domain { id: string; hostname: string; status: string; sslStatus: string; isPrimary: boolean; verificationToken: string; applePayRegistered: boolean; instructions?: DnsInstruction[] }
export interface DnsInstruction { type: string; name: string; value: string; purpose: string }
export interface TeamMember { id: string; email: string; name: string; role: string; permissions: string[]; pending: boolean; acceptedAt: string | null }

export interface Workflow { id: string; name: string; trigger: string; conditions: { field: string; op: string; value: unknown }[]; actions: { type: string; params: Record<string, unknown> }[]; enabled: boolean; createdAt: string; runs: { id: string; status: string; log: string[]; createdAt: string }[] }

export interface ChatMessageRow { id: string; role: "user" | "assistant" | "tool" | "system"; content: { text?: string; toolCalls?: { id: string; name: string; input: unknown }[]; results?: { id: string; ok: boolean; output: unknown; error?: string }[]; images?: string[] }; runId: string | null; createdAt: string }
export interface ChatSession { id: string; title: string; createdAt: string; updatedAt: string }
export interface AgentRun { id: string; status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled"; result: string | null; error: string | null; todos: { title: string; status: string }[]; steps: unknown[]; sessionId: string | null; input: string; model: string; createdAt: string }
export interface AiModel { id: string; label: string; provider: string; tier: string; available: boolean }
export interface PromptItem { area: string; title: string; prompt: string }
