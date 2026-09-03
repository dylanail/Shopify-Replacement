import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { parseBody, sse } from "../lib/http.js";
import { requireUser, requireStore, type AuthVars } from "../lib/auth.js";
import { startRun, getRun, cancelRun, listSessions, listMessages, listRuns, PROMPT_LIBRARY } from "../ai/service.js";
import { registryForStore } from "../ai/tools/index.js";
import { MODELS } from "@kiln/agent";
import { credits } from "../services/billing.js";

export function aiRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: AuthVars }>();
  r.use("*", requireUser(deps), requireStore(deps));
  const sid = (c: { get: (k: "storeId") => string }) => c.get("storeId");

  r.post("/runs", async (c) => {
    const b = await parseBody(c, z.object({ input: z.string().min(1), images: z.array(z.string()).optional(), sessionId: z.string().optional(), pageContext: z.string().optional(), model: z.string().optional(), autonomyGrants: z.array(z.string()).optional() }));
    return c.json(await startRun(deps, { storeId: sid(c), actorId: c.get("userId"), ...b }), 202);
  });
  /** Resume a paused run (question / confirmation) by sending the merchant's answer as a new run in the same session with a grant. */
  r.post("/runs/:id/resume", async (c) => {
    const run = await getRun(deps, sid(c), c.req.param("id"));
    const b = await parseBody(c, z.object({ answer: z.string().default("Yes, go ahead."), confirm: z.boolean().default(false) }));
    const grants = b.confirm ? (run.steps as { kind: string; detail?: { toolCalls?: string[] } }[]).filter((s) => s.kind === "model").flatMap((s) => s.detail?.toolCalls ?? []) : [];
    return c.json(await startRun(deps, { storeId: sid(c), actorId: c.get("userId"), input: b.answer, sessionId: run.sessionId ?? undefined, pageContext: run.pageContext ?? undefined, autonomyGrants: grants }), 202);
  });
  r.get("/runs", async (c) => c.json({ items: await listRuns(deps, sid(c)) }));
  r.get("/runs/:id", async (c) => c.json(await getRun(deps, sid(c), c.req.param("id"))));
  r.post("/runs/:id/cancel", async (c) => c.json(await cancelRun(deps, sid(c), c.req.param("id"))));
  r.get("/runs/:id/events", (c) => {
    const runId = c.req.param("id");
    const storeId = sid(c);
    return sse(c, (send) => deps.bus.subscribe((e) => { if (e.storeId === storeId && e.channel === "agent" && (e.event as { runId?: string }).runId === runId) send(e.event.type, e.event); }));
  });
  r.get("/sessions", async (c) => c.json({ items: await listSessions(deps, sid(c)) }));
  r.get("/sessions/:id/messages", async (c) => c.json({ items: await listMessages(deps, sid(c), c.req.param("id"), c.req.query("before"), Number(c.req.query("limit") ?? 50)) }));
  r.get("/tools", async (c) => { const reg = await registryForStore(deps, sid(c)); return c.json({ count: reg.list().length, byArea: reg.byArea(), items: reg.list().map((t) => ({ name: t.name, description: t.description, area: t.area, risky: !!t.risky })) }); });
  r.get("/prompts", (c) => c.json({ items: PROMPT_LIBRARY }));
  r.get("/models", async (c) => c.json({ items: Object.entries(MODELS).map(([id, m]) => ({ id, ...m, available: id === "offline" || (m.provider === "anthropic" && !!deps.env.anthropicApiKey) || (m.provider === "openai" && !!deps.env.openaiApiKey) })), credits: await credits(deps, sid(c)) }));
  return r;
}
