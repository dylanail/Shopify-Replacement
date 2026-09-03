"use client";
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";
import { session as ss, storageKey } from "@/lib/storage";
import { useStore } from "./StoreProvider";

export type TrackKind = "view.page" | "view.product" | "view.collection" | "cart.add" | "cart.remove" | "checkout.start" | "checkout.complete" | "signup" | "search";
interface SessionValue { getSessionId: () => string | null; setSessionId: (id: string | null | undefined) => void; track: (kind: TrackKind, extra?: { path?: string; productId?: string; valueCents?: number; meta?: Record<string, unknown> }) => Promise<string | null> }
const Ctx = createContext<SessionValue | null>(null);

/** First-party analytics session: the id lives in sessionStorage per store; every client navigation sends view.page. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const key = storageKey("session", store.key);
  const idRef = useRef<string | null>(null);
  const getSessionId = useCallback(() => { if (idRef.current) return idRef.current; idRef.current = ss.get(key); return idRef.current; }, [key]);
  const setSessionId = useCallback((id: string | null | undefined) => { if (!id) return; idRef.current = id; ss.set(key, id); }, [key]);
  const track = useCallback<SessionValue["track"]>(async (kind, extra = {}) => {
    if (store.env === "draft") return getSessionId();
    try {
      const res = await api<{ sessionId: string | null }>(store.key, "/track", { body: { kind, sessionId: getSessionId() ?? undefined, ...extra } });
      setSessionId(res.sessionId);
      return res.sessionId ?? null;
    } catch { return getSessionId(); }
  }, [store.key, store.env, getSessionId, setSessionId]);
  const value = useMemo(() => ({ getSessionId, setSessionId, track }), [getSessionId, setSessionId, track]);
  return <Ctx.Provider value={value}>{children}<Suspense fallback={null}><PageViewTracker /></Suspense></Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}

function PageViewTracker() {
  const { track } = useSession();
  const pathname = usePathname();
  const search = useSearchParams();
  const last = useRef<string>("");
  useEffect(() => {
    const path = pathname.replace(/^\/s\/[^/]+/, "") || "/";
    const full = `${path}${search?.toString() ? `?${search.toString()}` : ""}`;
    if (last.current === full) return;
    last.current = full;
    void track("view.page", { path: full });
  }, [pathname, search, track]);
  return null;
}
