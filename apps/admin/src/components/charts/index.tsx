"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Hand-written SVG area chart with optional secondary series. */
export function AreaChart({ data, x, y, y2, height = 200, color = "#b8552f", color2 = "#2f6f6a", format = (v: number) => String(v), label, label2, marker, className }: { data: Record<string, unknown>[]; x: string; y: string; y2?: string; height?: number; color?: string; color2?: string; format?: (v: number) => string; label?: string; label2?: string; marker?: { index: number; label: string }; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, PL = 44, PR = 12, PT = 12, PB = 26;
  const n = data.length;
  const vals = data.map((d) => Number(d[y] ?? 0));
  const vals2 = y2 ? data.map((d) => Number(d[y2] ?? 0)) : [];
  const max = Math.max(1, ...vals, ...vals2);
  const px = (i: number) => PL + (n <= 1 ? 0 : (i / (n - 1)) * (W - PL - PR));
  const py = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const path = (vs: number[]) => vs.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = (vs: number[]) => `${path(vs)} L${px(n - 1).toFixed(1)},${(H - PB).toFixed(1)} L${px(0).toFixed(1)},${(H - PB).toFixed(1)} Z`;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const xLabels = n > 8 ? data.filter((_, i) => i % Math.ceil(n / 6) === 0 || i === n - 1) : data;
  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="#e9e2d9" strokeDasharray="2 3" />
            <text x={PL - 6} y={py(t) + 3} textAnchor="end" fontSize="10" fill="#a89d93">{format(t)}</text>
          </g>
        ))}
        {n > 0 && (
          <>
            {y2 && <path d={area(vals2)} fill={color2} opacity={0.12} />}
            <path d={area(vals)} fill={color} opacity={0.14} />
            {y2 && <path d={path(vals2)} fill="none" stroke={color2} strokeWidth={1.5} />}
            <path d={path(vals)} fill="none" stroke={color} strokeWidth={1.8} />
          </>
        )}
        {marker && n > marker.index && (
          <g>
            <line x1={px(marker.index)} x2={px(marker.index)} y1={PT} y2={H - PB} stroke="#1a1a1a" strokeDasharray="3 3" />
            <rect x={px(marker.index) + 4} y={PT} width={marker.label.length * 6 + 10} height={16} fill="#1a1a1a" rx={2} />
            <text x={px(marker.index) + 9} y={PT + 11} fontSize="10" fill="#fff">{marker.label}</text>
          </g>
        )}
        {xLabels.map((d) => {
          const i = data.indexOf(d);
          return <text key={i} x={px(i)} y={H - 8} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="10" fill="#a89d93">{String(d[x]).slice(5)}</text>;
        })}
        {data.map((_, i) => (
          <rect key={i} x={px(i) - (W - PL - PR) / Math.max(1, n - 1) / 2} y={PT} width={(W - PL - PR) / Math.max(1, n - 1)} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && (
          <g>
            <line x1={px(hover)} x2={px(hover)} y1={PT} y2={H - PB} stroke="#7a6f66" />
            <circle cx={px(hover)} cy={py(vals[hover]!)} r={3.5} fill={color} />
            {y2 && <circle cx={px(hover)} cy={py(vals2[hover]!)} r={3.5} fill={color2} />}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded border border-line bg-card px-2 py-1 text-[11px] shadow-sm">
          <span className="text-muted">{String(data[hover]![x])}</span> · <span style={{ color }}>{label ?? y} {format(vals[hover]!)}</span>
          {y2 && <> · <span style={{ color: color2 }}>{label2 ?? y2} {format(vals2[hover]!)}</span></>}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, width = 90, height = 24, color = "#2f6f6a", fill = true }: { values: number[]; width?: number; height?: number; color?: string; fill?: boolean }) {
  if (!values.length) return <svg width={width} height={height} />;
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const px = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * (width - 2) + 1);
  const py = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && <path d={`${d} L${px(values.length - 1)},${height - 1} L${px(0)},${height - 1} Z`} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} />
      <circle cx={px(values.length - 1)} cy={py(values[values.length - 1]!)} r={2} fill={color} />
    </svg>
  );
}

export function BarRow({ label, value, max, display, color = "#1a1a1a", sub, markers }: { label: string; value: number; max: number; display?: string; color?: string; sub?: string; markers?: { value: number; label: string; color: string }[] }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted">{display ?? value}</span>
      </div>
      <div className="relative h-2 w-full rounded-sm bg-sand">
        <div className="h-2 rounded-sm" style={{ width: `${pct}%`, background: color }} />
        {markers?.map((m) => (
          <span key={m.label} title={`${m.label}: ${m.value}%`} className="absolute -top-1 h-4 w-[2px]" style={{ left: `${Math.min(100, (m.value / max) * 100)}%`, background: m.color }} />
        ))}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function Bars({ data, height = 120, color = "#b8552f", format = (v: number) => String(v) }: { data: { label: string; value: number }[]; height?: number; color?: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group relative flex flex-1 flex-col items-center justify-end" title={`${d.label}: ${format(d.value)}`}>
          <div className="w-full rounded-t-[2px]" style={{ height: `${(d.value / max) * (height - 18)}px`, background: color, opacity: d.value === 0 ? 0.25 : 0.9 }} />
          <div className="mt-1 max-w-full truncate text-[9px] text-faint">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
