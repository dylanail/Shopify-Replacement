import { definePlugin, type PluginManifest } from "./manifest.js";

const secret = (label: string, pattern?: string) => ({ type: "secret" as const, label, required: true, pattern });
const text = (label: string, extra: Partial<{ pattern: string; required: boolean; placeholder: string; description: string }> = {}) => ({ type: "text" as const, label, required: extra.required ?? true, pattern: extra.pattern, placeholder: extra.placeholder, description: extra.description });
const bool = (label: string, def = true) => ({ type: "boolean" as const, label, default: def });

/**
 * First-party plugins. Each one is a real manifest: settings form, AI tools merged into the
 * assistant at install time, storefront slot components, and backend capabilities.
 */
export const FIRST_PARTY: PluginManifest[] = [
  definePlugin({
    id: "product-reviews", name: "Product Reviews", category: "Brand & Reputation", kind: "hybrid", icon: "⭐", featured: true,
    description: "Photo & video reviews, AI summaries, fake-review filter, Q&A, review-request emails.",
    longDescription: "Seven storefront components (grid, horizontal cards, video wall, star badge, happy-customers banner, quote card, bubbles grid), a moderation queue, and automatic review requests seven days after delivery.",
    settingsSchema: { autoApprove: bool("Auto-approve 4–5 star reviews", false), requestAfterDays: { type: "number", label: "Send review request after (days)", default: 7 }, incentiveCode: text("Discount code in request email", { required: false }) },
    aiTools: [
      { name: "list_reviews", description: "List reviews with optional status/product filters", input: { status: "string", productId: "string" } },
      { name: "moderate_review", description: "Approve, reject or restore a review", input: { reviewId: "string", action: "string" } },
      { name: "regenerate_review_summary", description: "Rebuild the AI summary bullets for a product", input: { productId: "string" } },
    ],
    storefront: { components: [
      { id: "ReviewBadge", slot: "pdpAboveTitle", propsFromContext: ["productId"] },
      { id: "ReviewWall", placement: "merchant_choice", validSlots: ["pdpBelowDescription", "pdpEnd", "homeSections"], defaultSlot: "pdpEnd", propsFromContext: ["productId"] },
      { id: "HappyCustomersBanner", placement: "merchant_choice", validSlots: ["homeSections", "collectionTop"], defaultSlot: "homeSections" },
    ], scripts: [] },
    capabilities: [{ id: "reviews", type: "ux_module" }],
  }),
  definePlugin({
    id: "upsells", name: "Upsells & Bundles", category: "Conversion & Upsell", kind: "ux_module", icon: "🧺", featured: true,
    description: "Cart-aware, AI-ranked frequently-bought-together, tiered bundles and post-checkout one-click offers.",
    settingsSchema: { placement: { type: "select", label: "Default placement", options: [{ value: "pdpBelowAddToCart", label: "PDP below add-to-cart" }, { value: "cartDrawerEnd", label: "Cart drawer" }, { value: "thankYouEnd", label: "Post-checkout" }], default: "pdpBelowAddToCart" } },
    aiTools: [
      { name: "create_bundle", description: "Create a tiered bundle (1×/2×/3×) across products and the promotion behind it", input: { title: "string", productIds: "string", tiers: "string" } },
      { name: "rebuild_affinity", description: "Recompute co-purchase affinity pairs from the last 90 days of orders", input: {} },
    ],
    storefront: { components: [
      { id: "FrequentlyBoughtTogether", placement: "merchant_choice", validSlots: ["pdpBelowAddToCart", "pdpBelowDescription", "cartDrawerEnd"], defaultSlot: "pdpBelowAddToCart", propsFromContext: ["productId"] },
      { id: "FreeShippingGapCloser", slot: "cartDrawerEnd" },
      { id: "PostPurchaseOffer", slot: "thankYouEnd" },
    ], scripts: [] },
    capabilities: [{ id: "upsells", type: "ux_module" }],
  }),
  definePlugin({
    id: "exit-intent", name: "Exit Intent", category: "Conversion & Upsell", kind: "ux_module", icon: "🚪",
    description: "Catch leaving visitors with a discount or email capture; responses, stats and CSV export in admin.",
    settingsSchema: { offer: text("Offer headline", { placeholder: "Wait — take 10% off" }), code: text("Discount code", { required: false }), delaySeconds: { type: "number", label: "Arm after (seconds)", default: 5 } },
    aiTools: [{ name: "configure_exit_intent", description: "Set the exit-intent offer copy and discount code", input: { offer: "string", code: "string" } }],
    storefront: { components: [{ id: "ExitIntentModal", slot: "bodyEnd", propsFromConfig: ["offer", "code", "delaySeconds"] }], scripts: [] },
    adminRoutes: [{ path: "/plugins/exit-intent", label: "Exit Intent responses" }],
    capabilities: [{ id: "exit_intent", type: "ux_module" }],
  }),
  definePlugin({
    id: "contact-form", name: "Contact Form", category: "Customer Support", kind: "ux_module", icon: "✉️",
    description: "A branded contact page with a submissions inbox and email notifications.",
    settingsSchema: { notifyEmail: text("Notify email", { required: false }), heading: text("Heading", { required: false, placeholder: "Talk to us" }) },
    aiTools: [{ name: "list_contact_submissions", description: "Read recent contact-form submissions", input: {} }],
    storefront: { components: [{ id: "ContactForm", slot: "footerEnd" }], scripts: [] },
    adminRoutes: [{ path: "/plugins/contact-form", label: "Contact inbox" }],
    capabilities: [{ id: "contact", type: "ux_module" }],
  }),
  definePlugin({
    id: "blog", name: "Blog", category: "Content", kind: "hybrid", icon: "📝",
    description: "Multi-blog CMS with rich articles, tags, SEO fields, scheduling and RSS.",
    aiTools: [
      { name: "create_blog", description: "Create a blog", input: { title: "string" } },
      { name: "create_article", description: "Write and publish an article on a blog", input: { blogId: "string", title: "string", body: "string", status: "string" } },
      { name: "list_blogs", description: "List blogs and article counts", input: {} },
    ],
    capabilities: [{ id: "blog", type: "ux_module" }],
  }),
  definePlugin({
    id: "engraving", name: "Engraving & Personalization", category: "Conversion & Upsell", kind: "ux_module", icon: "🔤",
    description: "Per-product engraving templates with character limits, fonts and a per-currency fee.",
    settingsSchema: { defaultFeeCents: { type: "number", label: "Default fee (cents)", default: 1500 } },
    aiTools: [{ name: "assign_engraving", description: "Attach an engraving template to a product", input: { productId: "string", templateName: "string", maxChars: "number", feeCents: "number" } }],
    storefront: { components: [{ id: "EngravingButton", placement: "merchant_choice", validSlots: ["pdpBelowAddToCart"], defaultSlot: "pdpBelowAddToCart", propsFromContext: ["productId"] }], scripts: [] },
    capabilities: [{ id: "engraving", type: "ux_module" }],
  }),
  definePlugin({
    id: "workflows", name: "Workflow Automation", category: "Inventory & Ops", kind: "integration", icon: "⚙️",
    description: "When [trigger] → If [conditions] → Then [actions]. Tag orders, send emails, append to sheets.",
    aiTools: [{ name: "create_workflow", description: "Create an automation rule from a plain-language description", input: { name: "string", trigger: "string", description: "string" } }],
    capabilities: [{ id: "workflows", type: "ux_module" }],
  }),
  definePlugin({
    id: "ga4", name: "Google Analytics 4", category: "Analytics", icon: "📈",
    description: "Server-verified GA4 tagging with e-commerce events (view_item, add_to_cart, purchase).",
    settingsSchema: { measurementId: text("Measurement ID", { pattern: "^G-[A-Z0-9]{6,}$", placeholder: "G-XXXXXXX" }) },
    aiTools: [{ name: "connect_ga4", description: "Connect GA4 by measurement ID", input: { measurementId: "string" } }],
    storefront: { components: [{ id: "Ga4Provider", slot: "rootProviders", propsFromConfig: ["measurementId"] }], scripts: [] },
    capabilities: [{ id: "ga4", type: "analytics_pixel" }], disableInPreview: true,
  }),
  definePlugin({
    id: "meta-ads", name: "Meta Pixel + Conversions API", category: "Marketing & Email", icon: "📣", featured: true, planGated: true, allowedPlanSlugs: ["starter", "scale", "enterprise"],
    description: "Browser pixel plus server-side CAPI with event deduplication and catalog sync.",
    settingsSchema: { pixelId: text("Pixel ID", { pattern: "^[0-9]{10,20}$" }), accessToken: secret("CAPI access token"), catalogSync: bool("Sync product catalog nightly") },
    aiTools: [{ name: "connect_meta", description: "Connect the Meta pixel and CAPI", input: { pixelId: "string", accessToken: "string" } }],
    storefront: { components: [{ id: "MetaPixelProvider", slot: "rootProviders", propsFromConfig: ["pixelId"] }, { id: "MetaPdpEvent", slot: "pdpAnalytics", propsFromContext: ["productId", "price", "currency"] }], scripts: [] },
    capabilities: [{ id: "meta", type: "analytics_pixel" }, { id: "meta_catalog", type: "marketing_sync" }], disableInPreview: true,
  }),
  definePlugin({
    id: "tiktok-ads", name: "TikTok Ads", category: "Marketing & Email", icon: "🎵",
    description: "TikTok pixel + Events API with dedup.",
    settingsSchema: { pixelCode: text("Pixel code"), accessToken: secret("Events API token") },
    aiTools: [{ name: "connect_tiktok", description: "Connect TikTok pixel and Events API", input: { pixelCode: "string", accessToken: "string" } }],
    storefront: { components: [{ id: "TikTokPixelProvider", slot: "rootProviders", propsFromConfig: ["pixelCode"] }], scripts: [] },
    capabilities: [{ id: "tiktok", type: "analytics_pixel" }], disableInPreview: true,
  }),
  definePlugin({
    id: "klaviyo", name: "Klaviyo", category: "Marketing & Email", icon: "💌", planGated: true, allowedPlanSlugs: ["starter", "scale", "enterprise"],
    description: "Outbox-backed sync of profiles, orders and cart events into Klaviyo.",
    settingsSchema: { privateKey: secret("Private API key", "^pk_"), listId: text("Default list ID", { required: false }) },
    aiTools: [{ name: "connect_klaviyo", description: "Connect Klaviyo with a private API key", input: { privateKey: "string" } }],
    capabilities: [{ id: "klaviyo", type: "marketing_sync" }],
  }),
  definePlugin({
    id: "mailchimp", name: "Mailchimp", category: "Marketing & Email", icon: "🐵",
    description: "Audience sync for customers who accept marketing.",
    settingsSchema: { apiKey: secret("API key"), audienceId: text("Audience ID") },
    aiTools: [{ name: "connect_mailchimp", description: "Connect Mailchimp", input: { apiKey: "string", audienceId: "string" } }],
    capabilities: [{ id: "mailchimp", type: "marketing_sync" }],
  }),
  definePlugin({
    id: "shippo", name: "Shippo", category: "Shipping & Fulfillment", icon: "📦", regions: ["US"], featured: true,
    description: "Buy discounted labels inside the order page; tracking webhooks flow back automatically.",
    settingsSchema: { apiToken: secret("API token", "^shippo_"), defaultParcel: { type: "select", label: "Default parcel", options: [{ value: "small", label: "Small box" }, { value: "medium", label: "Medium box" }, { value: "large", label: "Large box" }], default: "medium" } },
    aiTools: [{ name: "connect_shippo", description: "Connect Shippo with an API token", input: { apiToken: "string" } }, { name: "disconnect_shippo", description: "Disconnect Shippo", input: {} }],
    capabilities: [{ id: "shippo_shippo", type: "fulfillment_provider" }],
  }),
  definePlugin({
    id: "shipstation", name: "ShipStation", category: "Shipping & Fulfillment", icon: "🚚", regions: ["US"],
    description: "Push orders to ShipStation; shipments and tracking sync back.",
    settingsSchema: { apiKey: secret("API key"), apiSecret: secret("API secret") },
    aiTools: [{ name: "connect_shipstation", description: "Connect ShipStation", input: { apiKey: "string", apiSecret: "string" } }],
    capabilities: [{ id: "shipstation", type: "fulfillment_provider" }],
  }),
  definePlugin({
    id: "shipbob", name: "ShipBob", category: "Shipping & Fulfillment", icon: "🏭", regions: ["US"],
    description: "3PL fulfilment: orders push on payment, inventory syncs hourly.",
    settingsSchema: { token: secret("Personal access token") },
    aiTools: [{ name: "connect_shipbob", description: "Connect ShipBob", input: { token: "string" } }],
    capabilities: [{ id: "shipbob", type: "fulfillment_provider" }],
  }),
  definePlugin({
    id: "skydropx", name: "Skydropx", category: "Shipping & Fulfillment", icon: "🇲🇽", regions: ["MX"],
    description: "Mexican carriers (Estafeta, DHL, FedEx) with label purchase in admin.",
    settingsSchema: { apiKey: secret("API key") },
    aiTools: [{ name: "connect_skydropx", description: "Connect Skydropx", input: { apiKey: "string" } }],
    capabilities: [{ id: "skydropx", type: "fulfillment_provider" }],
  }),
  definePlugin({
    id: "shiprocket", name: "Shiprocket", category: "Shipping & Fulfillment", icon: "🚀", regions: ["IN"],
    description: "India's largest aggregator; COD support and NDR management.",
    settingsSchema: { email: text("Account email"), password: secret("Password") },
    aiTools: [{ name: "connect_shiprocket", description: "Connect Shiprocket", input: { email: "string", password: "string" } }],
    capabilities: [{ id: "shiprocket", type: "fulfillment_provider" }],
  }),
  definePlugin({
    id: "royal-mail", name: "Royal Mail Click & Drop", category: "Shipping & Fulfillment", icon: "👑", regions: ["GB"],
    description: "UK label printing and tracking.",
    settingsSchema: { apiKey: secret("API key") },
    aiTools: [{ name: "connect_royal_mail", description: "Connect Royal Mail", input: { apiKey: "string" } }],
    capabilities: [{ id: "royal_mail", type: "fulfillment_provider" }],
  }),
  definePlugin({
    id: "razorpay", name: "Razorpay", category: "Payments", icon: "💳", regions: ["IN"],
    description: "UPI, cards, netbanking and wallets for Indian merchants.",
    settingsSchema: { keyId: text("Key ID", { pattern: "^rzp_" }), keySecret: secret("Key secret") },
    aiTools: [{ name: "connect_razorpay", description: "Connect Razorpay", input: { keyId: "string", keySecret: "string" } }],
    storefront: { components: [{ id: "razorpay", placement: "payment_registry" }], scripts: [] },
    capabilities: [{ id: "razorpay", type: "payment_provider" }],
  }),
  definePlugin({
    id: "mollie", name: "Mollie", category: "Payments", icon: "🇪🇺", regions: ["EU"],
    description: "iDEAL, Bancontact, SEPA and cards for European merchants.",
    settingsSchema: { apiKey: secret("API key", "^(live|test)_") },
    aiTools: [{ name: "connect_mollie", description: "Connect Mollie", input: { apiKey: "string" } }],
    storefront: { components: [{ id: "mollie", placement: "payment_registry" }], scripts: [] },
    capabilities: [{ id: "mollie", type: "payment_provider" }],
  }),
  definePlugin({
    id: "adyen", name: "Adyen", category: "Payments", icon: "🏦", regions: [],
    description: "Global acquiring with local methods via Adyen Drop-in.",
    settingsSchema: { apiKey: secret("API key"), merchantAccount: text("Merchant account"), clientKey: text("Client key") },
    aiTools: [{ name: "connect_adyen", description: "Connect Adyen", input: { apiKey: "string", merchantAccount: "string", clientKey: "string" } }],
    storefront: { components: [{ id: "adyen", placement: "payment_registry" }], scripts: [] },
    capabilities: [{ id: "adyen", type: "payment_provider" }],
  }),
  definePlugin({
    id: "paystack", name: "Paystack", category: "Payments", icon: "🇳🇬", regions: ["NG", "GH", "ZA", "KE"],
    description: "Cards, bank transfer and mobile money across Africa.",
    settingsSchema: { secretKey: secret("Secret key", "^sk_") },
    aiTools: [{ name: "connect_paystack", description: "Connect Paystack", input: { secretKey: "string" } }],
    storefront: { components: [{ id: "paystack", placement: "payment_registry" }], scripts: [] },
    capabilities: [{ id: "paystack", type: "payment_provider" }],
  }),
  definePlugin({
    id: "google-shopping", name: "Google Merchant Center", category: "Sales Channels", icon: "🛍️",
    description: "Product feed generation and Merchant Center sync.",
    settingsSchema: { merchantId: text("Merchant ID", { pattern: "^[0-9]+$" }) },
    aiTools: [{ name: "connect_google_merchant", description: "Connect Google Merchant Center", input: { merchantId: "string" } }],
    capabilities: [{ id: "google_shopping", type: "sales_channel" }],
  }),
  definePlugin({
    id: "google-ads", name: "Google Ads", category: "Marketing & Email", icon: "🎯",
    description: "Conversion tag with enhanced conversions.",
    settingsSchema: { conversionId: text("Conversion ID", { pattern: "^AW-[0-9]+$", placeholder: "AW-123456789" }), conversionLabel: text("Conversion label") },
    aiTools: [{ name: "connect_google_ads", description: "Connect Google Ads conversion tracking", input: { conversionId: "string", conversionLabel: "string" } }],
    storefront: { components: [{ id: "GoogleAdsTag", slot: "rootProviders", propsFromConfig: ["conversionId", "conversionLabel"] }], scripts: [] },
    capabilities: [{ id: "google_ads", type: "analytics_pixel" }], disableInPreview: true,
  }),
  definePlugin({
    id: "facebook-shop", name: "Facebook & Instagram Shop", category: "Sales Channels", icon: "🛒",
    description: "Catalog sync so products are shoppable on Instagram and Facebook.",
    settingsSchema: { catalogId: text("Catalog ID"), accessToken: secret("Access token") },
    aiTools: [{ name: "connect_facebook_instagram_shop", description: "Connect the Facebook/Instagram catalog", input: { catalogId: "string", accessToken: "string" } }],
    capabilities: [{ id: "fb_shop", type: "sales_channel" }],
  }),
  definePlugin({
    id: "tidio", name: "Tidio", category: "Customer Support", icon: "💬",
    description: "Live chat widget on the storefront.",
    settingsSchema: { publicKey: text("Public key") },
    aiTools: [{ name: "connect_tidio", description: "Add Tidio live chat", input: { publicKey: "string" } }],
    storefront: { components: [], scripts: [{ src: "https://code.tidio.co/{{publicKey}}.js", position: "bodyEnd" }] },
    capabilities: [{ id: "tidio", type: "support" }], disableInPreview: true,
  }),
  definePlugin({
    id: "sevdesk", name: "sevDesk", category: "Accounting & Tax", icon: "🧾", regions: ["DE", "AT", "CH"],
    description: "Invoices and bookings pushed to sevDesk per paid order.",
    settingsSchema: { apiToken: secret("API token") },
    aiTools: [{ name: "connect_sevdesk", description: "Connect sevDesk", input: { apiToken: "string" } }],
    capabilities: [{ id: "sevdesk", type: "accounting" }],
  }),
  definePlugin({
    id: "goaffpro", name: "GoAffPro Affiliates", category: "Loyalty", icon: "🤝",
    description: "Affiliate tracking and commission sync.",
    settingsSchema: { accessToken: secret("Access token") },
    aiTools: [{ name: "connect_goaffpro", description: "Connect GoAffPro", input: { accessToken: "string" } }],
    storefront: { components: [], scripts: [{ src: "https://api.goaffpro.com/loader.js?shop={{storeSlug}}", position: "bodyEnd" }] },
    capabilities: [{ id: "goaffpro", type: "affiliates" }], disableInPreview: true,
  }),
  definePlugin({
    id: "printful", name: "Printful", category: "Dropshipping", icon: "👕",
    description: "Print-on-demand: products sync in, orders push out.",
    settingsSchema: { apiKey: secret("API key") },
    aiTools: [{ name: "connect_printful", description: "Connect Printful", input: { apiKey: "string" } }],
    capabilities: [{ id: "printful", type: "dropshipping" }],
  }),
  definePlugin({
    id: "cj-dropshipping", name: "CJ Dropshipping", category: "Dropshipping", icon: "🌏",
    description: "Import CJ products with variants and route orders for fulfilment.",
    settingsSchema: { apiKey: secret("API key") },
    aiTools: [{ name: "connect_cj", description: "Connect CJ Dropshipping", input: { apiKey: "string" } }, { name: "import_cj_product", description: "Import a CJ product by URL or id", input: { source: "string" } }],
    capabilities: [{ id: "cj", type: "dropshipping" }],
  }),
];

