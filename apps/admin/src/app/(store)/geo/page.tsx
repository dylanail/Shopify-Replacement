"use client";

import { useEffect, useState } from "react";
import { Plus, Radar, RefreshCw, Sparkles, X } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDateTime, titleCase } from "@/lib/utils";
import type { GeoOverview, KnowledgeCard } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Sparkline } from "@/components/charts";
import { Badge, Button, Card, Chips, EmptyState, Field, Input, Loading, PageHeader, StatTiles, Table, Td, Th, Tr, type Tone } from "@/components/ui";

const MODEL_LABEL: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", perplexity: "Perplexity", gemini: "Gemini" };
const placementTone = (p: string): Tone => (p === "recommended" ? "green" : p === "cited" ? "teal" : p === "mentioned" ? "amber" : "neutral");

export default function GeoPage() {
  const { open } = useAi();
  const q = useStoreQuery<GeoOverview>(["geo"], "/geo");
  const preview = useStoreQuery<string>(["geo-preview"], "/geo/preview", { text: true });
  const [prompt, setPrompt] = useState("");
  const [card, setCard] = useState<KnowledgeCard>({ brandName: "", categories: [], differentiators: [], locations: [], founders: [], comparisons: [] });
  useEffect(() => { if (q.data?.card) setCard({ ...q.data.card, comparisons: q.data.card.comparisons ?? [] }); }, [q.data?.card]);
  const track = useStoreMutation((sapi) => sapi("/geo/prompts", { method: "POST", body: { prompt } }), { success: "Prompt tracked across 4 engines", invalidate: "geo", onSuccess: () => setPrompt("") });
  const check = useStoreMutation((sapi) => sapi("/geo/check", { method: "POST" }), { success: "Checked every prompt", invalidate: "geo" });
  const saveCard = useStoreMutation((sapi) => sapi("/geo/knowledge-card", { method: "PUT", body: card }), { success: "Knowledge card saved · llms.txt regenerated", invalidate: "geo" });
  const d = q.data;
  const prompts = d?.prompts ?? [];
  const uniquePrompts = [...new Set(prompts.map((p) => p.prompt))];
  const cited = prompts.filter((p) => p.placement !== "not_cited").length;
  const maxTracked = Math.max(1, ...(d?.byModel ?? []).map((m) => m.tracked));

  return (
    <Page wide>
      <PageHeader eyebrow="Answer engines" title={<span className="text-teal">GEO</span>} subtitle="Generative engine optimisation: does ChatGPT, Claude, Perplexity or Gemini recommend you when shoppers ask?" actions={<><Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Update my knowledge card so answer engines recommend us — fill in categories, differentiators and comparisons from what you know about the store")}>Fill card with AI</Button><Button variant="primary" icon={<RefreshCw size={13} />} loading={check.isPending} onClick={() => check.mutate()}>Check now</Button></>} />
      {q.isLoading && <Loading />}
      {d && (
        <>
          <StatTiles items={[{ label: "Tracked prompts", value: uniquePrompts.length }, { label: "Engine checks", value: prompts.length }, { label: "Cited or better", value: cited, hint: prompts.length ? `${Math.round((cited / prompts.length) * 100)}% of checks` : undefined }, { label: "Recommended", value: prompts.filter((p) => p.placement === "recommended").length }]} />
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              <Card title="Prompts × engines" padded={false} action={<div className="flex gap-1.5"><Input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && prompt.trim().length > 2 && track.mutate()} placeholder="best hand-stitched boxing gloves" className="!h-7 !w-64 !text-xs" /><Button size="sm" icon={<Plus size={11} />} loading={track.isPending} disabled={prompt.trim().length < 3} onClick={() => track.mutate()}>Track</Button></div>}>
                {prompts.length === 0 ? <EmptyState icon={<Radar size={28} />} title="No prompts tracked" body="Add the questions shoppers ask an assistant — each is checked on four engines." /> : (
                  <Table>
                    <thead><tr><Th>Prompt</Th><Th>Engine</Th><Th>Placement</Th><Th>Trend</Th><Th>Checked</Th></tr></thead>
                    <tbody>{prompts.map((p) => <Tr key={p.id}><Td className="max-w-[280px] truncate font-medium" title={p.prompt}>{p.prompt}</Td><Td>{MODEL_LABEL[p.model] ?? p.model}</Td><Td><Badge tone={placementTone(p.placement)} dot>{p.placement.replace("_", " ")}</Badge></Td><Td><Sparkline values={p.history.length ? p.history : [0]} width={70} height={20} color={p.placement === "not_cited" ? "#a89d93" : "#2f6f6a"} /></Td><Td className="text-[11px] text-muted">{p.checkedAt ? fmtDateTime(p.checkedAt) : "never"}</Td></Tr>)}</tbody>
                  </Table>
                )}
              </Card>
              <Card title="Answer snippets" eyebrow="What the engines actually said" padded={false}>
                {prompts.filter((p) => p.snippet).length === 0 ? <div className="px-4 py-6 text-center text-[11px] text-muted">Snippets appear after a check finds a mention.</div> : (
                  <ul className="divide-y divide-line">{prompts.filter((p) => p.snippet).map((p) => <li key={p.id} className="px-4 py-2.5 text-xs"><div className="mb-0.5 flex items-center gap-2"><Badge tone={placementTone(p.placement)}>{MODEL_LABEL[p.model] ?? p.model}</Badge><span className="truncate text-muted">{p.prompt}</span></div><p className="italic">{p.snippet}</p></li>)}</ul>
                )}
              </Card>
            </div>
            <div className="space-y-4">
              <Card title="Mentions by engine">
                <div className="space-y-2">{d.byModel.map((m) => <div key={m.model} className="text-xs"><div className="flex justify-between"><span className="font-medium">{MODEL_LABEL[m.model] ?? m.model}</span><span className="text-muted">{m.mentions}/{m.tracked}</span></div><div className="mt-1 h-2 rounded bg-sand"><div className="h-2 rounded bg-teal" style={{ width: `${(m.mentions / maxTracked) * 100}%` }} /></div></div>)}</div>
              </Card>
              <Card title="Knowledge card" eyebrow="Entity descriptors shipped to llms.txt + Organization JSON-LD">
                <div className="space-y-3">
                  <Field label="Brand name"><Input value={card.brandName} onChange={(e) => setCard({ ...card, brandName: e.target.value })} /></Field>
                  <Field label="Categories"><Chips value={card.categories} onChange={(v) => setCard({ ...card, categories: v })} placeholder="boxing gloves, hand wraps" /></Field>
                  <Field label="Differentiators"><Chips value={card.differentiators} onChange={(v) => setCard({ ...card, differentiators: v })} placeholder="hand-stitched, lifetime repairs" /></Field>
                  <Field label="Locations"><Chips value={card.locations} onChange={(v) => setCard({ ...card, locations: v })} placeholder="Mexico City" /></Field>
                  <Field label="Founders"><Chips value={card.founders} onChange={(v) => setCard({ ...card, founders: v })} /></Field>
                  <div>
                    <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium">Comparisons</span><Button size="xs" icon={<Plus size={11} />} onClick={() => setCard({ ...card, comparisons: [...card.comparisons, { competitor: "", points: [] }] })}>Add</Button></div>
                    <div className="space-y-2">{card.comparisons.map((c, i) => <div key={i} className="rounded border border-line p-2"><div className="flex gap-1.5"><Input value={c.competitor} onChange={(e) => setCard({ ...card, comparisons: card.comparisons.map((x, j) => (j === i ? { ...x, competitor: e.target.value } : x)) })} placeholder="vs. Competitor" className="!h-7" /><button onClick={() => setCard({ ...card, comparisons: card.comparisons.filter((_, j) => j !== i) })} className="text-muted hover:text-danger"><X size={13} /></button></div><div className="mt-1.5"><Chips value={c.points} onChange={(v) => setCard({ ...card, comparisons: card.comparisons.map((x, j) => (j === i ? { ...x, points: v } : x)) })} placeholder="why we're better" /></div></div>)}</div>
                  </div>
                  <Button variant="primary" loading={saveCard.isPending} onClick={() => saveCard.mutate()}>Save knowledge card</Button>
                </div>
              </Card>
              <Card title="How ChatGPT ingests it" eyebrow="Live preview of /llms.txt">
                <pre className={cn("scrollbar-thin max-h-72 overflow-auto rounded border border-line bg-cream p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap", preview.isFetching && "opacity-60")}>{preview.data ?? "…"}</pre>
                <p className="mt-1 text-[10px] text-muted">Placement: {["recommended", "cited", "mentioned", "not_cited"].map((p) => titleCase(p)).join(" › ")}</p>
              </Card>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
