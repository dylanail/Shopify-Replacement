/** Safe localStorage/sessionStorage helpers (private mode, SSR and sandboxed iframes all throw). */
export const local = {
  get(key: string): string | null { try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* ignore */ } },
  remove(key: string) { try { window.localStorage.removeItem(key); } catch { /* ignore */ } },
};
export const session = {
  get(key: string): string | null { try { return typeof window === "undefined" ? null : window.sessionStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { window.sessionStorage.setItem(key, value); } catch { /* ignore */ } },
  remove(key: string) { try { window.sessionStorage.removeItem(key); } catch { /* ignore */ } },
};
export const storageKey = (kind: "cart" | "session" | "token" | "region" | "exit" | "checkout", storeKey: string) => `kiln:${kind}:${storeKey}`;
