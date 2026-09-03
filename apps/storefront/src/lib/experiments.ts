import type { ExperimentAssignment } from "./types";

/** Pull the PDP-relevant overrides out of active experiment assignments. */
export function pdpExperimentOverrides(experiments: Record<string, ExperimentAssignment> | undefined) {
  let ctaLabel: string | undefined, headline: string | undefined, priceDeltaPercent = 0, imagePreset: string | undefined;
  for (const a of Object.values(experiments ?? {})) {
    const p = a.payload ?? {};
    if (a.surface === "cta" && typeof p.label === "string" && p.label.trim()) ctaLabel = p.label.trim();
    if (a.surface === "headline" && typeof p.headline === "string" && p.headline.trim()) headline = p.headline.trim();
    if (a.surface === "pricing" && typeof p.priceDeltaPercent === "number") priceDeltaPercent = p.priceDeltaPercent;
    if (a.surface === "image" && typeof p.preset === "string") imagePreset = p.preset;
  }
  return { ctaLabel, headline, priceDeltaPercent, imagePreset };
}
export const applyPriceDelta = (cents: number, pct: number) => (pct ? Math.round(cents * (1 + pct / 100)) : cents);
export const assignmentVariants = (experiments: Record<string, ExperimentAssignment> | undefined): Record<string, string> => Object.fromEntries(Object.entries(experiments ?? {}).map(([id, a]) => [id, a.variant]));
