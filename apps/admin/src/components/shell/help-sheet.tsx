"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, MessageCircle, Mic, Phone, Send, X } from "lucide-react";
import { useAi } from "@/lib/ai-context";
import { cn } from "@/lib/utils";
import { Button, IconButton, Textarea } from "@/components/ui";
import { BOOK_CALL_URL, FeatureRequest } from "./topbar";

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { open: openAssistant } = useAi();
  const [text, setText] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  const ask = () => {
    if (!text.trim()) return;
    openAssistant(text.trim());
    setText("");
    onClose();
  };
  return createPortal(
    <div className="fixed inset-0 z-[75]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-ink/20" />
      <aside className={cn("animate-in absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-line bg-cream shadow-xl")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line bg-card px-4 py-3">
          <div className="font-display text-lg">Help</div>
          <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
          <section className="card p-3">
            <div className="flex items-center gap-2"><MessageCircle size={14} className="text-accent" /><div className="text-[13px] font-semibold">Live chat</div></div>
            <p className="mt-1 text-xs text-muted">Ask anything about running your store. The assistant answers first and can hand off to a founder when it can't help.</p>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="How do I…" className="mt-2 min-h-[70px]" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
            <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" icon={<Send size={12} />} onClick={ask} disabled={!text.trim()}>Ask</Button></div>
          </section>
          <section className="card p-3">
            <div className="flex items-center gap-2"><Phone size={14} className="text-teal" /><div className="text-[13px] font-semibold">Book a call</div></div>
            <p className="mt-1 text-xs text-muted">Thirty minutes with a founder — migrations, pricing, anything.</p>
            <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block"><Button size="sm" icon={<ExternalLink size={12} />}>Pick a time</Button></a>
          </section>
          <section className="card p-3">
            <div className="flex items-center gap-2"><Mic size={14} className="text-amber" /><div className="text-[13px] font-semibold">Request a feature</div></div>
            <p className="mt-1 text-xs text-muted">Say it out loud or type it. Requests go straight to the roadmap.</p>
            <div className="mt-2"><FeatureRequest trigger={(start) => <Button size="sm" icon={<Mic size={12} />} onClick={start}>Request a feature</Button>} /></div>
          </section>
          <section className="text-[11px] text-muted">
            <div className="eyebrow mb-1">Shortcuts</div>
            <ul className="space-y-0.5">
              <li>Enter sends a message · Shift+Enter for a new line</li>
              <li>Messages sent while the assistant is working are queued</li>
              <li>Risky actions (refunds, deletes, publishing) always ask first unless granted in Settings</li>
            </ul>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
