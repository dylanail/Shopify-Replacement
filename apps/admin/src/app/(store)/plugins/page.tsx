"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Lock, Search, Sparkles } from "lucide-react";
import { useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { useAi } from "@/lib/ai-context";
import { cn } from "@/lib/utils";
import type { CatalogPlugin, InstalledPlugin } from "@/lib/types";
import { Page } from "@/components/shell/shell";
import { Badge, Button, Input, Loading, PageHeader, useDebounce } from "@/components/ui";

interface Res { items: CatalogPlugin[]; categories: { category: string; count: number }[]; installed: InstalledPlugin[] }
const PAGE = 18;

function PluginCard({ p, onInstall, busy }: { p: CatalogPlugin; onInstall: () => void; busy: boolean }) {
  return (
    <article className={cn("card flex flex-col p-3", p.featured && p.source === "first-party" && "border-accent/40")}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-cream text-lg">{p.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><Link href={`/plugins/${p.id}`} className="truncate text-[13px] font-semibold hover:underline">{p.name}</Link>{p.source === "first-party" && <Badge tone="accent" className="!px-1 !text-[9px]">Kiln</Badge>}</div>
          <div className="text-[10px] text-muted">{p.category}{p.regions.length ? ` · ${p.regions.join(", ")}` : ""}</div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 flex-1 text-[11px] text-muted">{p.description}</p>
      <div className="mt-3 flex items-center gap-1.5">
        {p.installed ? <Link href={`/plugins/${p.id}`}><Button size="xs" icon={<Check size={11} />}>Installed</Button></Link> : !p.installable ? <Link href={`/plugins/${p.id}`}><Button size="xs" variant="ghost">Directory listing</Button></Link> : !p.available ? <Badge tone="amber"><Lock size={10} /> {p.allowedPlanSlugs?.[0] ? `${p.allowedPlanSlugs[0]}+ plan` : "plan-gated"}</Badge> : <Button size="xs" variant="primary" loading={busy} onClick={onInstall}>Install</Button>}
        {p.aiTools.length > 0 && <span className="text-[10px] text-muted">{p.aiTools.length} AI tool{p.aiTools.length > 1 ? "s" : ""}</span>}
        <span className="flex-1" />
        <Link href={`/plugins/${p.id}`} className="text-[11px] text-muted hover:text-ink">Details</Link>
      </div>
    </article>
  );
}

export default function PluginsPage() {
  const { open } = useAi();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [shown, setShown] = useState(PAGE);
  const dq = useDebounce(q);
  const res = useStoreQuery<Res>(["plugins"], "/plugins", { query: { q: dq, category } });
  const install = useStoreMutation((sapi, id: string) => sapi(`/plugins/${id}/install`, { method: "POST", body: {} }), { success: "Installed — configure it on the plugin page", invalidate: "plugins" });
  const items = res.data?.items ?? [];
  const featured = useMemo(() => items.filter((p) => p.featured && p.source === "first-party"), [items]);
  const installedCount = res.data?.installed.length ?? 0;
  const list = items.slice(0, shown);

  return (
    <Page wide>
      <PageHeader eyebrow="Discover" title="Plugins" subtitle={`${items.length} integrations and modules. First-party plugins ship with settings forms, AI tools and storefront components.`} actions={<Button icon={<Sparkles size={13} className="text-accent" />} onClick={() => open("Which plugins should I install for my store? Install the obvious ones.")}>Ask what to install</Button>} />
      {!dq && !category && featured.length > 0 && (
        <section className="mb-5">
          <div className="eyebrow mb-2">Featured · first-party</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{featured.map((p) => <PluginCard key={p.id} p={p} busy={install.isPending && install.variables === p.id} onInstall={() => install.mutate(p.id)} />)}</div>
        </section>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search plugins…" className="!pl-8" /></div>
        <span className="text-[11px] text-muted">{installedCount} installed</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        <button onClick={() => { setCategory(""); setShown(PAGE); }} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", !category ? "border-ink bg-ink text-white" : "border-line text-muted hover:text-ink")}>All</button>
        {(res.data?.categories ?? []).map((c) => <button key={c.category} onClick={() => { setCategory(c.category); setShown(PAGE); }} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", category === c.category ? "border-ink bg-ink text-white" : "border-line text-muted hover:text-ink")}>{c.category} <span className="opacity-60">{c.count}</span></button>)}
      </div>
      {res.isLoading && <Loading />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map((p) => <PluginCard key={p.id} p={p} busy={install.isPending && install.variables === p.id} onInstall={() => install.mutate(p.id)} />)}</div>
      {items.length > shown && <div className="mt-4 flex justify-center"><Button onClick={() => setShown((s) => s + PAGE)}>Show more ({items.length - shown})</Button></div>}
      {res.data && items.length === 0 && <div className="card px-4 py-10 text-center text-xs text-muted">Nothing matches. Ask the assistant to request a native integration.</div>}
    </Page>
  );
}
