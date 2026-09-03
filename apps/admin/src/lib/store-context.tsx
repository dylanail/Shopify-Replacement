"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { api, STORE_KEY, tokens } from "./api";
import type { Me, Store, StoreSummary } from "./types";

interface StoreCtx {
  me: Me;
  stores: StoreSummary[];
  storeId: string;
  store: Store | undefined;
  setStoreId: (id: string) => void;
  /** Prefix a store-scoped path: sp("/products") → "/stores/<id>/products" */
  sp: (path: string) => string;
  refreshStore: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [storeId, setStoreIdState] = useState<string>("");

  useEffect(() => {
    const t = tokens.access();
    setHasToken(!!t);
    if (!t) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) setStoreIdState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), enabled: hasToken === true, staleTime: 60_000 });

  useEffect(() => {
    if (!me.data) return;
    const list = me.data.stores;
    if (list.length === 0) {
      if (!pathname.startsWith("/onboarding")) router.replace("/onboarding");
      return;
    }
    if (!list.some((s) => s.id === storeId)) {
      const first = list[0]!.id;
      setStoreIdState(first);
      localStorage.setItem(STORE_KEY, first);
    }
  }, [me.data, storeId, pathname, router]);

  const storeQ = useQuery({ queryKey: ["store", storeId], queryFn: () => api<Store>(`/stores/${storeId}`), enabled: !!storeId && !!me.data?.stores.some((s) => s.id === storeId), staleTime: 15_000 });

  const setStoreId = useCallback(
    (id: string) => {
      localStorage.setItem(STORE_KEY, id);
      setStoreIdState(id);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
    [qc],
  );

  const value = useMemo<StoreCtx | null>(() => {
    if (!me.data || !storeId || !me.data.stores.some((s) => s.id === storeId)) return null;
    return { me: me.data, stores: me.data.stores, storeId, store: storeQ.data, setStoreId, sp: (p: string) => `/stores/${storeId}${p}`, refreshStore: () => void qc.invalidateQueries({ queryKey: ["store", storeId] }) };
  }, [me.data, storeId, storeQ.data, setStoreId, qc]);

  if (me.isError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="card max-w-sm p-6 text-center">
          <div className="font-display text-lg">Couldn't reach Kiln</div>
          <p className="mt-2 text-muted">{(me.error as Error).message}. Check that the core API is running at {process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000"}.</p>
          <button className="mt-4 rounded border px-3 py-1.5 hover:bg-sand" onClick={() => me.refetch()}>Retry</button>
        </div>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="flex h-screen items-center justify-center text-muted">
        <div className="dot-bounce"><span /><span /><span /></div>
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}

/** Convenience: store-scoped GET query. */
export function useStoreQuery<T>(key: unknown[], path: string, opts: { query?: Record<string, string | number | boolean | undefined | null>; enabled?: boolean; refetchInterval?: number; text?: boolean } = {}) {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ["s", storeId, ...key, opts.query ?? null],
    queryFn: () => api<T>(`/stores/${storeId}${path}`, { query: opts.query, text: opts.text }),
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetchInterval,
  });
}
