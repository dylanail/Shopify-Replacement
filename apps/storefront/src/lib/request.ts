import { headers } from "next/headers";
import type { StoreCtx } from "./store-path";

/** Per-request store context derived from the middleware headers + route params. */
export async function storeCtx(storeParam: string, searchParams?: Record<string, string | string[] | undefined>): Promise<StoreCtx> {
  const h = await headers();
  const mode = h.get("x-kiln-mode") === "host" ? "host" : "path";
  const envHeader = h.get("x-kiln-env");
  const sp = searchParams?.env;
  const env = (Array.isArray(sp) ? sp[0] : sp) === "draft" || envHeader === "draft" ? "draft" : "live";
  return { key: decodeURIComponent(storeParam), mode, env };
}

export async function requestPath(): Promise<string> {
  const h = await headers();
  return h.get("x-kiln-path") ?? "/";
}
