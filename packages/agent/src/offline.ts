/**
 * Offline planner — a deterministic, rule-based stand-in for the LLM. It turns a merchant
 * sentence into concrete tool calls so every surface (chat, onboarding, designer) works in demo
 * mode and in tests without network access. The shape of its output matches the model provider.
 */
import type { ProviderTurn, ProviderMessage } from "./provider.js";

interface Rule {
  test: RegExp;
  plan: (m: RegExpMatchArray, input: string) => { tool: string; input: Record<string, unknown> }[] | null;
  say: string;
}

const money = (s: string) => Math.round(parseFloat(s.replace(/[^0-9.]/g, "")) * 100);
const clean = (s: string) => s.trim().replace(/^["'“]|["'”]$/g, "").replace(/[.!]$/, "");

const RULES: Rule[] = [
  {
    test: /(?:add|create|make)(?: a| the)? (?:new )?product(?: called| named)?\s+["“]?([^"”]+?)["”]?(?:\s+(?:for|at|priced at|price)\s+\$?([\d.]+))?(?:\s+(?:in|with) (?:sizes?|options?|variants?)\s+([^.]+))?\.?$/i,
    plan: (m) => [{ tool: "create_product", input: { title: clean(m[1]!), priceCents: m[2] ? money(m[2]) : 4900, options: m[3] ? [{ name: "Size", values: m[3].split(/,|\band\b|\//).map((v) => v.trim()).filter(Boolean) }] : [], status: "published", generateCopy: true } }],
    say: "Created the product, wrote the description and published it.",
  },
  {
    test: /(?:add|create|generate)\s+(\d+|three|five|ten)\s+(?:more |new |sample )?products?(?:\s+(?:for|about|of)\s+(.+))?/i,
    plan: (m) => [{ tool: "generate_products", input: { count: { three: 3, five: 5, ten: 10 }[m[1]!.toLowerCase()] ?? parseInt(m[1]!, 10), theme: m[2] ? clean(m[2]) : undefined } }],
    say: "Generated the products with copy, variants and images, and published them.",
  },
  {
    test: /(?:create|add|make)(?: a| an)? (?:discount|promo(?:tion)?|coupon)(?: code)?\s+(?:called |named |code )?["“]?([A-Z0-9_-]{3,})["”]?(?:\s+(?:for|worth|of|giving))?\s*(\d+)\s*(%|percent|dollars?|\$)?(?: off)?/i,
    plan: (m) => [{ tool: "create_promotion", input: { name: `${m[1]!.toUpperCase()} promotion`, code: m[1]!.toUpperCase(), type: !m[3] || m[3].includes("%") || m[3].includes("percent") ? "percentage" : "fixed", value: !m[3] || m[3].includes("%") || m[3].includes("percent") ? parseInt(m[2]!, 10) : parseInt(m[2]!, 10) * 100 } }],
    say: "The discount code is live.",
  },
  {
    test: /(\d+)\s*%\s*off\s+(?:code|coupon|discount)?\s*["“]?([A-Z0-9_-]{3,})["”]?/i,
    plan: (m) => [{ tool: "create_promotion", input: { name: `${m[2]!.toUpperCase()} promotion`, code: m[2]!.toUpperCase(), type: "percentage", value: parseInt(m[1]!, 10) } }],
    say: "The discount code is live.",
  },
  {
    test: /free shipping (?:over|above|on orders over|threshold)\s*\$?([\d.]+)/i,
    plan: (m) => [{ tool: "create_promotion", input: { name: `Free shipping over $${m[1]}`, kind: "automatic", type: "free_shipping", value: 0, minSubtotalCents: money(m[1]!) } }],
    say: "Free shipping now applies automatically above that threshold.",
  },
  {
    test: /(?:bundle|buy)\s+(\d+)\s+(?:and\s+)?(?:save|get)\s+(\d+)\s*%/i,
    plan: (m) => [{ tool: "create_promotion", input: { name: `Buy ${m[1]} save ${m[2]}%`, kind: "automatic", type: "bundle", value: parseInt(m[2]!, 10), minQuantity: parseInt(m[1]!, 10), bundle: { tiers: [{ quantity: parseInt(m[1]!, 10), percentOff: parseInt(m[2]!, 10) }] } } }],
    say: "Bundle pricing is live as an automatic promotion.",
  },
  {
    test: /(?:change|update|set|rewrite)(?: the)? (?:home ?page|hero)\s*(?:headline|title|heading)?\s*(?:to|:)\s*["“]?(.+?)["”]?$/i,
    plan: (m) => [{ tool: "update_theme_section", input: { sectionType: "hero", settings: { headline: clean(m[1]!) } } }],
    say: "Updated the homepage hero and queued a rebuild of the draft.",
  },
  {
    test: /(?:update|refresh|redesign|improve)(?: the)? home ?page/i,
    plan: () => [{ tool: "update_theme_section", input: { sectionType: "hero", settings: { refresh: true } } }, { tool: "build_storefront", input: { environment: "draft" } }],
    say: "Refreshed the homepage sections and rebuilt the draft. Preview it, then publish.",
  },
  {
    test: /(?:publish|go live|launch)(?: the)?(?: store| storefront| draft)?/i,
    plan: () => [{ tool: "publish_storefront", input: {} }],
    say: "Published. The live store now matches the draft.",
  },
  {
    test: /(?:install|add|connect|enable|set ?up)\s+(?:the\s+)?([a-z0-9 .+&-]+?)\s+(?:plugin|integration|app|pixel)/i,
    plan: (m) => [{ tool: "install_plugin", input: { pluginId: m[1]!.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") } }],
    say: "Installed and enabled the plugin. Open its settings to finish connecting it.",
  },
  {
    test: /(?:uninstall|remove|disable)\s+(?:the\s+)?([a-z0-9 .+&-]+?)\s+(?:plugin|integration|app)/i,
    plan: (m) => [{ tool: "uninstall_plugin", input: { pluginId: m[1]!.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") } }],
    say: "Removed the plugin from the store.",
  },
  {
    test: /(?:review|show|summari[sz]e|how (?:is|are)|what(?:'s| is| are))\s+(?:my |the |our )?(?:analytics|sales|numbers|performance|conversion|traffic|funnel)/i,
    plan: () => [{ tool: "get_analytics_summary", input: { range: "7d" } }],
    say: "Here's the last seven days.",
  },
  {
    test: /(?:refund)\s+(?:order\s*)?#?(\d+)(?:\s+\$?([\d.]+))?/i,
    plan: (m) => [{ tool: "refund_order", input: { orderNumber: parseInt(m[1]!, 10), amountCents: m[2] ? money(m[2]) : undefined, reason: "Requested via assistant" } }],
    say: "Refund issued and the customer has been emailed.",
  },
  {
    test: /(?:cancel)\s+(?:order\s*)?#?(\d+)/i,
    plan: (m) => [{ tool: "cancel_order", input: { orderNumber: parseInt(m[1]!, 10), reason: "Cancelled via assistant" } }],
    say: "Order cancelled.",
  },
  {
    test: /(?:fulfil|ship)\s+(?:order\s*)?#?(\d+)(?:\s+(?:with|via)\s+(?:tracking\s+)?([A-Z0-9]{6,}))?/i,
    plan: (m) => [{ tool: "fulfill_order", input: { orderNumber: parseInt(m[1]!, 10), trackingNumber: m[2] } }],
    say: "Marked as shipped and sent the shipping confirmation.",
  },
  {
    test: /(?:create|add|make)(?: a)? collection(?: called| named)?\s+["“]?([^"”]+?)["”]?(?:\s+(?:with|containing|for)\s+(.+))?$/i,
    plan: (m) => [{ tool: "create_collection", input: { title: clean(m[1]!), productQuery: m[2] ? clean(m[2]) : undefined } }],
    say: "Collection created and products assigned.",
  },
  {
    test: /(?:move|add|put)\s+["“]?(.+?)["”]?\s+(?:in|into|to)(?: the)? ["“]?(.+?)["”]? collection/i,
    plan: (m) => [{ tool: "manage_collection_products", input: { collectionTitle: clean(m[2]!), addProductTitles: [clean(m[1]!)] } }],
    say: "Done — the product is in that collection.",
  },
  {
    test: /(?:enhance|improve|clean ?up|fix)\s+(?:the\s+)?(?:product\s+)?(?:images?|photos?)(?:\s+(?:for|of|on)\s+(.+))?/i,
    plan: (m) => [{ tool: "enhance_image", input: { productTitle: m[1] ? clean(m[1]) : undefined, preset: "white_seamless" } }],
    say: "Rendered four enhanced lanes and attached the best to the product.",
  },
  {
    test: /(?:generate|make|create)\s+(?:a\s+)?(?:new\s+)?logo/i,
    plan: () => [{ tool: "generate_logo", input: {} }],
    say: "Generated a new wordmark and applied it to the theme.",
  },
  {
    test: /(?:write|draft|send)\s+(?:a\s+)?(?:newsletter|campaign|email)(?:\s+(?:about|for|on)\s+(.+))?/i,
    plan: (m) => [{ tool: "draft_campaign", input: { brief: m[1] ? clean(m[1]) : "What's new this month" } }],
    say: "Drafted the campaign with three subject-line candidates. Review it under Emails.",
  },
  {
    test: /(?:set ?up|connect|configure)\s+(?:payments?|stripe)/i,
    plan: () => [{ tool: "setup_payments_wizard", input: {} }],
    say: "Here's how to connect Stripe — two clicks and payouts go straight to your bank.",
  },
  {
    test: /(?:connect|add|set ?up)\s+(?:a\s+|my\s+)?(?:custom\s+)?domain(?:\s+([a-z0-9.-]+\.[a-z]{2,}))?/i,
    plan: (m) => [{ tool: "connect_domain", input: { hostname: m[1] ?? "" } }],
    say: "Domain added. Point the DNS records shown and Kiln will verify and issue SSL automatically.",
  },
  {
    test: /(?:set|change|update)\s+(?:the\s+)?price\s+(?:of|for)\s+["“]?(.+?)["”]?\s+to\s+\$?([\d.]+)/i,
    plan: (m) => [{ tool: "update_product", input: { title: clean(m[1]!), priceCents: money(m[2]!) } }],
    say: "Price updated across all variants.",
  },
  {
    test: /(?:a\/?b test|experiment|test)\s+(?:the\s+)?(headline|cta|button|price|pricing|image|hero)(?:\s+(?:on|for)\s+(.+))?/i,
    plan: (m) => [{ tool: "create_experiment", input: { surface: m[1]!.toLowerCase().includes("price") ? "pricing" : m[1]!.toLowerCase().includes("cta") || m[1]!.toLowerCase().includes("button") ? "cta" : m[1]!.toLowerCase().includes("image") || m[1]!.toLowerCase().includes("hero") ? "image" : "headline", target: m[2] ? clean(m[2]) : undefined } }],
    say: "Experiment drafted with two AI variants and a 50/50 split. Start it from Experiments.",
  },
  {
    test: /(?:write|create|publish)\s+(?:a\s+)?(?:blog\s+)?(?:post|article)(?:\s+(?:about|on)\s+(.+))?/i,
    plan: (m) => [{ tool: "create_article", input: { title: m[1] ? clean(m[1]) : "Notes from the workshop", status: "published" } }],
    say: "Article written and published to the blog.",
  },
  {
    test: /(?:list|show)\s+(?:pending\s+)?reviews/i,
    plan: () => [{ tool: "list_reviews", input: { status: "pending" } }],
    say: "Here are the reviews waiting for moderation.",
  },
  {
    test: /(?:summari[sz]e|recap)\s+(?:today'?s\s+|recent\s+|the\s+)?orders/i,
    plan: () => [{ tool: "list_orders", input: { limit: 10 } }],
    say: "Recent orders, summarised.",
  },
];

export function planOffline(input: string): { calls: { tool: string; input: Record<string, unknown> }[]; say: string } {
  const text = input.trim();
  for (const rule of RULES) {
    const m = text.match(rule.test);
    if (m) {
      const calls = rule.plan(m, text);
      if (calls) return { calls, say: rule.say };
    }
  }
  return {
    calls: [],
    say: "I can do that once I have a bit more detail. Try things like “add a product called Oxblood Wraps for $28”, “create discount code WELCOME10 for 10% off”, “change the homepage headline to …”, “install the GA4 plugin”, or “review analytics”.",
  };
}

/** Provider implementation backed by the offline planner. Single turn: plan → tools → summary. */
export function offlineProvider() {
  return {
    name: "offline" as const,
    async turn(messages: ProviderMessage[]): Promise<ProviderTurn> {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const lastToolResults = messages[messages.length - 1];
      if (lastToolResults && lastToolResults.role === "tool") {
        const failures = lastToolResults.results.filter((r) => !r.ok);
        const plan = planOffline(lastUser?.text ?? "");
        return { text: failures.length ? `Some steps failed: ${failures.map((f) => f.error).join("; ")}` : plan.say, toolCalls: [], stop: "end_turn" };
      }
      const plan = planOffline(lastUser?.text ?? "");
      if (plan.calls.length === 0) return { text: plan.say, toolCalls: [], stop: "end_turn" };
      return { text: "", toolCalls: plan.calls.map((c, i) => ({ id: `call_${i}`, name: c.tool, input: c.input })), stop: "tool_use" };
    },
  };
}
