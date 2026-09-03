import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { parseBody } from "../lib/http.js";
import { requireUser, requireStore, type AuthVars } from "../lib/auth.js";
import { catalogFor, listInstalled, installPlugin, uninstallPlugin, updatePluginSettings, setPluginEnabled } from "../services/plugins.js";
import { catalogCategories } from "@kiln/plugins";
import { listDomains, addDomain, verifyDomain, setPrimary, removeDomain } from "../services/domains.js";
import { listMembers, invite, updateMember, removeMember, PERMISSIONS } from "../services/team.js";
import { listPlans, getBilling, changePlan, credits, topUp, connectLink, completeConnect, paymentStatus } from "../services/billing.js";
import { getStore, updateStore } from "../services/stores.js";
import { contactSubmissions, exitIntentResponses, engravingTemplates, eq, desc } from "@kiln/db";
import { forbidden } from "../lib/errors.js";

export function settingsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: AuthVars }>();
  r.use("*", requireUser(deps), requireStore(deps));
  const sid = (c: { get: (k: "storeId") => string }) => c.get("storeId");
  const ownerOnly = (c: { get: (k: "role") => string }) => { if (c.get("role") !== "owner" && c.get("role") !== "admin") throw forbidden("Owner or admin only"); };

  r.get("/plugins", async (c) => c.json({ items: await catalogFor(deps, sid(c), { category: c.req.query("category"), search: c.req.query("q"), region: c.req.query("region") }), categories: catalogCategories(), installed: await listInstalled(deps, sid(c)) }));
  r.post("/plugins/:id/install", async (c) => c.json(await installPlugin(deps, sid(c), c.req.param("id"), (await parseBody(c, z.object({ settings: z.record(z.string(), z.unknown()).optional() }))).settings, c.get("userId")), 201));
  r.delete("/plugins/:id", async (c) => c.json(await uninstallPlugin(deps, sid(c), c.req.param("id"))));
  r.patch("/plugins/:id/settings", async (c) => c.json(await updatePluginSettings(deps, sid(c), c.req.param("id"), await parseBody(c, z.record(z.string(), z.unknown())))));
  r.patch("/plugins/:id/enabled", async (c) => c.json(await setPluginEnabled(deps, sid(c), c.req.param("id"), (await parseBody(c, z.object({ enabled: z.boolean() }))).enabled)));
  r.get("/plugins/contact-form/submissions", async (c) => c.json({ items: await deps.db.select().from(contactSubmissions).where(eq(contactSubmissions.storeId, sid(c))).orderBy(desc(contactSubmissions.createdAt)).limit(200) }));
  r.get("/plugins/exit-intent/responses", async (c) => { const items = await deps.db.select().from(exitIntentResponses).where(eq(exitIntentResponses.storeId, sid(c))).orderBy(desc(exitIntentResponses.createdAt)).limit(500); return c.json({ items, stats: { shown: items.length, captured: items.filter((i) => i.email).length, converted: items.filter((i) => i.converted).length } }); });
  r.get("/plugins/exit-intent/responses.csv", async (c) => { const items = await deps.db.select().from(exitIntentResponses).where(eq(exitIntentResponses.storeId, sid(c))); return c.text(["email,offer,converted,created_at", ...items.map((i) => `${i.email ?? ""},${JSON.stringify(i.offer)},${i.converted},${i.createdAt.toISOString()}`)].join("\n"), 200, { "Content-Type": "text/csv" }); });
  r.get("/plugins/engraving/templates", async (c) => c.json({ items: await deps.db.select().from(engravingTemplates).where(eq(engravingTemplates.storeId, sid(c))) }));
  r.post("/plugins/engraving/templates", async (c) => { const b = await parseBody(c, z.object({ name: z.string(), maxChars: z.number().int().default(20), feeCents: z.number().int().default(0), fonts: z.array(z.string()).default(["serif"]) })); const [row] = await deps.db.insert(engravingTemplates).values({ storeId: sid(c), ...b }).returning(); return c.json(row, 201); });

  r.get("/domains", async (c) => c.json({ items: await listDomains(deps, sid(c)), baseDomain: deps.env.storefrontBaseDomain }));
  r.post("/domains", async (c) => c.json(await addDomain(deps, sid(c), (await parseBody(c, z.object({ hostname: z.string() }))).hostname), 201));
  r.post("/domains/:id/verify", async (c) => c.json(await verifyDomain(deps, sid(c), c.req.param("id"), c.req.query("force") === "1")));
  r.post("/domains/:id/primary", async (c) => c.json(await setPrimary(deps, sid(c), c.req.param("id"))));
  r.delete("/domains/:id", async (c) => c.json(await removeDomain(deps, sid(c), c.req.param("id"))));

  r.get("/team", async (c) => c.json({ items: await listMembers(deps, sid(c)), permissions: PERMISSIONS }));
  r.post("/team/invite", async (c) => { ownerOnly(c); const b = await parseBody(c, z.object({ email: z.string().email(), role: z.enum(["admin", "member"]).default("member"), permissions: z.array(z.string()).optional() })); return c.json(await invite(deps, sid(c), b.email, b.role, b.permissions), 201); });
  r.patch("/team/:id", async (c) => { ownerOnly(c); return c.json(await updateMember(deps, sid(c), c.req.param("id"), await parseBody(c, z.object({ role: z.string().optional(), permissions: z.array(z.string()).optional() })))); });
  r.delete("/team/:id", async (c) => { ownerOnly(c); return c.json(await removeMember(deps, sid(c), c.req.param("id"))); });

  r.get("/billing", async (c) => { const s = await getStore(deps, sid(c)); return c.json({ ...(await getBilling(deps, s.orgId)), plans: listPlans(), credits: await credits(deps, sid(c)) }); });
  r.post("/billing/plan", async (c) => { ownerOnly(c); const s = await getStore(deps, sid(c)); const b = await parseBody(c, z.object({ planSlug: z.string(), interval: z.enum(["monthly", "yearly"]).default("monthly") })); return c.json(await changePlan(deps, s.orgId, b.planSlug, b.interval)); });
  r.post("/billing/credits/top-up", async (c) => { ownerOnly(c); return c.json(await topUp(deps, sid(c), (await parseBody(c, z.object({ credits: z.number().int().positive().max(100000) }))).credits)); });
  r.post("/autonomy", async (c) => { ownerOnly(c); const b = await parseBody(c, z.object({ grants: z.array(z.string()) })); return c.json(await updateStore(deps, sid(c), { settings: { autonomyGrants: b.grants } })); });

  r.get("/payments", async (c) => c.json(await paymentStatus(deps, sid(c))));
  r.post("/payments/stripe/connect", async (c) => c.json(await connectLink(deps, sid(c))));
  r.get("/payments/stripe/simulate", async (c) => { await completeConnect(deps, sid(c), `acct_sim_${sid(c).slice(-6)}`); return c.redirect(`${deps.env.adminUrl}/settings/payments?connected=1`); });
  r.post("/payments/stripe/simulate", async (c) => c.json(await completeConnect(deps, sid(c), `acct_sim_${sid(c).slice(-6)}`)));
  r.patch("/payments", async (c) => { const b = await parseBody(c, z.object({ captureMode: z.enum(["automatic", "manual"]).optional(), senderEmail: z.string().email().optional() })); return c.json(await updateStore(deps, sid(c), { settings: b })); });
  return r;
}
