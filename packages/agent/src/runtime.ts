import type { AgentEvent } from "@kiln/shared";
import { ToolRegistry, type ToolContext } from "./tool.js";
import type { Provider, ProviderMessage } from "./provider.js";

export interface RunOptions<TDeps> {
  runId: string;
  storeId: string;
  actorId?: string;
  pageContext?: string;
  deps: TDeps;
  provider: Provider;
  model: string;
  system: string;
  registry: ToolRegistry<TDeps>;
  history: ProviderMessage[];
  input: string;
  images?: string[];
  maxSteps?: number;
  /** Tools the merchant has pre-authorised (risky tools outside this set pause the run). */
  autonomyGrants?: string[];
  onEvent?: (e: AgentEvent) => void;
  /** Persist a step; called after every model turn and tool batch so runs survive restarts. */
  persist?: (state: RunState) => Promise<void>;
  isCancelled?: () => Promise<boolean> | boolean;
}

export interface RunState {
  status: "running" | "completed" | "failed" | "paused" | "cancelled";
  messages: ProviderMessage[];
  steps: { at: string; kind: "model" | "tool"; detail: unknown }[];
  todos: { title: string; status: string }[];
  summary?: string;
  error?: string;
  creditsUsed: number;
}

/**
 * The agent loop: model turn → execute tool calls → feed results back, until the model stops.
 * Every step is persisted through `persist`, so a crashed process can resume from the last state.
 */
export async function runAgent<TDeps>(o: RunOptions<TDeps>): Promise<RunState> {
  const emit = o.onEvent ?? (() => {});
  const state: RunState = { status: "running", messages: [...o.history, { role: "user", text: o.input, images: o.images }], steps: [], todos: [], creditsUsed: 0 };
  const tools = o.registry.toModelTools();
  const maxSteps = o.maxSteps ?? 12;
  emit({ type: "run.started", runId: o.runId });
  const areaOf = (name: string) => o.registry.get(name)?.area;
  try {
    for (let step = 0; step < maxSteps; step++) {
      if (await o.isCancelled?.()) {
        state.status = "cancelled";
        break;
      }
      const turn = await o.provider.turn(state.messages, { system: o.system, tools, model: o.model });
      state.creditsUsed += Math.max(1, Math.ceil(((turn.usage?.input ?? 0) + 3 * (turn.usage?.output ?? 0)) / 1000));
      state.messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });
      state.steps.push({ at: new Date().toISOString(), kind: "model", detail: { text: turn.text, toolCalls: turn.toolCalls.map((t) => t.name) } });
      if (turn.text) emit({ type: "text", runId: o.runId, delta: turn.text });
      await o.persist?.(state);
      if (turn.stop !== "tool_use" || turn.toolCalls.length === 0) {
        state.status = "completed";
        state.summary = turn.text;
        break;
      }
      const results: { id: string; ok: boolean; output: unknown; error?: string }[] = [];
      for (const call of turn.toolCalls) {
        const def = o.registry.get(call.name);
        if (call.name === "ask_merchant") {
          const q = (call.input as { question?: string })?.question ?? "Can you clarify?";
          emit({ type: "question", runId: o.runId, question: q });
          state.status = "paused";
          state.summary = q;
          results.push({ id: call.id, ok: true, output: { paused: true } });
          break;
        }
        if (call.name === "update_plan") {
          state.todos = ((call.input as { todos?: { title: string; status: string }[] })?.todos ?? []).slice(0, 20);
          emit({ type: "todo.updated", runId: o.runId, todos: state.todos });
          results.push({ id: call.id, ok: true, output: { ok: true } });
          continue;
        }
        if (def?.risky && !(o.autonomyGrants ?? []).includes(call.name) && !(o.autonomyGrants ?? []).includes("*")) {
          emit({ type: "question", runId: o.runId, question: `I'm about to run ${call.name} with ${JSON.stringify(call.input)}. Confirm?` });
          state.status = "paused";
          state.summary = `Confirmation needed for ${call.name}`;
          results.push({ id: call.id, ok: false, output: null, error: "awaiting merchant confirmation" });
          break;
        }
        emit({ type: "tool.started", runId: o.runId, tool: call.name, input: call.input, area: areaOf(call.name), callId: call.id });
        const ctx: ToolContext<TDeps> = { storeId: o.storeId, runId: o.runId, actorId: o.actorId, pageContext: o.pageContext, deps: o.deps, progress: (message) => emit({ type: "tool.started", runId: o.runId, tool: call.name, input: { progress: message }, area: areaOf(call.name), callId: call.id }) };
        const r = await o.registry.execute(call.name, call.input, ctx);
        state.creditsUsed += def?.credits ?? 1;
        emit({ type: "tool.finished", runId: o.runId, tool: call.name, output: r.ok ? r.output : { error: r.error }, ok: r.ok, area: areaOf(call.name), callId: call.id });
        state.steps.push({ at: new Date().toISOString(), kind: "tool", detail: { name: call.name, input: call.input, ok: r.ok, error: r.error } });
        results.push({ id: call.id, ...r });
      }
      state.messages.push({ role: "tool", results });
      await o.persist?.(state);
      if (state.status === "paused") break;
    }
    if (state.status === "running") {
      state.status = "completed";
      state.summary ??= "Reached the step limit; stopping here.";
    }
  } catch (err) {
    state.status = "failed";
    state.error = err instanceof Error ? err.message : String(err);
  }
  await o.persist?.(state);
  emit({ type: "run.finished", runId: o.runId, status: state.status, summary: state.summary, error: state.error });
  return state;
}
