/** Five-star rating glyphs (works in server and client components). */
export function Stars({ rating, size = 14, className = "" }: { rating: number; size?: number; className?: string }) {
  const r = Math.max(0, Math.min(5, rating));
  return (
    <span className={`stars ${className}`} role="img" aria-label={`${r.toFixed(1)} out of 5 stars`} style={{ fontSize: size, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, r - (i - 1)));
        return (
          <span key={i} aria-hidden style={{ position: "relative", display: "inline-block", width: "1em", height: "1em" }}>
            <svg viewBox="0 0 24 24" width="1em" height="1em" style={{ position: "absolute", inset: 0, opacity: 0.25 }} fill="currentColor"><path d="M12 2.5l2.95 6.3 6.9.8-5.1 4.75 1.35 6.85L12 17.8l-6.1 3.4 1.35-6.85-5.1-4.75 6.9-.8z" /></svg>
            <svg viewBox="0 0 24 24" width="1em" height="1em" style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }} fill="currentColor"><path d="M12 2.5l2.95 6.3 6.9.8-5.1 4.75 1.35 6.85L12 17.8l-6.1 3.4 1.35-6.85-5.1-4.75 6.9-.8z" /></svg>
          </span>
        );
      })}
    </span>
  );
}
