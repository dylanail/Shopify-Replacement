import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry, defineTool, runAgent, offlineProvider, planOffline, routeModel } from "../src/index.js";

describe("offline planner", () => {
  it("maps sentences to tool calls", () => {
    expect(planOffline("Add a product called Oxblood Wraps for $28 in sizes S, M, L").calls[0]).toMatchObject({ tool: "create_product", input: { title: "Oxblood Wraps", priceCents: 2800 } });
    expect(planOffline("create discount code WELCOME10 for 10% off").calls[0]).toMatchObject({ tool: "create_promotion", input: { code: "WELCOME10", value: 10, type: "percentage" } });
    expect(planOffline("free shipping over $200").calls[0]).toMatchObject({ tool: "create_promotion", input: { type: "free_shipping", minSubtotalCents: 20000 } });
    expect(planOffline("install the GA4 plugin").calls[0]).toMatchObject({ tool: "install_plugin", input: { pluginId: "ga4" } });
    expect(planOffline("change the homepage headline to Built for real rounds").calls[0]).toMatchObject({ tool: "update_theme_section", input: { settings: { headline: "Built for real rounds" } } });
    expect(planOffline("hello there").calls).toHaveLength(0);
  });
  it("routes models", () => {
    expect(routeModel("chat", undefined, false)).toBe("offline");
    expect(routeModel("design", undefined, true)).toBe("claude-opus-5");
    expect(routeModel("chat", "claude-opus-5", true)).toBe("claude-opus-5");
  });
});

describe("runtime", () => {
  it("executes tools through the loop and persists", async () => {
    const created: string[] = [];
    const registry = new ToolRegistry<{ tag: string }>().register(
      defineTool({ name: "create_product", description: "x", area: "products", input: z.object({ title: z.string(), priceCents: z.number().int() }).loose(), handler: async (i, ctx) => { created.push(`${ctx.deps.tag}:${i.title}`); return { id: "prod_1" }; } }),
    );
    const persisted: string[] = [];
    const events: string[] = [];
    const state = await runAgent({
      runId: "run_1", storeId: "store_1", deps: { tag: "t" }, provider: offlineProvider(), model: "offline", system: "", registry, history: [],
      input: "add a product called Oxblood Wraps for $28", onEvent: (e) => events.push(e.type), persist: async (s) => { persisted.push(s.status); },
    });
    expect(state.status).toBe("completed");
    expect(created).toEqual(["t:Oxblood Wraps"]);
    expect(events).toContain("tool.finished");
    expect(persisted[persisted.length - 1]).toBe("completed");
    expect(state.summary).toMatch(/Created the product/);
  });
  it("pauses on risky tools without a grant", async () => {
    const registry = new ToolRegistry<object>().register(defineTool({ name: "refund_order", description: "x", area: "orders", risky: true, input: z.object({}).loose(), handler: async () => ({}) }));
    const state = await runAgent({ runId: "r", storeId: "s", deps: {}, provider: offlineProvider(), model: "offline", system: "", registry, history: [], input: "refund order #12" });
    expect(state.status).toBe("paused");
    const granted = await runAgent({ runId: "r", storeId: "s", deps: {}, provider: offlineProvider(), model: "offline", system: "", registry, history: [], input: "refund order #12", autonomyGrants: ["refund_order"] });
    expect(granted.status).toBe("completed");
  });
  it("produces JSON schema for the model", () => {
    const registry = new ToolRegistry<object>().register(defineTool({ name: "t", description: "d", area: "ai", input: z.object({ a: z.string().describe("A"), n: z.number().optional() }), handler: async () => 1 }));
    const [t] = registry.toModelTools();
    expect(t!.input_schema).toMatchObject({ type: "object", required: ["a"] });
  });
});
