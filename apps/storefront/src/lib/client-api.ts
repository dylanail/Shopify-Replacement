"use client";
/** Browser-side access to the Kiln public API. Used by client components (cart, checkout, reviews, account…). */
import { PUBLIC_CORE_URL, publicApiBase } from "./config";

export class ClientApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export interface ClientOpts { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; token?: string | null; env?: "draft" | "live"; query?: Record<string, string | number | boolean | undefined | null>; signal?: AbortSignal }

export async function api<T = unknown>(storeKey: string, path: string, opts: ClientOpts = {}): Promise<T> {
  const url = new URL(`${publicApiBase(PUBLIC_CORE_URL, storeKey)}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  if (opts.env === "draft") url.searchParams.set("env", "draft");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(url, { method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal, credentials: "omit" });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const b = body as { error?: string; details?: unknown } | string;
    const msg = typeof b === "object" && b && "error" in b && b.error ? String(b.error) : res.status === 404 ? "Not found" : `Something went wrong (${res.status})`;
    throw new ClientApiError(res.status, msg, typeof b === "object" && b ? b.details : undefined);
  }
  return body as T;
}

export const errorMessage = (e: unknown, fallback = "Something went wrong. Please try again.") => (e instanceof Error && e.message ? e.message : fallback);
