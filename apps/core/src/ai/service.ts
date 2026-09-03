import { and, eq, desc, asc, agentRuns, chatSessions, chatMessages, stores } from "@kiln/db";
import { runAgent, anthropicProvider, offlineProvider, routeModel, type ProviderMessage, type RunState, type Provider } from "@kiln/agent";
import type { AgentEvent } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { registryForStore } from "./tools/index.js";
import { buildSystemPrompt } from "./system.js";
import { spendCredits, credits } from "../services/billing.js";
import { recordActivity } from "../services/todos.js";
import { notFound, badRequest } from "../lib/errors.js";

export function providerFor(deps: AppDeps, model: string): Provider {
  if (model === "offline" || !deps.env.anthropicApiKey) return offlineProvider();
  return anthropicProvider(deps.env.anthropicApiKey);
}

export async function ensureSession(deps: AppDeps, storeId: string, sessionId?: string, title?: string) {
  if (sessionId) {
    const s = await deps.db.query.chatSessions.findFirst({ where: and(eq(chatSessions.id, sessionId), eq(chatSessions.storeId, storeId)) });
    if (s) return s;
  }
  const [s] = await deps.db.insert(chatSessions).values({ storeId, title: title?.slice(0, 80) ?? "New conversation" }).returning();
  return s!;
}

export async function history(deps: AppDeps, sessionId: string, limit = 30): Promise<ProviderMessage[]> {
  const rows = await deps.db.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(desc(chatMessages.createdAt)).limit(limit);
  const msgs: ProviderMessage[] = [];
  for (const r of rows.reverse()) {
    const c = r.content as { text?: string; toolCalls?: { id: string; name: string; input: unknown }[]; results?: { id: string; ok: boolean; output: unknown; error?: string }[]; images?: string[] };
    if (r.role === "user") msgs.push({ role: "user", text: c.text ?? "", images: c.images });
    else if (r.role === "assistant") msgs.push({ role: "assistant", text: c.text ?? "", toolCalls: c.toolCalls ?? [] });
    else if (r.role === "tool") msgs.push({ role: "tool", results: c.results ?? [] });
  }
  // The transcript must start with a user turn and tool results must follow assistant tool calls.
  while (msgs.length && msgs[0]!.role !== "user") msgs.shift();
  return msgs;
}

export interface StartRunInput {
  storeId: string;
  input: string;
  images?: string[];
  sessionId?: string;
  pageContext?: string;
  actorId?: string;
  kind?: "chat" | "onboarding" | "build" | "cro";
  autonomyGrants?: string[];
  model?: string;
}

/**
 * Starts a durable run. The run row is created first (status queued) so the client can subscribe to
 * its events; execution happens on the next tick and every step is persisted to agent_runs.steps.
 */
export async function startRun(deps: AppDeps, o: StartRunInput) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, o.storeId) });
  if (!store) throw notFound("Store");
  const bal = await credits(deps, o.storeId);
  if (bal.balance <= 0) throw badRequest("Out of AI credits — top up or upgrade your plan.");
  const session = await ensureSession(deps, o.storeId, o.sessionId, o.input);
  const model = routeModel(o.kind === "build" ? "design" : "chat", o.model ?? store.aiModel, !!deps.env.anthropicApiKey);
  const [run] = await deps.db.insert(agentRuns).values({ storeId: o.storeId, sessionId: session.id, kind: o.kind ?? "chat", status: "queued", input: o.input, pageContext: o.pageContext ?? null, model }).returning();
  await deps.db.insert(chatMessages).values({ sessionId: session.id, storeId: o.storeId, role: "user", content: { text: o.input, images: o.images }, runId: run!.id, pageContext: o.pageContext ?? null });
  const events: AgentEvent[] = [];
  const emit = (e: AgentEvent) => {
    events.push(e);
    deps.bus.publish({ channel: "agent", storeId: o.storeId, event: e });
  };
  setTimeout(() => void execute(deps, run!.id, session.id, o, model, emit), 0);
  return { runId: run!.id, sessionId: session.id, model };
}

async function execute(deps: AppDeps, runId: string, sessionId: string, o: StartRunInput, model: string, emit: (e: AgentEvent) => void) {
  const grants = ((await deps.db.query.stores.findFirst({ where: eq(stores.id, o.storeId) }))?.settings.autonomyGrants as string[] | undefined) ?? [];
  await deps.db.update(agentRuns).set({ status: "running", startedAt: new Date() }).where(eq(agentRuns.id, runId));
  const registry = await registryForStore(deps, o.storeId);
  const system = await buildSystemPrompt(deps, o.storeId, o.pageContext);
  const prior = (await history(deps, sessionId)).slice(0, -1);
  const persisted = new Set<number>();
  const state = await runAgent<AppDeps>({
    runId, storeId: o.storeId, actorId: o.actorId, pageContext: o.pageContext, deps, provider: providerFor(deps, model), model, system, registry, history: prior, input: o.input, images: o.images,
    autonomyGrants: [...grants, ...(o.autonomyGrants ?? [])],
    onEvent: emit,
    isCancelled: async () => (await deps.db.query.agentRuns.findFirst({ where: eq(agentRuns.id, runId) }))?.status === "cancelled",
    persist: async (s: RunState) => {
      await deps.db.update(agentRuns).set({ status: s.status, steps: s.steps, todos: s.todos, result: s.summary ?? null, error: s.error ?? null, creditsUsed: s.creditsUsed }).where(eq(agentRuns.id, runId));
      // persist new transcript messages (skip the ones already written)
      const newMsgs = s.messages.slice(prior.length + 1);
      for (const [i, m] of newMsgs.entries()) {
        if (persisted.has(i)) continue;
        persisted.add(i);
        await deps.db.insert(chatMessages).values({ sessionId, storeId: o.storeId, role: m.role, content: m.role === "user" ? { text: m.text } : m.role === "assistant" ? { text: m.text, toolCalls: m.toolCalls } : { results: m.results }, runId });
      }
    },
  });
  await deps.db.update(agentRuns).set({ status: state.status, finishedAt: new Date(), creditsUsed: state.creditsUsed }).where(eq(agentRuns.id, runId));
  await spendCredits(deps, o.storeId, state.creditsUsed);
  await deps.db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
  if (state.status === "failed") await recordActivity(deps, o.storeId, "ai", "error", state.error ?? "Run failed", runId);
}

