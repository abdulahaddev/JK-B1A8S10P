import { useEffect, useMemo, useState } from "react";
import { byDay, cells, hourProfile, powerW, series, spreadMv, todayStart } from "./analytics";
import { CategoryChart, TimeChart, type LineSeries } from "./components/Chart";
import { PeriodComparison } from "./components/Compare";
import { ControlPanel, DeviceHealth } from "./components/Device";
import { CellsCard, Kpis, StatusStrip } from "./components/Live";
import { useDevice, useInfo, useLatest, useReadings } from "./data";
import { useTheme } from "./theme";
import type { Reading } from "./types";

const RANGES = [
  { id: "1h", label: "1 h", s: 3600, refresh: 60 },
  { id: "6h", label: "6 h", s: 6 * 3600, refresh: 60 },
  { id: "24h", label: "24 h", s: 86400, refresh: 120 },
  { id: "7d", label: "7 days", s: 7 * 86400, refresh: 600 },
] as const;

const COMPARES = [
  { id: "none", label: "No comparison", shift: () => 0 },
  { id: "prev", label: "Previous period", shift: (span: number) => span },
  { id: "day", label: "Same time yesterday", shift: () => 86400 },
  { id: "week", label: "Same time last week", shift: () => 7 * 86400 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];
type CompareId = (typeof COMPARES)[number]["id"];

/** Wall clock in whole seconds, refreshed every `everyS` (keeps history queries stable in between). */
function useNow(everyS: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyS * 1000);
    return () => clearInterval(t);
  }, [everyS]);
  return now;
}

function rememberedRange(): RangeId {
  try {
    const v = localStorage.getItem("range");
    return RANGES.some((r) => r.id === v) ? (v as RangeId) : "24h";
  } catch {
    return "24h";
  }
}

