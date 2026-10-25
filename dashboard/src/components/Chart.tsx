import ReactECharts from "echarts-for-react";
import type { LucideIcon } from "lucide-react";
import { LineChart, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { series, stats, type Pick, type Point } from "../analytics";
import { useShifted } from "../data";
import type { Tokens } from "../theme";
import type { Reading } from "../types";
import { Card, COMPARES, CompareSelect, Delta, type CompareId } from "./ui";

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

const fmtTime = (ms: number, spanMs: number) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return spanMs > 1.5 * 86400e3 ? `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${time}` : time;
};

const fade = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function tooltipBase(t: Tokens) {
  return {
    trigger: "axis",
    backgroundColor: t.surface,
    borderColor: t.axis,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: t.ink, fontSize: 12, fontFamily: FONT },
    extraCssText: `border-radius:10px;box-shadow:0 10px 30px ${t.shadow};`,
    confine: true,
  };
}

const axisCommon = (t: Tokens) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11, fontFamily: FONT, hideOverlap: true },
  splitLine: { lineStyle: { color: t.grid, type: [4, 4] } },
});

const row = (color: string, value: string, name: string, t: Tokens, dashed = false) =>
  `<div style="display:flex;gap:8px;align-items:center;margin-top:3px">` +
  `<span style="display:inline-block;width:12px;height:0;border-top:2px ${dashed ? "dashed" : "solid"} ${color}"></span>` +
  `<span style="color:${t.ink2};flex:1">${name}</span><b style="color:${t.ink};margin-left:12px">${value}</b></div>`;

function ViewToggle({ table, onToggle }: { table: boolean; onToggle: () => void }) {
  return (
    <button className="icon-btn" onClick={onToggle} title={table ? "Show chart" : "Show table"} aria-label={table ? "Show chart" : "Show table"}>
      {table ? <LineChart size={15} /> : <Table2 size={15} />}
    </button>
  );
}

function rememberedCompare(key: string): CompareId {
  try {
    const v = localStorage.getItem(key);
    return COMPARES.some((c) => c.id === v) ? (v as CompareId) : "none";
  } catch {
    return "none";
  }
}

export interface Metric {
  name: string;
  color: string;
  pick: Pick;
}

interface TimeProps {
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
  unit: string;
  decimals?: number;
  rows: Reading[] | null;
  loading?: boolean;
  from: number; // unix s
  to: number;
  metrics: Metric[];
  tokens: Tokens;
  /** Offer the per-chart comparison picker (single-metric charts only). */
  comparable?: boolean;
  /** Which direction of the average is good, for the comparison cue. */
  better?: "up" | "down";
  height?: number;
  yMin?: number;
  yMax?: number;
  zeroLine?: boolean;
  className?: string;
  /** Extra header controls, left of the comparison picker. */
  extra?: React.ReactNode;
}

interface Line {
  name: string;
  color: string;
  data: Point[];
  compare?: boolean;
}

