"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccountResponse, Customer } from "@/lib/types";
import { api } from "@/lib/client-api";
import { local, storageKey } from "@/lib/storage";
import { useStore } from "./StoreProvider";

interface AccountValue { token: string | null; customer: Customer | null; account: AccountResponse | null; loading: boolean; login: (email: string, password: string) => Promise<void>; register: (input: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>; logout: () => void; refresh: () => Promise<AccountResponse | null>; subscriptionAction: (id: string, action: "pause" | "resume" | "cancel" | "change_cadence", cadence?: string) => Promise<void> }
const Ctx = createContext<AccountValue | null>(null);

/** Customer session: bearer token in localStorage per store. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const key = storageKey("token", store.key);
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (tok: string | null = token): Promise<AccountResponse | null> => {
    if (!tok) { setAccount(null); setLoading(false); return null; }
    try { const a = await api<AccountResponse>(store.key, "/account", { token: tok }); setAccount(a); return a; }
    catch { local.remove(key); setToken(null); setAccount(null); return null; }
    finally { setLoading(false); }
  }, [token, store.key, key]);

  useEffect(() => { const t = local.get(key); setToken(t); void refresh(t); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; customer: Customer }>(store.key, "/account/login", { body: { email, password } });
    local.set(key, r.token); setToken(r.token); await refresh(r.token);
  }, [store.key, key, refresh]);
  const register = useCallback(async (input: { email: string; password: string; firstName?: string; lastName?: string }) => {
    const r = await api<{ token: string; customer: Customer }>(store.key, "/account/register", { body: input });
    local.set(key, r.token); setToken(r.token); await refresh(r.token);
  }, [store.key, key, refresh]);
  const logout = useCallback(() => { local.remove(key); setToken(null); setAccount(null); }, [key]);
  const subscriptionAction = useCallback(async (id: string, action: "pause" | "resume" | "cancel" | "change_cadence", cadence?: string) => {
    await api(store.key, `/account/subscriptions/${encodeURIComponent(id)}/${action}`, { body: { cadence }, token });
    await refresh();
  }, [store.key, token, refresh]);

  const value = useMemo<AccountValue>(() => ({ token, customer: account?.customer ?? null, account, loading, login, register, logout, refresh: () => refresh(), subscriptionAction }), [token, account, loading, login, register, logout, refresh, subscriptionAction]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAccount(): AccountValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAccount must be used inside <AccountProvider>");
  return v;
}
