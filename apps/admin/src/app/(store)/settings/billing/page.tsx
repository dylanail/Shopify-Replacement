"use client";

import { useState } from "react";
import { Check, Coins, Phone } from "lucide-react";
import type { PlanDef } from "@kiln/shared";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { cn, fmtDate, money } from "@/lib/utils";
import { Badge, Button, Card, Input, Loading, SegmentedControl, StatusBadge } from "@/components/ui";
import { BOOK_CALL_URL } from "@/components/shell/topbar";

interface Billing { org: { id: string; name: string; planSlug: string; billingInterval: string; subscriptionStatus: string; currentPeriodEnd: string | null }; plan: PlanDef; usage: { stores: number; maxStores: number }; plans: (PlanDef & { cardRateLabel: string; creditsLabel: string })[]; credits: { balance: number; usedThisPeriod: number; periodStart: string } }

export default function BillingPage() {
  const { refreshStore } = useStore();
  const q = useStoreQuery<Billing>(["billing"], "/billing");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [credits, setCredits] = useState("500");
  const change = useStoreMutation((sapi, planSlug: string) => sapi<{ checkoutUrl: string | null; planSlug?: string }>("/billing/plan", { method: "POST", body: { planSlug, interval } }), { success: (r) => (r.checkoutUrl ? "Redirecting to checkout…" : `Switched to ${r.planSlug}`), invalidate: "billing", onSuccess: (r) => { if (r.checkoutUrl) window.location.href = r.checkoutUrl; else refreshStore(); } });
  const topUp = useStoreMutation((sapi) => sapi<{ balance: number }>("/billing/credits/top-up", { method: "POST", body: { credits: Number(credits) } }), { success: (r) => `Balance is now ${r.balance.toLocaleString()} credits`, invalidate: "billing", onSuccess: refreshStore });
  const d = q.data;
  if (!d) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Current plan" eyebrow={d.org.name}>
          <div className="flex items-center gap-3"><div className="font-display text-2xl">{d.plan.name}</div><StatusBadge status={d.org.subscriptionStatus} /><Badge>{d.org.billingInterval}</Badge></div>
          <p className="mt-1 text-xs text-muted">{d.plan.tagline} · {d.usage.stores}/{d.usage.maxStores} stores{d.org.currentPeriodEnd ? ` · renews ${fmtDate(d.org.currentPeriodEnd)}` : ""}</p>
          <ul className="mt-3 space-y-0.5 text-xs">{d.plan.displayFeatures.map((f) => <li key={f} className="flex items-center gap-1.5"><Check size={11} className="text-positive" />{f}</li>)}</ul>
        </Card>
        <Card title="AI credits" eyebrow="Pool for this store" action={<Coins size={14} className="text-amber" />}>
          <div className="font-display text-2xl">{d.plan.baseCreditsPerMonth == null ? "Unlimited" : d.credits.balance.toLocaleString()}</div>
          <p className="mt-1 text-xs text-muted">{d.credits.usedThisPeriod.toLocaleString()} used since {fmtDate(d.credits.periodStart)}{d.plan.baseCreditsPerMonth != null ? ` · ${d.plan.baseCreditsPerMonth}/month included` : ""}</p>
          <div className="mt-3 flex gap-2"><Input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} className="!w-28" /><Button loading={topUp.isPending} onClick={() => topUp.mutate()}>Top up</Button></div>
          <p className="mt-1 text-[11px] text-muted">Pay-as-you-go top-ups never expire. Roughly 1 credit per assistant turn, 3–8 for generation.</p>
        </Card>
      </div>
      <div className="flex items-center justify-between">
        <div className="eyebrow">Plans</div>
        <div className="flex items-center gap-2"><SegmentedControl value={interval} onChange={setInterval} items={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />{interval === "yearly" && <Badge tone="green">save 20%</Badge>}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {d.plans.map((p) => {
          const current = p.slug === d.org.planSlug;
          const price = interval === "yearly" ? p.yearlyPriceCents / 12 : p.monthlyPriceCents;
          return (
            <div key={p.slug} className={cn("card flex flex-col p-3", p.isPopular && "border-accent", current && "bg-cream")}>
              <div className="flex items-center justify-between"><div className="font-display text-lg">{p.name}</div>{p.isPopular && <Badge tone="accent">popular</Badge>}{current && <Badge tone="ink">current</Badge>}</div>
              <div className="mt-1 text-[11px] text-muted">{p.tagline}</div>
              <div className="mt-3 text-xl font-semibold">{p.slug === "enterprise" ? "Custom" : money(price)}<span className="text-xs font-normal text-muted">{p.slug === "enterprise" ? "" : "/mo"}</span></div>
              <div className="text-[10px] text-muted">{p.cardRateLabel} · {p.platformFeeBps / 100}% platform fee · {p.creditsLabel}</div>
              <ul className="mt-3 flex-1 space-y-0.5 text-[11px]">{p.displayFeatures.map((f) => <li key={f} className="flex items-start gap-1"><Check size={10} className="mt-0.5 shrink-0 text-positive" />{f}</li>)}</ul>
              {p.slug === "enterprise" ? <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="mt-3"><Button size="sm" className="w-full" icon={<Phone size={11} />}>{p.ctaLabel}</Button></a> : <Button size="sm" variant={current ? "secondary" : p.isPopular ? "accent" : "primary"} className="mt-3 w-full" disabled={current} loading={change.isPending && change.variables === p.slug} onClick={() => change.mutate(p.slug)}>{current ? "Your plan" : p.ctaLabel}</Button>}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">Cancel any time: your store stays exportable for 90 days (CSV, JSON, archive) after a downgrade to Free.</p>
    </div>
  );
}
