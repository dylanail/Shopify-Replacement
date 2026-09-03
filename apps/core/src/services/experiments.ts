import { and, eq, desc, experiments, experimentEvents, sql } from "@kiln/db";
import { z } from "zod";
import type { AppDeps } from "../context.js";
import { notFound, badRequest } from "../lib/errors.js";
import { sha256 } from "../lib/crypto.js";

export const ExperimentInput = z.object({
  name: z.string().min(1),
  hypothesis: z.string().optional(),
  surface: z.enum(["headline", "cta", "image", "pricing", "bundle", "free_ship", "email_subject", "send_time"]),
  target: z.string().optional(),
  variants: z.array(z.object({ key: z.string(), label: z.string(), payload: z.record(z.string(), z.unknown()) })).min(2),
  trafficSplit: z.record(z.string(), z.number()).optional(),
  autoPromoteAt: z.number().min(0.5).max(0.999).optional(),
});

export async function createExperiment(deps: AppDeps, storeId: string, input: z.infer<typeof ExperimentInput>) {
  const split = input.trafficSplit ?? Object.fromEntries(input.variants.map((v) => [v.key, Math.round(100 / input.variants.length)]));
  const [row] = await deps.db.insert(experiments).values({ storeId, name: input.name, hypothesis: input.hypothesis ?? "", surface: input.surface, target: input.target ?? null, variants: input.variants, trafficSplit: split, autoPromoteAt: input.autoPromoteAt ?? 0.95, results: Object.fromEntries(input.variants.map((v) => [v.key, { exposures: 0, conversions: 0, revenueCents: 0 }])) }).returning();
  return row!;
}

export async function setStatus(deps: AppDeps, storeId: string, id: string, status: "running" | "killed" | "promoted" | "draft") {
  const [row] = await deps.db.update(experiments).set({ status, ...(status === "running" ? { startedAt: new Date() } : {}), ...(status === "killed" || status === "promoted" ? { endedAt: new Date() } : {}) }).where(and(eq(experiments.id, id), eq(experiments.storeId, storeId))).returning();
  if (!row) throw notFound("Experiment");
  return row;
}

export async function listExperiments(deps: AppDeps, storeId: string) {
  const rows = await deps.db.select().from(experiments).where(eq(experiments.storeId, storeId)).orderBy(desc(experiments.createdAt));
  return rows.map((r) => ({ ...r, analysis: analyse(r) }));
}

/** Deterministic assignment by session hash, weighted by the traffic split. */
export function assignVariant(exp: { id: string; variants: { key: string }[]; trafficSplit: Record<string, number> }, sessionId: string) {
  const h = parseInt(sha256(`${exp.id}:${sessionId}`).slice(0, 8), 16) % 100;
  let acc = 0;
  for (const v of exp.variants) {
    acc += exp.trafficSplit[v.key] ?? 0;
    if (h < acc) return v.key;
  }
  return exp.variants[exp.variants.length - 1]!.key;
}

export async function activeAssignments(deps: AppDeps, storeId: string, sessionId: string, target?: string) {
  const running = await deps.db.select().from(experiments).where(and(eq(experiments.storeId, storeId), eq(experiments.status, "running")));
  const out: Record<string, { variant: string; surface: string; payload: Record<string, unknown> }> = {};
  for (const e of running) {
    if (e.target && target && e.target !== target && !target.startsWith(e.target)) continue;
    const key = assignVariant(e, sessionId);
    out[e.id] = { variant: key, surface: e.surface, payload: e.variants.find((v) => v.key === key)?.payload ?? {} };
  }
  return out;
}

export async function record(deps: AppDeps, storeId: string, experimentId: string, variant: string, kind: "exposure" | "conversion", valueCents = 0, sessionId?: string) {
  const exp = await deps.db.query.experiments.findFirst({ where: and(eq(experiments.id, experimentId), eq(experiments.storeId, storeId)) });
  if (!exp || exp.status !== "running") return null;
  await deps.db.insert(experimentEvents).values({ experimentId, variant, kind, valueCents, sessionId: sessionId ?? null });
  const results = { ...exp.results };
  const r = results[variant] ?? { exposures: 0, conversions: 0, revenueCents: 0 };
  if (kind === "exposure") r.exposures++;
  else {
    r.conversions++;
    r.revenueCents += valueCents;
  }
  results[variant] = r;
  const [row] = await deps.db.update(experiments).set({ results }).where(eq(experiments.id, experimentId)).returning();
  const a = analyse(row!);
  if (a.decision === "promote" && a.winner) {
    await deps.db.update(experiments).set({ status: "winner", winner: a.winner, endedAt: new Date() }).where(eq(experiments.id, experimentId));
    deps.bus.publish({ channel: "activity", storeId, event: { area: "experiments", status: "done", message: `${exp.name}: variant ${a.winner} won at ${(a.probability * 100).toFixed(1)}% confidence` } });
  }
  return a;
}

