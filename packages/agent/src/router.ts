/** Route tasks to models. Merchants can override per store; tasks map to the cheapest capable model. */
export const MODELS = {
  "claude-opus-5": { label: "Opus 5", provider: "anthropic", tier: "frontier" },
  "claude-sonnet-5": { label: "Sonnet 5", provider: "anthropic", tier: "balanced" },
  "claude-haiku-4-5-20251001": { label: "Haiku 4.5", provider: "anthropic", tier: "fast" },
  "gpt-5": { label: "GPT-5", provider: "openai", tier: "frontier" },
  offline: { label: "Offline planner", provider: "kiln", tier: "deterministic" },
} as const;
export type ModelId = keyof typeof MODELS;

export type TaskKind = "chat" | "onboarding" | "design" | "classify" | "copy" | "cro";

export function routeModel(task: TaskKind, preferred?: string, hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY): ModelId {
  if (!hasAnthropicKey) return "offline";
  if (preferred && preferred in MODELS && preferred !== "offline") return preferred as ModelId;
  switch (task) {
    case "design":
    case "cro":
      return "claude-opus-5";
    case "classify":
      return "claude-haiku-4-5-20251001";
    default:
      return "claude-sonnet-5";
  }
}
