import { and, eq, storeEnvironments, stores } from "@kiln/db";
import { ThemeConfig, THEME_TEMPLATES, type ThemeConfig as ThemeConfigT, type ThemeSection } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import { defaultTheme } from "./stores.js";

export async function getEnvironment(deps: AppDeps, storeId: string, kind: "draft" | "live") {
  const env = await deps.db.query.storeEnvironments.findFirst({ where: and(eq(storeEnvironments.storeId, storeId), eq(storeEnvironments.kind, kind)) });
  if (!env) throw notFound("Environment");
  return env;
}

export async function updateDraftTheme(deps: AppDeps, storeId: string, patch: Partial<ThemeConfigT>, actor = "user") {
  const env = await getEnvironment(deps, storeId, "draft");
  const next = ThemeConfig.parse({ ...env.theme, ...patch, brand: { ...env.theme.brand, ...(patch.brand ?? {}) }, slots: { ...env.theme.slots, ...(patch.slots ?? {}) }, files: { ...env.theme.files, ...(patch.files ?? {}) } });
  const [row] = await deps.db.update(storeEnvironments).set({ theme: next, buildStatus: "idle" }).where(eq(storeEnvironments.id, env.id)).returning();
  deps.bus.publish({ channel: "activity", storeId, event: { area: "designer", status: "done", message: `Draft theme updated by ${actor}` } });
  return row!;
}

export async function upsertSection(deps: AppDeps, storeId: string, section: Partial<ThemeSection> & { type: ThemeSection["type"] }, position?: number) {
  const env = await getEnvironment(deps, storeId, "draft");
  const sections = [...env.theme.sections];
  const idx = section.id ? sections.findIndex((s) => s.id === section.id) : sections.findIndex((s) => s.type === section.type);
  if (idx >= 0) sections[idx] = { ...sections[idx]!, ...section, settings: { ...sections[idx]!.settings, ...(section.settings ?? {}) } };
  else {
    const s: ThemeSection = { id: section.id ?? `${section.type}-${Date.now().toString(36)}`, type: section.type, settings: section.settings ?? {}, hidden: section.hidden ?? false };
    if (position != null) sections.splice(position, 0, s);
    else sections.push(s);
  }
  return updateDraftTheme(deps, storeId, { sections }, "ai");
}

export async function reorderSections(deps: AppDeps, storeId: string, ids: string[]) {
  const env = await getEnvironment(deps, storeId, "draft");
  const byId = new Map(env.theme.sections.map((s) => [s.id, s]));
  const ordered = ids.map((id) => byId.get(id)).filter((s): s is ThemeSection => !!s);
  const rest = env.theme.sections.filter((s) => !ids.includes(s.id));
  return updateDraftTheme(deps, storeId, { sections: [...ordered, ...rest] });
}

export async function removeSection(deps: AppDeps, storeId: string, id: string) {
  const env = await getEnvironment(deps, storeId, "draft");
  return updateDraftTheme(deps, storeId, { sections: env.theme.sections.filter((s) => s.id !== id) });
}

export async function applyTemplate(deps: AppDeps, storeId: string, template: string) {
  if (!THEME_TEMPLATES.some((t) => t.id === template)) throw badRequest("Unknown template");
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const env = await getEnvironment(deps, storeId, "draft");
  const fresh = defaultTheme({ ...store!.brand, ...env.theme.brand }, template);
  return updateDraftTheme(deps, storeId, { ...fresh, slots: env.theme.slots, files: env.theme.files });
}

