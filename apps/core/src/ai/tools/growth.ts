import { tool } from "./define.js";
import { z } from "zod";
import type { AppDeps } from "../../context.js";
import { summary, funnel, topProducts, realtime } from "../../services/analytics.js";
import { draftCampaign, listCampaigns } from "../../services/campaigns.js";
import { updateTemplate, listTemplates, sendTemplated } from "../../services/emails.js";
import { createArticle, createBlog, listBlogs } from "../../services/blog.js";
import { listReviews, moderate, regenerateSummary, reviewOverview } from "../../services/reviews.js";
import { scanSeoIssues, addRedirect, upsertKeyword } from "../../services/seo.js";
import { updateKnowledgeCard, trackPrompt, checkPrompts, KnowledgeCardInput } from "../../services/geo.js";
import { createExperiment, setStatus, generateVariants, listExperiments } from "../../services/experiments.js";
import { createWorkflow, WorkflowInput } from "../../services/workflows.js";
import { findProductByTitle } from "../../services/products.js";
import { getEnvironment } from "../../services/theme.js";
import { recordActivity } from "../../services/todos.js";
import { formatMoney } from "@kiln/shared";
import { dayRange } from "../../lib/http.js";

const d = (ctx: { deps: AppDeps }) => ctx.deps;

export const growthTools = [
  tool({
    name: "get_analytics_summary", area: "analytics", description: "KPIs with deltas (sessions, sales, orders, CVR, AOV), funnel vs industry benchmarks and top products for 24h | 7d | 30d | 90d.",
    input: z.object({ range: z.enum(["24h", "7d", "30d", "90d"]).default("7d") }),
    handler: async (input, ctx) => {
      const days = dayRange(input.range);
      const [s, f, t, r] = await Promise.all([summary(d(ctx), ctx.storeId, days), funnel(d(ctx), ctx.storeId, days), topProducts(d(ctx), ctx.storeId, days), realtime(d(ctx), ctx.storeId)]);
      return { range: input.range, kpis: { sessions: s.kpis.sessions, totalSales: { value: formatMoney(s.kpis.totalSalesCents.value), delta: s.kpis.totalSalesCents.delta }, orders: s.kpis.orders, conversionRate: { value: `${s.kpis.conversionRate.value}%`, delta: s.kpis.conversionRate.delta }, aov: { value: formatMoney(s.kpis.aovCents.value), delta: s.kpis.aovCents.delta } }, funnel: f.map((x) => ({ step: x.label, sessions: x.sessions, rate: `${x.rate}%`, dropOff: `${x.dropOff}%`, benchmarkMedian: x.benchmark ? `${x.benchmark.median}%` : undefined })), topProducts: t.map((p) => ({ title: p.title, units: p.units, revenue: formatMoney(p.revenueCents) })), visitorsNow: r.visitorsNow };
    },
  }),
  tool({
    name: "draft_campaign", area: "emails", credits: 3, description: "Draft a newsletter/campaign from a brief using live products; returns 3 subject candidates. Saved as a draft under Emails.",
    input: z.object({ brief: z.string() }),
    handler: async (input, ctx) => {
      const c = await draftCampaign(d(ctx), ctx.storeId, input.brief);
      await recordActivity(d(ctx), ctx.storeId, "emails", "done", `Drafted campaign "${c.name}"`, ctx.runId);
      return { id: c.id, subjects: c.subjectVariants, adminUrl: `/emails/campaigns/${c.id}` };
    },
  }),
  tool({ name: "list_campaigns", area: "emails", description: "List campaigns and their stats.", input: z.object({}), handler: async (_i, ctx) => (await listCampaigns(d(ctx), ctx.storeId)).map((c) => ({ id: c.id, name: c.name, status: c.status, subject: c.subject, stats: c.stats })) }),
  tool({
    name: "update_email_template", area: "emails", description: "Edit a transactional template's subject/html (Handlebars), enable/disable, or change its delay. Keys: order_confirmation, order_shipped, order_delivered, order_cancelled, refund_issued, welcome, password_reset, abandoned_cart, review_request, payment_failed.",
    input: z.object({ key: z.string(), subject: z.string().optional(), html: z.string().optional(), enabled: z.boolean().optional(), delayMinutes: z.number().int().optional() }),
    handler: async ({ key, ...patch }, ctx) => {
      const t = await updateTemplate(d(ctx), ctx.storeId, key, patch);
      return { key: t.key, subject: t.subject, enabled: t.enabled, adminUrl: `/emails/templates/${key}` };
    },
  }),
  tool({ name: "list_email_templates", area: "emails", description: "List the transactional templates and whether they've been customised.", input: z.object({}), handler: async (_i, ctx) => (await listTemplates(d(ctx), ctx.storeId)).map((t) => ({ key: t.key, name: t.name, trigger: t.trigger, subject: t.subject, enabled: t.enabled, customized: t.customized })) }),
  tool({ name: "send_test_email", area: "emails", description: "Send a template to an address with sample data.", input: z.object({ key: z.string(), to: z.string().email() }), handler: async (input, ctx) => sendTemplated(d(ctx), ctx.storeId, input.key, input.to, { customer: { firstName: "Test" }, order: { number: 1, currency: "USD", items: [], subtotalCents: 0, discountCents: 0, shippingCents: 0, taxCents: 0, totalCents: 0, shippingAddress: {} }, firstItemTitle: "your order" }) }),
  tool({
    name: "create_article", area: "blog", credits: 3, description: "Write and (optionally) publish a blog article. If body is omitted, a 400-word article is drafted from the title in the brand voice.",
    input: z.object({ title: z.string(), body: z.string().optional(), tags: z.array(z.string()).optional(), status: z.enum(["draft", "published"]).default("published"), blogId: z.string().optional() }),
    handler: async (input, ctx) => {
      const { getStore } = await import("../../services/stores.js");
      const store = await getStore(d(ctx), ctx.storeId);
      const body = input.body ?? `<p>${input.title}. At ${store.brand.name}, we write these notes for the people who care how things are made.</p><p>${store.brand.description}</p><h2>What we changed</h2><p>Small decisions compound. This month we tightened the details you don't see — materials, tolerances, the way things ship — because that's where longevity lives.</p><h2>What's next</h2><p>More of the same, done a little better. If you've got questions, reply to any email; a person reads every one.</p><p><em>— The ${store.brand.name} workshop</em></p>`;
      const a = await createArticle(d(ctx), ctx.storeId, { ...input, body });
      await recordActivity(d(ctx), ctx.storeId, "blog", "done", `Published "${a.title}"`, ctx.runId);
      return { id: a.id, handle: a.handle, status: a.status, url: `/blog/${a.handle}` };
    },
  }),
  tool({ name: "create_blog", area: "blog", description: "Create a new blog.", input: z.object({ title: z.string() }), handler: async (input, ctx) => createBlog(d(ctx), ctx.storeId, input.title) }),
  tool({ name: "list_blogs", area: "blog", description: "List blogs and article counts.", input: z.object({}), handler: async (_i, ctx) => listBlogs(d(ctx), ctx.storeId) }),
  tool({
    name: "list_reviews", area: "reviews", description: "List reviews (status: pending | approved | rejected | all) with fake-review flags.",
    input: z.object({ status: z.string().default("pending"), productId: z.string().optional(), limit: z.number().int().max(50).default(20) }),
    handler: async (input, ctx) => {
      const r = await listReviews(d(ctx), ctx.storeId, { page: 1, pageSize: input.limit, status: input.status, productId: input.productId });
      const o = await reviewOverview(d(ctx), ctx.storeId);
      return { overview: o, items: r.items.map((x) => ({ id: x.id, product: x.product?.title, rating: x.rating, author: x.authorName, body: x.body.slice(0, 200), status: x.status, verified: x.verified, flags: x.flags, fakeScore: x.fakeScore })) };
    },
  }),
  tool({ name: "moderate_review", area: "reviews", description: "approve | reject | restore | delete | reply to a review.", input: z.object({ reviewId: z.string(), action: z.enum(["approve", "reject", "restore", "delete", "reply"]), reply: z.string().optional() }), handler: async (input, ctx) => moderate(d(ctx), ctx.storeId, input.reviewId, input.action, input.reply) }),
  tool({ name: "regenerate_review_summary", area: "reviews", description: "Rebuild the AI summary bullets for a product's reviews.", input: z.object({ productId: z.string().optional(), productTitle: z.string().optional() }), handler: async (input, ctx) => { const id = input.productId ?? (await findProductByTitle(d(ctx), ctx.storeId, input.productTitle ?? ""))?.id; if (!id) throw new Error("Product not found"); return { bullets: await regenerateSummary(d(ctx), ctx.storeId, id) }; } }),
  tool({ name: "scan_seo", area: "seo", description: "Scan published products for SEO issues (alt text, meta, schema, thin copy).", input: z.object({}), handler: async (_i, ctx) => scanSeoIssues(d(ctx), ctx.storeId) }),
  tool({ name: "add_redirect", area: "seo", description: "Add a 301/302 redirect.", input: z.object({ fromPath: z.string(), toPath: z.string(), code: z.number().int().default(301) }), handler: async (input, ctx) => addRedirect(d(ctx), ctx.storeId, input.fromPath, input.toPath, input.code) }),
  tool({ name: "track_keyword", area: "seo", description: "Track a search keyword for a page.", input: z.object({ query: z.string(), page: z.string(), position: z.number().nullable().optional() }), handler: async (input, ctx) => upsertKeyword(d(ctx), ctx.storeId, input.query, input.page, input.position ?? null) }),
  tool({ name: "update_knowledge_card", area: "geo", description: "Update the GEO knowledge card (what ChatGPT/Claude/Perplexity/Gemini ingest): categories, differentiators, locations, founders, comparisons.", input: KnowledgeCardInput, handler: async (input, ctx) => updateKnowledgeCard(d(ctx), ctx.storeId, input) }),
  tool({ name: "track_geo_prompt", area: "geo", description: "Track a shopper prompt across answer engines and check placements now.", input: z.object({ prompt: z.string() }), handler: async (input, ctx) => { await trackPrompt(d(ctx), ctx.storeId, input.prompt); const rows = await checkPrompts(d(ctx), ctx.storeId); return rows.filter((r) => r.prompt === input.prompt).map((r) => ({ model: r.model, placement: r.placement, snippet: r.snippet })); } }),
  tool({
    name: "create_experiment", area: "experiments", credits: 3, description: "Create (and optionally start) an A/B test on a surface: headline | cta | image | pricing | bundle | free_ship | email_subject | send_time. Variants are generated if not provided.",
    input: z.object({ name: z.string().optional(), surface: z.enum(["headline", "cta", "image", "pricing", "bundle", "free_ship", "email_subject", "send_time"]), target: z.string().optional(), hypothesis: z.string().optional(), variants: z.array(z.object({ key: z.string(), label: z.string(), payload: z.record(z.string(), z.unknown()) })).optional(), start: z.boolean().default(false) }),
    handler: async (input, ctx) => {
      const env = await getEnvironment(d(ctx), ctx.storeId, "live");
      const hero = env.theme.sections.find((s) => s.type === "hero");
      const variants = input.variants ?? generateVariants(input.surface, hero?.settings ?? {});
      const e = await createExperiment(d(ctx), ctx.storeId, { name: input.name ?? `${input.surface} test${input.target ? ` · ${input.target}` : ""}`, surface: input.surface, target: input.target, hypothesis: input.hypothesis ?? `A ${input.surface} change lifts conversion.`, variants });
      if (input.start) await setStatus(d(ctx), ctx.storeId, e.id, "running");
      await recordActivity(d(ctx), ctx.storeId, "experiments", "done", `Experiment ${e.name} ${input.start ? "started" : "drafted"}`, ctx.runId);
      return { id: e.id, name: e.name, variants: variants.map((v) => ({ key: v.key, label: v.label })), status: input.start ? "running" : "draft", adminUrl: "/experiments" };
    },
  }),
  tool({ name: "set_experiment_status", area: "experiments", description: "Start, kill or promote an experiment.", input: z.object({ experimentId: z.string(), status: z.enum(["running", "killed", "promoted", "draft"]) }), handler: async (input, ctx) => setStatus(d(ctx), ctx.storeId, input.experimentId, input.status) }),
  tool({ name: "list_experiments", area: "experiments", description: "List experiments with Bayesian analysis.", input: z.object({}), handler: async (_i, ctx) => (await listExperiments(d(ctx), ctx.storeId)).map((e) => ({ id: e.id, name: e.name, surface: e.surface, status: e.status, winner: e.analysis.winner, probability: e.analysis.probability, lift: e.analysis.liftPercent, decision: e.analysis.decision })) }),
  tool({ name: "create_workflow", area: "settings", description: "Create an automation: when [trigger] if [conditions] then [actions: tag_order, send_email, webhook, notify, append_sheet].", input: WorkflowInput.extend({ description: z.string().optional() }), handler: async ({ description, ...input }, ctx) => { void description; return createWorkflow(d(ctx), ctx.storeId, input); } }),
];
