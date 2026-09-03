/**
 * "One sentence → live store". Runs the parallel onboarding branches with visible progress:
 *   naming → brand kit → products (hero + complements) → collections → promotions → build.
 * Crash-safe: every branch writes its result to the store/todos before the next starts; re-running
 * a step is idempotent, so a restarted worker can resume from the persisted checkpoint.
 */
import { eq, agentRuns, stores } from "@kiln/db";
import type { AgentEvent } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { createStore, updateStore, storefrontUrl } from "../services/stores.js";
import { createProduct } from "../services/products.js";
import { createCollection } from "../services/collections.js";
import { createPromotion } from "../services/promotions.js";
import { updateDraftTheme, upsertSection, buildEnvironment, publish } from "../services/theme.js";
import { installPlugin } from "../services/plugins.js";
import { recordActivity, setTodo, upsertTodo } from "../services/todos.js";
import { updateKnowledgeCard } from "../services/geo.js";
import { generateBrandName, generatePalette, generateSlogan, generateBrandDescription, generateProducts, generateCollections, generatePromotions, detectCategory } from "./generators.js";
import { generateLanes } from "./images.js";
import { anthropicProvider } from "@kiln/agent";

export interface OnboardingInput {
  orgId: string;
  prompt: string;
  referenceImages?: string[];
  existingSiteUrl?: string;
  country?: string;
  currency?: string;
  template?: string;
  productCount?: number;
  publish?: boolean;
  actorId?: string;
}

export interface OnboardingStep {
  key: string;
  title: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

const STEPS: OnboardingStep[] = [
  { key: "name", title: "Naming the brand", status: "pending" },
  { key: "brand", title: "Building the brand kit", status: "pending" },
  { key: "products", title: "Creating three products", status: "pending" },
  { key: "collections", title: "Organising collections", status: "pending" },
  { key: "promotions", title: "Setting up promotions", status: "pending" },
  { key: "storefront", title: "Building the storefront", status: "pending" },
];

/** Optional model pass: refine the deterministic brand kit when a key is configured. */
async function refineWithModel(deps: AppDeps, prompt: string, draft: { name: string; slogan: string; description: string }) {
  if (!deps.env.anthropicApiKey) return draft;
  try {
    const p = anthropicProvider(deps.env.anthropicApiKey);
    const t = await p.turn([{ role: "user", text: `Merchant brief: "${prompt}". Draft brand: ${JSON.stringify(draft)}. Return JSON {name, slogan, description} — name short and brandable (no "Shop"/"Online"), slogan ≤ 8 words, description 2 sentences in a specific voice.` }], { system: "You are a brand strategist. Reply with JSON only.", tools: [], model: "claude-sonnet-5", maxTokens: 300 });
    const m = t.text.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]) as Partial<typeof draft>;
      return { name: j.name || draft.name, slogan: j.slogan || draft.slogan, description: j.description || draft.description };
    }
  } catch { /* deterministic draft stands */ }
  return draft;
}

