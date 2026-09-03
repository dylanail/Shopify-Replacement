"use client";
import { useState } from "react";
import type { SlotComponentProps } from "../Slot";
import { usePdpOptional } from "@/components/product/PdpContext";
import { useStore } from "@/components/providers/StoreProvider";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/format";

/** "Add engraving" → modal → sets line metadata {engraving, engravingFeeCents} on the PDP buy state. */
export function EngravingButton({ settings }: SlotComponentProps) {
  const pdp = usePdpOptional();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(pdp?.engraving?.text ?? "");
  if (!pdp) return null;
  const fee = typeof settings.defaultFeeCents === "number" ? settings.defaultFeeCents : typeof pdp.product.metadata.engravingFeeCents === "number" ? (pdp.product.metadata.engravingFeeCents as number) : 1500;
  const max = 20;
  return (
    <div className="border border-rule p-4 flex items-center justify-between gap-4" style={{ borderRadius: "var(--radius-card)" }}>
      <div>
        <p className="font-medium text-sm">Personalise it</p>
        <p className="text-xs text-muted">{pdp.engraving?.text ? <>Engraving: <strong>“{pdp.engraving.text}”</strong> (+{formatMoney(fee, store.currency)})</> : <>Add initials or a short line, engraved by hand · +{formatMoney(fee, store.currency)}</>}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        {pdp.engraving && <button type="button" className="btn btn-ghost min-h-9 px-2 text-xs" onClick={() => { pdp.setEngraving(null); setText(""); }}>Remove</button>}
        <button type="button" className="btn btn-outline min-h-9 px-3 text-xs" onClick={() => setOpen(true)}>{pdp.engraving ? "Edit" : "Add engraving"}</button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Engraving" size="sm">
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) pdp.setEngraving({ text: text.trim().slice(0, max), feeCents: fee }); setOpen(false); }} className="space-y-4">
          <div>
            <label htmlFor="engraving-text" className="label">Text (up to {max} characters)</label>
            <input id="engraving-text" className="field font-display text-lg" maxLength={max} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. J.R.M. · 2026" autoComplete="off" />
            <p className="text-xs text-muted mt-1">{text.length}/{max}. Engraved items are made to order and can't be returned.</p>
          </div>
          <div className="border border-dashed border-rule-strong p-4 text-center" aria-hidden><p className="eyebrow text-[10px] text-muted mb-1">Preview</p><p className="font-display text-2xl tracking-widest">{text || "Your text"}</p></div>
          <button type="submit" className="btn btn-primary w-full">{text.trim() ? `Add engraving · +${formatMoney(fee, store.currency)}` : "Skip engraving"}</button>
        </form>
      </Modal>
    </div>
  );
}
