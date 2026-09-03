import { NextResponse, type NextRequest } from "next/server";

const BASE_DOMAIN = (process.env.STOREFRONT_BASE_DOMAIN ?? "localhost:3001").toLowerCase();
const baseHost = BASE_DOMAIN.split(":")[0]!;

/**
 * Multi-tenant routing.
 *  (a) /s/<slug>/...            → path mode (local dev / preview iframe). Kept as is.
 *  (b) <slug>.<base-domain>/... → host mode, rewritten to /s/<slug>/...
 *  (c) any other host           → custom domain, rewritten to /s/<hostname>/...
 * The resolved mode, original path and draft flag are passed down as request headers.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostHeader = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const host = hostHeader.split(":")[0]!;
  const isDraft = url.searchParams.get("env") === "draft";
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-kiln-env", isDraft ? "draft" : "live");

  if (url.pathname === "/s" || url.pathname.startsWith("/s/")) {
    const rest = url.pathname.replace(/^\/s\/[^/]+/, "") || "/";
    const slug = url.pathname.split("/")[2];
    reqHeaders.set("x-kiln-mode", "path");
    reqHeaders.set("x-kiln-path", rest);
    if (slug) reqHeaders.set("x-kiln-store", decodeURIComponent(slug));
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  let key: string | null = null;
  if (host && host !== baseHost && host.endsWith(`.${baseHost}`)) {
    key = host.slice(0, -(baseHost.length + 1)).split(".")[0] ?? null; // first label
    if (key === "www") key = null;
  } else if (host && host !== baseHost && host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0") {
    key = host; // custom domain: the core resolves hostnames too
  }
  if (!key) {
    reqHeaders.set("x-kiln-mode", "path");
    reqHeaders.set("x-kiln-path", url.pathname);
    return NextResponse.next({ request: { headers: reqHeaders } });
  }
  reqHeaders.set("x-kiln-mode", "host");
  reqHeaders.set("x-kiln-path", url.pathname);
  reqHeaders.set("x-kiln-store", key);
  const rewritten = url.clone();
  rewritten.pathname = `/s/${key}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(rewritten, { request: { headers: reqHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|assets/).*)"],
};