export async function runOnboarding(deps: AppDeps, input: OnboardingInput, onEvent?: (e: AgentEvent | { type: "onboarding.step"; runId: string; steps: OnboardingStep[]; storeId?: string; previewUrl?: string }) => void) {
  const steps = STEPS.map((s) => ({ ...s }));
  const prompt = input.prompt.trim();
  const cat = detectCategory(prompt);
  const draft = { name: generateBrandName(prompt), slogan: "", description: "" };
  draft.slogan = generateSlogan(prompt, draft.name);
  draft.description = generateBrandDescription(prompt, draft.name);
  const palette = generatePalette(prompt);
  // Step 1: create the store immediately so the preview URL exists as early as possible.
  const store = await createStore(deps, { orgId: input.orgId, name: draft.name, prompt, brand: { ...palette, slogan: draft.slogan, description: draft.description, announcement: `${draft.slogan} · Free shipping over $${(generatePromotions(draft, prompt)[1]!.minSubtotalCents ?? 0) / 100}` }, currency: input.currency, country: input.country, referenceImages: input.referenceImages, template: input.template });
  const storeId = store.id;
  const [run] = await deps.db.insert(agentRuns).values({ storeId, kind: "onboarding", status: "running", input: prompt, model: deps.env.anthropicApiKey ? "claude-sonnet-5" : "offline", startedAt: new Date() }).returning();
  const runId = run!.id;
  const previewUrl = storefrontUrl(deps, store);
  const emitSteps = async () => {
    await deps.db.update(agentRuns).set({ todos: steps.map((s) => ({ title: s.title, status: s.status })), steps: steps as unknown[] }).where(eq(agentRuns.id, runId));
    onEvent?.({ type: "onboarding.step", runId, steps: steps.map((s) => ({ ...s })), storeId, previewUrl });
    deps.bus.publish({ channel: "agent", storeId, event: { type: "todo.updated", runId, todos: steps.map((s) => ({ title: s.title, status: s.status })) } });
  };
  const set = async (key: string, status: OnboardingStep["status"], detail?: string) => {
    const s = steps.find((x) => x.key === key)!;
    s.status = status;
    if (detail) s.detail = detail;
    await recordActivity(deps, storeId, key === "products" ? "products" : key === "promotions" ? "promotions" : key === "collections" ? "collections" : "designer", status === "error" ? "error" : status === "done" ? "done" : "running", `${s.title}${detail ? ` — ${detail}` : ""}`, runId);
    await emitSteps();
  };
  const wrap = async <T>(key: string, fn: () => Promise<T>, detail: (r: T) => string) => {
    await set(key, "running");
    try {
      const r = await fn();
      await set(key, "done", detail(r));
      return r;
    } catch (err) {
      await set(key, "error", err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  try {
    onEvent?.({ type: "run.started", runId });
    // naming (+ optional model refinement)
    const refined = await wrap("name", () => refineWithModel(deps, prompt, draft), (r) => r.name);
    if (refined.name !== store.name) await updateStore(deps, storeId, { name: refined.name, brand: { name: refined.name, slogan: refined.slogan, description: refined.description } });
    // brand kit + products + promotions run in parallel branches
    const brandBranch = wrap("brand", async () => {
      const logoUrl = `${deps.env.publicCoreUrl}/api/v1/public/stores/${store.slug}/logo.svg`;
      const heroImageUrl = `${deps.env.publicCoreUrl}/api/v1/public/stores/${store.slug}/hero.svg`;
      const s = await updateStore(deps, storeId, { brand: { logoUrl, heroImageUrl } });
      await updateDraftTheme(deps, storeId, { brand: s.brand }, "ai");
      await upsertSection(deps, storeId, { type: "hero", settings: { headline: s.brand.slogan, subheadline: s.brand.description, imageUrl: heroImageUrl, ctaLabel: "Shop the collection", ctaHref: "/collections/all" } });
      await updateKnowledgeCard(deps, storeId, { brandName: s.brand.name, categories: [cat.key === "generic" ? "goods" : cat.key], differentiators: cat.descriptors.slice(0, 3) });
      return s.brand;
    }, (b) => `${b.primaryColor} · ${b.displayFont}`);
    const productsBranch = wrap("products", async () => {
      const gen = generateProducts(prompt, { name: refined.name }, input.productCount ?? 3);
      const created = [];
      for (const g of gen) {
        const lanes = await generateLanes(deps.env, { title: g.title, brief: g.imagePrompt, preset: "white_seamless", primary: palette.primaryColor ?? "#111", secondary: palette.secondaryColor ?? "#888", wordmark: refined.name, lanes: 2, referenceImage: input.referenceImages?.[0] });
        const p = await createProduct(deps, storeId, { title: g.title, subtitle: g.subtitle, description: g.description, priceCents: g.priceCents, compareAtCents: g.compareAtCents, options: g.options, tags: g.tags, productType: g.productType, status: "published", inventoryQty: 25, media: lanes.map((l, i) => ({ url: l.url, alt: `${g.title} — ${refined.name}`, kind: "image" as const, sort: i, generated: true, preset: l.preset })) }, "ai");
        created.push(p);
        await recordActivity(deps, storeId, "products", "done", `Created ${p.title}`, runId);
      }
      return created;
    }, (r) => r.map((p) => p.title).join(", "));
    const promosBranch = wrap("promotions", async () => {
      const out = [];
      for (const p of generatePromotions({ name: refined.name }, prompt)) out.push(await createPromotion(deps, storeId, p));
      return out;
    }, (r) => r.map((p) => p.code ?? p.name).join(", "));
    const [, created] = await Promise.all([brandBranch, productsBranch, promosBranch]);
    await wrap("collections", async () => {
      const cols = [];
      for (const c of generateCollections(prompt)) {
        const ids = created.filter((p) => p.tags.some((t) => c.tags.includes(t))).map((p) => p.id);
        cols.push(await createCollection(deps, storeId, { title: c.title, productIds: ids.length ? ids : created.map((p) => p.id) }));
      }
      cols.push(await createCollection(deps, storeId, { title: "All", handle: "all", productIds: created.map((p) => p.id) }));
      return cols;
    }, (r) => r.map((c) => c.title).join(", "));
    await wrap("storefront", async () => {
      await installPlugin(deps, storeId, "product-reviews", {}, "ai");
      await installPlugin(deps, storeId, "upsells", {}, "ai");
      const b = await buildEnvironment(deps, storeId, "draft", { fast: true });
      if (input.publish !== false) await publish(deps, storeId, "ai");
      return b;
    }, () => (input.publish !== false ? "live" : "draft ready"));
    await setTodo(deps, storeId, "brand", "done");
    await setTodo(deps, storeId, "publish", input.publish !== false ? "done" : "todo");
    await upsertTodo(deps, storeId, { key: "products", title: "Swap the sample catalog for your own products", description: "Three sample products are live. Replace them by chat, CSV import, or the product editor.", href: "/products", prompt: "Help me replace the sample products with my own", sort: 1 });
    await updateStore(deps, storeId, { onboardingStep: "done" });
    await deps.db.update(agentRuns).set({ status: "completed", finishedAt: new Date(), result: `Store ${refined.name} is ${input.publish !== false ? "live" : "ready"} at ${previewUrl}` }).where(eq(agentRuns.id, runId));
    onEvent?.({ type: "run.finished", runId, status: "completed", summary: `${refined.name} is ready` });
    deps.bus.publish({ channel: "agent", storeId, event: { type: "run.finished", runId, status: "completed", summary: `${refined.name} is ready` } });
    return { storeId, runId, name: refined.name, slug: store.slug, previewUrl, steps };
  } catch (err) {
    await deps.db.update(agentRuns).set({ status: "failed", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) }).where(eq(agentRuns.id, runId));
    await deps.db.update(stores).set({ status: "building" }).where(eq(stores.id, storeId));
    onEvent?.({ type: "run.finished", runId, status: "failed", error: err instanceof Error ? err.message : String(err) });
    return { storeId, runId, name: draft.name, slug: store.slug, previewUrl, steps, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Scrape an existing site for brand signals (title, description, colours) — best effort, 5s budget. */
export async function scrapeSite(url: string): Promise<{ title?: string; description?: string; colors: string[]; images: string[] }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "KilnBot/1.0" } });
    clearTimeout(t);
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim();
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)?.[1];
    const colors = [...new Set(html.match(/#[0-9a-f]{6}\b/gi) ?? [])].slice(0, 6);
    const images = [...new Set((html.match(/<img[^>]+src=["'](https?:[^"']+\.(?:jpg|jpeg|png|webp))["']/gi) ?? []).map((m) => m.replace(/.*src=["']|["']$/g, "")))].slice(0, 6);
    return { title, description, colors, images };
  } catch {
    return { colors: [], images: [] };
  }
}
