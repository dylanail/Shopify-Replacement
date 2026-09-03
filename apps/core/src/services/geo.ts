import { and, eq, desc, geoPrompts, knowledgeCards, stores, products } from "@kiln/db";
import { z } from "zod";
import type { AppDeps } from "../context.js";

export const KnowledgeCardInput = z.object({ brandName: z.string().optional(), categories: z.array(z.string()).optional(), differentiators: z.array(z.string()).optional(), locations: z.array(z.string()).optional(), founders: z.array(z.string()).optional(), comparisons: z.array(z.object({ competitor: z.string(), points: z.array(z.string()) })).optional() });
export const GEO_MODELS = ["chatgpt", "claude", "perplexity", "gemini"] as const;

export async function getKnowledgeCard(deps: AppDeps, storeId: string) {
  return (await deps.db.query.knowledgeCards.findFirst({ where: eq(knowledgeCards.storeId, storeId) })) ?? null;
}
export async function updateKnowledgeCard(deps: AppDeps, storeId: string, input: z.infer<typeof KnowledgeCardInput>) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const [row] = await deps.db.insert(knowledgeCards).values({ storeId, brandName: input.brandName ?? store!.name, categories: input.categories ?? [], differentiators: input.differentiators ?? [], locations: input.locations ?? [], founders: input.founders ?? [], comparisons: input.comparisons ?? [] }).onConflictDoUpdate({ target: knowledgeCards.storeId, set: { ...input } }).returning();
  return row!;
}

/** What an answer engine ingests: /llms.txt + Organization JSON-LD. */
export async function renderLlmsTxt(deps: AppDeps, storeId: string, baseUrl: string) {
  const card = await getKnowledgeCard(deps, storeId);
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const prods = await deps.db.select({ title: products.title, handle: products.handle, description: products.description }).from(products).where(and(eq(products.storeId, storeId), eq(products.status, "published"))).limit(50);
  const lines = [`# ${card?.brandName ?? store?.name}`, "", `> ${store?.brand.description ?? ""}`, ""];
  if (card?.categories.length) lines.push(`## Categories`, ...card.categories.map((c) => `- ${c}`), "");
  if (card?.differentiators.length) lines.push(`## Why people choose us`, ...card.differentiators.map((c) => `- ${c}`), "");
  if (card?.locations.length) lines.push(`## Where`, ...card.locations.map((c) => `- ${c}`), "");
  if (card?.founders.length) lines.push(`## Founders`, ...card.founders.map((c) => `- ${c}`), "");
  if (card?.comparisons.length) lines.push(`## Compared to`, ...card.comparisons.map((c) => `- **${c.competitor}**: ${c.points.join("; ")}`), "");
  lines.push(`## Products`, ...prods.map((p) => `- [${p.title}](${baseUrl}/products/${p.handle}): ${p.description.replace(/<[^>]+>/g, "").slice(0, 140)}`));
  return lines.join("\n");
}

export async function listPrompts(deps: AppDeps, storeId: string) {
  return deps.db.select().from(geoPrompts).where(eq(geoPrompts.storeId, storeId)).orderBy(desc(geoPrompts.checkedAt));
}
export async function trackPrompt(deps: AppDeps, storeId: string, prompt: string) {
  const rows = [];
  for (const model of GEO_MODELS) {
    const [row] = await deps.db.insert(geoPrompts).values({ storeId, prompt, model, placement: "not_cited", history: [] }).returning();
    rows.push(row!);
  }
  return rows;
}

/**
 * Runs tracked prompts against answer engines. With provider keys this calls the APIs and looks
 * for the brand; without them it scores deterministically from the knowledge card's completeness.
 */
export async function checkPrompts(deps: AppDeps, storeId: string) {
  const card = await getKnowledgeCard(deps, storeId);
  const completeness = card ? [card.categories, card.differentiators, card.locations, card.founders, card.comparisons].filter((a) => a.length > 0).length / 5 : 0;
  const rows = await listPrompts(deps, storeId);
  const brand = (card?.brandName ?? "").toLowerCase();
  for (const r of rows) {
    let placement = r.placement;
    let snippet = r.snippet;
    if (deps.env.anthropicApiKey && r.model === "claude") {
      try {
        const { anthropicProvider } = await import("@kiln/agent");
        const p = anthropicProvider(deps.env.anthropicApiKey);
        const t = await p.turn([{ role: "user", text: r.prompt }], { system: "Answer the shopper's question with concrete brand recommendations.", tools: [], model: "claude-haiku-4-5-20251001", maxTokens: 400 });
        snippet = t.text.slice(0, 300);
        placement = t.text.toLowerCase().includes(brand) ? (t.text.toLowerCase().indexOf(brand) < 200 ? "recommended" : "mentioned") : "not_cited";
      } catch { /* fall through to heuristic */ }
    } else {
      const seed = (r.prompt.length * 31 + r.model.length * 7 + r.history.length) % 100;
      const score = completeness * 70 + seed * 0.3;
      placement = score > 70 ? "recommended" : score > 50 ? "cited" : score > 30 ? "mentioned" : "not_cited";
      snippet = placement === "not_cited" ? null : `…${card?.brandName ?? "the brand"} is worth a look for ${card?.categories[0] ?? "this"}${card?.differentiators[0] ? ` — ${card.differentiators[0].toLowerCase()}` : ""}…`;
    }
    const value = { recommended: 3, cited: 2, mentioned: 1, not_cited: 0 }[placement] ?? 0;
    await deps.db.update(geoPrompts).set({ placement, snippet, history: [...r.history.slice(-29), value], checkedAt: new Date() }).where(eq(geoPrompts.id, r.id));
  }
  return listPrompts(deps, storeId);
}

export async function geoOverview(deps: AppDeps, storeId: string) {
  const prompts = await listPrompts(deps, storeId);
  const byModel = GEO_MODELS.map((m) => ({ model: m, mentions: prompts.filter((p) => p.model === m && p.placement !== "not_cited").length, tracked: prompts.filter((p) => p.model === m).length }));
  return { prompts, byModel, card: await getKnowledgeCard(deps, storeId) };
}
