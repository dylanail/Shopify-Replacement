"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, ImagePlus, LoaderCircle, Mic, Send, Square, X, ListChecks, ChevronDown, ChevronRight } from "lucide-react";
import { useAi, type ChatMsg, type ToolCall } from "@/lib/ai-context";
import { useStore } from "@/lib/store-context";
import { cn, fileToDataUrl, titleCase } from "@/lib/utils";
import { speechSupported, startDictation } from "@/lib/speech";
import { AreaIcon } from "@/components/shell/areas";
import { KilnMark } from "@/components/shell/logo";
import { Button } from "@/components/ui";
import type { Todo } from "@/lib/types";
import { useStoreQuery } from "@/lib/store-context";

function toolLabel(t: ToolCall) {
  const inp = (t.input ?? {}) as Record<string, unknown>;
  const out = (t.output ?? {}) as Record<string, unknown>;
  const pick = (o: Record<string, unknown>) => [o.title, o.name, o.code, o.query, o.hostname, o.email, o.prompt, o.headline].find((v) => typeof v === "string" && v) as string | undefined;
  return pick(inp) ?? pick(out) ?? (typeof out === "object" && out && "count" in out ? `${out.count} results` : undefined);
}

export function ToolChip({ t }: { t: ToolCall }) {
  const [open, setOpen] = useState(false);
  const label = toolLabel(t);
  return (
    <div className="max-w-full">
      <button onClick={() => setOpen((o) => !o)} className={cn("inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium", t.status === "running" && "border-amber/40 bg-amber-soft text-amber", t.status === "done" && "border-line bg-card text-ink", t.status === "error" && "border-danger/40 bg-danger-soft text-danger")}>
        {t.status === "running" ? <LoaderCircle size={11} className="animate-spin" /> : t.status === "done" ? <Check size={11} strokeWidth={3} /> : <CircleAlert size={11} />}
        <AreaIcon area={t.area} size={11} className="text-muted" />
        <span className="font-mono">{t.name}</span>
        {label && <span className="truncate text-muted">· {label}</span>}
      </button>
      {open && (
        <pre className="scrollbar-thin mt-1 max-h-40 overflow-auto rounded border border-line bg-cream p-2 text-[10px] leading-snug text-muted">{JSON.stringify({ input: t.input, output: t.output }, null, 1).slice(0, 4000)}</pre>
      )}
    </div>
  );
}

function renderText(text: string) {
  // Minimal markdown: paragraphs, bullets, bold, inline code.
  const blocks = text.split(/\n{2,}/);
  return blocks.map((b, i) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={i} className="my-1 list-disc space-y-0.5 pl-4">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>)}</ul>;
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i} className="my-1 list-decimal space-y-0.5 pl-4">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
    return <p key={i} className="my-1 whitespace-pre-wrap">{inline(b)}</p>;
  });
}
function inline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i} className="rounded bg-sand px-1 font-mono text-[11px]">{p.slice(1, -1)}</code> : <span key={i}>{p}</span>));
}

export function Bubble({ m, compact }: { m: ChatMsg; compact?: boolean }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className={cn("max-w-[88%] rounded-[10px] rounded-br-[3px] bg-ink px-3 py-2 text-[13px] text-white", compact && "text-xs")}>
          {m.images?.length ? <div className="mb-1.5 flex flex-wrap gap-1">{m.images.map((src, i) => <img key={i} src={src} alt="" className="h-14 w-14 rounded object-cover" />)}</div> : null}
          <div className="whitespace-pre-wrap">{m.text}</div>
        </div>
      </div>
    );
  }
  const empty = !m.text && m.tools.length === 0;
  return (
    <div className="flex gap-2">
      <span className="mt-1 shrink-0"><KilnMark size={14} /></span>
      <div className={cn("min-w-0 flex-1 text-[13px] leading-relaxed", compact && "text-xs")}>
        {m.tools.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1">{m.tools.map((t) => <ToolChip key={t.callId} t={t} />)}</div>}
        {m.text && <div className="prose-html">{renderText(m.text)}</div>}
        {m.status === "streaming" && (empty || true) && <div className="dot-bounce mt-1"><span /><span /><span /></div>}
        {m.status === "failed" && <div className="mt-1 flex items-center gap-1.5 rounded border border-danger/30 bg-danger-soft px-2 py-1 text-[11px] text-danger"><CircleAlert size={12} /> Run failed{m.error ? `: ${m.error}` : ""}</div>}
        {m.status === "cancelled" && <div className="mt-1 text-[11px] text-muted">Cancelled.</div>}
      </div>
    </div>
  );
}

