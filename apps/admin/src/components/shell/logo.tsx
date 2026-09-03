export function KilnMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 2c2.2 3.4 5.5 5.6 5.5 10a5.5 5.5 0 0 1-11 0c0-1.8.6-3.1 1.4-4.3.5 1.2 1.3 2 2.3 2.4C9.7 7.4 10.9 4.7 12 2Z" fill="#b8552f" />
      <path d="M12 12.5c.9 1.3 2.1 2.2 2.1 3.9a2.1 2.1 0 0 1-4.2 0c0-1.7 1.2-2.6 2.1-3.9Z" fill="#faf6f2" />
    </svg>
  );
}
export function KilnLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <KilnMark />
      <span className="font-display text-[15px] font-semibold tracking-tight">Kiln</span>
    </span>
  );
}
