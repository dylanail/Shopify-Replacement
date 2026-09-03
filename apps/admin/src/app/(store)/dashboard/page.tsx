"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, LoaderCircle, MessageCircle, Rocket, TrendingUp } from "lucide-react";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn, fmtDate, fmtNumber, fmtPct, money, timeAgo } from "@/lib/utils";
import type { Dashboard, Todo } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { BrowserFrame } from "@/components/preview";
import { AreaChart } from "@/components/charts";
import { Badge, Card, ErrorBox, Kpi, KpiRow, Loading, SegmentedControl, StatusBadge } from "@/components/ui";
import { AreaIcon } from "@/components/shell/areas";

const RANGES = [{ value: "1", label: "24h" }, { value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "90", label: "90d" }] as const;
type Range = (typeof RANGES)[number]["value"];

function TodoRow({ t, onPrompt }: { t: Todo; onPrompt: (p: string) => void }) {
  const done = t.status === "done";
  const tone = done ? "border-positive bg-positive text-white" : t.status === "in_progress" ? "border-amber text-amber" : t.status === "waiting" ? "border-accent bg-accent-soft text-accent" : "border-line text-faint";
  const label = done ? "Done" : t.status === "in_progress" ? "In progress" : t.status === "waiting" ? "Waiting on you" : "To do";
  const setStatus = useStoreMutation((sapi, s: Todo["status"]) => sapi(`/todos/${t.key}`, { method: "PATCH", body: { status: s } }), { success: "Updated", invalidate: "dashboard" });
  const inner = (
    <>
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStatus.mutate(done ? "todo" : "done"); }} title={done ? "Mark as to do" : "Mark done"} className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]", tone)}>
        {done ? <Check size={11} strokeWidth={3} /> : t.status === "in_progress" ? <LoaderCircle size={11} className="animate-spin" /> : t.status === "waiting" ? "!" : null}
      </button>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px]", done ? "text-muted line-through" : "text-ink")}>{t.title}</span>
        {!done && <span className="block text-[11px] text-muted">{t.description}</span>}
      </span>
      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", done ? "bg-positive-soft text-positive" : t.status === "in_progress" ? "bg-amber-soft text-amber" : t.status === "waiting" ? "bg-accent-soft text-accent" : "bg-sand text-muted")}>{label}</span>
      {!done && t.prompt && <button onClick={(e) => { e.preventDefault(); onPrompt(t.prompt!); }} title="Ask the assistant" className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:border-ink hover:text-ink sm:inline-flex">Ask AI</button>}
    </>
  );
  const cls = "flex items-start gap-3 px-4 py-2.5 hover:bg-cream/60";
  return t.href ? <Link href={t.href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export default function DashboardPage() {
  const { me, store } = useStore();
  const { open } = useAi();
  const [range, setRange] = useState<Range>("7");
  const q = useStoreQuery<Dashboard>(["dashboard"], "/dashboard", { query: { days: range }, refetchInterval: 60_000 });
  const d = q.data;
  const firstName = me.user.name.split(" ")[0] ?? me.user.name;

  return (
    <Page wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] leading-tight">Hello {firstName}, <em className="italic">welcome back.</em></h1>
          <p className="mt-1 text-muted">{store?.name} · {d ? <StatusBadge status={d.store.status} /> : null}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="hidden sm:inline">Questions?</span>
          <button onClick={() => open()} className="inline-flex items-center gap-1 rounded border border-line bg-card px-2 py-1 text-[11px] font-medium text-ink hover:bg-sand"><MessageCircle size={12} className="text-accent" /> Live chat</button>
          <SegmentedControl value={range} onChange={setRange} items={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        </div>
      </div>

      {q.isError && <div className="mt-4"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>}
      {!d && !q.isError && <Loading />}
      {d && (
        <>
          {d.deployment.buildStatus !== "idle" && (
            <div className={cn("mt-4 flex flex-wrap items-center gap-3 rounded border px-3 py-2 text-xs", d.deployment.buildStatus === "failed" ? "border-danger/30 bg-danger-soft" : "border-line bg-card")}>
              <Rocket size={13} className={d.deployment.buildStatus === "failed" ? "text-danger" : "text-positive"} />
              <span><strong>v{d.deployment.version}</strong> {d.deployment.publishedAt ? `published ${timeAgo(d.deployment.publishedAt)}` : "not published yet"}</span>
              <StatusBadge status={d.deployment.buildStatus} />
              {d.publish.dirty && <span className="text-muted">· {d.publish.reason}</span>}
              <span className="flex-1" />
              <Link href="/designer" className="inline-flex items-center gap-1 text-muted hover:text-ink">Open designer <ArrowRight size={11} /></Link>
            </div>
          )}

          <KpiRow className="mt-4">
            <Kpi label="Sessions" value={fmtNumber(d.kpis.sessions.value)} delta={d.kpis.sessions.delta} />
            <Kpi label="Total sales" value={money(d.kpis.totalSalesCents.value, store?.defaultCurrency)} delta={d.kpis.totalSalesCents.delta} />
            <Kpi label="Orders" value={fmtNumber(d.kpis.orders.value)} delta={d.kpis.orders.delta} />
            <Kpi label="Conversion rate" value={fmtPct(d.kpis.conversionRate.value, 2)} delta={d.kpis.conversionRate.delta} />
            <Kpi label="AOV" value={money(d.kpis.aovCents.value, store?.defaultCurrency)} delta={d.kpis.aovCents.delta} />
          </KpiRow>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <Card eyebrow={`Last ${d.range.days} day${d.range.days === 1 ? "" : "s"}`} title="Sales" action={<span className="inline-flex items-center gap-1 text-[11px] text-muted"><TrendingUp size={12} /> revenue · sessions</span>}>
                <AreaChart data={d.series as unknown as Record<string, unknown>[]} x="day" y="revenueCents" y2="sessions" label="Revenue" label2="Sessions" format={(v) => (v >= 100 ? money(v, store?.defaultCurrency) : String(Math.round(v)))} height={190} />
              </Card>
              <BrowserFrame url={d.store.url} height={520} />
            </div>
            <div className="space-y-4">
              <Card eyebrow="Next steps" title="Your punch list" padded={false} action={<span className="text-[11px] text-muted">{d.todos.filter((t) => t.status === "done").length}/{d.todos.length} done</span>}>
                <div className="divide-y divide-line">
                  {d.todos.map((t) => <TodoRow key={t.key} t={t} onPrompt={(p) => open(p)} />)}
                </div>
              </Card>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/products" className="card p-3 hover:border-ink">
                  <div className="eyebrow">Products</div>
                  <div className="mt-1 text-lg font-semibold">{d.products.total}</div>
                  <div className="text-[11px] text-muted">{d.products.published} live · {d.products.drafts} drafts{d.products.outOfStock ? ` · ${d.products.outOfStock} out of stock` : ""}</div>
                </Link>
                <Link href="/orders" className="card p-3 hover:border-ink">
                  <div className="eyebrow">Orders</div>
                  <div className="mt-1 text-lg font-semibold">{d.orders.total}</div>
                  <div className="text-[11px] text-muted">{money(d.orders.revenueCents, store?.defaultCurrency)} lifetime{d.orders.unfulfilled ? ` · ${d.orders.unfulfilled} to fulfil` : ""}</div>
                </Link>
              </div>
              <Card eyebrow="Recent" title="Activity" padded={false}>
                {d.activity.length === 0 ? <div className="px-4 py-6 text-center text-[11px] text-muted">Activity from you and the assistant shows up here.</div> : (
                  <ul className="divide-y divide-line">
                    {d.activity.slice(0, 12).map((a, i) => (
                      <li key={a.id ?? i} className="flex items-start gap-2 px-4 py-2">
                        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", a.status === "error" ? "bg-danger" : a.status === "running" ? "bg-amber" : "bg-positive")} />
                        <AreaIcon area={a.area} size={12} className="mt-0.5 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 text-xs">{a.message}</span>
                        <span className="shrink-0 text-[10px] text-faint"><Clock size={9} className="mr-0.5 inline" />{timeAgo(a.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-faint">Range {fmtDate(d.range.from)} – {fmtDate(d.range.to)} · deltas vs the previous period · <Badge tone="neutral">first-party, no cookies</Badge></p>
        </>
      )}
    </Page>
  );
}
