import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { parseBody, parseQuery, Pagination, dayRange } from "../lib/http.js";
import { requireUser, requireStore, type AuthVars } from "../lib/auth.js";
import { summary, timeseries, funnel, realtime, topProducts, cohorts, INDUSTRY_BENCHMARKS } from "../services/analytics.js";
import { listReviews, moderate, reviewOverview, regenerateSummary, listQuestions, answerQuestion, productReviewStats } from "../services/reviews.js";
import { listTemplates, updateTemplate, previewTemplate, sendLog, sendTemplated } from "../services/emails.js";
import { draftCampaign, listCampaigns, updateCampaign, sendCampaign, deleteCampaign, CampaignInput } from "../services/campaigns.js";
import { flows, and, eq } from "@kiln/db";
import { listBlogs, createBlog, listArticles, createArticle, updateArticle, deleteArticle, ArticleInput } from "../services/blog.js";
import { seoOverview, scanSeoIssues, upsertKeyword, addRedirect, validateSchema } from "../services/seo.js";
import { geoOverview, updateKnowledgeCard, trackPrompt, checkPrompts, KnowledgeCardInput, renderLlmsTxt } from "../services/geo.js";
import { listExperiments, createExperiment, setStatus, deleteExperiment, generateVariants, ExperimentInput } from "../services/experiments.js";
import { listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, WorkflowInput } from "../services/workflows.js";
import { getProduct } from "../services/products.js";
import { getStore, storefrontUrl } from "../services/stores.js";
import { getEnvironment } from "../services/theme.js";

