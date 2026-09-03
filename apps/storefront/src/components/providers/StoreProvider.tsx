"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { StoreClient } from "@/lib/lite";
import { storePath } from "@/lib/store-path";

interface StoreValue extends StoreClient { path: (p?: string) => string }
const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ value, children }: { value: StoreClient; children: ReactNode }) {
  const v = useMemo<StoreValue>(() => ({ ...value, path: (p = "/") => storePath(value, p) }), [value]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside <StoreProvider>");
  return v;
}
/** Store-relative link builder for client components. */
export const useStorePath = () => useStore().path;
