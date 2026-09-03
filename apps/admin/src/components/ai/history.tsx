"use client";

import { Plus, X, MessageSquare } from "lucide-react";
import { useAi } from "@/lib/ai-context";
import { cn, timeAgo } from "@/lib/utils";
import { IconButton } from "@/components/ui";

/** Session history list — rendered inline inside the panel / page. */
export function HistoryList({ onClose, className }: { onClose?: () => void; className?: string }) {
  const { sessions, sessionId, loadSession, newSession } = useAi();
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="text-xs font-semibold">Conversations</div>
        <div className="flex items-center gap-1">
          <button onClick={newSession} className="inline-flex h-6 items-center gap-1 rounded border border-line px-1.5 text-[11px] hover:bg-sand"><Plus size={11} /> New</button>
          {onClose && <IconButton label="Close" onClick={onClose}><X size={14} /></IconButton>}
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {sessions.length === 0 && <div className="px-3 py-6 text-center text-[11px] text-muted">No conversations yet.</div>}
        {sessions.map((s) => (
          <button key={s.id} onClick={() => void loadSession(s.id)} className={cn("flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left hover:bg-cream", s.id === sessionId && "bg-cream")}>
            <MessageSquare size={12} className="mt-0.5 shrink-0 text-faint" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{s.title || "New conversation"}</span>
              <span className="block text-[10px] text-muted">{timeAgo(s.updatedAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
