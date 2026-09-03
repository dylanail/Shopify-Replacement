"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { api, errorMessage, streamSse, tokens, STORE_KEY } from "@/lib/api";
import { cn, fileToDataUrl } from "@/lib/utils";
import { Button, ErrorBox, Input, Select, Textarea } from "@/components/ui";
import { KilnLogo } from "@/components/shell/logo";
import type { Me } from "@/lib/types";

interface Step { key: string; title: string; status: "pending" | "running" | "done" | "error"; detail?: string }
const STEP_LABELS: Record<string, string> = { name: "Naming", brand: "Brand kit", products: "Products", collections: "Collections", promotions: "Promotions", storefront: "Storefront" };
const INITIAL: Step[] = [
  { key: "name", title: "Naming the brand", status: "pending" },
  { key: "brand", title: "Building the brand kit", status: "pending" },
  { key: "products", title: "Creating three products", status: "pending" },
  { key: "collections", title: "Organising collections", status: "pending" },
  { key: "promotions", title: "Setting up promotions", status: "pending" },
  { key: "storefront", title: "Building the storefront", status: "pending" },
];
const EXAMPLES = [
  "A hand-stitched boxing-gear store in the style of a 1920s heritage leather atelier in Mexico City",
  "A small-batch ceramics studio in Lisbon selling vases, mugs and plates with a calm, gallery feel",
  "A dark, moody candle brand for night owls — soy wax, three scents, gift sets",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [siteUrl, setSiteUrl] = useState("");
  const [showUrl, setShowUrl] = useState(false);
  const [productCount, setProductCount] = useState(3);
  const [phase, setPhase] = useState<"compose" | "building" | "done" | "error">("compose");
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; slug: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tokens.access()) router.replace("/login?next=/onboarding");
  }, [router]);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), enabled: typeof window !== "undefined" && !!tokens.access() });
  const orgId = me.data?.orgs[0]?.id;

  const start = async () => {
    if (!orgId || prompt.trim().length < 4) return;
    setPhase("building");
    setErr(null);
    setSteps(INITIAL.map((s, i) => ({ ...s, status: i === 0 ? "running" : "pending" })));
    try {
      await streamSse("/stores/onboard", { orgId, prompt: prompt.trim(), referenceImages: images.length ? images : undefined, existingSiteUrl: siteUrl.trim() || undefined, productCount, publish: true }, (event, data) => {
        const d = data as { steps?: Step[]; storeId?: string; previewUrl?: string; slug?: string; name?: string; error?: string };
        if (event === "onboarding.step" && d.steps) {
          setSteps(d.steps);
          if (d.storeId) { setStoreId(d.storeId); localStorage.setItem(STORE_KEY, d.storeId); }
          if (d.previewUrl) setPreviewUrl(d.previewUrl);
        }
        if (event === "onboarding.done") {
          if (d.steps) setSteps(d.steps);
          if (d.storeId) { setStoreId(d.storeId); localStorage.setItem(STORE_KEY, d.storeId); }
          if (d.previewUrl) setPreviewUrl(d.previewUrl);
          if (d.error) { setErr(d.error); setPhase("error"); }
          else { setResult({ name: d.name ?? "", slug: d.slug ?? "" }); setPhase("done"); }
        }
      });
      setPhase((p) => (p === "building" ? "done" : p));
    } catch (e) {
      setErr(errorMessage(e));
      setPhase("error");
    }
  };

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const urls = await Promise.all(Array.from(files).slice(0, 4 - images.length).map(fileToDataUrl));
    setImages((i) => [...i, ...urls].slice(0, 4));
  };
  const doneCount = useMemo(() => steps.filter((s) => s.status === "done").length, [steps]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="flex h-12 items-center justify-between border-b border-line bg-card px-5">
        <KilnLogo />
        {me.data?.stores.length ? <Link href="/dashboard" className="text-xs text-muted hover:text-ink">Back to dashboard</Link> : <span className="text-xs text-muted">{me.data?.user.email}</span>}
      </header>

      {phase === "compose" && (
        <main className="mx-auto max-w-2xl px-5 py-14">
          <p className="eyebrow">Onboarding</p>
          <h1 className="font-display mt-2 text-[40px] leading-[1.05]">Type one sentence. <em className="italic text-accent">See your store.</em></h1>
          <p className="mt-3 max-w-lg text-[14px] text-muted">Describe what you sell and the feel you want. Kiln names the brand, writes the copy, generates products and imagery, sets promotions and builds the storefront — live in about a minute.</p>
          {me.isError && <div className="mt-4"><ErrorBox error={me.error} retry={() => me.refetch()} /></div>}
          <div className="card mt-8 p-4">
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Create me a high-converting hand-stitched boxing-gear store in the style of a 1920s heritage leather atelier…" className="min-h-[120px] border-0 !px-1 text-[15px] leading-relaxed focus:ring-0" autoFocus />
            {images.length > 0 && (
              <div className="mt-2 flex gap-2">
                {images.map((src, i) => (
                  <span key={i} className="relative h-14 w-14 overflow-hidden rounded border border-line">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-ink/70 p-0.5 text-white"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
            {showUrl && (
              <div className="mt-3 flex items-center gap-2">
                <Link2 size={14} className="text-muted" />
                <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://your-old-store.com — we'll pull the brand, colours and imagery" />
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
              <Button size="sm" variant="ghost" icon={<ImagePlus size={14} />} onClick={() => fileRef.current?.click()} disabled={images.length >= 4}>Add reference images</Button>
              <Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={() => setShowUrl((s) => !s)}>Paste your old store URL</Button>
              <div className="ml-auto flex items-center gap-2 text-xs text-muted">
                <span>Products</span>
                <Select value={String(productCount)} onChange={(e) => setProductCount(Number(e.target.value))} className="!h-7 !w-16 !text-xs">
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
              <Button variant="primary" icon={<ArrowRight size={14} />} onClick={start} disabled={!orgId || prompt.trim().length < 4}>Fire the store</Button>
            </div>
          </div>
          <div className="mt-6">
            <div className="eyebrow mb-2">Try one</div>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setPrompt(ex)} className="rounded border border-line bg-card px-3 py-2 text-left text-xs text-muted hover:border-ink hover:text-ink">{ex}</button>
              ))}
            </div>
          </div>
        </main>
      )}

      {phase !== "compose" && (
        <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[360px_1fr]">
          <div>
            <p className="eyebrow">{phase === "done" ? "Store ready" : phase === "error" ? "Build stopped" : "Building"}</p>
            <h1 className="font-display mt-1 text-[30px] leading-tight">{result?.name ? result.name : phase === "done" ? "Your store is live." : "Firing the kiln…"}</h1>
            <p className="mt-2 text-muted">{doneCount} of {steps.length} steps complete</p>
            <ol className="card mt-5 divide-y divide-line">
              {steps.map((s) => (
                <li key={s.key} className="flex items-start gap-3 px-4 py-3">
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]", s.status === "done" && "border-positive bg-positive text-white", s.status === "running" && "border-accent text-accent", s.status === "error" && "border-danger bg-danger text-white", s.status === "pending" && "border-line text-faint")}>
                    {s.status === "done" ? <Check size={11} strokeWidth={3} /> : s.status === "running" ? <Loader2 size={11} className="animate-spin" /> : s.status === "error" ? <X size={11} /> : null}
                  </span>
                  <div className="min-w-0">
                    <div className="eyebrow !text-[10px]">{STEP_LABELS[s.key] ?? s.key}</div>
                    <div className={cn("text-[13px]", s.status === "pending" ? "text-muted" : "text-ink")}>{s.title}</div>
                    {s.detail && <div className="mt-0.5 truncate text-[11px] text-muted">{s.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
            {err && <div className="mt-3"><ErrorBox error={err} /></div>}
            {(phase === "done" || phase === "error") && (
              <div className="mt-5 flex flex-wrap gap-2">
                {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer"><Button icon={<ExternalLink size={14} />}>View your store</Button></a>}
                {storeId && <Button variant="primary" icon={<ArrowRight size={14} />} onClick={() => router.push("/dashboard")}>Go to dashboard</Button>}
                {phase === "error" && <Button variant="ghost" onClick={() => setPhase("compose")}>Try again</Button>}
              </div>
            )}
            {phase === "done" && (
              <div className="mt-6">
                <div className="eyebrow mb-2">Next steps</div>
                <ul className="space-y-1.5 text-xs text-muted">
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Swap the sample catalog for your own products</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Connect Stripe to take payments</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Point a domain at your store</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Review shipping rates per region</li>
                </ul>
              </div>
            )}
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line bg-sand px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 flex-1 truncate rounded bg-card px-2 py-0.5 text-[11px] text-muted">{previewUrl ?? "Waiting for the storefront URL…"}</span>
            </div>
            {previewUrl ? (
              <iframe key={`${previewUrl}-${doneCount}`} src={previewUrl} title="Storefront preview" className="h-[70vh] w-full bg-white" />
            ) : (
              <div className="flex h-[70vh] items-center justify-center text-muted"><div className="dot-bounce"><span /><span /><span /></div></div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
