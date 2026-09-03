"use client";
import { useId, useState } from "react";

export function ProductTabs({ tabs }: { tabs: { id: string; label: string; html?: string; text?: string }[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const base = useId();
  const list = tabs.filter((t) => t.html || t.text);
  if (!list.length) return null;
  return (
    <div>
      <div role="tablist" aria-label="Product information" className="flex gap-6 border-b border-rule">
        {list.map((t) => (
          <button key={t.id} role="tab" id={`${base}-tab-${t.id}`} aria-selected={active === t.id} aria-controls={`${base}-panel-${t.id}`} onClick={() => setActive(t.id)}
            onKeyDown={(e) => { const i = list.findIndex((x) => x.id === active); if (e.key === "ArrowRight") setActive(list[(i + 1) % list.length]!.id); if (e.key === "ArrowLeft") setActive(list[(i - 1 + list.length) % list.length]!.id); }}
            className={`eyebrow py-3 -mb-px border-b-2 transition-colors ${active === t.id ? "border-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</button>
        ))}
      </div>
      {list.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={active !== t.id} className="pt-5 prose text-sm">
          {t.html ? <div dangerouslySetInnerHTML={{ __html: t.html }} /> : t.text?.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ))}
    </div>
  );
}