const THIRD_PARTY_SEED: [string, string, string?][] = [
  ["UPS", "Shipping & Fulfillment"], ["FedEx", "Shipping & Fulfillment"], ["DHL Express", "Shipping & Fulfillment"], ["USPS", "Shipping & Fulfillment"], ["EasyPost", "Shipping & Fulfillment"], ["Sendcloud", "Shipping & Fulfillment", "EU"], ["Packlink", "Shipping & Fulfillment", "EU"], ["Deliverr", "Shipping & Fulfillment", "US"], ["Flexport", "Shipping & Fulfillment"], ["Evri", "Shipping & Fulfillment", "GB"], ["Delhivery", "Shipping & Fulfillment", "IN"], ["Blue Dart", "Shipping & Fulfillment", "IN"], ["Estafeta", "Shipping & Fulfillment", "MX"], ["Giao Hàng Nhanh", "Shipping & Fulfillment", "VN"], ["Yurtiçi Kargo", "Shipping & Fulfillment", "TR"],
  ["QuickBooks", "Accounting & Tax"], ["Xero", "Accounting & Tax"], ["TaxJar", "Accounting & Tax"], ["Avalara", "Accounting & Tax"], ["Lexoffice", "Accounting & Tax", "DE"],
  ["Gorgias", "Customer Support"], ["Zendesk", "Customer Support"], ["Intercom", "Customer Support"], ["Crisp", "Customer Support"],
  ["Smile.io", "Loyalty"], ["LoyaltyLion", "Loyalty"], ["Yotpo Loyalty", "Loyalty"],
  ["Recharge", "Subscriptions"], ["Skio", "Subscriptions"], ["Bold Subscriptions", "Subscriptions"],
  ["Postscript", "SMS"], ["Attentive", "Sms"], ["Twilio", "SMS"],
  ["Amazon", "Sales Channels"], ["eBay", "Sales Channels"], ["Etsy", "Sales Channels"], ["Walmart Marketplace", "Sales Channels"],
  ["PayPal", "Payments"], ["Klarna", "Payments"], ["Afterpay", "Payments"], ["Affirm", "Payments"],
  ["Semrush", "SEO"], ["Ahrefs", "SEO"], ["Yoast", "SEO"],
  ["Signifyd", "Fraud"], ["Riskified", "Fraud"], ["NoFraud", "Fraud"],
  ["Weglot", "Translation"], ["Langify", "Translation"],
  ["Trustpilot", "Brand & Reputation"], ["Judge.me", "Brand & Reputation"], ["Okendo", "Brand & Reputation"],
  ["Hotjar", "Analytics"], ["Mixpanel", "Analytics"], ["Triple Whale", "Analytics"], ["Northbeam", "Analytics"],
  ["Cin7", "Inventory & Ops"], ["Linnworks", "Inventory & Ops"], ["Stocky", "Inventory & Ops"],
];

export const THIRD_PARTY: PluginManifest[] = THIRD_PARTY_SEED.map(([name, category, region]) =>
  definePlugin({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name, category: category === "Sms" ? "SMS" : category, source: "third-party", installable: false, icon: "🔗",
    regions: region ? [region] : [],
    description: `${name} — directory listing. Ask the assistant to request a native integration.`,
    website: `https://www.google.com/search?q=${encodeURIComponent(name)}`,
  }),
);

export const CATALOG: PluginManifest[] = [...FIRST_PARTY, ...THIRD_PARTY];
export const pluginById = (id: string) => CATALOG.find((p) => p.id === id);
export function catalogCategories() {
  const counts = new Map<string, number>();
  for (const p of CATALOG) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count }));
}