/** Static "lint" of a theme: the checks that run in the sandbox before a build is allowed to publish. */
export function lintTheme(theme: ThemeConfigT) {
  const problems: { level: "error" | "warning"; message: string; sectionId?: string }[] = [];
  const parsed = ThemeConfig.safeParse(theme);
  if (!parsed.success) problems.push({ level: "error", message: `Invalid theme config: ${parsed.error.issues[0]?.message}` });
  const hero = theme.sections.find((s) => s.type === "hero" && !s.hidden);
  if (!hero) problems.push({ level: "warning", message: "No visible hero section — the homepage will open on product cards." });
  else if (!hero.settings.headline) problems.push({ level: "error", message: "Hero headline is empty", sectionId: hero.id });
  const ids = theme.sections.map((s) => s.id);
  if (new Set(ids).size !== ids.length) problems.push({ level: "error", message: "Duplicate section ids" });
  const open = (theme.customCss.match(/{/g) ?? []).length, close = (theme.customCss.match(/}/g) ?? []).length;
  if (open !== close) problems.push({ level: "error", message: "customCss has unbalanced braces" });
  if (/<script/i.test(theme.customCss)) problems.push({ level: "error", message: "customCss must not contain script tags" });
  for (const [file, src] of Object.entries(theme.files)) if (/process\.env|require\(|import\s+.*from\s+['"]fs['"]/.test(src)) problems.push({ level: "error", message: `${file}: server-only code is not allowed in theme files` });
  for (const [slot, comps] of Object.entries(theme.slots)) for (const c of comps) if (!c.component) problems.push({ level: "error", message: `Slot ${slot} has an unnamed component` });
  return { ok: !problems.some((p) => p.level === "error"), problems };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Build pipeline for an environment: queued → building (compile theme) → verifying (lint + screenshot) → ready.
 * Each stage is written to the build log so it survives restarts and streams to the admin.
 */
export async function buildEnvironment(deps: AppDeps, storeId: string, kind: "draft" | "live", opts: { fast?: boolean } = {}) {
  const env = await getEnvironment(deps, storeId, kind);
  const log: { at: string; level: string; message: string }[] = [];
  const stage = async (status: string, message: string, level = "info") => {
    log.push({ at: new Date().toISOString(), level, message });
    await deps.db.update(storeEnvironments).set({ buildStatus: status, buildLog: log }).where(eq(storeEnvironments.id, env.id));
    deps.bus.publish({ channel: "build", storeId, event: { environment: kind, status, message } });
    deps.bus.publish({ channel: "activity", storeId, event: { area: "designer", status: status === "failed" ? "error" : status === "ready" ? "done" : "running", message } });
    if (!opts.fast) await sleep(150);
  };
  await stage("queued", "Build queued");
  await stage("building", `Compiling ${env.theme.template} template with ${env.theme.sections.length} sections`);
  const lint = lintTheme(env.theme);
  for (const p of lint.problems) await stage("verifying", p.message, p.level);
  if (!lint.ok) {
    await stage("failed", "Build failed verification — fix the errors above and rebuild", "error");
    return { ok: false, log, problems: lint.problems };
  }
  await stage("verifying", "Lint passed · rendering screenshot");
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const screenshotUrl = `/api/v1/public/stores/${store!.slug}/preview.svg?env=${kind}&v=${env.version}`;
  await deps.db.update(storeEnvironments).set({ screenshotUrl }).where(eq(storeEnvironments.id, env.id));
  await stage("ready", kind === "draft" ? "Draft ready to preview" : "Live build ready");
  return { ok: true, log, problems: lint.problems, screenshotUrl };
}

/** Publish = verify the draft, copy it over live, bump the version. */
export async function publish(deps: AppDeps, storeId: string, actor = "user") {
  const draft = await getEnvironment(deps, storeId, "draft");
  const live = await getEnvironment(deps, storeId, "live");
  const build = await buildEnvironment(deps, storeId, "draft", { fast: true });
  if (!build.ok) throw badRequest("Draft failed verification", build.problems);
  const previous = live.theme;
  const [row] = await deps.db.update(storeEnvironments).set({ theme: draft.theme, version: live.version + 1, buildStatus: "ready", buildLog: build.log, screenshotUrl: build.screenshotUrl, publishedAt: new Date() }).where(eq(storeEnvironments.id, live.id)).returning();
  await deps.db.update(stores).set({ status: "live", settings: { ...(await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) }))!.settings, previousTheme: previous } }).where(eq(stores.id, storeId));
  deps.bus.publish({ channel: "activity", storeId, event: { area: "designer", status: "done", message: `Published v${row!.version} by ${actor}` } });
  return row!;
}

export async function rollback(deps: AppDeps, storeId: string) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const previous = store?.settings.previousTheme as ThemeConfigT | undefined;
  if (!previous) throw badRequest("Nothing to roll back to");
  const live = await getEnvironment(deps, storeId, "live");
  const [row] = await deps.db.update(storeEnvironments).set({ theme: previous, version: live.version + 1, publishedAt: new Date() }).where(eq(storeEnvironments.id, live.id)).returning();
  return row!;
}

/** What the "Publish store" button should say — the state-aware CTA. */
export async function publishState(deps: AppDeps, storeId: string) {
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const draft = await getEnvironment(deps, storeId, "draft");
  const live = await getEnvironment(deps, storeId, "live");
  const dirty = JSON.stringify(draft.theme) !== JSON.stringify(live.theme);
  const { products } = await import("@kiln/db");
  const { count } = await import("@kiln/db");
  const [{ n }] = await deps.db.select({ n: count() }).from(products).where(and(eq(products.storeId, storeId), eq(products.status, "published")));
  if (Number(n) === 0) return { label: "Add a product", action: "products", dirty, reason: "Your store needs at least one published product." };
  if (draft.buildStatus === "building" || draft.buildStatus === "verifying") return { label: "Building…", action: "wait", dirty, reason: "A build is in progress." };
  if (draft.buildStatus === "failed") return { label: "Fix build errors", action: "designer", dirty, reason: "The draft failed verification." };
  if (store?.status !== "live") return { label: "Publish store", action: "publish", dirty: true, reason: "Your store is not live yet." };
  if (dirty) return { label: "Publish changes", action: "publish", dirty, reason: "The draft has unpublished changes." };
  return { label: "Live · up to date", action: "none", dirty: false, reason: "Everything is published." };
}
