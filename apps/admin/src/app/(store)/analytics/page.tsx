"use client";

import { useEffect, useState } from "react";
import { Radio, Sparkles } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useEventChannel, type AnalyticsEvent } from "@/lib/events";
import { useAi } from "@/lib/ai-context";
import { cn, fmtNumber, fmtPct, money, timeAgo } from "@/lib/utils";
import type { Kpi as KpiT, SeriesPoint } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { AreaChart, BarRow } from "@/components/charts";
import { Badge, Button, Card, Kpi, KpiRow, SegmentedControl, Table, Td, Th, Tr } from "@/components/ui";

type Range = "24h" | "7d" | "30d" | "90d";
interface Summary { range: { from: string; to: string; days: number }; kpis: { sessions: KpiT; totalSalesCents: KpiT; orders: KpiT; conversionRate: KpiT; aovCents: KpiT } }
interface Funnel { steps: { key: string; label: string; sessions: number; rate: number; dropOff: number; benchmark?: { median: number; topDecile: number } }[]; benchmarks: Record<string, { median: number; topDecile: number }> }
interface Realtime { visitorsNow: number; events: { kind: string; path: string | null; valueCents: number; createdAt: string; country: string | null; city: string | null }[]; geo: { country: string; sessions: number }[]; visits: { city: string | null; country: string | null; path: string | null; at: string }[] }
interface SubMetrics { metrics: { subscribers: number; mrrCents: number; churnRate: number; trialing: number; byCadence: Record<string, number> } }

