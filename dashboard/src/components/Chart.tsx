import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import type { Point } from "../analytics";
import type { Tokens } from "../theme";

export interface LineSeries {
  name: string;
  color: string;
  data: Point[];
  /** Comparison baseline (previous period): drawn thinner and recessive, never dashed grid-like. */
  baseline?: boolean;
}

interface TimeProps {
  title: string;
  subtitle?: string;
  unit: string;
  decimals?: number;
  series: LineSeries[];
  tokens: Tokens;
  height?: number;
  yMin?: number;
  yMax?: number;
  zeroLine?: boolean;
  loading?: boolean;
  extra?: React.ReactNode; // stat chips under the title
}

const fmtTime = (ms: number, spanMs: number) => {
  const d = new Date(ms);
  return spanMs > 2 * 86400e3
    ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

function baseOption(t: Tokens) {
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: t.ink2 },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 14,
      itemHeight: 4,
      textStyle: { color: t.ink2, fontSize: 12 },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.surface,
      borderColor: t.axis,
      borderWidth: 1,
      textStyle: { color: t.ink, fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color: t.muted, width: 1 } },
      confine: true,
    },
  };
}

/** Time-series line chart: one y-axis, crosshair tooltip with every series, inside zoom, table view. */
export function TimeChart(p: TimeProps) {
  const [table, setTable] = useState(false);
  const t = p.tokens;
  const all = p.series.flatMap((s) => s.data.filter((d) => d[1] !== null));
  const spanMs = all.length ? Math.max(...all.map((d) => d[0])) - Math.min(...all.map((d) => d[0])) : 0;
  const dec = p.decimals ?? 2;

  const option = useMemo(
    () => ({
      ...baseOption(t),
      legend: { ...baseOption(t).legend, show: p.series.length > 1 },
      tooltip: {
        ...baseOption(t).tooltip,
        formatter: (items: { seriesName: string; value: Point; color: string }[]) => {
          if (!items.length) return "";
          const head = `<div style="color:${t.ink2};margin-bottom:4px">${fmtTime(items[0].value[0], spanMs)}</div>`;
          const rows = items
            .filter((i) => i.value[1] !== null)
            .map(
              (i) =>
                `<div style="display:flex;gap:8px;align-items:center"><span style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${i.color}"></span><b style="color:${t.ink}">${(i.value[1] as number).toFixed(dec)} ${p.unit}</b><span style="color:${t.ink2}">${i.seriesName}</span></div>`,
            )
            .join("");
          return head + rows;
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: p.yMin,
        max: p.yMax,
        scale: true,
        axisLabel: { color: t.muted, formatter: (v: number) => `${+v.toFixed(dec)}` },
        splitLine: { lineStyle: { color: t.grid, width: 1 } },
      },
      dataZoom: [{ type: "inside", throttle: 50 }],
      series: p.series.map((s) => ({
        name: s.name,
        type: "line",
        data: s.data,
        showSymbol: false,
        connectNulls: false,
        smooth: false,
        lineStyle: { width: s.baseline ? 1.5 : 2, color: s.color, opacity: s.baseline ? 0.55 : 1 },
        itemStyle: { color: s.color },
        emphasis: { focus: "series" },
        z: s.baseline ? 1 : 2,
        markLine:
          p.zeroLine && !s.baseline
            ? { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: t.axis, type: "solid", width: 1 }, data: [{ yAxis: 0 }] }
            : undefined,
      })),
      animation: false,
    }),
    [p.series, t, p.unit, dec, spanMs, p.yMin, p.yMax, p.zeroLine],
  );

  return (
    <section className="card chart-card">
      <header className="card-head">
        <div>
          <h3>
            {p.title} <span className="unit">{p.unit}</span>
          </h3>
          {p.subtitle && <p className="sub">{p.subtitle}</p>}
        </div>
        <button className="ghost small" onClick={() => setTable((x) => !x)}>
          {table ? "Chart" : "Table"}
        </button>
      </header>
      {p.extra}
      <div className={p.loading ? "stale" : ""}>
        {table ? (
          <SeriesTable series={p.series} unit={p.unit} dec={dec} spanMs={spanMs} />
        ) : all.length ? (
          <ReactECharts option={option} notMerge style={{ height: p.height ?? 260 }} />
        ) : (
          <div className="empty" style={{ height: p.height ?? 260 }}>
            {p.loading ? "Loading…" : "No readings in this period"}
          </div>
        )}
      </div>
    </section>
  );
}

