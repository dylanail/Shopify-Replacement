"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ExternalLink, LoaderCircle, Mic, Phone, Plus, Rocket, Store } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useStore, useStoreQuery } from "@/lib/store-context";
import { useStoreMutation } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { speechSupported, startDictation } from "@/lib/speech";
import { KilnMark } from "./logo";
import { Button, Dialog, Menu, Textarea, useToast } from "@/components/ui";
import type { PublishState } from "@/lib/types";

export const BOOK_CALL_URL = process.env.NEXT_PUBLIC_BOOK_CALL_URL ?? "https://cal.com/kiln/founders";

export function StoreSwitcher() {
  const { stores, storeId, store, setStoreId } = useStore();
  const router = useRouter();
  return (
    <Menu
      align="left"
      trigger={
        <button className="inline-flex h-7 max-w-[200px] items-center gap-1.5 rounded border border-transparent px-2 text-xs hover:border-line hover:bg-sand">
          <Store size={13} className="text-muted" />
          <span className="truncate font-medium">{store?.name ?? stores.find((s) => s.id === storeId)?.name ?? "Store"}</span>
          <ChevronDown size={12} className="text-muted" />
        </button>
      }
      items={[
        ...stores.map((s) => ({ label: s.name, icon: s.id === storeId ? <Check size={12} /> : <span className="w-3" />, onClick: () => { setStoreId(s.id); router.push("/dashboard"); } })),
        { label: "Create another store", icon: <Plus size={12} />, onClick: () => router.push("/onboarding") },
      ]}
    />
  );
}

export function FeatureRequest({ trigger }: { trigger?: (open: () => void) => React.ReactNode }) {
  const { storeId } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [source, setSource] = useState<"typed" | "voice">("typed");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = () => {
    setOpen(true);
    if (speechSupported()) {
      setListening(true);
      setSource("voice");
      startDictation((t) => setText(t), () => setListening(false));
    }
  };
  const submit = async () => {
    setBusy(true);
    try {
      await api("/auth/feature-request", { method: "POST", body: { text, storeId, source } });
      toast("Thanks — it's on the roadmap board.");
      setOpen(false);
      setText("");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {trigger ? trigger(start) : (
        <button onClick={start} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-[11px] font-medium text-ink hover:bg-sand">
          <Mic size={12} className="text-accent" /> Request a Feature
        </button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Request a feature" description="Say it or type it. Requests land on the founders' roadmap board." width="max-w-md" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={text.trim().length < 3} onClick={submit}>Send</Button></>}>
        <div className={cn("rounded border p-2", listening ? "border-accent" : "border-line")}>
          <Textarea value={text} onChange={(e) => { setText(e.target.value); setSource("typed"); }} placeholder={listening ? "Listening…" : "I'd love Kiln to…"} className="min-h-[100px] border-0 !px-1" autoFocus />
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
            <span>{listening ? <span className="inline-flex items-center gap-1 text-accent"><Mic size={11} className="pulse" /> Listening</span> : speechSupported() ? "Voice available" : "Voice input isn't supported in this browser"}</span>
            {speechSupported() && !listening && <button onClick={() => { setListening(true); setSource("voice"); startDictation((t) => setText(t), () => setListening(false)); }} className="inline-flex items-center gap-1 hover:text-ink"><Mic size={11} /> Dictate</button>}
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** The state-aware Publish CTA. */
export function PublishButton({ size = "sm" }: { size?: "xs" | "sm" | "md" }) {
  const { store, refreshStore } = useStore();
  const toast = useToast();
  const ps = useStoreQuery<PublishState>(["publish-state"], "/publish-state", { refetchInterval: 20_000 });
  const state = ps.data ?? store?.publish;
  const publish = useStoreMutation((sapi) => sapi<{ version: number }>("/publish", { method: "POST" }), { success: (r) => `Published v${r.version}. Your store is live.`, onSuccess: () => refreshStore() });
  if (!state) return null;
  if (state.action === "publish") {
    return <Button size={size} variant="primary" icon={<Rocket size={13} />} loading={publish.isPending} onClick={() => publish.mutate()} title={state.reason}>{state.label}</Button>;
  }
  if (state.action === "products") return <Link href="/products/new"><Button size={size} variant="primary" title={state.reason}>{state.label}</Button></Link>;
  if (state.action === "designer") return <Link href="/designer"><Button size={size} variant="danger" title={state.reason}>{state.label}</Button></Link>;
  if (state.action === "wait") return <Button size={size} variant="secondary" disabled icon={<LoaderCircle size={13} className="animate-spin" />}>{state.label}</Button>;
  return (
    <a href={store?.url} target="_blank" rel="noreferrer" title={state.reason}>
      <Button size={size} variant="secondary" icon={<span className="h-1.5 w-1.5 rounded-full bg-positive" />} onClick={() => toast("Everything is published.", "info")}>{state.label} <ExternalLink size={11} className="text-muted" /></Button>
    </a>
  );
}

export function TopBar() {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-card px-2" style={{ height: "var(--shell-top)" }}>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 pl-1">
        <KilnMark size={18} />
        <span className="font-display text-[15px] font-semibold tracking-tight">Kiln</span>
      </Link>
      <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
      <StoreSwitcher />
      <div className="hidden items-center gap-2 sm:flex">
        <FeatureRequest />
        <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 px-1.5 text-[11px] text-muted hover:text-ink"><Phone size={11} /> Book a call</a>
      </div>
      <span className="flex-1" />
      <PublishButton />
    </header>
  );
}
