import { Hono } from "hono";
import { z } from "zod";
import { eq, organizations } from "@kiln/db";
import { THEME_TEMPLATES, planBySlug } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { parseBody, sse } from "../lib/http.js";
import { requireUser, requireStore, type AuthVars } from "../lib/auth.js";
import { forbidden, badRequest } from "../lib/errors.js";
import { createStore, getStore, listStoresForUser, updateStore, storefrontUrl } from "../services/stores.js";
import { runOnboarding, scrapeSite } from "../ai/onboarding.js";
import { summary, timeseries } from "../services/analytics.js";
import { listTodos, setTodo, recentActivity, auditEntries } from "../services/todos.js";
import { publishState, getEnvironment, updateDraftTheme, upsertSection, removeSection, reorderSections, buildEnvironment, publish, rollback, applyTemplate, lintTheme } from "../services/theme.js";
import { credits } from "../services/billing.js";
import { productStats } from "../services/products.js";
import { orderStats } from "../services/orders.js";

export function storeRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: AuthVars }>();
  r.use("*", requireUser(deps));

  r.get("/", async (c) => c.json({ items: await listStoresForUser(deps, c.get("userId")) }));

  const ownsOrg = async (userId: string, orgId: string) => {
    const org = await deps.db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (!org || org.ownerUserId !== userId) throw forbidden("Not your organisation");
    return org;
  };

  r.post("/", async (c) => {
    const b = await parseBody(c, z.object({ orgId: z.string(), name: z.string().min(1), prompt: z.string().optional(), currency: z.string().optional(), country: z.string().optional(), template: z.string().optional() }));
    const org = await ownsOrg(c.get("userId"), b.orgId);
    const existing = await listStoresForUser(deps, c.get("userId"));
    const plan = planBySlug(org.planSlug);
    if (existing.filter((s) => s.orgId === org.id).length >= plan.maxStores) throw badRequest(`${plan.name} allows ${plan.maxStores} store(s). Upgrade to add more.`);
    const s = await createStore(deps, b);
    return c.json({ ...s, url: storefrontUrl(deps, s) }, 201);
  });

  /** One sentence → store. Streams step progress over SSE when Accept is text/event-stream; otherwise waits and returns the result. */
  r.post("/onboard", async (c) => {
    const b = await parseBody(c, z.object({ orgId: z.string(), prompt: z.string().min(4), referenceImages: z.array(z.string()).optional(), existingSiteUrl: z.string().url().optional(), country: z.string().optional(), currency: z.string().optional(), template: z.string().optional(), productCount: z.number().int().min(1).max(8).optional(), publish: z.boolean().optional() }));
    const org = await ownsOrg(c.get("userId"), b.orgId);
    const plan = planBySlug(org.planSlug);
    const existing = await listStoresForUser(deps, c.get("userId"));
    if (existing.filter((s) => s.orgId === org.id).length >= plan.maxStores) throw badRequest(`${plan.name} allows ${plan.maxStores} store(s). Upgrade to add more.`);
    let prompt = b.prompt;
    if (b.existingSiteUrl) {
      const site = await scrapeSite(b.existingSiteUrl);
      if (site.title) prompt += ` (existing brand: ${site.title}${site.description ? ` — ${site.description}` : ""}${site.colors.length ? `; colours ${site.colors.slice(0, 2).join(" ")}` : ""})`;
      b.referenceImages = [...(b.referenceImages ?? []), ...site.images.slice(0, 2)];
    }
    if (c.req.header("accept")?.includes("text/event-stream")) {
      return sse(c, (send) => {
        void runOnboarding(deps, { ...b, prompt, actorId: c.get("userId") }, (e) => send(e.type, e)).then((res) => send("onboarding.done", res));
        return () => {};
      });
    }
    return c.json(await runOnboarding(deps, { ...b, prompt, actorId: c.get("userId") }), 201);
  });

  r.get("/templates", (c) => c.json({ items: THEME_TEMPLATES }));

  const s = new Hono<{ Variables: AuthVars }>();
  s.use("*", requireStore(deps));
  s.get("/", async (c) => {
    const store = await getStore(deps, c.get("storeId"));
    return c.json({ ...store, url: storefrontUrl(deps, store), role: c.get("role"), publish: await publishState(deps, store.id), credits: await credits(deps, store.id) });
  });
  s.patch("/", async (c) => {
    const b = await parseBody(c, z.object({ name: z.string().min(1).optional(), brand: z.record(z.string(), z.unknown()).optional(), settings: z.record(z.string(), z.unknown()).optional(), aiModel: z.string().optional(), defaultCurrency: z.string().optional() }));
    return c.json(await updateStore(deps, c.get("storeId"), b as never));
  });
  s.get("/dashboard", async (c) => {
    const storeId = c.get("storeId");
    const days = Number(c.req.query("days") ?? 7);
    const [store, kpis, series, todos, activity, ps, os, pub] = await Promise.all([getStore(deps, storeId), summary(deps, storeId, days), timeseries(deps, storeId, days), listTodos(deps, storeId), recentActivity(deps, storeId, 20), productStats(deps, storeId), orderStats(deps, storeId), publishState(deps, storeId)]);
    const live = await getEnvironment(deps, storeId, "live");
    return c.json({ store: { id: store.id, name: store.name, slug: store.slug, status: store.status, brand: store.brand, url: storefrontUrl(deps, store) }, kpis: kpis.kpis, range: kpis.range, series, todos, activity, products: ps, orders: os, publish: pub, deployment: { version: live.version, publishedAt: live.publishedAt, buildStatus: live.buildStatus } });
  });
  s.get("/todos", async (c) => c.json({ items: await listTodos(deps, c.get("storeId")) }));
  s.patch("/todos/:key", async (c) => c.json(await setTodo(deps, c.get("storeId"), c.req.param("key"), (await parseBody(c, z.object({ status: z.enum(["todo", "in_progress", "waiting", "done"]) }))).status)));
  s.get("/activity", async (c) => c.json({ items: await recentActivity(deps, c.get("storeId")) }));
  s.get("/audit", async (c) => c.json({ items: await auditEntries(deps, c.get("storeId")) }));

  // Designer / environments
  s.get("/environments/:kind", async (c) => {
    const env = await getEnvironment(deps, c.get("storeId"), c.req.param("kind") as "draft" | "live");
    return c.json({ ...env, lint: lintTheme(env.theme) });
  });
  s.patch("/environments/draft/theme", async (c) => c.json(await updateDraftTheme(deps, c.get("storeId"), await parseBody(c, z.record(z.string(), z.unknown())) as never)));
  s.post("/environments/draft/sections", async (c) => {
    const b = await parseBody(c, z.object({ id: z.string().optional(), type: z.string(), settings: z.record(z.string(), z.unknown()).optional(), hidden: z.boolean().optional(), position: z.number().int().optional() }));
    return c.json(await upsertSection(deps, c.get("storeId"), b as never, b.position));
  });
  s.delete("/environments/draft/sections/:id", async (c) => c.json(await removeSection(deps, c.get("storeId"), c.req.param("id"))));
  s.post("/environments/draft/reorder", async (c) => c.json(await reorderSections(deps, c.get("storeId"), (await parseBody(c, z.object({ ids: z.array(z.string()) }))).ids)));
  s.post("/environments/draft/template", async (c) => c.json(await applyTemplate(deps, c.get("storeId"), (await parseBody(c, z.object({ template: z.string() }))).template)));
  s.post("/environments/:kind/build", async (c) => c.json(await buildEnvironment(deps, c.get("storeId"), c.req.param("kind") as "draft" | "live")));
  s.post("/publish", async (c) => c.json(await publish(deps, c.get("storeId"), c.get("userId"))));
  s.post("/rollback", async (c) => c.json(await rollback(deps, c.get("storeId"))));
  s.get("/publish-state", async (c) => c.json(await publishState(deps, c.get("storeId"))));

  /** Live event stream for a store: agent events, activity dots, build status, realtime analytics. */
  s.get("/events", (c) => {
    const storeId = c.get("storeId");
    return sse(c, (send) => deps.bus.subscribe((e) => { if (e.storeId === storeId) send(e.channel, e.event); }));
  });

  r.route("/:storeId", s);
  return r;
}