/** Time-series chart: gradient area for one metric, lines for several; own comparison, crosshair, zoom, table view. */
export function TimeChart(p: TimeProps) {
  const t = p.tokens;
  const [table, setTable] = useState(false);
  const storeKey = `cmp:${p.title}`;
  const [compareId, setCompareId] = useState<CompareId>(() => (p.comparable ? rememberedCompare(storeKey) : "none"));
  useEffect(() => {
    try {
      localStorage.setItem(storeKey, compareId);
    } catch {
      /* not essential */
    }
  }, [storeKey, compareId]);

  const compare = COMPARES.find((c) => c.id === compareId)!;
  const shift = p.comparable ? compare.shift(p.to - p.from) : 0;
  const prev = useShifted(p.from, p.to, shift);
  const dec = p.decimals ?? 2;
  const single = p.metrics.length === 1;

  const lines = useMemo<Line[]>(() => {
    const rows = p.rows ?? [];
    const out: Line[] = p.metrics.map((m) => ({ name: single ? "Current" : m.name, color: m.color, data: series(rows, m.pick) }));
    if (single && prev.rows) out.push({ name: compare.short, color: t.muted, data: series(prev.rows, p.metrics[0].pick, 600, shift), compare: true });
    return out;
  }, [p.rows, p.metrics, prev.rows, shift, single, compare.short, t.muted]);

  const s = single && p.rows ? stats(p.rows, p.metrics[0].pick) : null;
  const ps = single && prev.rows ? stats(prev.rows, p.metrics[0].pick) : null;
  const hasData = lines.some((l) => l.data.some((d) => d[1] !== null));
  const spanMs = (p.to - p.from) * 1000;

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      textStyle: { fontFamily: FONT },
      grid: { left: 4, right: 12, top: single ? 12 : 36, bottom: 4, containLabel: true },
      legend: single
        ? { show: false }
        : { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, itemGap: 16, textStyle: { color: t.ink2, fontSize: 12, fontFamily: FONT } },
      tooltip: {
        ...tooltipBase(t),
        axisPointer: { type: "line", lineStyle: { color: t.axis, width: 1 } },
        formatter: (items: { seriesIndex: number; value: Point; color: string }[]) => {
          if (!items.length) return "";
          const head = `<div style="color:${t.muted};font-size:11px">${fmtTime(items[0].value[0], spanMs)}</div>`;
          return (
            head +
            items
              .filter((i) => i.value[1] !== null)
              .map((i) => {
                const l = lines[i.seriesIndex];
                const v = `${(i.value[1] as number).toFixed(dec)} ${p.unit}`;
                const name = l.compare ? `${l.name} · ${fmtTime(i.value[0] - shift * 1000, spanMs)}` : l.name;
                return row(l.color, v, name, t, l.compare);
              })
              .join("")
          );
        },
      },
      xAxis: { type: "time", min: p.from * 1000, max: p.to * 1000, ...axisCommon(t), splitLine: { show: false } },
      yAxis: {
        type: "value",
        min: p.yMin,
        max: p.yMax,
        scale: true,
        splitNumber: 4,
        ...axisCommon(t),
        axisLabel: { ...axisCommon(t).axisLabel, formatter: (v: number) => `${+v.toFixed(dec)}` },
      },
      dataZoom: [{ type: "inside", throttle: 50 }],
      series: lines.map((l, i) => ({
        name: l.name,
        type: "line",
        data: l.data,
        showSymbol: false,
        symbol: "circle",
        symbolSize: 7,
        smooth: 0.2,
        sampling: "lttb",
        connectNulls: false,
        lineStyle: { width: l.compare ? 1.5 : 2, color: l.color, type: l.compare ? [5, 4] : "solid" },
        itemStyle: { color: l.color, borderColor: t.surface, borderWidth: 2 },
        areaStyle:
          single && !l.compare
            ? {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: fade(l.color, 0.28) },
                    { offset: 1, color: fade(l.color, 0) },
                  ],
                },
                origin: p.zeroLine ? 0 : "auto",
              }
            : undefined,
        emphasis: { disabled: true },
        z: l.compare ? 1 : 2,
        markLine:
          p.zeroLine && i === 0
            ? { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: t.axis, type: "solid", width: 1 }, data: [{ yAxis: 0 }] }
            : undefined,
      })),
      animationDuration: 300,
    }),
    [lines, t, p.unit, dec, spanMs, shift, p.from, p.to, p.yMin, p.yMax, p.zeroLine, single],
  );

  const height = p.height ?? 240;
  const busy = p.loading || prev.loading;

  return (
    <Card
      title={
        <>
          {p.title} <span className="unit">{p.unit}</span>
        </>
      }
      icon={p.icon}
      subtitle={p.subtitle}
      className={`chart-card ${p.className ?? ""}`}
      actions={
        <>
          {p.extra}
          {p.comparable && <CompareSelect value={compareId} onChange={setCompareId} />}
          <ViewToggle table={table} onToggle={() => setTable((x) => !x)} />
        </>
      }
    >
      {s && (
        <div className="chart-stats">
          <Stat label="Min" value={s.min} dec={dec} unit={p.unit} />
          <Stat label="Avg" value={s.avg} dec={dec} unit={p.unit} />
          <Stat label="Max" value={s.max} dec={dec} unit={p.unit} />
          {ps && (
            <div className="chart-stat compare">
              <span>Avg vs {compare.short.toLowerCase()}</span>
              <Delta now={s.avg} prev={ps.avg} dec={dec} unit={p.unit} better={p.better} />
            </div>
          )}
        </div>
      )}
      {single && prev.rows && (
        <div className="chart-legend">
          <span>
            <i style={{ borderColor: lines[0].color }} /> Current
          </span>
          <span>
            <i className="dashed" style={{ borderColor: t.muted }} /> {compare.short}
          </span>
        </div>
      )}
      <div className={busy ? "stale" : ""}>
        {table ? (
          <SeriesTable lines={lines} unit={p.unit} dec={dec} spanMs={spanMs} shift={shift} height={height} />
        ) : hasData ? (
          <ReactECharts option={option} notMerge style={{ height }} />
        ) : (
          <div className="empty" style={{ height }}>
            {busy ? "Loading…" : "No readings in this period"}
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, dec, unit }: { label: string; value: number; dec: number; unit: string }) {
  return (
    <div className="chart-stat">
      <span>{label}</span>
      <b>
        {value.toFixed(dec)} <small>{unit}</small>
      </b>
    </div>
  );
}

function SeriesTable({ lines, unit, dec, spanMs, shift, height }: { lines: Line[]; unit: string; dec: number; spanMs: number; shift: number; height: number }) {
  // Rows from the first line's timestamps, thinned to ~60 rows; other lines matched by nearest time
  const base = lines[0]?.data.filter((d) => d[1] !== null) ?? [];
  const step = Math.max(1, Math.ceil(base.length / 60));
  const rows = base.filter((_, i) => i % step === 0).reverse();
  const near = (l: Line, ms: number) => {
    let best: Point | null = null;
    for (const d of l.data) if (d[1] !== null && (!best || Math.abs(d[0] - ms) < Math.abs(best[0] - ms))) best = d;
    return best && Math.abs(best[0] - ms) < 15 * 60e3 ? (best[1] as number).toFixed(dec) : "–";
  };
  return (
    <div className="table-wrap" style={{ maxHeight: height }}>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            {lines.map((l) => (
              <th key={l.name} className="num">
                {l.name} ({unit})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              <td>{fmtTime(r[0], spanMs)}</td>
              {lines.map((l, i) => (
                <td key={l.name} className="num">
                  {i === 0 ? (r[1] as number).toFixed(dec) : near(l, r[0])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {shift > 0 && <p className="sub">Comparison values are matched to the same time of day.</p>}
    </div>
  );
}

export interface CatSeries {
  name: string;
  color: string;
  data: (number | null)[];
  dashed?: boolean;
}

interface CatProps {
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
  categories: string[];
  series: CatSeries[];
  unit: string;
  decimals?: number;
  tokens: Tokens;
  height?: number;
  kind?: "bar" | "line";
  className?: string;
}

/** Category chart (days, hours): grouped rounded bars or category lines, tooltip, table view. */
export function CategoryChart(p: CatProps) {
  const [table, setTable] = useState(false);
  const t = p.tokens;
  const dec = p.decimals ?? 1;
  const kind = p.kind ?? "bar";
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      textStyle: { fontFamily: FONT },
      grid: { left: 4, right: 12, top: 36, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: kind === "bar" ? 12 : 4, itemGap: 16, textStyle: { color: t.ink2, fontSize: 12, fontFamily: FONT } },
      tooltip: {
        ...tooltipBase(t),
        axisPointer: kind === "bar" ? { type: "shadow", shadowStyle: { color: fade(t.muted, 0.08) } } : { type: "line", lineStyle: { color: t.axis } },
        formatter: (items: { seriesIndex: number; name: string; value: number | null }[]) =>
          items.length
            ? `<div style="color:${t.muted};font-size:11px">${items[0].name}</div>` +
              items
                .map((i) => {
                  const s = p.series[i.seriesIndex];
                  return row(s.color, i.value === null || i.value === undefined ? "–" : `${i.value.toFixed(dec)} ${p.unit}`, s.name, t, s.dashed);
                })
                .join("")
            : "",
      },
      xAxis: { type: "category", data: p.categories, ...axisCommon(t), axisLine: { show: true, lineStyle: { color: t.axis } }, splitLine: { show: false } },
      yAxis: { type: "value", scale: kind === "line", splitNumber: 4, ...axisCommon(t) },
      series: p.series.map((s) => ({
        name: s.name,
        type: kind,
        data: s.data,
        barMaxWidth: 22,
        barGap: "15%",
        showSymbol: false,
        symbolSize: 7,
        smooth: 0.2,
        connectNulls: false,
        itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0], borderColor: t.surface, borderWidth: kind === "bar" ? 1 : 2 },
        lineStyle: { width: s.dashed ? 1.5 : 2, color: s.color, type: s.dashed ? [5, 4] : "solid" },
        emphasis: { disabled: true },
      })),
      animationDuration: 300,
    }),
    [p.series, p.categories, t, p.unit, dec, kind],
  );

  return (
    <Card
      title={
        <>
          {p.title} <span className="unit">{p.unit}</span>
        </>
      }
      icon={p.icon}
      subtitle={p.subtitle}
      className={`chart-card ${p.className ?? ""}`}
      actions={<ViewToggle table={table} onToggle={() => setTable((x) => !x)} />}
    >
      {table ? (
        <CatTable categories={p.categories} cols={p.series.map((s) => ({ name: s.name, data: s.data }))} unit={p.unit} dec={dec} height={p.height ?? 260} />
      ) : (
        <ReactECharts option={option} notMerge style={{ height: p.height ?? 260 }} />
      )}
    </Card>
  );
}

function CatTable({ categories, cols, unit, dec, height }: { categories: string[]; cols: { name: string; data: (number | null)[] }[]; unit: string; dec: number; height: number }) {
  return (
    <div className="table-wrap" style={{ maxHeight: height }}>
      <table>
        <thead>
          <tr>
            <th></th>
            {cols.map((c) => (
              <th key={c.name} className="num">
                {c.name} ({unit})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c, i) => (
            <tr key={c}>
              <td>{c}</td>
              {cols.map((s) => (
                <td key={s.name} className="num">
                  {s.data[i] === null || s.data[i] === undefined ? "–" : (s.data[i] as number).toFixed(dec)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Floating bars from low to high per category (e.g. each day's SOC range). */
export function RangeChart(p: {
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
  categories: string[];
  low: (number | null)[];
  high: (number | null)[];
  unit: string;
  decimals?: number;
  color: string;
  tokens: Tokens;
  height?: number;
  yMin?: number;
  yMax?: number;
}) {
  const [table, setTable] = useState(false);
  const t = p.tokens;
  const dec = p.decimals ?? 0;
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      textStyle: { fontFamily: FONT },
      grid: { left: 4, right: 12, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        ...tooltipBase(t),
        axisPointer: { type: "shadow", shadowStyle: { color: fade(t.muted, 0.08) } },
        formatter: (items: { dataIndex: number; name: string }[]) => {
          const i = items[0]?.dataIndex;
          if (i === undefined || p.low[i] === null || p.high[i] === null) return "";
          return (
            `<div style="color:${t.muted};font-size:11px">${items[0].name}</div>` +
            row(p.color, `${p.high[i]!.toFixed(dec)} ${p.unit}`, "Highest", t) +
            row(p.color, `${p.low[i]!.toFixed(dec)} ${p.unit}`, "Lowest", t)
          );
        },
      },
      xAxis: { type: "category", data: p.categories, ...axisCommon(t), axisLine: { show: true, lineStyle: { color: t.axis } }, splitLine: { show: false } },
      yAxis: { type: "value", min: p.yMin, max: p.yMax, splitNumber: 4, ...axisCommon(t) },
      series: [
        { type: "bar", stack: "r", data: p.low, itemStyle: { color: "transparent" }, silent: true, barMaxWidth: 22 },
        {
          type: "bar",
          stack: "r",
          name: "Range",
          data: p.high.map((h, i) => (h === null || p.low[i] === null ? null : h - p.low[i]!)),
          barMaxWidth: 22,
          itemStyle: { color: p.color, borderRadius: 4 },
          label: {
            show: true,
            position: "top",
            color: t.ink2,
            fontSize: 11,
            formatter: (x: { dataIndex: number }) => (p.high[x.dataIndex] === null ? "" : p.high[x.dataIndex]!.toFixed(dec)),
          },
          emphasis: { disabled: true },
        },
      ],
      animationDuration: 300,
    }),
    [p.categories, p.low, p.high, t, p.unit, dec, p.color, p.yMin, p.yMax],
  );
  return (
    <Card
      title={
        <>
          {p.title} <span className="unit">{p.unit}</span>
        </>
      }
      icon={p.icon}
      subtitle={p.subtitle}
      className="chart-card"
      actions={<ViewToggle table={table} onToggle={() => setTable((x) => !x)} />}
    >
      {table ? (
        <CatTable categories={p.categories} cols={[{ name: "Lowest", data: p.low }, { name: "Highest", data: p.high }]} unit={p.unit} dec={dec} height={p.height ?? 260} />
      ) : (
        <ReactECharts option={option} notMerge style={{ height: p.height ?? 260 }} />
      )}
    </Card>
  );
}
