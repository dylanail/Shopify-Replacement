/**
 * Store-relative link builder. In path mode (http://localhost:3001/s/<slug>/...) every link is prefixed with
 * /s/<key>; in host mode (<slug>.<base> or a custom domain) links are root-relative. Draft previews keep ?env=draft.
 */
export interface StoreCtx { key: string; mode: "path" | "host"; env: "draft" | "live" }

export const storeBase = (ctx: Pick<StoreCtx, "key" | "mode">) => (ctx.mode === "path" ? `/s/${encodeURIComponent(ctx.key)}` : "");

export function storePath(ctx: StoreCtx, path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = `${storeBase(ctx)}${clean === "/" && ctx.mode === "path" ? "" : clean}` || "/";
  if (ctx.env !== "draft") return url;
  const [p, hash] = url.split("#");
  const sep = p!.includes("?") ? "&" : "?";
  return `${p}${/[?&]env=/.test(p!) ? "" : `${sep}env=draft`}${hash ? `#${hash}` : ""}`;
}