export function PlanCard({ plan, compact }: { plan: { title: string; status: string }[]; compact?: boolean }) {
  const [open, setOpen] = useState(true);
  if (!plan.length) return null;
  const done = plan.filter((t) => t.status === "done").length;
  return (
    <div className={cn("rounded border border-line bg-card", compact ? "text-[11px]" : "text-xs")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
        <ListChecks size={12} className="text-muted" />
        <span className="font-medium">Plan</span>
        <span className="text-muted">{done}/{plan.length}</span>
        <span className="ml-auto text-muted">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>
      {open && (
        <ol className="border-t border-line px-2.5 py-1.5">
          {plan.map((t, i) => (
            <li key={i} className="flex items-center gap-2 py-0.5">
              <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px]", t.status === "done" ? "border-positive bg-positive text-white" : t.status === "in_progress" ? "border-amber text-amber" : "border-line text-faint")}>{t.status === "done" ? <Check size={9} strokeWidth={3} /> : t.status === "in_progress" ? <LoaderCircle size={9} className="animate-spin" /> : null}</span>
              <span className={cn(t.status === "done" && "text-muted line-through")}>{t.title}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function QuestionCard({ question, confirm, onConfirm, onDeny, compact }: { question: string; confirm: boolean; onConfirm: () => void; onDeny: () => void; compact?: boolean }) {
  return (
    <div className={cn("rounded border border-amber/40 bg-amber-soft p-2.5", compact ? "text-[11px]" : "text-xs")}>
      <div className="eyebrow !text-amber">{confirm ? "Confirmation needed" : "Question"}</div>
      <p className="mt-1 text-ink">{question}</p>
      <div className="mt-2 flex gap-1.5">
        {confirm ? (
          <>
            <Button size="xs" variant="primary" onClick={onConfirm}>Confirm</Button>
            <Button size="xs" variant="ghost" onClick={onDeny}>Don't do that</Button>
          </>
        ) : (
          <span className="text-muted">Type your answer below.</span>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ compact, onPick }: { compact?: boolean; onPick: (prompt: string) => void }) {
  const { suggestionsFor, pageContext } = useAi();
  const { store } = useStore();
  const todos = useStoreQuery<{ items: Todo[] }>(["todos"], "/todos");
  const open = (todos.data?.items ?? []).filter((t) => t.status !== "done").slice(0, 4);
  const sugg = suggestionsFor(pageContext);
  return (
    <div className={cn("flex flex-col items-center px-3 py-6 text-center", compact && "py-4")}>
      <KilnMark size={compact ? 22 : 28} />
      <div className={cn("font-display mt-2", compact ? "text-[15px]" : "text-lg")}>Kiln Assistant</div>
      <p className="mt-1 max-w-[260px] text-[11px] text-muted">Hi{store ? `, running ${store.name}` : ""}. I can do anything across the admin — ask, or pick one:</p>
      <div className="mt-4 w-full space-y-1">
        {sugg.map((s) => (
          <button key={s.title} onClick={() => onPick(s.prompt)} className="flex w-full items-center gap-2 rounded border border-line bg-card px-2.5 py-2 text-left text-xs hover:border-ink">
            <AreaIcon area={s.area} size={13} className="text-accent" />
            <span className="flex-1 truncate">{s.title}</span>
            <ChevronRight size={12} className="text-faint" />
          </button>
        ))}
      </div>
      {open.length > 0 && (
        <div className="mt-5 w-full text-left">
          <div className="eyebrow mb-1.5">Next steps</div>
          <div className="flex flex-wrap gap-1">
            {open.map((t) => (
              <button key={t.key} onClick={() => t.prompt && onPick(t.prompt)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", t.status === "in_progress" ? "border-amber/40 bg-amber-soft text-amber" : t.status === "waiting" ? "border-accent/40 bg-accent-soft text-accent" : "border-line bg-card text-muted hover:text-ink")}>
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Composer({ compact, placeholder, autoFocus, pageContext }: { compact?: boolean; placeholder?: string; autoFocus?: boolean; pageContext?: string }) {
  const { send, cancel, activeRun, queue, clearQueue } = useAi();
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const running = !!activeRun && activeRun.status !== "paused";

  const submit = async () => {
    if (!text.trim() && !images.length) return;
    const t = text, im = images;
    setText("");
    setImages([]);
    await send(t, im, pageContext ? { pageContext } : undefined);
  };
  const toggleMic = () => {
    if (listening) { stopRef.current?.(); return; }
    if (!speechSupported()) { taRef.current?.focus(); return; }
    setListening(true);
    stopRef.current = startDictation((t) => setText(t), () => { setListening(false); stopRef.current = null; });
  };
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
  }, [text]);

  return (
    <div className="border-t border-line bg-card p-2">
      {queue.length > 0 && (
        <div className="mb-1.5 flex items-center gap-2 rounded bg-sand px-2 py-1 text-[11px] text-muted">
          <LoaderCircle size={11} className="animate-spin" /> {queue.length} message{queue.length > 1 ? "s" : ""} queued — sends when the current run finishes
          <button onClick={clearQueue} className="ml-auto hover:text-ink">Clear</button>
        </div>
      )}
      {images.length > 0 && (
        <div className="mb-1.5 flex gap-1">
          {images.map((src, i) => (
            <span key={i} className="relative h-12 w-12 overflow-hidden rounded border border-line">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-ink/70 p-0.5 text-white"><X size={9} /></button>
            </span>
          ))}
        </div>
      )}
      <div className={cn("rounded-[6px] border border-line bg-card focus-within:border-ink", listening && "border-accent")}>
        <textarea ref={taRef} value={text} autoFocus={autoFocus} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} placeholder={placeholder ?? (activeRun?.status === "paused" ? "Answer the question…" : running ? "Queue another message…" : "Ask a question…")} rows={1} className={cn("block w-full resize-none bg-transparent px-2.5 pt-2 outline-none placeholder:text-faint", compact ? "text-xs" : "text-[13px]")} />
        <div className="flex items-center gap-0.5 px-1 pb-1">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => { const fs = e.target.files; if (!fs) return; const urls = await Promise.all(Array.from(fs).slice(0, 4).map(fileToDataUrl)); setImages((i) => [...i, ...urls].slice(0, 4)); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted hover:bg-sand hover:text-ink"><ImagePlus size={13} /> Add image</button>
          <button onClick={toggleMic} title={speechSupported() ? "Dictate" : "Voice input isn't supported in this browser"} className={cn("inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-sand hover:text-ink", listening && "bg-accent-soft text-accent")}><Mic size={13} /></button>
          <span className="flex-1" />
          {running && <button onClick={() => void cancel()} title="Cancel run" className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-danger hover:bg-danger-soft"><Square size={11} /> Stop</button>}
          <button onClick={() => void submit()} disabled={!text.trim() && !images.length} className="inline-flex h-6 w-6 items-center justify-center rounded bg-ink text-white disabled:bg-faint" aria-label="Send"><Send size={12} /></button>
        </div>
      </div>
    </div>
  );
}

/** Complete chat surface: list + plan + question + composer. Used by the panel, /ai, the designer and the mobile sheet. */
export function ChatView({ compact, className, pageContext, placeholder, showEmpty = true }: { compact?: boolean; className?: string; pageContext?: string; placeholder?: string; showEmpty?: boolean }) {
  const { messages, plan, activeRun, resume, send, loadingSession } = useAi();
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, plan, activeRun]);
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {loadingSession && <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted"><LoaderCircle size={12} className="animate-spin" /> Loading conversation…</div>}
        {messages.length === 0 && !loadingSession && showEmpty ? (
          <EmptyState compact={compact} onPick={(p) => void send(p, undefined, pageContext ? { pageContext } : undefined)} />
        ) : (
          <div className={cn("space-y-3 p-3", compact && "space-y-2.5 p-2.5")}>
            {messages.map((m) => <Bubble key={m.id} m={m} compact={compact} />)}
          </div>
        )}
      </div>
      {(plan.length > 0 || activeRun?.status === "paused") && (
        <div className="space-y-1.5 border-t border-line bg-cream px-2.5 py-2">
          {plan.length > 0 && <PlanCard plan={plan} compact={compact} />}
          {activeRun?.status === "paused" && activeRun.question && (
            <QuestionCard compact={compact} question={activeRun.question} confirm={!!activeRun.confirm} onConfirm={() => void resume("Yes, go ahead.", true)} onDeny={() => void resume("No, don't do that. Stop here.", false)} />
          )}
        </div>
      )}
      <Composer compact={compact} pageContext={pageContext} placeholder={placeholder} />
    </div>
  );
}

export const areaLabel = (a?: string) => titleCase(a ?? "");