function SeriesTable({ series, unit, dec, spanMs }: { series: LineSeries[]; unit: string; dec: number; spanMs: number }) {
  // Rows from the first series' timestamps, thinned to ~60 rows; other series matched by nearest time
  const base = series[0]?.data.filter((d) => d[1] !== null) ?? [];
  const step = Math.max(1, Math.ceil(base.length / 60));
  const rows = base.filter((_, i) => i % step === 0);
  const near = (s: LineSeries, ms: number) => {
    let best: Point | null = null;
    for (const d of s.data) if (d[1] !== null && (!best || Math.abs(d[0] - ms) < Math.abs(best[0] - ms))) best = d;
    return best && Math.abs(best[0] - ms) < 15 * 60e3 ? (best[1] as number).toFixed(dec) : "–";
  };
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            {series.map((s) => (
              <th key={s.name}>
                {s.name} ({unit})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              <td>{fmtTime(r[0], spanMs)}</td>
              {series.map((s, i) => (
                <td key={s.name}>{i === 0 ? (r[1] as number).toFixed(dec) : near(s, r[0])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BarProps {
  title: string;
  subtitle?: string;
  categories: string[];
  series: { name: string; color: string; data: (number | null)[] }[];
  unit: string;
  decimals?: number;
  tokens: Tokens;
  height?: number;
  kind?: "bar" | "line";
}

/** Category chart (days, hours): grouped bars or category lines, per-mark tooltip, table view. */
export function CategoryChart(p: BarProps) {
  const [table, setTable] = useState(false);
  const t = p.tokens;
  const dec = p.decimals ?? 1;
  const kind = p.kind ?? "bar";
  const option = useMemo(
    () => ({
      ...baseOption(t),
      legend: { ...baseOption(t).legend, show: p.series.length > 1 },
      tooltip: {
        ...baseOption(t).tooltip,
        axisPointer: kind === "bar" ? { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } } : baseOption(t).tooltip.axisPointer,
        valueFormatter: (v: number | null) => (v === null || v === undefined ? "–" : `${v.toFixed(dec)} ${p.unit}`),
      },
      xAxis: {
        type: "category",
        data: p.categories,
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        scale: kind === "line",
        axisLabel: { color: t.muted },
        splitLine: { lineStyle: { color: t.grid } },
      },
      series: p.series.map((s) => ({
        name: s.name,
        type: kind,
        data: s.data,
        barMaxWidth: 18,
        barGap: "20%",
        showSymbol: kind === "line" ? false : undefined,
        connectNulls: false,
        itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0], borderColor: t.surface, borderWidth: kind === "bar" ? 1 : 0 },
        lineStyle: { width: 2, color: s.color },
        emphasis: { focus: "series" },
      })),
      animation: false,
    }),
    [p.series, p.categories, t, p.unit, dec, kind],
  );

  return (
    <section className="card chart-card">
      <header className="card-head">
        <div>
          <h3>
            {p.title} <span className="unit">{p.unit}</span>
          </h3>
          {p.subtitle && <p className="sub">{p.subtitle}</p>}
        </div>
        <button className="ghost small" onClick={() => setTable((x) => !x)}>
          {table ? "Chart" : "Table"}
        </button>
      </header>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                {p.series.map((s) => (
                  <th key={s.name}>
                    {s.name} ({p.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.categories.map((c, i) => (
                <tr key={c}>
                  <td>{c}</td>
                  {p.series.map((s) => (
                    <td key={s.name}>{s.data[i] === null ? "–" : (s.data[i] as number).toFixed(dec)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ReactECharts option={option} notMerge style={{ height: p.height ?? 260 }} />
      )}
    </section>
  );
}
