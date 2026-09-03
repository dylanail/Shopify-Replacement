"use client";

import { useState } from "react";
import { Clock, Plus, Wrench, ShieldAlert } from "lucide-react";
import { useAi } from "@/lib/ai-context";
import { useStoreQuery } from "@/lib/store-context";
import { cn, titleCase } from "@/lib/utils";
import { ChatView } from "@/components/ai/chat";
import { HistoryList } from "@/components/ai/history";
import { ModelPicker } from "@/components/ai/panel";
import { AreaIcon } from "@/components/shell/areas";
import { Badge, Tabs } from "@/components/ui";

interface ToolsRes { count: number; byArea: Record<string, string[]>; items: { name: string; description: string; area: string; risky: boolean }[] }

export default function AiPage() {
  const { prompts, send, credits, newSession, historyOpen, setHistoryOpen, sessionId, sessions } = useAi();
  const tools = useStoreQuery<ToolsRes>(["ai-tools"], "/ai/tools");
  const [tab, setTab] = useState<"prompts" | "tools">("prompts");
  const [area, setArea] = useState<string>("all");
  const areas = ["all", ...Object.keys(tools.data?.byArea ?? {})];
  const promptAreas = [...new Set(prompts.map((p) => p.area))];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-h-[60vh] flex-1 flex-col border-b border-line lg:min-h-0 lg:border-b-0 lg:border-r">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-card px-4">
          <h1 className="font-display text-lg">Assistant</h1>
          <Badge tone="accent">Beta</Badge>
          <span className="text-[11px] text-muted">{tools.data ? `${tools.data.count} tools` : ""}{credits ? ` · ${credits.balance.toLocaleString()} credits` : ""}</span>
          <span className="flex-1" />
          <ModelPicker />
          <button onClick={() => setHistoryOpen(!historyOpen)} className={cn("inline-flex h-7 items-center gap-1 rounded border border-line px-2 text-[11px] hover:bg-sand", historyOpen && "bg-sand")}><Clock size={12} /> History{sessions.length ? ` (${sessions.length})` : ""}</button>
          <button onClick={newSession} className="inline-flex h-7 items-center gap-1 rounded border border-line px-2 text-[11px] hover:bg-sand"><Plus size={12} /> New</button>
        </div>
        <div className="flex min-h-0 flex-1">
          {historyOpen && <div className="w-64 shrink-0 border-r border-line bg-cream"><HistoryList onClose={() => setHistoryOpen(false)} className="h-full" /></div>}
          <ChatView key={sessionId ?? "new"} className="min-w-0" placeholder="Ask anything — I can work across every page of the admin." />
        </div>
      </section>
      <aside className="scrollbar-thin w-full shrink-0 overflow-y-auto bg-cream lg:w-[360px]">
        <Tabs value={tab} onChange={setTab} items={[{ value: "prompts", label: "Prompt library", count: prompts.length }, { value: "tools", label: "Tools", count: tools.data?.count }]} className="bg-card px-2" />
        {tab === "prompts" && (
          <div className="p-3">
            <p className="mb-3 text-[11px] text-muted">Curated prompts by area. Click to send — edit the placeholders in your own words first if you like.</p>
            {promptAreas.map((a) => (
              <div key={a} className="mb-4">
                <div className="eyebrow mb-1.5 flex items-center gap-1.5"><AreaIcon area={a} size={11} /> {titleCase(a)}</div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {prompts.filter((p) => p.area === a).map((p) => (
                    <button key={p.title} onClick={() => void send(p.prompt)} className="rounded border border-line bg-card px-2.5 py-2 text-left hover:border-ink">
                      <div className="text-xs font-medium">{p.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">{p.prompt}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "tools" && (
          <div className="p-3">
            <div className="mb-3 flex flex-wrap gap-1">
              {areas.map((a) => (
                <button key={a} onClick={() => setArea(a)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", area === a ? "border-ink bg-ink text-white" : "border-line bg-card text-muted hover:text-ink")}>{a === "all" ? "All" : titleCase(a)}{a !== "all" ? ` ${tools.data?.byArea[a]?.length ?? ""}` : ""}</button>
              ))}
            </div>
            <ul className="space-y-1">
              {(tools.data?.items ?? []).filter((t) => area === "all" || t.area === area).map((t) => (
                <li key={t.name} className="rounded border border-line bg-card px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Wrench size={11} className="text-muted" />
                    <span className="font-mono font-medium">{t.name}</span>
                    <AreaIcon area={t.area} size={11} className="ml-auto text-muted" />
                    {t.risky && <span title="Asks for confirmation unless granted in Settings"><ShieldAlert size={11} className="text-amber" /></span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{t.description}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