const flag = (cc: string) => (cc && cc.length === 2 && cc !== "??" ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌐");
const kindTone = (k: string) => (k.startsWith("checkout.complete") ? "green" : k.startsWith("cart") ? "amber" : k.startsWith("checkout") ? "teal" : "neutral") as "green" | "amber" | "teal" | "neutral";

export default function AnalyticsPage() {
  const { store } = useStore();
  const { open } = useAi();
  const [range, setRange] = useState<Range>("7d");
  const cur = store?.defaultCurrency;
  const summary = useStoreQuery<Summary>(["an-summary"], "/analytics/summary", { query: { range }, refetchInterval: 60_000 });
  const series = useStoreQuery<{ items: SeriesPoint[] }>(["an-series"], "/analytics/timeseries", { query: { range } });
  const funnel = useStoreQuery<Funnel>(["an-funnel"], "/analytics/funnel", { query: { range } });
  const realtime = useStoreQuery<Realtime>(["an-realtime"], "/analytics/realtime", { refetchInterval: 15_000 });
  const top = useStoreQuery<{ items: { productId: string; title: string; units: number; revenueCents: number }[] }>(["an-top"], "/analytics/top-products", { query: { range } });
  const cohorts = useStoreQuery<{ items: { month: string; size: number; retention: number[] }[] }>(["an-cohorts"], "/analytics/cohorts");
  const subs = useStoreQuery<SubMetrics>(["subscriptions"], "/subscriptions");
  const [live, setLive] = useState<(AnalyticsEvent & { id: number })[]>([]);
  const [pulse, setPulse] = useState(0);
  useEventChannel<AnalyticsEvent>("analytics", (e) => { setLive((l) => [{ ...e, id: Date.now() + Math.random() }, ...l].slice(0, 40)); setPulse((p) => p + 1); });
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t); }, []);

  const k = summary.data?.kpis;
  const rt = realtime.data;
  const ticker = [...live.map((e) => ({ kind: e.kind, path: e.path ?? null, valueCents: e.valueCents ?? 0, at: e.at, country: e.country ?? null, city: e.city ?? null, fresh: true })), ...(rt?.events ?? []).map((e) => ({ kind: e.kind, path: e.path, valueCents: e.valueCents, at: e.createdAt, country: e.country, city: e.city, fresh: false }))].slice(0, 30);
  const maxGeo = Math.max(1, ...(rt?.geo ?? []).map((g) => g.sessions));

  return (
    <Page wide>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow mb-1">Growth</div><h1 className="font-display text-[26px] leading-tight">Analytics</h1><p className="mt-1 text-xs text-muted">First-party, cookie-less. Sessions are keyed by a daily-rotating fingerprint — no pixel, no SDK, no consent banner.</p></div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<Sparkles size={13} className="text-accent" />} onClick={() => open(`Review analytics for the last ${range} and tell me what to fix`)}>What should I fix?</Button>
          <SegmentedControl value={range} onChange={setRange} items={[{ value: "24h", label: "24H" }, { value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }]} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-line bg-card px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium"><span key={pulse} className="h-2 w-2 rounded-full bg-positive animate-in" /><Radio size={13} className="text-positive" /> {rt?.visitorsNow ?? 0} on site now</span>
        <span className="text-muted">·</span>
        <span className="text-muted">{live.length} live events this session</span>
        <span className="flex-1" />
        <Badge tone="neutral">first-party</Badge><Badge tone="neutral">no cookies</Badge>
      </div>

      <KpiRow>
        <Kpi label="Sessions" value={fmtNumber(k?.sessions.value ?? 0)} delta={k?.sessions.delta} />
        <Kpi label="Revenue" value={money(k?.totalSalesCents.value ?? 0, cur)} delta={k?.totalSalesCents.delta} />
        <Kpi label="Orders" value={fmtNumber(k?.orders.value ?? 0)} delta={k?.orders.delta} />
        <Kpi label="Conversion" value={fmtPct(k?.conversionRate.value ?? 0, 2)} delta={k?.conversionRate.delta} />
        <Kpi label="AOV" value={money(k?.aovCents.value ?? 0, cur)} delta={k?.aovCents.delta} />
      </KpiRow>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="Revenue & sessions" eyebrow={range}>
            <AreaChart data={(series.data?.items ?? []) as unknown as Record<string, unknown>[]} x="day" y="revenueCents" y2="sessions" label="Revenue" label2="Sessions" format={(v) => (v >= 100 ? money(v, cur) : String(Math.round(v)))} height={200} />
          </Card>
          <Card title="Funnel" eyebrow="Sessions → add to cart → checkout → purchase" action={<span className="flex items-center gap-3 text-[10px] text-muted"><span className="inline-flex items-center gap-1"><span className="h-3 w-[2px] bg-amber" /> industry median</span><span className="inline-flex items-center gap-1"><span className="h-3 w-[2px] bg-positive" /> top decile</span></span>}>
            {(funnel.data?.steps ?? []).map((s, i) => (
              <BarRow key={s.key} label={s.label} value={s.rate} max={100} display={`${fmtNumber(s.sessions)} · ${fmtPct(s.rate)}`} color={i === 0 ? "#1a1a1a" : i === 3 ? "#2f7a4f" : "#b8552f"} sub={i > 0 ? `${fmtPct(s.dropOff)} drop-off from previous step${s.benchmark ? ` · median ${s.benchmark.median}% · top decile ${s.benchmark.topDecile}%` : ""}` : undefined} markers={s.benchmark ? [{ value: s.benchmark.median, label: "median", color: "#b7791f" }, { value: s.benchmark.topDecile, label: "top decile", color: "#2f7a4f" }] : undefined} />
            ))}
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Top products" eyebrow={range} padded={false}>
              {(top.data?.items ?? []).length === 0 ? <div className="px-4 py-6 text-center text-[11px] text-muted">No sales in this range.</div> : (
                <Table><thead><tr><Th>Product</Th><Th right>Units</Th><Th right>Revenue</Th></tr></thead><tbody>{top.data!.items.map((p) => <Tr key={p.productId}><Td className="font-medium">{p.title}</Td><Td right>{p.units}</Td><Td right>{money(p.revenueCents, cur)}</Td></Tr>)}</tbody></Table>
              )}
            </Card>
            <Card title="Subscriptions" eyebrow="Recurring">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="eyebrow">Subscribers</div><div className="text-xl font-semibold">{subs.data?.metrics.subscribers ?? 0}</div></div>
                <div><div className="eyebrow">MRR</div><div className="text-xl font-semibold">{money(subs.data?.metrics.mrrCents ?? 0, cur)}</div></div>
                <div><div className="eyebrow">Churn</div><div className="text-xl font-semibold">{fmtPct(subs.data?.metrics.churnRate ?? 0)}</div></div>
                <div><div className="eyebrow">Trialing</div><div className="text-xl font-semibold">{subs.data?.metrics.trialing ?? 0}</div></div>
              </div>
              {subs.data && Object.keys(subs.data.metrics.byCadence).length > 0 && <div className="mt-3 flex flex-wrap gap-1">{Object.entries(subs.data.metrics.byCadence).map(([c, n]) => <Badge key={c}>{c}: {n}</Badge>)}</div>}
            </Card>
          </div>
          <Card title="Cohort retention" eyebrow="Customers who ordered again, by first-order month" padded={false}>
            {(cohorts.data?.items ?? []).length === 0 ? <div className="px-4 py-6 text-center text-[11px] text-muted">Cohorts appear once customers place a second order.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead><tr><th className="eyebrow px-3 py-2 text-left">Cohort</th><th className="eyebrow px-3 py-2 text-right">Size</th>{[0, 1, 2, 3, 4, 5].map((m) => <th key={m} className="eyebrow px-2 py-2 text-center">M{m}</th>)}</tr></thead>
                  <tbody>
                    {cohorts.data!.items.map((c) => (
                      <tr key={c.month} className="border-t border-line">
                        <td className="px-3 py-1.5 font-medium">{c.month}</td><td className="px-3 py-1.5 text-right">{c.size}</td>
                        {c.retention.map((r, i) => <td key={i} className="px-1 py-1"><div className="rounded px-1 py-1 text-center" style={{ background: `rgba(47,111,106,${Math.min(1, r / 100 + 0.05)})`, color: r > 50 ? "#fff" : "#1a1a1a" }}>{fmtPct(r, 0)}</div></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Where visitors are" eyebrow="Last 24 hours">
            {(rt?.geo ?? []).length === 0 && <div className="text-[11px] text-muted">No sessions yet.</div>}
            <ul className="space-y-1.5">{(rt?.geo ?? []).map((g) => <li key={g.country} className="text-xs"><div className="flex justify-between"><span>{flag(g.country)} {g.country}</span><span className="text-muted">{g.sessions}</span></div><div className="mt-0.5 h-1 rounded bg-sand"><div className="h-1 rounded bg-teal" style={{ width: `${(g.sessions / maxGeo) * 100}%` }} /></div></li>)}</ul>
          </Card>
          <Card title="Live visits" padded={false}>
            <ul className="divide-y divide-line">
              {(rt?.visits ?? []).length === 0 && <li className="px-4 py-5 text-center text-[11px] text-muted">Waiting for visitors…</li>}
              {(rt?.visits ?? []).map((v, i) => <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs"><span>{flag(v.country ?? "")}</span><span className="min-w-0 flex-1 truncate"><span className="font-medium">{v.city ?? "Somewhere"}</span> <span className="text-muted">{v.path ?? "/"}</span></span><span className="text-[10px] text-faint">{timeAgo(v.at)}</span></li>)}
            </ul>
          </Card>
          <Card title="Event ticker" eyebrow="Realtime" padded={false}>
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {ticker.length === 0 && <li className="px-4 py-5 text-center text-[11px] text-muted">Events stream in as people browse.</li>}
              {ticker.map((e, i) => <li key={i} className={cn("flex items-center gap-2 px-3 py-1.5 text-[11px]", e.fresh && "animate-in bg-positive-soft/40")}><Badge tone={kindTone(e.kind)} className="!px-1 !text-[9px]">{e.kind}</Badge><span className="min-w-0 flex-1 truncate text-muted">{e.path ?? ""}{e.city ? ` · ${e.city}` : ""}</span>{e.valueCents ? <span className="font-medium">{money(e.valueCents, cur)}</span> : null}<span className="text-[10px] text-faint">{timeAgo(e.at)}</span></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
