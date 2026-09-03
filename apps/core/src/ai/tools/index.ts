import { ToolRegistry } from "@kiln/agent";
import { tool } from "./define.js";
import { z } from "zod";
import type { AppDeps } from "../../context.js";
import { catalogTools } from "./catalog.js";
import { commerceTools } from "./commerce.js";
import { storefrontTools } from "./storefront.js";
import { growthTools } from "./growth.js";
import { setupTools } from "./setup.js";
import { pluginTools } from "./plugins.js";

export type Deps = AppDeps;

export const metaTools = [
  tool({ name: "update_plan", description: "Set or update the visible step-by-step plan for a multi-step task. Call first, then keep statuses current (pending | in_progress | done).", area: "ai", input: z.object({ todos: z.array(z.object({ title: z.string(), status: z.enum(["pending", "in_progress", "done"]) })) }), handler: async () => ({ ok: true }) }),
  tool({ name: "ask_merchant", description: "Pause and ask the merchant one specific question when a missing fact would change the outcome.", area: "ai", input: z.object({ question: z.string() }), handler: async () => ({ paused: true }) }),
];

/** Core registry: every first-party tool. Plugin-contributed tools are added per store at run time. */
export function buildRegistry() {
  return new ToolRegistry<Deps>().register(...metaTools, ...catalogTools, ...commerceTools, ...storefrontTools, ...growthTools, ...setupTools);
}

export async function registryForStore(deps: AppDeps, storeId: string) {
  const reg = buildRegistry();
  const extra = await pluginTools(deps, storeId, new Set(reg.names()));
  reg.register(...extra);
  return reg;
}
