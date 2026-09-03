import { tool, type AnyTool } from "./define.js";
import { z } from "zod";
import type { AppDeps } from "../../context.js";
import { listInstalled, installPlugin, uninstallPlugin, updatePluginSettings } from "../../services/plugins.js";
import { CATALOG } from "@kiln/plugins";

/**
 * Plugin-contributed AI tools. `connect_<plugin>` installs + configures with the given credentials,
 * `disconnect_<plugin>` uninstalls, and any other declared tool maps to configure_plugin semantics.
 * Also exposes connect_* for not-yet-installed first-party plugins so "connect Shippo" works cold.
 */
export async function pluginTools(deps: AppDeps, storeId: string, taken: Set<string>): Promise<AnyTool[]> {
  const installed = new Set((await listInstalled(deps, storeId)).map((p) => p.pluginId));
  const out: AnyTool[] = [];
  for (const m of CATALOG.filter((p) => p.installable)) {
    for (const t of m.aiTools) {
      if (taken.has(t.name)) continue;
      taken.add(t.name);
      const shape: Record<string, z.ZodType> = {};
      for (const [k, ty] of Object.entries(t.input)) shape[k] = ty === "number" ? z.number().optional() : ty === "boolean" ? z.boolean().optional() : z.string().optional();
      const isConnect = t.name.startsWith("connect_");
      const isDisconnect = t.name.startsWith("disconnect_");
      out.push(
        tool({
          name: t.name, area: "plugins", description: `${m.name}: ${t.description}${installed.has(m.id) ? "" : " (installs the plugin first)"}`,
          input: z.object(shape),
          handler: async (input, ctx) => {
            if (isDisconnect) return uninstallPlugin(ctx.deps, ctx.storeId, m.id);
            if (!installed.has(m.id)) await installPlugin(ctx.deps, ctx.storeId, m.id, {}, "ai");
            const settings = Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([, v]) => v !== undefined));
            if (isConnect || Object.keys(settings).some((k) => k in m.settingsSchema)) {
              const r = await updatePluginSettings(ctx.deps, ctx.storeId, m.id, settings);
              return { plugin: m.id, connected: true, settings: r.settings };
            }
            return { plugin: m.id, tool: t.name, input, note: "Recorded — this plugin action runs through the outbox drainer." };
          },
        }),
      );
    }
  }
  return out;
}
