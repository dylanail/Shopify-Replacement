"use client";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";
import { useSession } from "@/components/providers/SessionProvider";

export function NewsletterForm({ compact = false, cta = "Subscribe" }: { compact?: boolean; cta?: string }) {
  const store = useStore();
  const { track } = useSession();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; msg?: string }>({ status: "idle" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState({ status: "busy" });
    try { await api(store.key, "/newsletter", { body: { email: email.trim() } }); void track("signup", { meta: { source: "newsletter" } }); setState({ status: "done", msg: "You're on the list. Welcome." }); setEmail(""); }
    catch (err) { setState({ status: "error", msg: errorMessage(err, "Could not subscribe. Check the address and try again.") }); }
  };
  const id = compact ? "nl-footer" : "nl-section";
  return (
    <form onSubmit={submit} className={compact ? "flex gap-2" : "flex flex-col sm:flex-row gap-2 max-w-md mx-auto"} noValidate>
      <label htmlFor={id} className="sr-only">Email address</label>
      <input id={id} type="email" required autoComplete="email" className="field flex-1" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={`${id}-msg`} />
      <button type="submit" className="btn btn-primary" disabled={state.status === "busy"}>{state.status === "busy" ? "…" : cta}</button>
      <p id={`${id}-msg`} role="status" className={`text-xs basis-full ${state.status === "error" ? "text-red-700" : "text-muted"}`}>{state.msg}</p>
    </form>
  );
}
