import { z } from "zod";
import type { AdminArea } from "@kiln/shared";

export interface ToolContext<TDeps = unknown> {
  storeId: string;
  runId: string;
  actorId?: string;
  pageContext?: string;
  deps: TDeps;
  /** Emit a progress line the UI shows as an activity dot + message. */
  progress: (message: string) => void;
}

export interface ToolDef<TDeps = unknown, TIn extends z.ZodType = z.ZodType, TOut = unknown> {
  name: string;
  description: string;
  area: AdminArea;
  input: TIn;
  /** Risky tools require merchant confirmation unless an autonomy grant covers them. */
  risky?: boolean;
  /** Approximate credit cost. */
  credits?: number;
  handler: (input: z.infer<TIn>, ctx: ToolContext<TDeps>) => Promise<TOut>;
}

export function defineTool<TDeps, TIn extends z.ZodType, TOut>(def: ToolDef<TDeps, TIn, TOut>): ToolDef<TDeps, TIn, TOut> {
  if (!/^[a-z][a-z0-9_]*$/.test(def.name)) throw new Error(`invalid tool name ${def.name}`);
  return def;
}

export class ToolRegistry<TDeps = unknown> {
  private tools = new Map<string, ToolDef<TDeps, z.ZodType, unknown>>();

  register(...defs: ToolDef<TDeps, any, any>[]) {
    for (const d of defs) {
      if (this.tools.has(d.name)) throw new Error(`duplicate tool ${d.name}`);
      this.tools.set(d.name, d as ToolDef<TDeps, z.ZodType, unknown>);
    }
    return this;
  }

  get(name: string) {
    return this.tools.get(name);
  }
  has(name: string) {
    return this.tools.has(name);
  }
  list() {
    return [...this.tools.values()];
  }
  names() {
    return [...this.tools.keys()];
  }
  byArea() {
    const out: Record<string, string[]> = {};
    for (const t of this.tools.values()) (out[t.area] ??= []).push(t.name);
    return out;
  }

  /** Anthropic Messages API tool definitions (JSON Schema via zod 4). */
  toModelTools(filter?: (t: ToolDef<TDeps, z.ZodType, unknown>) => boolean) {
    return this.list()
      .filter((t) => (filter ? filter(t) : true))
      .map((t) => ({ name: t.name, description: t.description, input_schema: z.toJSONSchema(t.input, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown> }));
  }

  async execute(name: string, rawInput: unknown, ctx: ToolContext<TDeps>): Promise<{ ok: boolean; output: unknown; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, output: null, error: `unknown tool ${name}` };
    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) return { ok: false, output: null, error: `invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    try {
      const output = await tool.handler(parsed.data, ctx);
      return { ok: true, output };
    } catch (err) {
      return { ok: false, output: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
