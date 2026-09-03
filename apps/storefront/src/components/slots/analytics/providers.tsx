"use client";
import { useEffect } from "react";
import type { SlotComponentProps } from "../Slot";
import { useStore } from "@/components/providers/StoreProvider";
import { usePdpOptional } from "@/components/product/PdpContext";

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: ((...a: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void; push?: unknown }; ttq?: { load: (id: string) => void; page: () => void; track: (e: string, p?: unknown) => void; [k: string]: unknown } } }

function useScript(id: string, src: string, enabled: boolean, onLoad?: () => void) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined" || document.getElementById(id)) return;
    const s = document.createElement("script"); s.id = id; s.async = true; s.src = src; if (onLoad) s.onload = onLoad; document.head.appendChild(s);
  }, [id, src, enabled, onLoad]);
}
const useLive = () => useStore().env !== "draft";

/** gtag.js with the configured Measurement ID; page views come from the client router. */
export function Ga4Provider({ props }: SlotComponentProps) {
  const id = typeof props.measurementId === "string" ? props.measurementId : "";
  const live = useLive();
  useEffect(() => { if (!id || !live) return; window.dataLayer = window.dataLayer ?? []; window.gtag = window.gtag ?? function gtag() { window.dataLayer!.push(arguments); }; window.gtag("js", new Date()); window.gtag("config", id, { send_page_view: true }); }, [id, live]);
  useScript(`ga4-${id}`, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, !!id && live);
  return null;
}

export function GoogleAdsTag({ props }: SlotComponentProps) {
  const id = typeof props.conversionId === "string" ? props.conversionId : "";
  const live = useLive();
  useEffect(() => { if (!id || !live) return; window.dataLayer = window.dataLayer ?? []; window.gtag = window.gtag ?? function gtag() { window.dataLayer!.push(arguments); }; window.gtag("js", new Date()); window.gtag("config", id); }, [id, live]);
  useScript(`gads-${id}`, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, !!id && live);
  return null;
}

export function MetaPixelProvider({ props }: SlotComponentProps) {
  const id = typeof props.pixelId === "string" ? props.pixelId : "";
  const live = useLive();
  useEffect(() => {
    if (!id || !live || window.fbq) return;
    const f = function fbq(...a: unknown[]) { if (f.callMethod) f.callMethod(...a); else f.queue!.push(a); } as NonNullable<Window["fbq"]>;
    f.queue = []; f.loaded = true; f.version = "2.0"; f.push = f; window.fbq = f;
    f("init", id); f("track", "PageView");
  }, [id, live]);
  useScript("meta-pixel", "https://connect.facebook.net/en_US/fbevents.js", !!id && live);
  return null;
}

/** Fires ViewContent for the product being viewed (price from the PDP buy state when available). */
export function MetaPdpEvent({ props, ctx }: SlotComponentProps) {
  const pdp = usePdpOptional();
  const store = useStore();
  const productId = (typeof props.productId === "string" ? props.productId : ctx.product?.id) ?? "";
  const price = pdp?.unitPriceCents ?? (typeof props.price === "number" ? props.price : ctx.priceCents ?? 0);
  useEffect(() => { if (!productId || store.env === "draft") return; window.fbq?.("track", "ViewContent", { content_ids: [productId], content_type: "product", value: price / 100, currency: store.currency }); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function TikTokPixelProvider({ props }: SlotComponentProps) {
  const id = typeof props.pixelCode === "string" ? props.pixelCode : "";
  const live = useLive();
  useEffect(() => {
    if (!id || !live || window.ttq) return;
    const q: unknown[] = [];
    const ttq: NonNullable<Window["ttq"]> = { load: (c: string) => q.push(["load", c]), page: () => q.push(["page"]), track: (e: string, p?: unknown) => q.push(["track", e, p]), _q: q };
    window.ttq = ttq;
    ttq.load(id); ttq.page();
  }, [id, live]);
  useScript(`ttq-${id}`, `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`, !!id && live);
  return null;
}
