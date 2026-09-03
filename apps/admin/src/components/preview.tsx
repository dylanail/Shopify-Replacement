"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, RefreshCw, Smartphone, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

/** Browser-chrome framed iframe (mac traffic lights) for storefront previews. */
export function BrowserFrame({ url, title = "Storefront preview", height = 560, className, actions, reloadKey, allowDevice = true }: { url: string | null | undefined; title?: string; height?: number | string; className?: string; actions?: ReactNode; reloadKey?: string | number; allowDevice?: boolean }) {
  const [nonce, setNonce] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className={cn("card flex flex-col overflow-hidden", className)}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-sand px-3">
        <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" /></span>
        <span className="ml-2 min-w-0 flex-1 truncate rounded bg-card px-2 py-0.5 text-[11px] text-muted">{url ?? "—"}</span>
        {allowDevice && (
          <span className="hidden items-center rounded border border-line bg-card p-0.5 sm:inline-flex">
            <button onClick={() => setDevice("desktop")} className={cn("rounded p-0.5", device === "desktop" ? "bg-ink text-white" : "text-muted")} title="Desktop"><Monitor size={12} /></button>
            <button onClick={() => setDevice("mobile")} className={cn("rounded p-0.5", device === "mobile" ? "bg-ink text-white" : "text-muted")} title="Mobile"><Smartphone size={12} /></button>
          </span>
        )}
        <button onClick={() => setNonce((n) => n + 1)} className="text-muted hover:text-ink" title="Reload"><RefreshCw size={12} /></button>
        {url && <a href={url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" title="Open in new tab"><ExternalLink size={12} /></a>}
        {actions}
      </div>
      <div className="flex min-h-0 flex-1 justify-center bg-[#e6e0d8]" style={{ height }}>
        {url ? (
          <iframe key={`${url}-${nonce}-${reloadKey ?? ""}`} src={url} title={title} className={cn("h-full bg-white", device === "mobile" ? "w-[390px] border-x border-line" : "w-full")} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted"><div className="dot-bounce"><span /><span /><span /></div></div>
        )}
      </div>
    </div>
  );
}
