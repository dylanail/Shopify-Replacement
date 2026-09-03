"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Cart } from "@/lib/types";
import { api, errorMessage } from "@/lib/client-api";
import { local, storageKey } from "@/lib/storage";
import { useStore } from "./StoreProvider";
import { useSession } from "./SessionProvider";

export interface AddOpts { subscriptionCadence?: string; metadata?: Record<string, unknown>; open?: boolean }
interface CartValue {
  cart: Cart | null; loading: boolean; error: string | null; itemCount: number; currency: string;
  drawerOpen: boolean; openDrawer: () => void; closeDrawer: () => void;
  ensureCart: () => Promise<Cart>;
  add: (variantId: string, quantity?: number, opts?: AddOpts) => Promise<Cart>;
  addMany: (lines: { variantId: string; quantity?: number; metadata?: Record<string, unknown> }[]) => Promise<Cart>;
  updateQty: (lineId: string, quantity: number) => Promise<void>;
  remove: (lineId: string) => Promise<void>;
  applyDiscount: (code: string) => Promise<void>;
  patch: (body: Record<string, unknown>) => Promise<Cart>;
  setRegion: (regionId: string) => Promise<void>;
  refresh: () => Promise<Cart | null>;
  clear: () => void;
  lastAdded: string | null;
}
const Ctx = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { getSessionId, setSessionId } = useSession();
  const key = storageKey("cart", store.key);
  const regionKey = storageKey("region", store.key);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const pending = useRef<Promise<Cart> | null>(null);

  const load = useCallback(async (): Promise<Cart | null> => {
    const id = local.get(key);
    if (!id) { setLoading(false); return null; }
    try {
      const c = await api<Cart>(store.key, `/cart/${encodeURIComponent(id)}`, { env: store.env });
      if (c.status !== "open") { local.remove(key); setCart(null); return null; }
      setCart(c);
      return c;
    } catch { local.remove(key); setCart(null); return null; }
    finally { setLoading(false); }
  }, [key, store.key, store.env]);

  useEffect(() => { void load(); }, [load]);

  const ensureCart = useCallback(async (): Promise<Cart> => {
    if (cart && cart.status === "open") return cart;
    if (pending.current) return pending.current;
    pending.current = (async () => {
      const existing = local.get(key) ? await load() : null;
      if (existing) return existing;
      const regionId = local.get(regionKey) ?? store.region?.id ?? undefined;
      const c = await api<Cart>(store.key, "/cart", { body: { sessionId: getSessionId() ?? undefined, regionId, country: store.region?.countries[0] }, env: store.env });
      local.set(key, c.id);
      setCart(c);
      setLoading(false);
      return c;
    })().finally(() => { pending.current = null; });
    return pending.current;
  }, [cart, key, regionKey, load, store.key, store.env, store.region, getSessionId]);

  const add = useCallback<CartValue["add"]>(async (variantId, quantity = 1, opts = {}) => {
    setError(null);
    const c = await ensureCart();
    try {
      const next = await api<Cart>(store.key, `/cart/${c.id}/items`, { body: { variantId, quantity, subscriptionCadence: opts.subscriptionCadence, metadata: opts.metadata, sessionId: getSessionId() ?? undefined }, env: store.env });
      setCart(next);
      setSessionId(next.sessionId);
      setLastAdded(variantId);
      if (opts.open !== false) setDrawerOpen(true);
      return next;
    } catch (e) { setError(errorMessage(e)); throw e; }
  }, [ensureCart, store.key, store.env, getSessionId, setSessionId]);

  const addMany = useCallback<CartValue["addMany"]>(async (lines) => {
    setError(null);
    const c = await ensureCart();
    let next: Cart = c;
    try {
      for (const l of lines) next = await api<Cart>(store.key, `/cart/${c.id}/items`, { body: { variantId: l.variantId, quantity: l.quantity ?? 1, metadata: l.metadata, sessionId: getSessionId() ?? undefined }, env: store.env });
      setCart(next);
      setLastAdded(lines[lines.length - 1]?.variantId ?? null);
      setDrawerOpen(true);
      return next;
    } catch (e) { setCart(next); setError(errorMessage(e)); throw e; }
  }, [ensureCart, store.key, store.env, getSessionId]);

  const updateQty = useCallback<CartValue["updateQty"]>(async (lineId, quantity) => {
    if (!cart) return;
    setError(null);
    const prev = cart;
    // optimistic: adjust the line and the item count immediately, reconcile with the priced cart from the API
    setCart({ ...cart, items: cart.items.map((i) => (i.id === lineId ? { ...i, quantity } : i)).filter((i) => i.quantity > 0), pricing: { ...cart.pricing, itemCount: cart.items.reduce((s, i) => s + (i.id === lineId ? quantity : i.quantity), 0) } });
    try { setCart(await api<Cart>(store.key, `/cart/${cart.id}/items/${lineId}`, { method: "PATCH", body: { quantity }, env: store.env })); }
    catch (e) { setCart(prev); setError(errorMessage(e)); }
  }, [cart, store.key, store.env]);

  const remove = useCallback((lineId: string) => updateQty(lineId, 0), [updateQty]);

  const applyDiscount = useCallback<CartValue["applyDiscount"]>(async (code) => {
    const c = await ensureCart();
    setCart(await api<Cart>(store.key, `/cart/${c.id}/discount`, { body: { code }, env: store.env }));
  }, [ensureCart, store.key, store.env]);

  const patch = useCallback<CartValue["patch"]>(async (body) => {
    const c = await ensureCart();
    const next = await api<Cart>(store.key, `/cart/${c.id}`, { method: "PATCH", body: { ...body, sessionId: getSessionId() ?? undefined }, env: store.env });
    setCart(next);
    return next;
  }, [ensureCart, store.key, store.env, getSessionId]);

  const setRegion = useCallback(async (regionId: string) => {
    local.set(regionKey, regionId);
    if (cart) { try { await patch({ regionId, shippingOptionId: null }); } catch (e) { setError(errorMessage(e)); } }
  }, [regionKey, cart, patch]);

  const clear = useCallback(() => { local.remove(key); setCart(null); setDrawerOpen(false); }, [key]);

  const value = useMemo<CartValue>(() => ({
    cart, loading, error, itemCount: cart?.pricing.itemCount ?? cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0, currency: cart?.currency ?? store.currency,
    drawerOpen, openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false),
    ensureCart, add, addMany, updateQty, remove, applyDiscount, patch, setRegion, refresh: load, clear, lastAdded,
  }), [cart, loading, error, store.currency, drawerOpen, ensureCart, add, addMany, updateQty, remove, applyDiscount, patch, setRegion, load, clear, lastAdded]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}