export async function getRun(deps: AppDeps, storeId: string, runId: string) {
  const r = await deps.db.query.agentRuns.findFirst({ where: and(eq(agentRuns.id, runId), eq(agentRuns.storeId, storeId)) });
  if (!r) throw notFound("Run");
  return r;
}
export async function cancelRun(deps: AppDeps, storeId: string, runId: string) {
  const [r] = await deps.db.update(agentRuns).set({ status: "cancelled" }).where(and(eq(agentRuns.id, runId), eq(agentRuns.storeId, storeId))).returning();
  if (!r) throw notFound("Run");
  deps.bus.publish({ channel: "agent", storeId, event: { type: "run.finished", runId, status: "cancelled" } });
  return r;
}
export async function listSessions(deps: AppDeps, storeId: string) {
  return deps.db.select().from(chatSessions).where(eq(chatSessions.storeId, storeId)).orderBy(desc(chatSessions.updatedAt)).limit(50);
}
export async function listMessages(deps: AppDeps, storeId: string, sessionId: string, before?: string, limit = 50) {
  const rows = await deps.db.select().from(chatMessages).where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.storeId, storeId), before ? desc(chatMessages.id) && eq(chatMessages.id, before) : undefined)).orderBy(asc(chatMessages.createdAt)).limit(limit);
  return rows;
}
export async function listRuns(deps: AppDeps, storeId: string, limit = 20) {
  return deps.db.select().from(agentRuns).where(eq(agentRuns.storeId, storeId)).orderBy(desc(agentRuns.createdAt)).limit(limit);
}

/** The curated prompt library shown in the empty AI panel. */
export const PROMPT_LIBRARY = [
  { area: "products", title: "Add a new product", prompt: "Add a product called {title} for ${price} with sizes S, M, L" },
  { area: "products", title: "Generate three products", prompt: "Generate three more products that fit my catalog" },
  { area: "products", title: "Enhance product images", prompt: "Enhance the images for my best-selling product in the lifestyle preset" },
  { area: "products", title: "Import from Shopify", prompt: "I'll paste my Shopify CSV — import it and tidy up the copy" },
  { area: "designer", title: "Update homepage", prompt: "Update the homepage hero headline to something more specific to what we make" },
  { area: "designer", title: "Add a trust strip", prompt: "Add a trust strip under the hero with free shipping, returns, and secure checkout" },
  { area: "designer", title: "Publish store", prompt: "Publish the store" },
  { area: "promotions", title: "Create a discount", prompt: "Create discount code WELCOME10 for 10% off first orders" },
  { area: "promotions", title: "Free shipping threshold", prompt: "Free shipping over $150" },
  { area: "promotions", title: "Bundle & save", prompt: "Buy 3 and save 15% across the catalog" },
  { area: "promotions", title: "BOGO", prompt: "Create a buy 2 get 1 free promotion on wraps" },
  { area: "collections", title: "Organise by season", prompt: "Create a Summer Essentials collection with anything lightweight" },
  { area: "analytics", title: "Review analytics", prompt: "Review analytics for the last 7 days and tell me what to fix" },
  { area: "analytics", title: "Top products", prompt: "What are my top products this month?" },
  { area: "orders", title: "Summarise orders", prompt: "Summarise today's orders" },
  { area: "orders", title: "Fulfil an order", prompt: "Fulfil order #1001 with tracking 1Z999AA10123456784" },
  { area: "orders", title: "Refund", prompt: "Refund order #1001 $25 for a damaged item" },
  { area: "customers", title: "Find VIPs", prompt: "Show my VIP customers" },
  { area: "emails", title: "Draft a newsletter", prompt: "Write a newsletter about our new arrivals" },
  { area: "emails", title: "Warmer order email", prompt: "Rewrite the order confirmation email in a warmer tone" },
  { area: "reviews", title: "Moderate reviews", prompt: "Show pending reviews and flag anything that looks fake" },
  { area: "seo", title: "SEO scan", prompt: "Scan my products for SEO issues" },
  { area: "geo", title: "Knowledge card", prompt: "Update my knowledge card so ChatGPT recommends us for hand-stitched gloves" },
  { area: "experiments", title: "Test the headline", prompt: "A/B test the homepage headline" },
  { area: "experiments", title: "Test pricing", prompt: "Test pricing ±5% on my hero product" },
  { area: "blog", title: "Write an article", prompt: "Write a blog post about how we make things" },
  { area: "plugins", title: "Install GA4", prompt: "Install the GA4 plugin" },
  { area: "plugins", title: "Connect Shippo", prompt: "Connect Shippo with my API token" },
  { area: "settings", title: "Set up payments", prompt: "Set up payments" },
  { area: "settings", title: "Connect domain", prompt: "Connect my domain shop.example.com" },
  { area: "settings", title: "Add a region", prompt: "Add a United Kingdom region in GBP" },
];
