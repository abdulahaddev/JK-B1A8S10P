// Pure helpers over readings: downsampling, energy integration, profiles, comparisons.
import type { Reading } from "./types";
import { CELLS, cellKey } from "./types";

export type Point = [number, number | null]; // [ms, value]
export type Pick = (r: Reading) => number | undefined;

/** Average into at most `max` time buckets; a gap > 3 buckets (or > 5 min) becomes a break in the line. */
export function series(rows: Reading[], pick: Pick, max = 600, shiftS = 0): Point[] {
  if (rows.length === 0) return [];
  const t0 = rows[0].ts;
  const span = Math.max(1, rows[rows.length - 1].ts - t0);
  const bucket = Math.max(30, Math.ceil(span / max));
  const out: Point[] = [];
  let key = -1, sum = 0, n = 0, lastTs = t0;
  const flush = () => {
    if (n) out.push([(t0 + key * bucket + bucket / 2 + shiftS) * 1000, sum / n]);
  };
  for (const r of rows) {
    const v = pick(r);
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    if (r.ts - lastTs > Math.max(300, bucket * 3)) {
      flush();
      out.push([(lastTs + 1 + shiftS) * 1000, null]); // break the line across the outage
      key = -1; sum = 0; n = 0;
    }
    lastTs = r.ts;
    const k = Math.floor((r.ts - t0) / bucket);
    if (k !== key) {
      flush();
      key = k; sum = 0; n = 0;
    }
    sum += v;
    n++;
  }
  flush();
  return out;
}

export const cells = (r: Reading) => CELLS.map((c) => r[cellKey(c)]);
export const spreadMv = (r: Reading) => {
  const v = cells(r);
  return (Math.max(...v) - Math.min(...v)) * 1000;
};
export const powerW = (r: Reading) => (r.current ?? 0) * r.total_voltage;

export interface Stats {
  min: number;
  max: number;
  avg: number;
}
export function stats(rows: Reading[], pick: Pick): Stats | null {
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v === undefined || Number.isNaN(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
    n++;
  }
  return n ? { min, max, avg: sum / n } : null;
}

/** Charged / discharged amp-hours and watt-hours, integrated from current (gaps > 5 min are skipped). */
export interface Flow {
  chargeAh: number;
  dischargeAh: number;
  chargeWh: number;
  dischargeWh: number;
}
export function integrate(rows: Reading[]): Flow {
  const f: Flow = { chargeAh: 0, dischargeAh: 0, chargeWh: 0, dischargeWh: 0 };
  for (let i = 1; i < rows.length; i++) {
    const dt = rows[i].ts - rows[i - 1].ts;
    if (dt <= 0 || dt > 300) continue;
    const a = rows[i - 1].current ?? 0;
    const v = rows[i - 1].total_voltage;
    if (!Number.isFinite(a) || !Number.isFinite(v)) continue; // older readings can miss a value
    const ah = (a * dt) / 3600;
    const wh = ah * v;
    if (a > 0) {
      f.chargeAh += ah;
      f.chargeWh += wh;
    } else {
      f.dischargeAh -= ah;
      f.dischargeWh -= wh;
    }
  }
  return f;
}

const dayStart = (ts: number) => {
  const d = new Date(ts * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

/** Per local day: charged and discharged energy, plus min/max SOC. */
export interface Day extends Flow {
  day: number; // unix s of local midnight
  socMin: number;
  socMax: number;
  readings: number;
}
export function byDay(rows: Reading[]): Day[] {
  const groups = new Map<number, Reading[]>();
  for (const r of rows) {
    const d = dayStart(r.ts);
    (groups.get(d) ?? groups.set(d, []).get(d)!).push(r);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, rs]) => {
      const s = stats(rs, (r) => r.state_of_charge)!;
      return { day, ...integrate(rs), socMin: s.min, socMax: s.max, readings: rs.length };
    });
}

/** Average value per hour of the local day (0-23) for a set of readings; null where no data. */
export function hourProfile(rows: Reading[], pick: Pick): (number | null)[] {
  const sum = new Array(24).fill(0), n = new Array(24).fill(0);
  for (const r of rows) {
    const v = pick(r);
    if (v === undefined || Number.isNaN(v)) continue;
    const h = new Date(r.ts * 1000).getHours();
    sum[h] += v;
    n[h]++;
  }
  return sum.map((s, h) => (n[h] ? s / n[h] : null));
}

export const todayStart = () => dayStart(Date.now() / 1000);

/** Relative change of b vs a, as a signed percentage, or null if a is ~0. */
export const pctChange = (a: number, b: number) => (Math.abs(a) < 1e-9 ? null : ((b - a) / Math.abs(a)) * 100);