export default function App() {
  const { mode, tokens: t, toggle } = useTheme();
  const [rangeId, setRangeId] = useState<RangeId>(rememberedRange);
  const [compareId, setCompareId] = useState<CompareId>("prev");
  const range = RANGES.find((r) => r.id === rangeId)!;
  const compare = COMPARES.find((c) => c.id === compareId)!;
  const shift = compare.shift(range.s);

  const device = useDevice();
  const info = useInfo();
  const latest = useLatest<Reading>("telemetry", 1)[0];
  const clock = useNow(5); // for "x s ago"
  const now = useNow(range.refresh);

  const cur = useReadings(now - range.s, now, 3600);
  const prev = useReadings(shift ? now - range.s - shift : 0, shift ? now - shift : 0, 3600);
  const prevRows = shift ? prev.rows : null;

  // Daily comparisons always cover the last 7 full days + today
  const weekNow = useNow(600);
  const week = useReadings(todayStart() - 7 * 86400, weekNow, 3600);

  useEffect(() => {
    try {
      localStorage.setItem("range", rangeId);
    } catch {
      /* not essential */
    }
  }, [rangeId]);

  const curLabel = range.id === "24h" ? "Last 24 h" : range.id === "7d" ? "Last 7 days" : `Last ${range.label}`;
  const prevLabel = compare.id === "prev" ? `Previous ${range.label}` : compare.id === "day" ? "Yesterday" : compare.id === "week" ? "Last week" : "";

  const charts = useMemo(() => {
    const rows = cur.rows ?? [];
    const pr = prevRows ?? [];
    const pair = (pick: (r: Reading) => number | undefined, color: string): LineSeries[] => [
      { name: curLabel, color, data: series(rows, pick) },
      ...(prevRows ? [{ name: prevLabel, color: t.muted, data: series(pr, pick, 600, shift), baseline: true }] : []),
    ];
    return {
      soc: pair((r) => r.state_of_charge, t.series[0]),
      voltage: pair((r) => r.total_voltage, t.series[0]),
      current: pair((r) => r.current, t.series[0]),
      power: pair((r) => powerW(r), t.series[0]),
      spread: pair(spreadMv, t.series[0]),
      cells: [1, 2, 3, 4].map((c, i) => ({ name: `Cell ${c}`, color: t.series[i], data: series(rows, (r) => cells(r)[i]) })),
      temps: [
        { name: "MOSFET", color: t.series[0], data: series(rows, (r) => r.mosfet_temperature) },
        { name: "Sensor 1", color: t.series[1], data: series(rows, (r) => r.temperature_sensor_1) },
        { name: "Sensor 2", color: t.series[2], data: series(rows, (r) => r.temperature_sensor_2) },
      ],
    };
  }, [cur.rows, prevRows, shift, t, curLabel, prevLabel]);

  const daily = useMemo(() => {
    const rows = week.rows ?? [];
    const days = byDay(rows);
    const cats = days.map((d) => new Date(d.day * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));
    const t0 = todayStart();
    const today = rows.filter((r) => r.ts >= t0);
    const yesterday = rows.filter((r) => r.ts >= t0 - 86400 && r.ts < t0);
    const weekAvg = rows.filter((r) => r.ts < t0);
    const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
    const soc = (r: Reading) => r.state_of_charge;
    return {
      cats,
      energy: [
        { name: "Charged", color: t.series[0], data: days.map((d) => d.chargeWh) },
        { name: "Used", color: t.series[1], data: days.map((d) => d.dischargeWh) },
      ],
      socRange: [
        { name: "Highest SOC", color: t.series[0], data: days.map((d) => d.socMax) },
        { name: "Lowest SOC", color: t.series[1], data: days.map((d) => d.socMin) },
      ],
      hours,
      profile: [
        { name: "Today", color: t.series[0], data: hourProfile(today, soc) },
        { name: "Yesterday", color: t.series[1], data: hourProfile(yesterday, soc) },
        { name: "7-day average", color: t.series[2], data: hourProfile(weekAvg, soc) },
      ],
      loadProfile: [
        { name: "Today", color: t.series[0], data: hourProfile(today, (r) => -Math.min(0, powerW(r))) },
        { name: "Yesterday", color: t.series[1], data: hourProfile(yesterday, (r) => -Math.min(0, powerW(r))) },
        { name: "7-day average", color: t.series[2], data: hourProfile(weekAvg, (r) => -Math.min(0, powerW(r))) },
      ],
    };
  }, [week.rows, t]);

  const loading = cur.loading || (!!shift && prev.loading);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ⚡
          </span>
          <div>
            <h1>JK-BMS Monitor</h1>
            <p className="sub">
              {info?.device_model ?? "JK-B1A8S10P"} · 4S LiFePO4
              {info?.state_of_health !== undefined ? ` · SOH ${info.state_of_health}%` : ""}
              {info?.charging_cycles !== undefined ? ` · ${info.charging_cycles} cycles` : ""}
            </p>
          </div>
        </div>
        <button className="ghost" onClick={toggle} aria-label="Toggle theme">
          {mode === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>

      <StatusStrip device={device} nowS={clock} latest={latest} />
      {info?.errors ? <div className="banner">BMS reports: {info.errors}</div> : null}

      <Kpis r={latest} info={info} tokens={t} />

      <div className="filters" role="toolbar" aria-label="Time range and comparison">
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.id} className={r.id === rangeId ? "on" : ""} onClick={() => setRangeId(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <select value={compareId} onChange={(e) => setCompareId(e.target.value as CompareId)} aria-label="Compare with">
          {COMPARES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id === "none" ? c.label : `Compare: ${c.label}`}
            </option>
          ))}
        </select>
        <span className="sub">{loading ? "Updating…" : `${cur.rows?.length ?? 0} readings`}</span>
      </div>

      <div className="grid">
        <CellsCard r={latest} info={info} tokens={t} />
        <PeriodComparison cur={cur.rows ?? []} prev={prevRows} curLabel={curLabel} prevLabel={prevLabel} />
        <TimeChart title="State of charge" unit="%" decimals={0} series={charts.soc} tokens={t} yMin={0} yMax={100} loading={loading} />
        <TimeChart title="Pack voltage" unit="V" series={charts.voltage} tokens={t} loading={loading} />
        <TimeChart title="Current" subtitle="+ charging · − discharging" unit="A" series={charts.current} tokens={t} zeroLine loading={loading} />
        <TimeChart title="Power" subtitle="+ charging · − load" unit="W" decimals={0} series={charts.power} tokens={t} zeroLine loading={loading} />
        <TimeChart title="Cell voltages" subtitle="All four cells on one scale" unit="V" decimals={3} series={charts.cells} tokens={t} loading={loading} />
        <TimeChart title="Cell spread" subtitle="Highest minus lowest cell" unit="mV" decimals={0} series={charts.spread} tokens={t} yMin={0} loading={loading} />
        <TimeChart title="Temperatures" unit="°C" decimals={1} series={charts.temps} tokens={t} loading={loading} />
        <CategoryChart title="Energy per day" subtitle="Integrated from current, last 7 days + today" categories={daily.cats} series={daily.energy} unit="Wh" decimals={0} tokens={t} />
        <CategoryChart title="Daily SOC range" categories={daily.cats} series={daily.socRange} unit="%" decimals={0} tokens={t} kind="line" />
        <CategoryChart title="SOC by hour of day" subtitle="Today vs yesterday vs the 7-day average" categories={daily.hours} series={daily.profile} unit="%" decimals={0} tokens={t} kind="line" />
        <CategoryChart title="Load by hour of day" subtitle="Average discharge power" categories={daily.hours} series={daily.loadProfile} unit="W" decimals={0} tokens={t} kind="line" />
        <ControlPanel d={device} />
        <DeviceHealth d={device} nowS={clock} />
      </div>
    </div>
  );
}
