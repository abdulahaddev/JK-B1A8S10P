// Shared building blocks: cards, pills, segmented controls, the per-chart comparison picker, sparklines.
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Circle, GitCompareArrows, OctagonAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { Device } from "../types";

export const ago = (s: number) =>
  s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 86400)} d`;

/** "26 s ago" that counts up every second by itself and restarts when `ts` (unix s) changes. */
export function Ago({ ts, suffix = " ago" }: { ts: number; suffix?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="ago">
      {ago(Math.max(0, Date.now() / 1000 - ts))}
      {suffix}
    </span>
  );
}

export type Health = "online" | "delayed" | "offline" | "unknown";

export function linkHealth(d: Device | null | undefined, nowS: number): Health {
  if (!d?.last_seen) return "unknown";
  const age = nowS - d.last_seen;
  return age < 120 ? "online" : age < 900 ? "delayed" : "offline";
}

export type Kind = "good" | "warning" | "serious" | "critical" | "muted";

export const healthKind = (h: Health): Kind => (h === "online" ? "good" : h === "delayed" ? "warning" : h === "offline" ? "critical" : "muted");
export const HEALTH_LABEL: Record<Health, string> = { online: "Online", delayed: "Delayed", offline: "Offline", unknown: "No data" };

/** Signal strength bands: > -67 dBm good, > -80 fair, else weak; 0 or missing = unknown. */
export const rssiKind = (v?: number): Kind => (v === undefined || v === 0 ? "muted" : v > -67 ? "good" : v > -80 ? "warning" : "serious");
export const rssiLabel = (v?: number) => (v === undefined || v === 0 ? "–" : `${v} dBm · ${v > -67 ? "Good" : v > -80 ? "Fair" : "Weak"}`);

const PILL_ICON: Record<Kind, LucideIcon> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  serious: AlertTriangle,
  critical: OctagonAlert,
  muted: Circle,
};

/** Status indicator: icon + label, never color alone. */
export function StatusPill({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const Icon = PILL_ICON[kind];
  return (
    <span className={`pill pill-${kind}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {children}
    </span>
  );
}

export function Card({
  title,
  icon: Icon,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  icon?: LucideIcon;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div className="card-title">
            {Icon && (
              <span className="card-icon" aria-hidden>
                <Icon size={16} />
              </span>
            )}
            <div>
              {title && <h3>{title}</h3>}
              {subtitle && <p className="sub">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "small";
}) {
  return (
    <div className={`seg ${size ?? ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const COMPARES = [
  { id: "none", label: "No comparison", short: "", shift: () => 0 },
  { id: "prev", label: "Previous period", short: "Previous period", shift: (span: number) => span },
  { id: "day", label: "Yesterday", short: "Yesterday", shift: () => 86400 },
  { id: "week", label: "Last week", short: "Last week", shift: () => 7 * 86400 },
] as const;
export type CompareId = (typeof COMPARES)[number]["id"];

/** Comparison picker that lives in one chart's header. */
export function CompareSelect({ value, onChange }: { value: CompareId; onChange: (v: CompareId) => void }) {
  return (
    <label className={`compare-select ${value !== "none" ? "active" : ""}`} title="Compare this chart with another period">
      <GitCompareArrows size={14} aria-hidden />
      <select value={value} onChange={(e) => onChange(e.target.value as CompareId)} aria-label="Compare with">
        {COMPARES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id === "none" ? "Compare…" : `vs ${c.label}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Tiny trend line for KPI cards (no axes; the card states the value). */
export function Sparkline({ values, color, height = 36 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const w = 120;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 3 - ((v - min) / span) * (height - 6)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const id = `sg-${color.replace("#", "")}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Signed change chip: arrow + value, colored only when a direction is known to be good or bad. */
export function Delta({ now, prev, dec = 1, unit = "", better }: { now: number | null; prev: number | null; dec?: number; unit?: string; better?: "up" | "down" }) {
  if (now === null || prev === null) return <span className="delta delta-neutral">–</span>;
  const d = now - prev;
  const flat = Math.abs(d) < Math.pow(10, -dec) / 2;
  const cue = !better || flat ? "neutral" : (d > 0) === (better === "up") ? "good" : "bad";
  return (
    <span className={`delta delta-${cue}`}>
      {flat ? "■" : d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(dec)}
      {unit && ` ${unit}`}
    </span>
  );
}
