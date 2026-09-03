"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Sparkles, X } from "lucide-react";
import { useAi } from "@/lib/ai-context";
import { cn } from "@/lib/utils";
import { KilnMark } from "@/components/shell/logo";
import { ChatView } from "./chat";
import { HistoryList } from "./history";
import { Badge } from "@/components/ui";

export function ModelPicker({ className }: { className?: string }) {
  const { model, setModel, models, credits } = useAi();
  const current = models.find((m) => m.id === model) ?? models.find((m) => m.available && m.id !== "offline") ?? models[0];
  return (
    <div className={cn("relative", className)}>
      <select value={current?.id ?? ""} onChange={(e) => setModel(e.target.value)} title={credits ? `${credits.balance.toLocaleString()} credits left` : undefined} className="h-6 max-w-[120px] appearance-none truncate rounded border border-line bg-card pl-1.5 pr-5 text-[10px] text-muted outline-none hover:text-ink">
        {models.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.available ? "" : " (no key)"}</option>)}
      </select>
      <ChevronDown size={10} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function PanelHeader({ onClose, compact }: { onClose?: () => void; compact?: boolean }) {
  const { historyOpen, setHistoryOpen, panel, setPanel, activeRun } = useAi();
  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line bg-card px-2">
      <KilnMark size={16} />
      <span className="text-xs font-semibold">Kiln Assistant</span>
      <Badge tone="accent" className="!px-1 !py-0 !text-[9px]">Beta</Badge>
      {activeRun && activeRun.status !== "paused" && <span className="h-1.5 w-1.5 rounded-full bg-amber pulse" title="Running" />}
      <span className="flex-1" />
      <ModelPicker />
      <button onClick={() => setHistoryOpen(!historyOpen)} title="History" className={cn("inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-sand hover:text-ink", historyOpen && "bg-sand text-ink")}><Clock size={13} /></button>
      {!compact && (
        <>
          <button onClick={() => setPanel(panel === "wide" ? "open" : "wide")} title={panel === "wide" ? "Narrow" : "Expand"} className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-sand hover:text-ink">{panel === "wide" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
          <button onClick={() => setPanel("collapsed")} title="Collapse" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-sand hover:text-ink"><PanelRightClose size={14} /></button>
        </>
      )}
      {onClose && <button onClick={onClose} className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-sand hover:text-ink"><X size={14} /></button>}
    </div>
  );
}

/** Desktop: right-docked, collapsible to a 44px strip, expandable to 520px. */
export function AiPanel() {
  const { panel, setPanel, historyOpen, setHistoryOpen, activeRun } = useAi();
  if (panel === "collapsed") {
    return (
      <aside className="hidden w-[44px] shrink-0 flex-col items-center border-l border-line bg-card pt-2 md:flex" style={{ width: "var(--panel-w-collapsed)" }}>
        <button onClick={() => setPanel("open")} title="Open assistant" className="relative inline-flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-sand hover:text-ink">
          <PanelRightOpen size={16} />
          {activeRun && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber pulse" />}
        </button>
        <button onClick={() => setPanel("open")} className="mt-3 flex flex-col items-center gap-2 text-muted hover:text-ink" title="Kiln Assistant">
          <KilnMark size={16} />
          <span className="text-[10px] font-medium tracking-wide" style={{ writingMode: "vertical-rl" }}>Assistant</span>
        </button>
      </aside>
    );
  }
  return (
    <aside className="hidden shrink-0 flex-col border-l border-line bg-cream md:flex" style={{ width: panel === "wide" ? "var(--panel-w-wide)" : "var(--panel-w)" }}>
      <PanelHeader />
      {historyOpen ? <HistoryList onClose={() => setHistoryOpen(false)} /> : <ChatView compact={panel !== "wide"} />}
    </aside>
  );
}

/** Mobile: floating button + draggable bottom sheet with half/full snap points. */
export function MobileChatSheet() {
  const { sheet, setSheet, historyOpen, setHistoryOpen, activeRun } = useAi();
  const [dragY, setDragY] = useState<number | null>(null);
  const startY = useRef(0);
  const startH = useRef(0);
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const targetH = sheet === "full" ? vh - 8 : Math.round(vh * 0.55);
  const height = dragY !== null ? Math.max(120, Math.min(vh - 8, startH.current - (dragY - startY.current))) : targetH;

  useEffect(() => {
    if (sheet === "closed") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [sheet]);

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    startH.current = height;
    setDragY(e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (dragY !== null) setDragY(e.clientY); };
  const onPointerUp = () => {
    if (dragY === null) return;
    const h = height;
    setDragY(null);
    if (h < vh * 0.3) setSheet("closed");
    else if (h > vh * 0.78) setSheet("full");
    else setSheet("half");
  };

  return (
    <>
      {sheet === "closed" && (
        <button onClick={() => setSheet("half")} className="fixed bottom-[64px] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white shadow-lg md:hidden" aria-label="Open assistant">
          <Sparkles size={20} />
          {activeRun && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-ink bg-amber" />}
        </button>
      )}
      {sheet !== "closed" && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setSheet("closed")} />
          <div className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-xl border-t border-line bg-cream shadow-2xl" style={{ height, transition: dragY === null ? "height 200ms ease-out" : "none" }}>
            <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center">
              <span className="h-1 w-10 rounded-full bg-line-strong" />
            </div>
            <PanelHeader compact onClose={() => setSheet("closed")} />
            {historyOpen ? <HistoryList onClose={() => setHistoryOpen(false)} /> : <ChatView />}
          </div>
        </div>
      )}
    </>
  );
}
