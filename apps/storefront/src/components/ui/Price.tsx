import { formatMoney } from "@/lib/format";

export function Price({ cents, compareAtCents, currency, className = "", size = "md" }: { cents: number; compareAtCents?: number | null; currency: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const onSale = compareAtCents != null && compareAtCents > cents;
  const sz = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <span className={`inline-flex items-baseline gap-2 ${sz} ${className}`}>
      <span className={onSale ? "text-primary font-semibold" : "font-medium"}>{formatMoney(cents, currency)}</span>
      {onSale && <s className="text-muted text-[0.85em]" aria-label="Original price">{formatMoney(compareAtCents!, currency)}</s>}
      {onSale && <span className="badge bg-primary text-primary-contrast">Save {Math.round(((compareAtCents! - cents) / compareAtCents!) * 100)}%</span>}
    </span>
  );
}
