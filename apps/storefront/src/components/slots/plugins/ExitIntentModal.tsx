"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { SlotComponentProps } from "../Slot";
import { api, errorMessage } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";
import { Modal } from "@/components/ui/Modal";
import { session, storageKey } from "@/lib/storage";

/** Arms after `delaySeconds`; opens when the pointer leaves through the top of the viewport (or on mobile after a fast scroll-up). Once per session. */
export function ExitIntentModal({ props }: SlotComponentProps) {
  const store = useStore();
  const offer = typeof props.offer === "string" && props.offer.trim() ? props.offer : "Wait — take 10% off your first order";
  const code = typeof props.code === "string" ? props.code : "";
  const delay = typeof props.delaySeconds === "number" ? props.delaySeconds : 5;
  const key = storageKey("exit", store.key);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; msg?: string }>({ status: "idle" });
  useEffect(() => {
    if (store.env === "draft" || session.get(key)) return;
    let armed = false;
    const t = setTimeout(() => { armed = true; }, delay * 1000);
    const show = () => { if (!armed || session.get(key)) return; session.set(key, "1"); setOpen(true); void api(store.key, "/exit-intent", { body: { offer, converted: false } }).catch(() => undefined); };
    const onLeave = (e: MouseEvent) => { if (e.clientY <= 0) show(); };
    let lastY = window.scrollY;
    const onScroll = () => { const y = window.scrollY; if (lastY - y > 300 && y < 200) show(); lastY = y; };
    document.addEventListener("mouseout", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(t); document.removeEventListener("mouseout", onLeave); window.removeEventListener("scroll", onScroll); };
  }, [store.env, store.key, key, delay, offer]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ status: "busy" });
    try { await api(store.key, "/exit-intent", { body: { email: email.trim() || undefined, offer, converted: true } }); if (email.trim()) await api(store.key, "/newsletter", { body: { email: email.trim() } }).catch(() => undefined); setState({ status: "done" }); }
    catch (err) { setState({ status: "error", msg: errorMessage(err) }); }
  };
  return (
    <Modal open={open} onClose={() => setOpen(false)} size="sm">
      <p className="eyebrow text-primary mb-2">Before you go</p>
      <h2 className="display text-2xl mb-3">{offer}</h2>
      {state.status === "done" ? (
        <div className="space-y-3">
          {code ? <><p className="text-sm text-muted">Use this code at checkout:</p><p className="text-2xl font-semibold tracking-widest border border-dashed border-rule-strong p-3 text-center select-all">{code}</p></> : <p className="text-sm text-muted">You're in — watch your inbox.</p>}
          <button type="button" className="btn btn-primary w-full" onClick={() => setOpen(false)}>Keep shopping</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <p className="text-sm text-muted">Leave your email and we'll send the code{code ? "" : " and first access to new pieces"}.</p>
          <label htmlFor="exit-email" className="sr-only">Email</label>
          <input id="exit-email" type="email" className="field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {state.status === "error" && <p role="alert" className="text-xs text-red-700">{state.msg}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={state.status === "busy"}>{state.status === "busy" ? "…" : code ? "Reveal my code" : "Send it"}</button>
          <button type="button" className="w-full text-xs text-muted underline underline-offset-4" onClick={() => setOpen(false)}>No thanks</button>
        </form>
      )}
    </Modal>
  );
}
