"use client";

export const CORE_URL = process.env.NEXT_PUBLIC_CORE_URL ?? "http://localhost:4000";
export const API_BASE = `${CORE_URL}/api/v1`;

const ACCESS_KEY = "kiln.access";
const REFRESH_KEY = "kiln.refresh";
export const STORE_KEY = "kiln.storeId";

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const ls = () => (typeof window === "undefined" ? null : window.localStorage);
export const tokens = {
  access: () => ls()?.getItem(ACCESS_KEY) ?? null,
  refresh: () => ls()?.getItem(REFRESH_KEY) ?? null,
  set(access: string, refresh?: string) {
    ls()?.setItem(ACCESS_KEY, access);
    if (refresh) ls()?.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    ls()?.removeItem(ACCESS_KEY);
    ls()?.removeItem(REFRESH_KEY);
  },
};

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const rt = tokens.refresh();
    if (!rt) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) });
      if (!res.ok) return false;
      const body = (await res.json()) as { accessToken: string; refreshToken: string };
      tokens.set(body.accessToken, body.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** return the raw text instead of parsing JSON */
  text?: boolean;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export function qs(query?: ApiOptions["query"]) {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Fetch wrapper: JSON in/out, bearer auth, one automatic refresh on 401, redirect to /login if that fails. */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const doFetch = async () => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const at = tokens.access();
    if (opts.auth !== false && at) headers.Authorization = `Bearer ${at}`;
    return fetch(`${API_BASE}${path}${qs(opts.query)}`, { method: opts.method ?? "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal });
  };
  let res = await doFetch();
  if (res.status === 401 && opts.auth !== false) {
    const ok = await tryRefresh();
    if (ok) res = await doFetch();
    else {
      tokens.clear();
      redirectToLogin();
      throw new ApiError(401, "Session expired");
    }
  }
  const raw = await res.text();
  if (!res.ok) {
    let msg = res.statusText || "Request failed";
    let details: unknown;
    try {
      const j = JSON.parse(raw) as { error?: string; details?: unknown };
      msg = j.error ?? msg;
      details = j.details;
    } catch {
      if (raw) msg = raw.slice(0, 200);
    }
    throw new ApiError(res.status, msg, details);
  }
  if (opts.text) return raw as unknown as T;
  if (!raw) return undefined as unknown as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/** Streams a POST response as server-sent events (EventSource cannot POST). */
export async function streamSse(path: string, body: unknown, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal) {
  const at = tokens.access();
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(at ? { Authorization: `Bearer ${at}` } : {}) }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    let msg = "Request failed";
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (chunk: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let data: unknown = dataLines.join("\n");
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      /* text */
    }
    onEvent(event, data);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (chunk.trim()) flush(chunk);
    }
  }
  if (buffer.trim()) flush(buffer);
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
