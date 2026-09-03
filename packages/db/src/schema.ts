/**
 * Kiln data model. One Postgres schema serves the control plane, the commerce engine,
 * content/marketing surfaces and first-party analytics. Every tenant-scoped table
 * carries store_id; the control plane scopes by organisation.
 */
import { pgTable, text, integer, boolean, timestamp, jsonb, index, uniqueIndex, real, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Address, Brand, CartItem, MediaItem, OrderItem, ProductOption, Seo, SubscriptionConfig, ThemeConfig } from "@kiln/shared";

export const newId = (prefix: string) => `${prefix}_${ulid().toLowerCase()}`;
const id = (prefix: string) => text("id").primaryKey().$defaultFn(() => newId(prefix));
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = ts("created_at").notNull().defaultNow();
const updatedAt = ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date());
const json = <T>(name: string) => jsonb(name).$type<T>();

// ═══════════════════════════════ control plane ═══════════════════════════════
export const users = pgTable("users", {
  id: id("usr"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default(""),
  totpSecret: text("totp_secret"),
  createdAt,
});

export const organizations = pgTable("organizations", {
  id: id("org"),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  planSlug: text("plan_slug").notNull().default("free"),
  billingInterval: text("billing_interval").notNull().default("monthly"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").notNull().default("active"),
  currentPeriodEnd: ts("current_period_end"),
  createdAt,
});

export const stores = pgTable(
  "stores",
  {
    id: id("store"),
    orgId: text("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("building"), // building | live | paused
    defaultCurrency: text("default_currency").notNull().default("USD"),
    defaultRegionId: text("default_region_id"),
    brand: json<Brand>("brand").notNull(),
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    prompt: text("prompt").notNull().default(""),
    referenceImages: json<string[]>("reference_images").notNull().default([]),
    onboardingStep: text("onboarding_step").notNull().default("prompt"),
    stripeAccountId: text("stripe_account_id"),
    stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
    stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
    aiModel: text("ai_model").notNull().default("claude-sonnet-5"),
    createdAt,
    updatedAt,
  },
  (t) => [index("stores_org_idx").on(t.orgId)],
);

export const storeEnvironments = pgTable(
  "store_environments",
  {
    id: id("env"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // draft | live
    theme: json<ThemeConfig>("theme").notNull(),
    version: integer("version").notNull().default(1),
    buildStatus: text("build_status").notNull().default("idle"), // idle | queued | building | verifying | ready | failed
    buildLog: json<{ at: string; level: string; message: string }[]>("build_log").notNull().default([]),
    screenshotUrl: text("screenshot_url"),
    publishedAt: ts("published_at"),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("env_store_kind_idx").on(t.storeId, t.kind)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: id("tm"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"), // owner | admin | member
    permissions: json<string[]>("permissions").notNull().default([]),
    inviteToken: text("invite_token"),
    acceptedAt: ts("accepted_at"),
    createdAt,
  },
  (t) => [uniqueIndex("team_store_email_idx").on(t.storeId, t.email)],
);

export const refreshTokens = pgTable("refresh_tokens", {
  id: id("rt"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  createdAt,
});

export const aiCredits = pgTable("ai_credits", {
  storeId: text("store_id").primaryKey().references(() => stores.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(200),
  usedThisPeriod: integer("used_this_period").notNull().default(0),
  periodStart: ts("period_start").notNull().defaultNow(),
});

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: id("chat"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt,
    updatedAt,
  },
  (t) => [index("chat_store_idx").on(t.storeId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id("msg"),
    sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
    storeId: text("store_id").notNull(),
    role: text("role").notNull(), // user | assistant | tool | system
    content: json<unknown>("content").notNull(),
    runId: text("run_id"),
    pageContext: text("page_context"),
    createdAt,
  },
  (t) => [index("msg_session_idx").on(t.sessionId, t.createdAt)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id("run"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    kind: text("kind").notNull().default("chat"), // chat | onboarding | build | cro
    status: text("status").notNull().default("queued"), // queued | running | paused | completed | failed | cancelled
    input: text("input").notNull(),
    pageContext: text("page_context"),
    model: text("model").notNull(),
    steps: json<unknown[]>("steps").notNull().default([]),
    todos: json<{ title: string; status: string }[]>("todos").notNull().default([]),
    result: text("result"),
    error: text("error"),
    creditsUsed: integer("credits_used").notNull().default(0),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    createdAt,
    updatedAt,
  },
  (t) => [index("runs_store_idx").on(t.storeId, t.createdAt)],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: id("act"),
    storeId: text("store_id").notNull(),
    runId: text("run_id"),
    area: text("area").notNull(),
    status: text("status").notNull(), // running | done | error
    message: text("message").notNull(),
    createdAt,
  },
  (t) => [index("activity_store_idx").on(t.storeId, t.createdAt)],
);

export const todos = pgTable(
  "todos",
  {
    id: id("todo"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"), // todo | in_progress | waiting | done
    href: text("href"),
    prompt: text("prompt"),
    sort: integer("sort").notNull().default(0),
    updatedAt,
  },
  (t) => [uniqueIndex("todos_store_key_idx").on(t.storeId, t.key)],
);

export const storePlugins = pgTable(
  "store_plugins",
  {
    id: id("sp"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    themeIds: json<string[]>("theme_ids").notNull().default([]),
    installedAt: ts("installed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("store_plugin_idx").on(t.storeId, t.pluginId)],
);

export const storePluginCredentials = pgTable(
  "store_plugin_credentials",
  {
    id: id("cred"),
    storeId: text("store_id").notNull(),
    pluginId: text("plugin_id").notNull(),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    createdAt,
  },
  (t) => [uniqueIndex("cred_idx").on(t.storeId, t.pluginId, t.key)],
);

export const domains = pgTable("domains", {
  id: id("dom"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending | verified | active | failed
  verificationToken: text("verification_token").notNull(),
  sslStatus: text("ssl_status").notNull().default("pending"),
  isPrimary: boolean("is_primary").notNull().default(false),
  applePayRegistered: boolean("apple_pay_registered").notNull().default(false),
  createdAt,
});

export const featureRequests = pgTable("feature_requests", {
  id: id("fr"),
  storeId: text("store_id"),
  userId: text("user_id"),
  text: text("text").notNull(),
  source: text("source").notNull().default("typed"), // typed | voice
  createdAt,
});

export const supportConversations = pgTable("support_conversations", {
  id: id("sup"),
  storeId: text("store_id").notNull(),
  status: text("status").notNull().default("open"),
  messages: json<{ from: string; text: string; at: string }[]>("messages").notNull().default([]),
  createdAt,
  updatedAt,
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id("aud"),
    storeId: text("store_id").notNull(),
    actorType: text("actor_type").notNull(), // user | ai | system
    actorId: text("actor_id"),
    action: text("action").notNull(),
    target: text("target"),
    diff: json<unknown>("diff"),
    createdAt,
  },
  (t) => [index("audit_store_idx").on(t.storeId, t.createdAt)],
);

export const experiments = pgTable("experiments", {
  id: id("exp"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hypothesis: text("hypothesis").notNull().default(""),
  surface: text("surface").notNull(), // headline | cta | image | pricing | bundle | free_ship | email_subject | send_time
  target: text("target"), // product id / page path
  status: text("status").notNull().default("draft"), // draft | running | winner | killed | promoted
  variants: json<{ key: string; label: string; payload: Record<string, unknown> }[]>("variants").notNull(),
  trafficSplit: json<Record<string, number>>("traffic_split").notNull().default({}),
  autoPromoteAt: real("auto_promote_at").notNull().default(0.95),
  winner: text("winner"),
  results: json<Record<string, { exposures: number; conversions: number; revenueCents: number }>>("results").notNull().default({}),
  startedAt: ts("started_at"),
  endedAt: ts("ended_at"),
  createdAt,
});

export const experimentEvents = pgTable(
  "experiment_events",
  {
    id: id("xe"),
    experimentId: text("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
    variant: text("variant").notNull(),
    kind: text("kind").notNull(), // exposure | conversion
    valueCents: integer("value_cents").notNull().default(0),
    sessionId: text("session_id"),
    createdAt,
  },
  (t) => [index("xe_exp_idx").on(t.experimentId)],
);

export const migrationJobs = pgTable("migration_jobs", {
  id: id("mig"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // shopify | bigcommerce | woocommerce | magento | squarespace | csv
  status: text("status").notNull().default("queued"),
  mapping: json<Record<string, string>>("mapping").notNull().default({}),
  counts: json<Record<string, number>>("counts").notNull().default({}),
  issues: json<string[]>("issues").notNull().default([]),
  createdAt,
  updatedAt,
});

// ═══════════════════════════════ commerce ═══════════════════════════════
export const regions = pgTable("regions", {
  id: id("reg"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  countries: json<string[]>("countries").notNull().default([]),
  taxRateBps: integer("tax_rate_bps").notNull().default(0),
  taxInclusive: boolean("tax_inclusive").notNull().default(false),
  paymentProviders: json<string[]>("payment_providers").notNull().default(["stripe"]),
  freeShippingThresholdCents: integer("free_shipping_threshold_cents"),
  createdAt,
});

export const products = pgTable(
  "products",
  {
    id: id("prod"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"), // draft | published | archived
    options: json<ProductOption[]>("options").notNull().default([]),
    media: json<MediaItem[]>("media").notNull().default([]),
    tags: json<string[]>("tags").notNull().default([]),
    vendor: text("vendor"),
    productType: text("product_type"),
    seo: json<Seo>("seo").notNull().default({}),
    metadata: json<Record<string, unknown>>("metadata").notNull().default({}),
    subscription: json<SubscriptionConfig>("subscription"),
    digital: json<{ enabled: boolean; files: { name: string; url: string }[] }>("digital"),
    engravingTemplateId: text("engraving_template_id"),
    weightGrams: integer("weight_grams").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("products_store_handle_idx").on(t.storeId, t.handle), index("products_store_status_idx").on(t.storeId, t.status)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id("var"),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    storeId: text("store_id").notNull(),
    title: text("title").notNull(),
    sku: text("sku"),
    options: json<Record<string, string>>("options").notNull().default({}),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    prices: json<Record<string, number>>("prices").notNull().default({}), // per-currency overrides
    inventoryQty: integer("inventory_qty").notNull().default(0),
    inventoryByLocation: json<Record<string, number>>("inventory_by_location").notNull().default({}),
    allowBackorder: boolean("allow_backorder").notNull().default(false),
    reorderPoint: integer("reorder_point").notNull().default(5),
    imageUrl: text("image_url"),
    weightGrams: integer("weight_grams"),
    metadata: json<Record<string, unknown>>("metadata").notNull().default({}),
    sort: integer("sort").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [index("variants_product_idx").on(t.productId), index("variants_store_idx").on(t.storeId)],
);

export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: id("inv"),
  storeId: text("store_id").notNull(),
  variantId: text("variant_id").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  location: text("location").notNull().default("default"),
  actor: text("actor").notNull().default("system"),
  createdAt,
});

export const collections = pgTable(
  "collections",
  {
    id: id("col"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    kind: text("kind").notNull().default("manual"), // manual | smart
    rules: json<{ field: string; op: string; value: string }[]>("rules").notNull().default([]),
    seo: json<Seo>("seo").notNull().default({}),
    sort: integer("sort").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("collections_store_handle_idx").on(t.storeId, t.handle)],
);

export const collectionProducts = pgTable(
  "collection_products",
  {
    collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("collection_products_idx").on(t.collectionId, t.productId)],
);

export const customers = pgTable(
  "customers",
  {
    id: id("cus"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    acceptsMarketing: boolean("accepts_marketing").notNull().default(false),
    addresses: json<Address[]>("addresses").notNull().default([]),
    tags: json<string[]>("tags").notNull().default([]),
    segment: text("segment"),
    b2b: json<{ priceListId?: string; netTermsDays?: number; gatedCatalog?: boolean }>("b2b"),
    metadata: json<Record<string, unknown>>("metadata").notNull().default({}),
    ordersCount: integer("orders_count").notNull().default(0),
    totalSpentCents: integer("total_spent_cents").notNull().default(0),
    lastOrderAt: ts("last_order_at"),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("customers_store_email_idx").on(t.storeId, t.email)],
);

export const carts = pgTable(
  "carts",
  {
    id: id("cart"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    regionId: text("region_id"),
    customerId: text("customer_id"),
    email: text("email"),
    items: json<CartItem[]>("items").notNull().default([]),
    discountCodes: json<string[]>("discount_codes").notNull().default([]),
    giftCardCodes: json<string[]>("gift_card_codes").notNull().default([]),
    shippingAddress: json<Address>("shipping_address"),
    billingAddress: json<Address>("billing_address"),
    shippingOptionId: text("shipping_option_id"),
    status: text("status").notNull().default("open"), // open | completed | abandoned
    sessionId: text("session_id"),
    experimentVariants: json<Record<string, string>>("experiment_variants").notNull().default({}),
    abandonedEmailSentAt: ts("abandoned_email_sent_at"),
    createdAt,
    updatedAt,
  },
  (t) => [index("carts_store_idx").on(t.storeId, t.status)],
);

export const orders = pgTable(
  "orders",
  {
    id: id("ord"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    cartId: text("cart_id"),
    customerId: text("customer_id"),
    email: text("email").notNull(),
    status: text("status").notNull().default("open"), // open | completed | cancelled
    financialStatus: text("financial_status").notNull().default("pending"), // pending | authorized | paid | partially_refunded | refunded
    fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"), // unfulfilled | partial | fulfilled | returned
    currency: text("currency").notNull(),
    regionId: text("region_id"),
    items: json<OrderItem[]>("items").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    shippingAddress: json<Address>("shipping_address"),
    billingAddress: json<Address>("billing_address"),
    shippingMethod: text("shipping_method"),
    paymentProvider: text("payment_provider").notNull().default("test"),
    paymentRef: text("payment_ref"),
    discountCodes: json<string[]>("discount_codes").notNull().default([]),
    tags: json<string[]>("tags").notNull().default([]),
    notes: text("notes").notNull().default(""),
    metadata: json<Record<string, unknown>>("metadata").notNull().default({}),
    sessionId: text("session_id"),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("orders_store_number_idx").on(t.storeId, t.number), index("orders_store_created_idx").on(t.storeId, t.createdAt)],
);

export const fulfillments = pgTable("fulfillments", {
  id: id("ful"),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | shipped | delivered | cancelled
  provider: text("provider").notNull().default("manual"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  labelUrl: text("label_url"),
  items: json<{ variantId: string; quantity: number }[]>("items").notNull(),
  shippedAt: ts("shipped_at"),
  deliveredAt: ts("delivered_at"),
  createdAt,
});

export const returns = pgTable("returns", {
  id: id("ret"),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull(),
  status: text("status").notNull().default("requested"), // requested | approved | received | refunded | rejected
  kind: text("kind").notNull().default("refund"), // refund | exchange
  items: json<{ variantId: string; quantity: number; reason: string }[]>("items").notNull(),
  reason: text("reason").notNull().default(""),
  refundCents: integer("refund_cents").notNull().default(0),
  labelUrl: text("label_url"),
  createdAt,
  updatedAt,
});

export const refunds = pgTable("refunds", {
  id: id("rf"),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull().default(""),
  providerRef: text("provider_ref"),
  actor: text("actor").notNull().default("user"),
  createdAt,
});

export const promotions = pgTable(
  "promotions",
  {
    id: id("promo"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    kind: text("kind").notNull().default("code"), // code | automatic
    type: text("type").notNull(), // percentage | fixed | free_shipping | bogo | bundle
    value: integer("value").notNull().default(0), // percent (0-100) or cents
    minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
    minQuantity: integer("min_quantity").notNull().default(0),
    maxDiscountCents: integer("max_discount_cents"),
    appliesTo: json<{ productIds?: string[]; collectionIds?: string[]; variantIds?: string[] }>("applies_to").notNull().default({}),
    bogo: json<{ buyQuantity: number; getQuantity: number; getPercentOff: number }>("bogo"),
    bundle: json<{ tiers: { quantity: number; percentOff: number }[] }>("bundle"),
    regionIds: json<string[]>("region_ids").notNull().default([]),
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").notNull().default(0),
    perCustomerLimit: integer("per_customer_limit"),
    stackable: boolean("stackable").notNull().default(false),
    status: text("status").notNull().default("active"), // active | scheduled | expired | disabled
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    createdAt,
    updatedAt,
  },
  (t) => [index("promos_store_code_idx").on(t.storeId, t.code)],
);

export const shippingOptions = pgTable("shipping_options", {
  id: id("ship"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  regionId: text("region_id"),
  name: text("name").notNull(),
  type: text("type").notNull().default("flat"), // flat | free_above | weight | price | pickup | local_delivery | live
  amountCents: integer("amount_cents").notNull().default(0),
  thresholdCents: integer("threshold_cents"),
  rules: json<{ from: number; to: number | null; amountCents: number }[]>("rules").notNull().default([]),
  provider: text("provider"),
  estimate: text("estimate").notNull().default("3–5 business days"),
  enabled: boolean("enabled").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt,
});

export const giftCards = pgTable("gift_cards", {
  id: id("gc"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  initialCents: integer("initial_cents").notNull(),
  balanceCents: integer("balance_cents").notNull(),
  currency: text("currency").notNull(),
  customerId: text("customer_id"),
  status: text("status").notNull().default("active"),
  createdAt,
});

export const customerSubscriptions = pgTable("customer_subscriptions", {
  id: id("csub"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull(),
  variantId: text("variant_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  cadence: text("cadence").notNull(),
  status: text("status").notNull().default("active"), // trialing | active | paused | past_due | cancelled
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull(),
  nextBillingAt: ts("next_billing_at"),
  trialEndsAt: ts("trial_ends_at"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt,
  updatedAt,
});

// ═══════════════════════════════ content & marketing ═══════════════════════════════
export const reviews = pgTable(
  "reviews",
  {
    id: id("rev"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    customerId: text("customer_id"),
    authorName: text("author_name").notNull(),
    email: text("email"),
    rating: integer("rating").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull(),
    media: json<MediaItem[]>("media").notNull().default([]),
    status: text("status").notNull().default("pending"), // pending | approved | rejected | deleted
    verified: boolean("verified").notNull().default(false),
    flags: json<string[]>("flags").notNull().default([]),
    fakeScore: real("fake_score").notNull().default(0),
    reply: text("reply"),
    createdAt,
  },
  (t) => [index("reviews_store_product_idx").on(t.storeId, t.productId, t.status)],
);

export const productAiSummaries = pgTable("product_ai_summaries", {
  productId: text("product_id").primaryKey(),
  storeId: text("store_id").notNull(),
  bullets: json<string[]>("bullets").notNull().default([]),
  sentiment: real("sentiment").notNull().default(0),
  generatedAt: ts("generated_at").notNull().defaultNow(),
});

export const qaThreads = pgTable("qa_threads", {
  id: id("qa"),
  storeId: text("store_id").notNull(),
  productId: text("product_id").notNull(),
  question: text("question").notNull(),
  askedBy: text("asked_by"),
  answer: text("answer"),
  answeredBy: text("answered_by"), // founder | ai
  status: text("status").notNull().default("open"),
  createdAt,
});

export const blogs = pgTable("blogs", {
  id: id("blog"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  handle: text("handle").notNull(),
  title: text("title").notNull(),
  createdAt,
});

export const articles = pgTable("articles", {
  id: id("art"),
  blogId: text("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull(),
  handle: text("handle").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  featuredImage: text("featured_image"),
  tags: json<string[]>("tags").notNull().default([]),
  seo: json<Seo>("seo").notNull().default({}),
  status: text("status").notNull().default("draft"), // draft | scheduled | published
  publishedAt: ts("published_at"),
  createdAt,
  updatedAt,
});

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: id("tpl"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    updatedAt,
  },
  (t) => [uniqueIndex("email_templates_store_key_idx").on(t.storeId, t.key)],
);

export const emailSends = pgTable(
  "email_sends",
  {
    id: id("send"),
    storeId: text("store_id").notNull(),
    templateKey: text("template_key").notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("queued"), // queued | sent | bounced | failed
    providerId: text("provider_id"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    openedAt: ts("opened_at"),
    clickedAt: ts("clicked_at"),
    createdAt,
  },
  (t) => [index("sends_store_idx").on(t.storeId, t.createdAt)],
);

export const campaigns = pgTable("campaigns", {
  id: id("camp"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brief: text("brief").notNull().default(""),
  subject: text("subject").notNull(),
  subjectVariants: json<string[]>("subject_variants").notNull().default([]),
  html: text("html").notNull(),
  segment: text("segment").notNull().default("all"),
  status: text("status").notNull().default("draft"), // draft | scheduled | sending | sent
  scheduledAt: ts("scheduled_at"),
  sentAt: ts("sent_at"),
  stats: json<{ sent: number; opened: number; clicked: number; revenueCents: number }>("stats").notNull().default({ sent: 0, opened: 0, clicked: 0, revenueCents: 0 }),
  createdAt,
});

export const flows = pgTable(
  "flows",
  {
    id: id("flow"),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // welcome | browse_abandon | cart_abandon | post_purchase | win_back
    name: text("name").notNull(),
    trigger: text("trigger").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    steps: json<{ delayHours: number; templateKey: string; subject: string }[]>("steps").notNull().default([]),
    stats: json<{ triggered: number; converted: number }>("stats").notNull().default({ triggered: 0, converted: 0 }),
  },
  (t) => [uniqueIndex("flows_store_key_idx").on(t.storeId, t.key)],
);

export const seoKeywords = pgTable("seo_keywords", {
  id: id("kw"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  page: text("page").notNull(),
  position: real("position"),
  previousPosition: real("previous_position"),
  clicks28d: json<number[]>("clicks_28d").notNull().default([]),
  impressions28d: json<number[]>("impressions_28d").notNull().default([]),
  updatedAt,
});

export const seoIssues = pgTable("seo_issues", {
  id: id("seoi"),
  storeId: text("store_id").notNull(),
  path: text("path").notNull(),
  severity: text("severity").notNull(), // red | amber | green
  issue: text("issue").notNull(),
  fixedAt: ts("fixed_at"),
  createdAt,
});

export const redirects = pgTable(
  "redirects",
  {
    id: id("rd"),
    storeId: text("store_id").notNull(),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    code: integer("code").notNull().default(301),
  },
  (t) => [uniqueIndex("redirects_idx").on(t.storeId, t.fromPath)],
);

export const geoPrompts = pgTable("geo_prompts", {
  id: id("geo"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(), // chatgpt | claude | perplexity | gemini
  placement: text("placement").notNull().default("not_cited"), // recommended | cited | mentioned | not_cited
  snippet: text("snippet"),
  history: json<number[]>("history").notNull().default([]),
  checkedAt: ts("checked_at"),
});

export const knowledgeCards = pgTable("knowledge_cards", {
  storeId: text("store_id").primaryKey().references(() => stores.id, { onDelete: "cascade" }),
  brandName: text("brand_name").notNull(),
  categories: json<string[]>("categories").notNull().default([]),
  differentiators: json<string[]>("differentiators").notNull().default([]),
  locations: json<string[]>("locations").notNull().default([]),
  founders: json<string[]>("founders").notNull().default([]),
  comparisons: json<{ competitor: string; points: string[] }[]>("comparisons").notNull().default([]),
  updatedAt,
});

export const merchConfigs = pgTable("merch_configs", {
  id: id("merch"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // upsell | bundle | cross_sell
  component: text("component").notNull(),
  placement: text("placement").notNull(),
  title: text("title").notNull().default(""),
  productIds: json<string[]>("product_ids").notNull().default([]),
  rules: json<Record<string, unknown>>("rules").notNull().default({}),
  promotionId: text("promotion_id"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt,
});

export const affinityPairs = pgTable(
  "affinity_pairs",
  {
    storeId: text("store_id").notNull(),
    productA: text("product_a").notNull(),
    productB: text("product_b").notNull(),
    score: real("score").notNull(),
    coPurchases: integer("co_purchases").notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("affinity_idx").on(t.storeId, t.productA, t.productB)],
);

export const contactSubmissions = pgTable("contact_submissions", {
  id: id("cs"),
  storeId: text("store_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt,
});

export const exitIntentResponses = pgTable("exit_intent_responses", {
  id: id("xi"),
  storeId: text("store_id").notNull(),
  email: text("email"),
  offer: text("offer").notNull(),
  converted: boolean("converted").notNull().default(false),
  createdAt,
});

export const workflows = pgTable("workflows", {
  id: id("wf"),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(), // order.created | order.paid | customer.created | review.created | cart.abandoned
  conditions: json<{ field: string; op: string; value: unknown }[]>("conditions").notNull().default([]),
  actions: json<{ type: string; params: Record<string, unknown> }[]>("actions").notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  createdAt,
});

export const workflowRuns = pgTable("workflow_runs", {
  id: id("wfr"),
  workflowId: text("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull(),
  status: text("status").notNull(),
  log: json<string[]>("log").notNull().default([]),
  createdAt,
});

export const engravingTemplates = pgTable("engraving_templates", {
  id: id("eng"),
  storeId: text("store_id").notNull(),
  name: text("name").notNull(),
  maxChars: integer("max_chars").notNull().default(20),
  feeCents: integer("fee_cents").notNull().default(0),
  fonts: json<string[]>("fonts").notNull().default(["serif"]),
  createdAt,
});

// ═══════════════════════════════ analytics ═══════════════════════════════
export const sessions = pgTable(
  "sessions",
  {
    id: id("ses"),
    storeId: text("store_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    country: text("country"),
    city: text("city"),
    referrer: text("referrer"),
    landingPath: text("landing_path"),
    userAgent: text("user_agent"),
    device: text("device"),
    firstSeen: ts("first_seen").notNull().defaultNow(),
    lastSeen: ts("last_seen").notNull().defaultNow(),
  },
  (t) => [index("sessions_store_fp_idx").on(t.storeId, t.fingerprint), index("sessions_store_seen_idx").on(t.storeId, t.lastSeen)],
);

export const events = pgTable(
  "events",
  {
    id: id("evt"),
    storeId: text("store_id").notNull(),
    sessionId: text("session_id").notNull(),
    kind: text("kind").notNull(),
    path: text("path"),
    productId: text("product_id"),
    variantId: text("variant_id"),
    valueCents: integer("value_cents").notNull().default(0),
    meta: json<Record<string, unknown>>("meta").notNull().default({}),
    createdAt,
  },
  (t) => [index("events_store_created_idx").on(t.storeId, t.createdAt), index("events_store_kind_idx").on(t.storeId, t.kind, t.createdAt)],
);

export const counters = pgTable(
  "counters",
  {
    storeId: text("store_id").notNull(),
    key: text("key").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("counters_idx").on(t.storeId, t.key)],
);

export const _sql = sql;
