export type ProviderMessage =
  | { role: "user"; text: string; images?: string[] }
  | { role: "assistant"; text: string; toolCalls: { id: string; name: string; input: unknown }[] }
  | { role: "tool"; results: { id: string; ok: boolean; output: unknown; error?: string }[] };

export interface ProviderTurn {
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  stop: "end_turn" | "tool_use" | "max_tokens";
  usage?: { input: number; output: number };
}

export interface ModelTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Provider {
  name: string;
  turn(messages: ProviderMessage[], opts: { system: string; tools: ModelTool[]; model: string; maxTokens?: number }): Promise<ProviderTurn>;
}

/** Anthropic Messages API provider. Lazily imports the SDK so the package works without it configured. */
export function anthropicProvider(apiKey: string): Provider {
  let clientPromise: Promise<any> | null = null;
  const client = () => (clientPromise ??= import("@anthropic-ai/sdk").then((m) => new m.default({ apiKey })));
  return {
    name: "anthropic",
    async turn(messages, opts) {
      const c = await client();
      const apiMessages = messages.map((m) => {
        if (m.role === "user") {
          const content: any[] = [{ type: "text", text: m.text || "(empty)" }];
          for (const img of m.images ?? []) {
            if (img.startsWith("data:")) {
              const [meta, data] = img.split(",", 2);
              content.unshift({ type: "image", source: { type: "base64", media_type: meta!.slice(5).split(";")[0], data } });
            } else content.unshift({ type: "image", source: { type: "url", url: img } });
          }
          return { role: "user", content };
        }
        if (m.role === "assistant") {
          const content: any[] = [];
          if (m.text) content.push({ type: "text", text: m.text });
          for (const t of m.toolCalls) content.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
          return { role: "assistant", content: content.length ? content : [{ type: "text", text: "…" }] };
        }
        return { role: "user", content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: JSON.stringify(r.ok ? r.output : { error: r.error }).slice(0, 12000), is_error: !r.ok })) };
      });
      const res = await c.messages.create({ model: opts.model, max_tokens: opts.maxTokens ?? 4096, system: opts.system, tools: opts.tools, messages: apiMessages });
      const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      const toolCalls = res.content.filter((b: any) => b.type === "tool_use").map((b: any) => ({ id: b.id, name: b.name, input: b.input }));
      return { text, toolCalls, stop: res.stop_reason === "tool_use" ? "tool_use" : res.stop_reason === "max_tokens" ? "max_tokens" : "end_turn", usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 } };
    },
  };
}
