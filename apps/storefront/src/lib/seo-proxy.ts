import { headers } from "next/headers";
import { coreText } from "./api";

/** Route handler body for robots.txt / sitemap.xml / llms.txt: proxied from the core for the resolved store. */
export async function proxySeoFile(file: "robots.txt" | "sitemap.xml" | "llms.txt", storeKey?: string) {
  const h = await headers();
  const key = storeKey ?? h.get("x-kiln-store");
  const type = file === "sitemap.xml" ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8";
  if (!key) {
    const fallback = file === "robots.txt" ? "User-agent: *\nDisallow:\n" : file === "sitemap.xml" ? '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>' : "# Kiln storefront\n";
    return new Response(fallback, { headers: { "Content-Type": type } });
  }
  try {
    const r = await coreText(key, `/${file}`);
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.status === 200 ? type : "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  } catch {
    return new Response("Store unavailable", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}
