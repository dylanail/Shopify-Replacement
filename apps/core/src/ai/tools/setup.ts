import { tool } from "./define.js";
import { z } from "zod";
import type { AppDeps } from "../../context.js";
import { connectLink, paymentStatus } from "../../services/billing.js";
import { addDomain, verifyDomain, listDomains } from "../../services/domains.js";
import { listShippingOptions, listRegions } from "../../services/shipping.js";
import { invite } from "../../services/team.js";
import { listTodos, setTodo, upsertTodo } from "../../services/todos.js";
import { importCsv } from "../../services/migration.js";
import { installPlugin, uninstallPlugin, updatePluginSettings, catalogFor, listInstalled } from "../../services/plugins.js";
import { formatMoney } from "@kiln/shared";

const d = (ctx: { deps: AppDeps }) => ctx.deps;

export const setupTools = [
  tool({
    name: "setup_payments_wizard", area: "settings", description: "Explain and start Stripe Connect onboarding (2 clicks). Returns the connect link and current account status.",
    input: z.object({}),
    handler: async (_i, ctx) => {
      const [link, status] = await Promise.all([connectLink(d(ctx), ctx.storeId), paymentStatus(d(ctx), ctx.storeId)]);
      await setTodo(d(ctx), ctx.storeId, "payments", status.chargesEnabled ? "done" : "in_progress");
      return { connectUrl: link.url, simulated: link.simulated, status, steps: ["Click Connect with Stripe", "Confirm your business details (KYC)", "Payouts land in your bank on a 2-day rolling schedule"], adminUrl: "/settings/payments" };
    },
  }),
  tool({
    name: "connect_domain", area: "settings", description: "Add a custom domain and return the DNS records to set. Verifies automatically once records propagate.",
    input: z.object({ hostname: z.string().optional() }),
    handler: async (input, ctx) => {
      if (!input.hostname) {
        const existing = await listDomains(d(ctx), ctx.storeId);
        return { domains: existing, next: "Tell me the domain you own (e.g. shop.example.com) and I'll add it.", adminUrl: "/settings/domains" };
      }
      const dom = await addDomain(d(ctx), ctx.storeId, input.hostname);
      await setTodo(d(ctx), ctx.storeId, "domain", "waiting");
      return { ...dom, adminUrl: "/settings/domains" };
    },
  }),
  tool({ name: "verify_domain", area: "settings", description: "Check DNS for a domain and activate it.", input: z.object({ domainId: z.string() }), handler: async (input, ctx) => { const r = await verifyDomain(d(ctx), ctx.storeId, input.domainId, true); if (r.verified) await setTodo(d(ctx), ctx.storeId, "domain", "done"); return r; } }),
  tool({
    name: "setup_shipping_wizard", area: "settings", description: "Show current regions and shipping rates with a guided explanation of the options.",
    input: z.object({}),
    handler: async (_i, ctx) => {
      const [rs, opts] = await Promise.all([listRegions(d(ctx), ctx.storeId), listShippingOptions(d(ctx), ctx.storeId)]);
      await setTodo(d(ctx), ctx.storeId, "shipping", "in_progress");
      return { regions: rs.map((r) => ({ id: r.id, name: r.name, currency: r.currency, countries: r.countries, freeShippingThreshold: r.freeShippingThresholdCents != null ? formatMoney(r.freeShippingThresholdCents, r.currency) : null })), rates: opts.map((o) => ({ id: o.id, name: o.name, type: o.type, amount: formatMoney(o.amountCents), enabled: o.enabled, estimate: o.estimate })), tour: ["Flat rates are simplest — one price per region.", "Free-above-threshold nudges AOV; set it ~20% above your current AOV.", "Weight/price tiers for heavy or mixed catalogs.", "Live rates (UPS/FedEx/DHL) arrive with the Advanced plan.", "Pickup and local delivery are per-location."], adminUrl: "/settings/shipping" };
    },
  }),
  tool({ name: "invite_team_member", area: "settings", description: "Invite a teammate by email as admin or member with per-area permissions.", input: z.object({ email: z.string().email(), role: z.enum(["admin", "member"]).default("member"), permissions: z.array(z.string()).optional() }), handler: async (input, ctx) => invite(d(ctx), ctx.storeId, input.email, input.role, input.permissions) }),
  tool({ name: "list_todos", area: "dashboard", description: "Read the onboarding/punch-list to-dos and their status.", input: z.object({}), handler: async (_i, ctx) => listTodos(d(ctx), ctx.storeId) }),
  tool({ name: "update_todo", area: "dashboard", description: "Set a to-do's status or add a new one.", input: z.object({ key: z.string(), title: z.string().optional(), status: z.enum(["todo", "in_progress", "waiting", "done"]).default("done") }), handler: async (input, ctx) => (input.title ? upsertTodo(d(ctx), ctx.storeId, { key: input.key, title: input.title, status: input.status }) : setTodo(d(ctx), ctx.storeId, input.key, input.status)) }),
  tool({
    name: "import_products_csv", area: "products", credits: 5, description: "Import products from a Shopify / WooCommerce / BigCommerce / Magento / Squarespace / generic CSV (paste the CSV text). dryRun previews the mapping.",
    input: z.object({ csv: z.string().min(10), source: z.enum(["shopify", "woocommerce", "bigcommerce", "magento", "squarespace", "csv"]).optional(), dryRun: z.boolean().default(false), oldBaseUrl: z.string().optional() }),
    handler: async (input, ctx) => {
      const r = await importCsv(d(ctx), ctx.storeId, input.csv, { source: input.source, dryRun: input.dryRun, oldBaseUrl: input.oldBaseUrl });
      if (!input.dryRun) await setTodo(d(ctx), ctx.storeId, "products", "done");
      return r;
    },
  }),
  tool({ name: "list_plugins", area: "plugins", description: "Search the plugin marketplace (category, text) and see what's installed.", input: z.object({ search: z.string().optional(), category: z.string().optional(), installedOnly: z.boolean().default(false) }), handler: async (input, ctx) => (input.installedOnly ? (await listInstalled(d(ctx), ctx.storeId)).map((p) => ({ id: p.pluginId, name: p.manifest?.name, enabled: p.enabled, settings: p.settings })) : (await catalogFor(d(ctx), ctx.storeId, { search: input.search, category: input.category })).slice(0, 40).map((p) => ({ id: p.id, name: p.name, category: p.category, installed: p.installed, installable: p.installable, available: p.available, description: p.description }))) }),
  tool({ name: "install_plugin", area: "plugins", description: "Install a first-party plugin by id (e.g. ga4, meta-ads, shippo, product-reviews, upsells, exit-intent).", input: z.object({ pluginId: z.string(), settings: z.record(z.string(), z.unknown()).optional() }), handler: async (input, ctx) => { const r = await installPlugin(d(ctx), ctx.storeId, input.pluginId, input.settings, "ai"); return { id: r.pluginId, name: r.manifest.name, needsSettings: Object.entries(r.manifest.settingsSchema).filter(([, f]) => f.required).map(([k]) => k), adminUrl: `/plugins/${r.pluginId}` }; } }),
  tool({ name: "uninstall_plugin", area: "plugins", description: "Uninstall a plugin and delete its credentials.", input: z.object({ pluginId: z.string() }), handler: async (input, ctx) => uninstallPlugin(d(ctx), ctx.storeId, input.pluginId) }),
  tool({ name: "configure_plugin", area: "plugins", description: "Set plugin settings/credentials (validated against the plugin's schema; secrets encrypted).", input: z.object({ pluginId: z.string(), settings: z.record(z.string(), z.unknown()) }), handler: async (input, ctx) => { const r = await updatePluginSettings(d(ctx), ctx.storeId, input.pluginId, input.settings); return { id: r.pluginId, settings: r.settings }; } }),
];