export function growthRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: AuthVars }>();
  r.use("*", requireUser(deps), requireStore(deps));
  const sid = (c: { get: (k: "storeId") => string }) => c.get("storeId");

  r.get("/analytics/summary", async (c) => c.json(await summary(deps, sid(c), dayRange(c.req.query("range") ?? "7d"))));
  r.get("/analytics/timeseries", async (c) => c.json({ items: await timeseries(deps, sid(c), dayRange(c.req.query("range") ?? "30d")) }));
  r.get("/analytics/funnel", async (c) => c.json({ steps: await funnel(deps, sid(c), dayRange(c.req.query("range") ?? "7d")), benchmarks: INDUSTRY_BENCHMARKS }));
  r.get("/analytics/realtime", async (c) => c.json(await realtime(deps, sid(c))));
  r.get("/analytics/top-products", async (c) => c.json({ items: await topProducts(deps, sid(c), dayRange(c.req.query("range") ?? "30d")) }));
  r.get("/analytics/cohorts", async (c) => c.json({ items: await cohorts(deps, sid(c)) }));

  r.get("/reviews", async (c) => c.json({ ...(await listReviews(deps, sid(c), parseQuery(c, Pagination.extend({ productId: z.string().optional(), rating: z.string().optional(), withPhoto: z.string().optional(), verified: z.string().optional() })))), overview: await reviewOverview(deps, sid(c)) }));
  r.post("/reviews/:id/:action", async (c) => c.json(await moderate(deps, sid(c), c.req.param("id"), c.req.param("action") as never, (await parseBody(c, z.object({ reply: z.string().optional() }))).reply)));
  r.post("/reviews/summary/:productId", async (c) => c.json({ bullets: await regenerateSummary(deps, sid(c), c.req.param("productId")) }));
  r.get("/reviews/stats/:productId", async (c) => c.json(await productReviewStats(deps, sid(c), c.req.param("productId"))));
  r.get("/questions", async (c) => c.json({ items: await listQuestions(deps, sid(c), c.req.query("productId")) }));
  r.post("/questions/:id/answer", async (c) => c.json(await answerQuestion(deps, sid(c), c.req.param("id"), (await parseBody(c, z.object({ answer: z.string().min(1) }))).answer)));

  r.get("/emails/templates", async (c) => c.json({ items: await listTemplates(deps, sid(c)) }));
  r.patch("/emails/templates/:key", async (c) => c.json(await updateTemplate(deps, sid(c), c.req.param("key"), await parseBody(c, z.object({ subject: z.string().optional(), html: z.string().optional(), enabled: z.boolean().optional(), delayMinutes: z.number().int().optional() })))));
  r.post("/emails/templates/:key/preview", async (c) => c.json(await previewTemplate(deps, sid(c), c.req.param("key"), await parseBody(c, z.object({ subject: z.string().optional(), html: z.string().optional() })))));
  r.post("/emails/templates/:key/test", async (c) => c.json(await sendTemplated(deps, sid(c), c.req.param("key"), (await parseBody(c, z.object({ to: z.string().email() }))).to, { customer: { firstName: "Test" }, order: { number: 1, currency: "USD", items: [], subtotalCents: 0, discountCents: 0, shippingCents: 0, taxCents: 0, totalCents: 0, shippingAddress: {} }, firstItemTitle: "your order" })));
  r.get("/emails/log", async (c) => c.json(await sendLog(deps, sid(c))));
  r.get("/emails/flows", async (c) => c.json({ items: await deps.db.select().from(flows).where(eq(flows.storeId, sid(c))) }));
  r.patch("/emails/flows/:key", async (c) => { const b = await parseBody(c, z.object({ enabled: z.boolean().optional(), steps: z.array(z.object({ delayHours: z.number(), templateKey: z.string(), subject: z.string() })).optional() })); const [row] = await deps.db.update(flows).set(b).where(and(eq(flows.storeId, sid(c)), eq(flows.key, c.req.param("key")))).returning(); return c.json(row); });
  r.get("/emails/campaigns", async (c) => c.json({ items: await listCampaigns(deps, sid(c)) }));
  r.post("/emails/campaigns/draft", async (c) => c.json(await draftCampaign(deps, sid(c), (await parseBody(c, z.object({ brief: z.string().min(2) }))).brief), 201));
  r.patch("/emails/campaigns/:id", async (c) => c.json(await updateCampaign(deps, sid(c), c.req.param("id"), await parseBody(c, CampaignInput.partial()))));
  r.post("/emails/campaigns/:id/send", async (c) => c.json(await sendCampaign(deps, sid(c), c.req.param("id"))));
  r.delete("/emails/campaigns/:id", async (c) => c.json(await deleteCampaign(deps, sid(c), c.req.param("id"))));

  r.get("/blogs", async (c) => c.json({ items: await listBlogs(deps, sid(c)) }));
  r.post("/blogs", async (c) => c.json(await createBlog(deps, sid(c), (await parseBody(c, z.object({ title: z.string().min(1) }))).title), 201));
  r.get("/articles", async (c) => c.json({ items: await listArticles(deps, sid(c), { blogId: c.req.query("blogId") }) }));
  r.post("/articles", async (c) => c.json(await createArticle(deps, sid(c), await parseBody(c, ArticleInput)), 201));
  r.patch("/articles/:id", async (c) => c.json(await updateArticle(deps, sid(c), c.req.param("id"), await parseBody(c, ArticleInput.partial()))));
  r.delete("/articles/:id", async (c) => c.json(await deleteArticle(deps, sid(c), c.req.param("id"))));

  r.get("/seo", async (c) => c.json(await seoOverview(deps, sid(c))));
  r.post("/seo/scan", async (c) => c.json(await scanSeoIssues(deps, sid(c))));
  r.post("/seo/keywords", async (c) => { const b = await parseBody(c, z.object({ query: z.string(), page: z.string(), position: z.number().nullable().optional() })); return c.json(await upsertKeyword(deps, sid(c), b.query, b.page, b.position ?? null), 201); });
  r.post("/seo/redirects", async (c) => { const b = await parseBody(c, z.object({ fromPath: z.string(), toPath: z.string(), code: z.number().int().default(301) })); return c.json(await addRedirect(deps, sid(c), b.fromPath, b.toPath, b.code), 201); });
  r.post("/seo/redirects/bulk", async (c) => { const b = await parseBody(c, z.object({ items: z.array(z.object({ fromPath: z.string(), toPath: z.string() })) })); for (const it of b.items) await addRedirect(deps, sid(c), it.fromPath, it.toPath); return c.json({ imported: b.items.length }); });
  r.get("/seo/validate/:productId", async (c) => { const p = await getProduct(deps, sid(c), c.req.param("productId")); return c.json({ product: p.title, ...validateSchema(p.seo.jsonLd), jsonLd: p.seo.jsonLd }); });

  r.get("/geo", async (c) => c.json(await geoOverview(deps, sid(c))));
  r.put("/geo/knowledge-card", async (c) => c.json(await updateKnowledgeCard(deps, sid(c), await parseBody(c, KnowledgeCardInput))));
  r.post("/geo/prompts", async (c) => c.json(await trackPrompt(deps, sid(c), (await parseBody(c, z.object({ prompt: z.string().min(3) }))).prompt), 201));
  r.post("/geo/check", async (c) => c.json({ items: await checkPrompts(deps, sid(c)) }));
  r.get("/geo/preview", async (c) => { const s = await getStore(deps, sid(c)); return c.text(await renderLlmsTxt(deps, sid(c), storefrontUrl(deps, s))); });

  r.get("/experiments", async (c) => c.json({ items: await listExperiments(deps, sid(c)) }));
  r.post("/experiments", async (c) => c.json(await createExperiment(deps, sid(c), await parseBody(c, ExperimentInput)), 201));
  r.post("/experiments/suggest", async (c) => { const b = await parseBody(c, z.object({ surface: z.string() })); const env = await getEnvironment(deps, sid(c), "live"); const hero = env.theme.sections.find((s) => s.type === "hero"); return c.json({ variants: generateVariants(b.surface, hero?.settings ?? {}) }); });
  r.post("/experiments/:id/:status", async (c) => c.json(await setStatus(deps, sid(c), c.req.param("id"), c.req.param("status") as never)));
  r.delete("/experiments/:id", async (c) => c.json(await deleteExperiment(deps, sid(c), c.req.param("id"))));

  r.get("/workflows", async (c) => c.json({ items: await listWorkflows(deps, sid(c)) }));
  r.post("/workflows", async (c) => c.json(await createWorkflow(deps, sid(c), await parseBody(c, WorkflowInput)), 201));
  r.patch("/workflows/:id", async (c) => c.json(await updateWorkflow(deps, sid(c), c.req.param("id"), await parseBody(c, WorkflowInput.partial()))));
  r.delete("/workflows/:id", async (c) => c.json(await deleteWorkflow(deps, sid(c), c.req.param("id"))));
  return r;
}
