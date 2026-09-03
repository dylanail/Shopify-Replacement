import { and, eq, storePlugins, storePluginCredentials, stores, organizations } from "@kiln/db";
import { CATALOG, pluginById, validateSettings, type PluginManifest } from "@kiln/plugins";
import { planBySlug } from "@kiln/shared";
import type { AppDeps } from "../context.js";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";

export async function listInstalled(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select().from(storePlugins).where(eq(storePlugins.storeId, storeId));
  return rows.map((r) => ({ ...r, manifest: pluginById(r.pluginId) ?? null }));
}

export async function catalogFor(deps: AppDeps, storeId: string, q?: { category?: string; search?: string; region?: string }) {
  const installed = new Set((await deps.db.select({ pluginId: storePlugins.pluginId }).from(storePlugins).where(eq(storePlugins.storeId, storeId))).map((r) => r.pluginId));
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const org = store ? await deps.db.query.organizations.findFirst({ where: eq(organizations.id, store.orgId) }) : undefined;
  const plan = planBySlug(org?.planSlug ?? "free");
  return CATALOG.filter((p) => (!q?.category || p.category === q.category) && (!q?.search || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q.search.toLowerCase())) && (!q?.region || p.regions.length === 0 || p.regions.includes(q.region)))
    .map((p) => ({ ...p, installed: installed.has(p.id), available: !p.planGated || !p.allowedPlanSlugs || p.allowedPlanSlugs.includes(plan.slug) }))
    .sort((a, b) => Number(b.source === "first-party") - Number(a.source === "first-party") || Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
}

export async function installPlugin(deps: AppDeps, storeId: string, pluginId: string, settings: Record<string, unknown> = {}, actor = "user") {
  const manifest = pluginById(pluginId);
  if (!manifest) throw notFound(`Plugin ${pluginId}`);
  if (!manifest.installable) throw badRequest(`${manifest.name} is a directory listing — request a native integration from the assistant.`);
  const store = await deps.db.query.stores.findFirst({ where: eq(stores.id, storeId) });
  const org = store ? await deps.db.query.organizations.findFirst({ where: eq(organizations.id, store.orgId) }) : undefined;
  if (manifest.planGated && manifest.allowedPlanSlugs && !manifest.allowedPlanSlugs.includes(org?.planSlug ?? "free")) throw forbidden(`${manifest.name} requires the ${manifest.allowedPlanSlugs.map((s) => planBySlug(s).name).join(" or ")} plan`);
  const [row] = await deps.db.insert(storePlugins).values({ storeId, pluginId, enabled: true, settings: {} }).onConflictDoUpdate({ target: [storePlugins.storeId, storePlugins.pluginId], set: { enabled: true } }).returning();
  const final = Object.keys(settings).length ? await updatePluginSettings(deps, storeId, pluginId, settings) : { ...row!, manifest };
  deps.bus.publish({ channel: "activity", storeId, event: { area: "plugins", status: "done", message: `${manifest.name} installed by ${actor}` } });
  return final;
}

export async function uninstallPlugin(deps: AppDeps, storeId: string, pluginId: string) {
  await deps.db.delete(storePlugins).where(and(eq(storePlugins.storeId, storeId), eq(storePlugins.pluginId, pluginId)));
  await deps.db.delete(storePluginCredentials).where(and(eq(storePluginCredentials.storeId, storeId), eq(storePluginCredentials.pluginId, pluginId)));
  return { uninstalled: true };
}

/** Secret fields go to the encrypted credentials table; everything else lives in store_plugins.settings. */
export async function updatePluginSettings(deps: AppDeps, storeId: string, pluginId: string, values: Record<string, unknown>) {
  const manifest = pluginById(pluginId);
  if (!manifest) throw notFound("Plugin");
  const [row] = await deps.db.select().from(storePlugins).where(and(eq(storePlugins.storeId, storeId), eq(storePlugins.pluginId, pluginId)));
  if (!row) throw notFound("Plugin is not installed");
  const merged = { ...row.settings, ...values };
  const v = validateSettings(manifest, merged);
  if (!v.ok) throw badRequest("Invalid settings", v.errors);
  const publicSettings: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(manifest.settingsSchema)) {
    const val = v.values[key];
    if (val === undefined) continue;
    if (field.type === "secret") {
      const enc = encryptSecret(String(val), deps.env.jwtSecret);
      await deps.db.insert(storePluginCredentials).values({ storeId, pluginId, key, ...enc }).onConflictDoUpdate({ target: [storePluginCredentials.storeId, storePluginCredentials.pluginId, storePluginCredentials.key], set: enc });
      publicSettings[key] = "••••••••";
    } else publicSettings[key] = val;
  }
  const [updated] = await deps.db.update(storePlugins).set({ settings: publicSettings }).where(eq(storePlugins.id, row.id)).returning();
  return { ...updated!, manifest };
}

export async function setPluginEnabled(deps: AppDeps, storeId: string, pluginId: string, enabled: boolean) {
  const [row] = await deps.db.update(storePlugins).set({ enabled }).where(and(eq(storePlugins.storeId, storeId), eq(storePlugins.pluginId, pluginId))).returning();
  if (!row) throw notFound("Plugin is not installed");
  return row;
}

/** Per-tenant credential resolver with a short in-memory cache (mirrors the token-cache pattern). */
const credCache = new Map<string, { at: number; value: string }>();
export async function resolveCredential(deps: AppDeps, storeId: string, pluginId: string, key: string) {
  const ck = `${storeId}:${pluginId}:${key}`;
  const hit = credCache.get(ck);
  if (hit && Date.now() - hit.at < 60e3) return hit.value;
  const [row] = await deps.db.select().from(storePluginCredentials).where(and(eq(storePluginCredentials.storeId, storeId), eq(storePluginCredentials.pluginId, pluginId), eq(storePluginCredentials.key, key)));
  if (!row) return null;
  const value = decryptSecret(row.ciphertext, row.iv, deps.env.jwtSecret);
  credCache.set(ck, { at: Date.now(), value });
  return value;
}

/** Public storefront config: enabled plugins, their non-secret settings and slot components. Cached 60s by the route. */
export async function storefrontPluginConfig(deps: AppDeps, storeId: string, preview = false) {
  const rows = await deps.db.select().from(storePlugins).where(and(eq(storePlugins.storeId, storeId), eq(storePlugins.enabled, true)));
  return rows
    .map((r) => ({ r, m: pluginById(r.pluginId) }))
    .filter((x): x is { r: typeof x.r; m: PluginManifest } => !!x.m && !(preview && x.m.disableInPreview))
    .map(({ r, m }) => ({ id: m.id, name: m.name, settings: Object.fromEntries(Object.entries(r.settings).filter(([k]) => m.settingsSchema[k]?.type !== "secret")), components: m.storefront.components, scripts: m.storefront.scripts, capabilities: m.capabilities }));
}

export function pluginAiTools(installed: { pluginId: string }[]) {
  return installed.flatMap((r) => pluginById(r.pluginId)?.aiTools.map((t) => ({ ...t, pluginId: r.pluginId })) ?? []);
}
