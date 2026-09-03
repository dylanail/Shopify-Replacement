import type { ShellPlugin, MerchConfig } from "./types";
import type { ThemeConfig } from "@kiln/shared";

/** One thing to render in a slot, after merging theme placements, plugin manifests and merch configs. */
export interface SlotEntry { key: string; component: string; pluginId?: string; settings: Record<string, unknown>; props: Record<string, unknown>; propsFromConfig: string[]; propsFromContext: string[]; merch?: MerchConfig }

/**
 * Slot resolution order: explicit theme placements → plugin components bound to this slot (fixed `slot`, or
 * merchant_choice with `defaultSlot` === name when the merchant hasn't placed it elsewhere) → merch configs
 * whose placement is this slot. Payment registry entries never render in a slot.
 */
export function resolveSlot(name: string, slots: ThemeConfig["slots"], plugins: ShellPlugin[], merch: MerchConfig[]): SlotEntry[] {
  const out: SlotEntry[] = [];
  const placedIds = new Map<string, Set<string>>(); // component id → slots where the theme placed it
  for (const [slot, list] of Object.entries(slots ?? {})) for (const e of list ?? []) { const s = placedIds.get(e.component) ?? new Set(); s.add(slot); placedIds.set(e.component, s); }
  const settingsFor = (pluginId?: string) => plugins.find((p) => p.id === pluginId)?.settings ?? {};
  for (const [i, e] of (slots?.[name] ?? []).entries()) {
    const plugin = plugins.find((p) => p.id === e.pluginId) ?? plugins.find((p) => p.components.some((c) => c.id === e.component));
    const decl = plugin?.components.find((c) => c.id === e.component);
    out.push({ key: `theme:${name}:${i}:${e.component}`, component: e.component, pluginId: plugin?.id, settings: settingsFor(plugin?.id), props: e.props ?? {}, propsFromConfig: decl?.propsFromConfig ?? [], propsFromContext: decl?.propsFromContext ?? [] });
  }
  for (const p of plugins) {
    for (const c of p.components) {
      if (c.placement === "payment_registry") continue;
      const placed = placedIds.get(c.id);
      const bound = c.placement === "merchant_choice" ? (placed?.size ? placed.has(name) && !(slots?.[name] ?? []).some((e) => e.component === c.id) : c.defaultSlot === name) : c.slot === name;
      if (!bound) continue;
      if (out.some((o) => o.component === c.id && o.pluginId === p.id)) continue;
      out.push({ key: `plugin:${p.id}:${c.id}`, component: c.id, pluginId: p.id, settings: p.settings, props: {}, propsFromConfig: c.propsFromConfig ?? [], propsFromContext: c.propsFromContext ?? [] });
    }
  }
  for (const m of merch) if (m.enabled && m.placement === name) out.push({ key: `merch:${m.id}`, component: m.component, settings: {}, props: { title: m.title }, propsFromConfig: [], propsFromContext: [], merch: m });
  return out;
}

export const pluginInstalled = (plugins: ShellPlugin[], id: string) => plugins.some((p) => p.id === id);

/** `{{settingKey}}` / `{{storeSlug}}` interpolation for plugin script tags. */
export function interpolate(template: string, settings: Record<string, unknown>, extra: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, k: string) => { const v = extra[k] ?? settings[k]; return v == null ? "" : String(v); });
}
