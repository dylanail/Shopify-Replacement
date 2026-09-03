/** Plain <img> for absolute brand/product URLs (SVG art or uploads). Falls back to a neutral placeholder. */
export function Img({ src, alt, width, height, className = "", eager = false, sizes }: { src: string | null | undefined; alt: string; width: number; height: number; className?: string; eager?: boolean; sizes?: string }) {
  if (!src) return <div className={`bg-ink/5 flex items-center justify-center text-muted text-xs ${className}`} style={{ aspectRatio: `${width}/${height}` }} role="img" aria-label={alt}><span className="eyebrow opacity-60">No image</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} loading={eager ? "eager" : "lazy"} decoding="async" sizes={sizes} className={className} />;
}
