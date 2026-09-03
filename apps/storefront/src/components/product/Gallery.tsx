"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaItem } from "@kiln/shared";
import { usePdpOptional } from "./PdpContext";
import { Img } from "@/components/ui/Img";

/** Main image + thumbnails + "2/4" counter. Arrow keys and swipe move between images; the selected variant's image is auto-focused. */
export function Gallery({ media, title, template }: { media: MediaItem[]; title: string; template: string }) {
  const pdp = usePdpOptional();
  const items = useMemo(() => {
    const m = [...media].sort((a, b) => a.sort - b.sort);
    const variantImgs = pdp?.product.variants.map((v) => v.imageUrl).filter((u): u is string => !!u && !m.some((x) => x.url === u)) ?? [];
    return [...m, ...[...new Set(variantImgs)].map((url) => ({ url, alt: title, kind: "image" as const, sort: 99 }))];
  }, [media, pdp?.product.variants, title]);
  const [idx, setIdx] = useState(0);
  const variantUrl = pdp?.variant?.imageUrl;
  useEffect(() => { if (!variantUrl) return; const i = items.findIndex((m) => m.url === variantUrl); if (i >= 0) setIdx(i); }, [variantUrl, items]);
  const go = useCallback((d: number) => setIdx((i) => (items.length ? (i + d + items.length) % items.length : 0)), [items.length]);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "ArrowRight") { e.preventDefault(); go(1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } if (e.key === "Home") setIdx(0); if (e.key === "End") setIdx(items.length - 1); };
  const [touchX, setTouchX] = useState<number | null>(null);
  const cur = items[idx];
  if (!items.length) return <div className="aspect-square bg-ink/5 flex items-center justify-center text-muted eyebrow" style={{ borderRadius: "var(--radius-card)" }}>No image yet</div>;
  return (
    <div className={`flex flex-col gap-3 ${template === "studio" ? "lg:flex-row-reverse" : ""}`}>
      <div className="relative flex-1 group outline-none" tabIndex={0} role="region" aria-roledescription="carousel" aria-label={`${title} images`} onKeyDown={onKey}
        onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)} onTouchEnd={(e) => { const x = e.changedTouches[0]?.clientX; if (touchX != null && x != null && Math.abs(x - touchX) > 40) go(x < touchX ? 1 : -1); setTouchX(null); }}>
        <div className={`overflow-hidden bg-ink/5 ${template === "studio" ? "aspect-[4/5]" : "aspect-square"}`} style={{ borderRadius: "var(--radius-card)" }} aria-live="polite">
          {cur?.kind === "video" ? <video src={cur.url} controls className="w-full h-full object-cover" aria-label={cur.alt || title} /> : <Img src={cur?.url} alt={cur?.alt || title} width={1200} height={template === "studio" ? 1500 : 1200} eager className="w-full h-full object-cover" sizes="(min-width:1024px) 55vw, 100vw" />}
        </div>
        {items.length > 1 && (
          <>
            <span className="absolute top-3 right-3 text-[11px] font-semibold px-2 py-1 bg-paper/90 border border-rule" style={{ borderRadius: "var(--radius-pill)" }} aria-hidden>{idx + 1}/{items.length}</span>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-paper/90 border border-rule opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" style={{ borderRadius: "var(--radius-pill)" }}>‹</button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-paper/90 border border-rule opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" style={{ borderRadius: "var(--radius-pill)" }}>›</button>
          </>
        )}
      </div>
      {items.length > 1 && (
        <ul className={`flex gap-2 overflow-x-auto ${template === "studio" ? "lg:flex-col lg:w-20" : ""}`} role="tablist" aria-label="Choose image">
          {items.map((m, i) => (
            <li key={m.url + i} role="presentation" className="shrink-0">
              <button type="button" role="tab" aria-selected={i === idx} aria-label={`Image ${i + 1}`} onClick={() => setIdx(i)} className={`block w-16 sm:w-20 aspect-square overflow-hidden border transition-colors ${i === idx ? "border-ink" : "border-rule hover:border-rule-strong"}`} style={{ borderRadius: "var(--radius-card)" }}>
                <Img src={m.url} alt="" width={160} height={160} className="w-full h-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
