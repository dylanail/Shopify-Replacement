"use client";

import { useState } from "react";
import { Check, FlaskConical, Play, Plus, Skull, Sparkles, Trash2, Trophy, WandSparkles } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDate, fmtPct, money, titleCase } from "@/lib/utils";
import type { Experiment } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Field, Input, Loading, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";

const SURFACES = ["headline", "cta", "image", "pricing", "bundle", "free_ship", "email_subject", "send_time"];
interface VariantDraft { key: string; label: string; payload: string }

function Ladder({ ladder, p }: { ladder: { threshold: number; reached: boolean }[]; p: number }) {
  return (
    <div className="flex items-center gap-1">
      {ladder.map((l) => (
        <div key={l.threshold} className="flex flex-1 flex-col items-center gap-0.5">
          <div className={cn("h-1.5 w-full rounded-sm", l.reached ? "bg-positive" : "bg-sand")} />
          <span className={cn("text-[9px]", l.reached ? "text-positive" : "text-faint")}>{Math.round(l.threshold * 100)}%</span>
        </div>
      ))}
      <span className="ml-2 text-[11px] font-medium">{fmtPct(p * 100, 1)}</span>
    </div>
  );
}

function decisionTone(d: string) { return d === "promote" ? "green" : d === "kill" ? "red" : d === "keep_control" ? "amber" : "neutral"; }