/** Bayesian A/B: Beta(1+conv, 1+exp-conv) per arm; P(B > A) by Monte Carlo with a fixed seed. */
export function analyse(exp: { variants: { key: string }[]; results: Record<string, { exposures: number; conversions: number; revenueCents: number }>; autoPromoteAt: number }) {
  const arms = exp.variants.map((v) => ({ key: v.key, ...(exp.results[v.key] ?? { exposures: 0, conversions: 0, revenueCents: 0 }) }));
  const rates = arms.map((a) => ({ key: a.key, rate: a.exposures ? a.conversions / a.exposures : 0, exposures: a.exposures, conversions: a.conversions, revenueCents: a.revenueCents }));
  let seed = 42;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const gamma = (k: number): number => {
    // Marsaglia–Tsang for k>=1; boost for k<1
    if (k < 1) return gamma(k + 1) * Math.pow(rand(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number, v: number;
      do {
        const u1 = rand(), u2 = rand();
        x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rand();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const beta = (a: number, b: number) => {
    const x = gamma(a), y = gamma(b);
    return x / (x + y);
  };
  const N = 2000;
  const wins = new Map<string, number>(arms.map((a) => [a.key, 0]));
  for (let i = 0; i < N; i++) {
    let best = "", bestV = -1;
    for (const a of arms) {
      const s = beta(1 + a.conversions, 1 + Math.max(0, a.exposures - a.conversions));
      if (s > bestV) { bestV = s; best = a.key; }
    }
    wins.set(best, (wins.get(best) ?? 0) + 1);
  }
  const probs = arms.map((a) => ({ key: a.key, p: (wins.get(a.key) ?? 0) / N }));
  const top = [...probs].sort((a, b) => b.p - a.p)[0]!;
  const control = rates[0]!;
  const topRate = rates.find((r) => r.key === top.key)!;
  const lift = control.rate ? Math.round(((topRate.rate - control.rate) / control.rate) * 1000) / 10 : 0;
  const minExposures = arms.every((a) => a.exposures >= 100);
  const decision = minExposures && top.p >= exp.autoPromoteAt && top.key !== control.key ? "promote" : minExposures && top.p >= exp.autoPromoteAt ? "keep_control" : minExposures && probs.every((p) => p.p < 0.2) ? "kill" : "continue";
  const ladder = [0.5, 0.8, 0.95, 0.99].map((t) => ({ threshold: t, reached: top.p >= t }));
  return { rates, probabilities: probs, winner: top.key, probability: top.p, liftPercent: lift, decision, ladder, minExposuresReached: minExposures };
}

export function generateVariants(surface: string, base: Record<string, unknown>) {
  const s = String(base.headline ?? base.label ?? base.title ?? "");
  switch (surface) {
    case "headline": return [{ key: "A", label: "Control", payload: { headline: s } }, { key: "B", label: "Outcome-led", payload: { headline: s ? `${s} — built to last` : "Made for real use, not the shelf" } }, { key: "C", label: "Specific", payload: { headline: "Hand-finished. Ships in 14 days. Lifetime repairs." } }];
    case "cta": return [{ key: "A", label: "Control", payload: { label: s || "Add to cart" } }, { key: "B", label: "Ownership", payload: { label: "Order your pair" } }];
    case "pricing": return [{ key: "A", label: "Control", payload: { priceDeltaPercent: 0 } }, { key: "B", label: "+5%", payload: { priceDeltaPercent: 5 } }, { key: "C", label: "−5%", payload: { priceDeltaPercent: -5 } }];
    case "image": return [{ key: "A", label: "Control", payload: { preset: "white_seamless" } }, { key: "B", label: "Lifestyle", payload: { preset: "lifestyle" } }];
    case "free_ship": return [{ key: "A", label: "$200", payload: { thresholdCents: 20000 } }, { key: "B", label: "$150", payload: { thresholdCents: 15000 } }];
    default: return [{ key: "A", label: "Control", payload: base }, { key: "B", label: "Variant", payload: { ...base, variant: true } }];
  }
}

export async function deleteExperiment(deps: AppDeps, storeId: string, id: string) {
  const r = await deps.db.delete(experiments).where(and(eq(experiments.id, id), eq(experiments.storeId, storeId))).returning({ id: experiments.id });
  if (!r.length) throw notFound("Experiment");
  return { deleted: true };
}
export { badRequest, sql };
