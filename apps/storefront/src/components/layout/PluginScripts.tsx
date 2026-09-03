import type { ShellPlugin } from "@/lib/types";
import { interpolate } from "@/lib/slots";

/**
 * Third-party script tags declared by installed plugins. `head` scripts are rendered async so React hoists them into
 * <head>; `bodyEnd` scripts render at the end of <body>. `{{settingKey}}` and `{{storeSlug}}` are interpolated.
 */
export function PluginScripts({ plugins, position, storeSlug }: { plugins: ShellPlugin[]; position: "head" | "bodyEnd"; storeSlug: string }) {
  const tags: { key: string; src?: string; inline?: string }[] = [];
  for (const p of plugins) for (const [i, s] of (p.scripts ?? []).entries()) {
    if ((s.position ?? "bodyEnd") !== position) continue;
    const extra = { storeSlug, storeName: p.name };
    tags.push({ key: `${p.id}-${i}`, src: s.src ? interpolate(s.src, p.settings, extra) : undefined, inline: s.inline ? interpolate(s.inline, p.settings, extra) : undefined });
  }
  if (!tags.length) return null;
  return (
    <>
      {tags.map((t) => t.src
        ? <script key={t.key} src={t.src} async data-plugin={t.key} />
        : <script key={t.key} data-plugin={t.key} dangerouslySetInnerHTML={{ __html: t.inline ?? "" }} />)}
    </>
  );
}