export default function ExperimentsPage() {
  const { open } = useAi();
  const q = useStoreQuery<{ items: Experiment[] }>(["experiments"], "/experiments", { refetchInterval: 30_000 });
  const [create, setCreate] = useState(false);
  const [f, setF] = useState({ name: "", hypothesis: "", surface: "headline", target: "", variants: [] as VariantDraft[], split: {} as Record<string, number>, autoPromoteAt: "0.95" });
  const [del, setDel] = useState<Experiment | null>(null);
  const suggest = useStoreMutation((sapi, surface: string) => sapi<{ variants: { key: string; label: string; payload: Record<string, unknown> }[] }>("/experiments/suggest", { method: "POST", body: { surface } }), { invalidate: false, onSuccess: (r) => setF((x) => ({ ...x, variants: r.variants.map((v) => ({ key: v.key, label: v.label, payload: JSON.stringify(v.payload) })), split: Object.fromEntries(r.variants.map((v) => [v.key, Math.round(100 / r.variants.length)])) })) });
  const createM = useStoreMutation((sapi) => sapi("/experiments", { method: "POST", body: { name: f.name, hypothesis: f.hypothesis, surface: f.surface, target: f.target || undefined, variants: f.variants.map((v) => ({ key: v.key, label: v.label, payload: JSON.parse(v.payload || "{}") })), trafficSplit: f.split, autoPromoteAt: Number(f.autoPromoteAt) } }), { success: "Experiment created as a draft", invalidate: "experiments", onSuccess: () => setCreate(false) });
  const setStatus = useStoreMutation((sapi, v: { id: string; status: string }) => sapi(`/experiments/${v.id}/${v.status}`, { method: "POST" }), { success: (_, v) => `Experiment ${v.status}`, invalidate: "experiments" });
  const remove = useStoreMutation((sapi, id: string) => sapi(`/experiments/${id}`, { method: "DELETE" }), { success: "Deleted", invalidate: "experiments", onSuccess: () => setDel(null) });
  const items = q.data?.items ?? [];
  const counts = { running: items.filter((e) => e.status === "running").length, winner: items.filter((e) => e.status === "winner" || e.status === "promoted").length, draft: items.filter((e) => e.status === "draft").length, killed: items.filter((e) => e.status === "killed").length };
  const validVariants = f.variants.length >= 2 && f.variants.every((v) => { try { JSON.parse(v.payload || "{}"); return !!v.key; } catch { return false; } });

  return (
    <Page wide>
      <PageHeader eyebrow="Growth" title="Experiments" subtitle="Bayesian sequential tests on the storefront. Auto-promotes the winner at your confidence threshold, rolls back losers." actions={<><Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("A/B test the homepage headline")}>Suggest a test</Button><Button variant="primary" icon={<Plus size={13} />} onClick={() => { setF({ name: "", hypothesis: "", surface: "headline", target: "", variants: [], split: {}, autoPromoteAt: "0.95" }); setCreate(true); }}>New experiment</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2 overflow-x-auto rounded border border-line bg-ink px-3 py-2 text-[11px] text-cream">
        <span className="inline-flex items-center gap-1 font-medium"><FlaskConical size={12} /> Lab</span>
        <span className="text-cream/50">·</span><span><span className="text-amber">{counts.running}</span> running</span><span className="text-cream/50">·</span><span><span className="text-positive">{counts.winner}</span> winners</span><span className="text-cream/50">·</span><span>{counts.draft} drafts</span><span className="text-cream/50">·</span><span>{counts.killed} killed</span>
        <span className="flex-1" />
        {items.filter((e) => e.status === "running").slice(0, 3).map((e) => <span key={e.id} className="whitespace-nowrap rounded bg-white/10 px-1.5 py-0.5">{e.name}: {e.analysis.winner} at {fmtPct(e.analysis.probability * 100, 0)}</span>)}
      </div>
      {q.isLoading && <Loading />}
      {q.data && items.length === 0 && <div className="card"><EmptyState title="No experiments yet" body="Test headlines, CTAs, images, pricing, bundles, free-shipping thresholds, email subjects and send times." action={<Button variant="primary" onClick={() => setCreate(true)}>New experiment</Button>} /></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((e) => (
          <article key={e.id} className="card flex flex-col bg-[linear-gradient(transparent_23px,#f3ece4_24px)] bg-[length:100%_24px] p-4" style={{ backgroundColor: "#fffdf9" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="font-mono text-[10px] text-muted">#{e.id.slice(-6)} · {titleCase(e.surface)}{e.target ? ` · ${e.target}` : ""}</div><h2 className="font-display truncate text-[17px] leading-tight">{e.name}</h2></div>
              <StatusBadge status={e.status} />
            </div>
            {e.hypothesis && <p className="mt-1 text-[11px] italic text-muted">“{e.hypothesis}”</p>}
            <div className="mt-3 space-y-1.5">
              {e.analysis.rates.map((r) => {
                const prob = e.analysis.probabilities.find((p) => p.key === r.key)?.p ?? 0;
                const isWinner = e.analysis.winner === r.key && e.analysis.minExposuresReached;
                const label = e.variants.find((v) => v.key === r.key)?.label ?? r.key;
                return (
                  <div key={r.key} className={cn("rounded border px-2 py-1.5 text-[11px]", isWinner ? "border-positive/40 bg-positive-soft/50" : "border-line bg-card")}>
                    <div className="flex items-center justify-between"><span className="font-medium">{r.key} · {label}{isWinner && <Trophy size={10} className="ml-1 inline text-positive" />}</span><span>{fmtPct(r.rate * 100, 2)} <span className="text-muted">({r.conversions}/{r.exposures})</span></span></div>
                    <div className="mt-1 h-1 rounded bg-sand"><div className="h-1 rounded bg-accent" style={{ width: `${Math.min(100, prob * 100)}%` }} /></div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-muted"><span>P(best) {fmtPct(prob * 100, 0)}</span><span>{money(r.revenueCents)}</span></div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3">
              <div className="eyebrow mb-1">Confidence ladder</div>
              <Ladder ladder={e.analysis.ladder} p={e.analysis.probability} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <Badge tone={decisionTone(e.analysis.decision)}>{titleCase(e.analysis.decision)}</Badge>
              <span className="text-muted">lift {e.analysis.liftPercent > 0 ? "+" : ""}{e.analysis.liftPercent}%</span>
              {!e.analysis.minExposuresReached && <span className="text-muted">· needs 100 exposures per arm</span>}
              <span className="text-muted">· split {Object.entries(e.trafficSplit).map(([k, v]) => `${k} ${v}%`).join(" / ")}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {(e.status === "draft" || e.status === "killed") && <Button size="xs" variant="primary" icon={<Play size={11} />} onClick={() => setStatus.mutate({ id: e.id, status: "running" })}>Start</Button>}
              {e.status === "running" && <Button size="xs" variant="danger" icon={<Skull size={11} />} onClick={() => setStatus.mutate({ id: e.id, status: "killed" })}>Kill</Button>}
              {(e.status === "running" || e.status === "winner") && <Button size="xs" icon={<Check size={11} />} onClick={() => setStatus.mutate({ id: e.id, status: "promoted" })}>Promote {e.analysis.winner}</Button>}
              {e.status !== "draft" && e.status !== "running" && <Button size="xs" variant="ghost" onClick={() => setStatus.mutate({ id: e.id, status: "draft" })}>Back to draft</Button>}
              <span className="flex-1" />
              <span className="self-center text-[10px] text-faint">{e.startedAt ? `started ${fmtDate(e.startedAt)}` : `created ${fmtDate(e.createdAt)}`}</span>
              <button onClick={() => setDel(e)} className="text-muted hover:text-danger"><Trash2 size={13} /></button>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={create} onClose={() => setCreate(false)} title="New experiment" description="Pick a surface, let Kiln suggest variants, edit them, set the split." width="max-w-2xl" footer={<><Button variant="ghost" onClick={() => setCreate(false)}>Cancel</Button><Button variant="primary" loading={createM.isPending} disabled={!f.name.trim() || !validVariants} onClick={() => createM.mutate()}>Create draft</Button></>}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Hero headline v2" autoFocus /></Field>
            <Field label="Surface"><div className="flex gap-2"><Select value={f.surface} onChange={(e) => setF({ ...f, surface: e.target.value, variants: [] })}>{SURFACES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select><Button icon={<WandSparkles size={13} />} loading={suggest.isPending} onClick={() => suggest.mutate(f.surface)}>Suggest</Button></div></Field>
          </div>
          <Field label="Hypothesis"><Textarea value={f.hypothesis} onChange={(e) => setF({ ...f, hypothesis: e.target.value })} className="min-h-[50px]" placeholder="A specific, outcome-led headline lifts add-to-cart by 10%." /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target path (optional)"><Input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder="/ or /products/sparring-16oz" /></Field>
            <Field label="Auto-promote at"><Select value={f.autoPromoteAt} onChange={(e) => setF({ ...f, autoPromoteAt: e.target.value })}>{["0.8", "0.9", "0.95", "0.99"].map((v) => <option key={v} value={v}>{Math.round(Number(v) * 100)}% confidence</option>)}</Select></Field>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium">Variants ({f.variants.length})</span><Button size="xs" icon={<Plus size={11} />} onClick={() => { const key = String.fromCharCode(65 + f.variants.length); setF({ ...f, variants: [...f.variants, { key, label: f.variants.length === 0 ? "Control" : `Variant ${key}`, payload: "{}" }], split: { ...f.split, [key]: 0 } }); }}>Add variant</Button></div>
            {f.variants.length === 0 && <p className="text-[11px] text-muted">Click Suggest to generate variants from your live theme, or add them by hand.</p>}
            <div className="space-y-2">
              {f.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[48px_1fr_2fr_72px] items-start gap-2">
                  <Input value={v.key} onChange={(e) => setF({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, key: e.target.value.toUpperCase() } : x)) })} className="font-mono" />
                  <Input value={v.label} onChange={(e) => setF({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Label" />
                  <Input value={v.payload} onChange={(e) => setF({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, payload: e.target.value } : x)) })} className="font-mono !text-[11px]" placeholder='{"headline":"…"}' />
                  <div className="flex items-center gap-1"><Input type="number" value={f.split[v.key] ?? 0} onChange={(e) => setF({ ...f, split: { ...f.split, [v.key]: Number(e.target.value) } })} className="!px-1.5" /><span className="text-[11px] text-muted">%</span></div>
                </div>
              ))}
            </div>
            {f.variants.length > 0 && <p className={cn("mt-1 text-[11px]", Object.values(f.split).reduce((a, b) => a + b, 0) === 100 ? "text-muted" : "text-amber")}>Split totals {Object.values(f.split).reduce((a, b) => a + b, 0)}% — should be 100.</p>}
          </div>
        </div>
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending} title={`Delete “${del?.name}”?`} body="Results are discarded." confirmLabel="Delete" danger />
    </Page>
  );
}
