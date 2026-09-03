"use client";
import { useState, type FormEvent } from "react";
import type { SlotComponentProps } from "../Slot";
import { api, errorMessage } from "@/lib/client-api";
import { useStore } from "@/components/providers/StoreProvider";
import { Input, Textarea } from "@/components/ui/Field";

/** Contact form plugin component (footerEnd by default, and the /pages/contact page). POSTs /contact. */
export function ContactForm({ settings, slot }: SlotComponentProps) {
  const heading = typeof settings.heading === "string" && settings.heading ? settings.heading : "Talk to us";
  return (
    <section className={slot === "footerEnd" ? "border-t border-rule" : ""} aria-labelledby="contact-title">
      <div className={slot === "footerEnd" ? "container-x py-12 grid md:grid-cols-2 gap-8" : "grid md:grid-cols-2 gap-8"}>
        <div><h2 id="contact-title" className="section-title">{heading}</h2><p className="text-muted mt-3 max-w-sm">Questions about sizing, lead times or a custom order? Write to us — a real person replies, usually within a day.</p></div>
        <ContactFormFields />
      </div>
    </section>
  );
}

export function ContactFormFields() {
  const store = useStore();
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; msg?: string }>({ status: "idle" });
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { name: String(fd.get("name") ?? "").trim(), email: String(fd.get("email") ?? "").trim(), message: String(fd.get("message") ?? "").trim() };
    if (!body.name || !body.email || !body.message) { setState({ status: "error", msg: "Please fill in your name, email and a message." }); return; }
    setState({ status: "busy" });
    try { await api(store.key, "/contact", { body }); setState({ status: "done" }); e.currentTarget.reset(); }
    catch (err) { setState({ status: "error", msg: errorMessage(err) }); }
  };
  if (state.status === "done") return <div className="card p-6"><p className="display text-xl">Message sent.</p><p className="text-sm text-muted mt-1">Thanks — we'll reply to your email shortly.</p></div>;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid sm:grid-cols-2 gap-4"><Input id="ct-name" name="name" label="Name" required autoComplete="name" /><Input id="ct-email" name="email" type="email" label="Email" required autoComplete="email" /></div>
      <Textarea id="ct-msg" name="message" label="Message" required />
      {state.status === "error" && <p role="alert" className="text-xs text-red-700">{state.msg}</p>}
      <button type="submit" className="btn btn-primary" disabled={state.status === "busy"}>{state.status === "busy" ? "Sending…" : "Send message"}</button>
    </form>
  );
}
