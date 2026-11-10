import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BatteryCharging,
  Bluetooth,
  BluetoothOff,
  CalendarDays,
  CircuitBoard,
  Cpu,
  Gauge,
  Grid2x2,
  Sun,
  Thermometer,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { byDay, cells, ctrlByDay, integrateCtrl, powerW, spreadMv, stats, todayStart, type CtrlFlow } from "../analytics";
import type { Tokens } from "../theme";
import { useLatestCtrl } from "../data";
import type { Ctrl, Device, Info, Reading } from "../types";
import { CELLS, cellKey } from "../types";
import { CategoryChart, TimeChart, type Metric } from "./Chart";
import { MonthCalendar, PowerFlow, TempGauges, UsageByHour } from "./Insights";
import { Ago, Card, HEALTH_LABEL, healthKind, linkHealth, rssiKind, rssiLabel, Segmented, Sparkline, StatusPill, type Kind } from "./ui";

/** Pack state from the latest reading (±0.15 A dead band). */
function packState(r: Reading) {
  const i = r.current ?? 0;
  return i > 0.15 ? "Charging" : i < -0.15 ? "Discharging" : "Idle";
}

function Link({ icon: Icon, label, value, detail, kind, dot = true }: { icon: LucideIcon; label: string; value: string; detail: React.ReactNode; kind: Kind; dot?: boolean }) {
  return (
    <div className={`link link-${kind}`}>
      <span className="link-icon" aria-hidden>
        <Icon size={17} />
      </span>
      <div className="link-body">
        <span className="link-label">{label}</span>
        <b>
          {dot && <span className={`dot dot-${kind}`} aria-hidden />}
          <span className="link-value">{value}</span>
          {detail && <small>{detail}</small>}
        </b>
      </div>
    </div>
  );
}

/** Board, WiFi and BMS Bluetooth state; WiFi/Bluetooth are last-known values once the board stops reporting. */
function Links({ d, nowS }: { d: Device | null | undefined; nowS: number }) {
  const h = linkHealth(d, nowS);
  const live = h === "online" || h === "delayed";
  const queued = d?.buffered ?? 0;
  const ble = d?.ble_connected === 1;
  const boardDetail = d?.last_seen ? (
    <>
      <Ago ts={d.last_seen} />
      {queued > 2 ? ` · ${queued} queued` : ""}
    </>
  ) : null;
  const wifiOk = live && d?.wifi_rssi !== undefined && d.wifi_rssi !== 0;
  const ota = d?.ota_status && d.ota_status !== "idle" ? d.ota_status : "";
  const ctrlOk = d?.ctrl_silent_s !== undefined && d.ctrl_silent_s < 180;
  const otaBad = /fail|rolled back|refus|stopped|expired/i.test(ota);
  return (
    <div className="links">
      <Link
        icon={Sun}
        label="Controller"
        value={!live ? "Unknown" : ctrlOk ? "Connected" : "Silent"}
        detail={live && d?.ctrl_silent_s !== undefined && !ctrlOk ? `${Math.round(d.ctrl_silent_s / 60)} min` : ""}
        kind={!live ? "muted" : ctrlOk ? "good" : "critical"}
      />
      <Link
        icon={CircuitBoard}
        label="Firmware"
        value={d?.firmware_version ?? "–"}
        detail={ota ? <span title={ota}>{ota}</span> : d?.flash_log === 0 ? "flash log missing" : ""}
        kind={!d?.firmware_version ? "muted" : otaBad || d?.flash_log === 0 ? "warning" : "good"}
        dot={false}
      />
      <Link icon={Cpu} label="Board" value={HEALTH_LABEL[h]} detail={boardDetail} kind={queued > 2 && h === "online" ? "warning" : healthKind(h)} />
      <Link
        icon={wifiOk ? Wifi : WifiOff}
        label="WiFi"
        value={!live ? "Unknown" : wifiOk ? (rssiLabel(d?.wifi_rssi).split(" · ")[1] ?? "Connected") : "No signal"}
        detail={d?.wifi_rssi ? `${d.wifi_rssi} dBm` : ""}
        kind={!live ? "muted" : wifiOk ? rssiKind(d?.wifi_rssi) : "critical"}
      />
      <Link
        icon={ble ? Bluetooth : BluetoothOff}
        label="Bluetooth"
        value={!live ? "Unknown" : ble ? "Connected" : "Disconnected"}
        detail={live && ble && (d?.bms_link_rssi ?? d?.bms_rssi) ? `${d?.bms_link_rssi ?? d?.bms_rssi} dBm` : ""}
        kind={!live ? "muted" : ble ? rssiKind(d?.bms_link_rssi ?? d?.bms_rssi) : "critical"}
      />
    </div>
  );
}

/** Firmware, board, WiFi and Bluetooth in one slim row at the top of the page. */
function StatusStrip({ d, nowS }: { d: Device | null | undefined; nowS: number }) {
  return (
    <section className="card status-strip" aria-label="Connection status">
      <Links d={d} nowS={nowS} />
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  unit,
  note,
  spark,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  note?: React.ReactNode;
  spark: number[];
  color: string;
}) {
  return (
    <div className="card kpi">
      <div className="kpi-head">
        <span className="kpi-icon" style={{ color, background: `${color}1f` }} aria-hidden>
          <Icon size={16} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="kpi-foot">
        <div className="kpi-note">{note}</div>
        <Sparkline values={spark} color={color} />
      </div>
    </div>
  );
}

/** Cells against the LiFePO4 working range, with each cell's offset from the pack average. */
function CellsCard({ r, info, tokens: t }: { r: Reading; info?: Info | null; tokens: Tokens }) {
  const v = cells(r);
  const lo = 3.0, hi = 3.65; // LiFePO4 working range; a full bar is the 3.65 V charge limit
  const maxV = Math.max(...v), minV = Math.min(...v);
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const spread = (maxV - minV) * 1000;
  return (
    <Card
      title="Cells"
      icon={Grid2x2}
      subtitle={`Average ${avg.toFixed(3)} V`}
      actions={
        <StatusPill kind={spread < 30 ? "good" : spread < 80 ? "warning" : "serious"}>
          {spread.toFixed(0)} mV · {spread < 30 ? "Balanced" : spread < 80 ? "Drifting" : "Unbalanced"}
        </StatusPill>
      }
    >
      <div className="cells">
        {CELLS.map((c, idx) => {
          const val = r[cellKey(c)];
          const pct = Math.min(100, Math.max(0, ((val - lo) / (hi - lo)) * 100));
          const off = (val - avg) * 1000;
          const tag = val === maxV ? "High" : val === minV ? "Low" : "";
          const res = info?.[`cell_resistance_${c}` as keyof Info] as number | undefined;
          return (
            <div className="cell" key={c}>
              <div className="cell-name">
                <i style={{ background: t.series[idx] }} />
                Cell {c}
              </div>
              <div className="cell-track">
                <div className="cell-fill" style={{ width: `${pct}%`, background: t.series[idx] }} />
              </div>
              <div className="cell-val">
                <b>{val.toFixed(3)}</b> V
              </div>
              <div className="cell-off">
                {off >= 0 ? "+" : "−"}
                {Math.abs(off).toFixed(0)} mV
              </div>
              <div className="cell-tagcol">{tag && <span className="cell-tag">{tag}</span>}</div>
              <div className="cell-res">{res !== undefined ? `${(res * 1000).toFixed(1)} mΩ` : ""}</div>
            </div>
          );
        })}
        <div className="cell cell-scale" aria-hidden>
          <span />
          <div>
            <span>{lo.toFixed(2)} V</span>
            <span>{hi.toFixed(2)} V max</span>
          </div>
        </div>
      </div>
      <p className="sub cells-foot">Balancing {r.balancing ? `on${r.balancing_current ? ` · ${(r.balancing_current * 1000).toFixed(0)} mA` : ""}` : "off"}</p>
    </Card>
  );
}

/** Since local midnight: solar and load added up from the controller's readings, SOC from the BMS. */
function TodayCard({ rows, ctrl, nowS }: { rows: Reading[]; ctrl: CtrlFlow | null; nowS: number }) {
  const today = rows.filter((r) => r.ts >= todayStart());
  const soc = stats(today, (r) => r.state_of_charge);
  const has = ctrl !== null && ctrl.coveredS > 0;
  const items: [string, string, string][] = [
    ["Solar generated", has ? ctrl.solarWh.toFixed(0) : "–", "Wh"],
    ["Load used", has ? ctrl.loadWh.toFixed(0) : "–", "Wh"],
    ["SOC range", soc ? `${soc.min.toFixed(0)}–${soc.max.toFixed(0)}` : "–", "%"],
    ["Peak load", has ? ctrl.peakLoadW.toFixed(0) : "–", "W"],
  ];
  // Say so when the controller was silent for a real part of the day: the sums are then too low
  const elapsedS = nowS - todayStart();
  const partial = has && elapsedS > 1800 && ctrl.coveredS < elapsedS * 0.9;
  const subtitle = partial
    ? `Since midnight · controller data for ${(ctrl.coveredS / 3600).toFixed(1)} of ${(elapsedS / 3600).toFixed(1)} h`
    : "Since midnight · solar and load from the controller, SOC from the BMS";
  return (
    <Card title="Today" icon={CalendarDays} subtitle={subtitle}>
      <div className="today">
        {items.map(([k, v, u]) => (
          <div key={k}>
            <span>{k}</span>
            <b>
              {v} <small>{u}</small>
            </b>
          </div>
        ))}
      </div>
    </Card>
  );
}

const ENERGY_VIEWS = [
  { id: "solar", label: "Solar" },
  { id: "battery", label: "Battery" },
] as const;
type EnergyView = (typeof ENERGY_VIEWS)[number]["id"];

/**
 * Energy for every day of this month, midnight to midnight (days without readings stay empty).
 * Solar: generated and load used, from the controller. Battery: net in and out, from the BMS.
 */
function MonthEnergy({
  bms,
  bmsLoading,
  ctrl,
  ctrlLoading,
  tokens: t,
}: {
  bms: Reading[] | null;
  bmsLoading: boolean;
  ctrl: Ctrl[] | null;
  ctrlLoading: boolean;
  tokens: Tokens;
}) {
  const [view, setView] = useState<EnergyView>("solar");
  const d = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const n = new Date(y, m + 1, 0).getDate();
    const dayKeys = Array.from({ length: n }, (_, i) => Math.floor(new Date(y, m, i + 1).getTime() / 1000));
    const solarBy = new Map(ctrlByDay(ctrl ?? []).map((x) => [x.day, x]));
    const battBy = new Map(byDay(bms ?? []).map((x) => [x.day, x]));
    const solarDays = dayKeys.map((k) => solarBy.get(k));
    const battDays = dayKeys.map((k) => battBy.get(k));
    const sum = <T,>(xs: (T | undefined)[], f: (x: T) => number) => xs.reduce((a, x) => a + (x ? f(x) : 0), 0);
    const kwh = (wh: number) => `${(wh / 1000).toFixed(2)} kWh`;
    return {
      month: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      cats: Array.from({ length: n }, (_, i) => String(i + 1)),
      solar: {
        note: `from the controller · solar ${kwh(sum(solarDays, (x) => x.solarWh))} · load ${kwh(sum(solarDays, (x) => x.loadWh))}`,
        series: [
          { name: "Solar", color: t.series[2], data: solarDays.map((x) => (x ? +x.solarWh.toFixed(0) : null)) },
          { name: "Load", color: t.series[1], data: solarDays.map((x) => (x ? +x.loadWh.toFixed(0) : null)) },
        ],
      },
      battery: {
        note: `battery net, from the BMS · in ${kwh(sum(battDays, (x) => x.chargeWh))} · out ${kwh(sum(battDays, (x) => x.dischargeWh))}`,
        series: [
          { name: "Into battery", color: t.series[2], data: battDays.map((x) => (x ? +x.chargeWh.toFixed(0) : null)) },
          { name: "Out of battery", color: t.series[1], data: battDays.map((x) => (x ? +x.dischargeWh.toFixed(0) : null)) },
        ],
      },
    };
  }, [bms, ctrl, t]);
  const rows = view === "solar" ? ctrl : bms;
  const loading = view === "solar" ? ctrlLoading : bmsLoading;
  const subtitle = rows ? `${d.month} · ${d[view].note}` : loading ? `${d.month} · loading…` : d.month;
  return (
    <CategoryChart
      title="Energy per day"
      icon={view === "solar" ? Sun : BatteryCharging}
      subtitle={subtitle}
      categories={d.cats}
      series={d[view].series}
      unit="Wh"
      decimals={0}
      tokens={t}
      height={280}
      className="span-2"
      extra={<Segmented options={ENERGY_VIEWS} value={view} onChange={setView} label="Energy source" size="small" />}
    />
  );
}

const TREND = [
  { id: "soc", label: "SOC" },
  { id: "power", label: "Power" },
  { id: "voltage", label: "Voltage" },
  { id: "current", label: "Current" },
] as const;
type TrendId = (typeof TREND)[number]["id"];

export function Overview({
  latest,
  info,
  rows,
  todayRows,
  monthRows,
  monthLoading,
  ctrlToday,
  ctrlMonth,
  ctrlMonthLoading,
  loading,
  from,
  now,
  rangeLabel,
  device,
  clock,
  tokens: t,
}: {
  latest?: Reading;
  info?: Info | null;
  rows: Reading[] | null;
  todayRows: Reading[] | null; // since midnight, for the Today card
  monthRows: Reading[] | null; // since the 1st of this month, for the energy per day chart
  monthLoading: boolean;
  ctrlToday: Ctrl[] | null; // controller readings since midnight, for today's solar and load
  ctrlMonth: Ctrl[] | null; // since the 1st, for solar and load per day
  ctrlMonthLoading: boolean;
  loading: boolean;
  from: number; // start of the graph range (unix s)
  now: number;
  rangeLabel: string;
  device: Device | null | undefined;
  clock: number; // live wall clock for "x ago"
  tokens: Tokens;
}) {
  const [trend, setTrend] = useState<TrendId>("soc");
  const ctrlRow = useLatestCtrl();
  const ctrl = ctrlRow && clock - ctrlRow.ts < 180 ? ctrlRow : null;
  // midnight to midnight by the board's timestamps; the filter drops yesterday's rows for a while after midnight
  const ctrlDay = useMemo(() => (ctrlToday ? integrateCtrl(ctrlToday.filter((x) => x.ts >= todayStart())) : null), [ctrlToday]);
  const sparks = useMemo(() => {
    // Sparklines: the last 6 hours, or the whole range when it is shorter
    const recent = (rows ?? []).filter((r) => r.ts >= Math.max(from, now - 6 * 3600));
    const step = Math.max(1, Math.floor(recent.length / 60));
    const thin = recent.filter((_, i) => i % step === 0);
    return {
      voltage: thin.map((r) => r.total_voltage),
      current: thin.map((r) => r.current ?? 0),
      spread: thin.map(spreadMv),
      temp: thin.map((r) => r.mosfet_temperature ?? 0),
    };
  }, [rows, from, now]);

  if (!latest) return <div className="card empty" style={{ height: 200 }}>Waiting for the first reading…</div>;

  const r = latest;
  const i = r.current ?? 0;
  const spread = spreadMv(r);
  const temps = [r.mosfet_temperature, r.temperature_sensor_1, r.temperature_sensor_2].filter((x): x is number => x !== undefined);
  const hot = temps.length ? Math.max(...temps) : null;

  const trendCfg: Record<TrendId, { unit: string; dec: number; metric: Metric; yMin?: number; yMax?: number; zero?: boolean }> = {
    soc: { unit: "%", dec: 0, metric: { name: "SOC", color: t.series[0], pick: (x) => x.state_of_charge }, yMin: 0, yMax: 100 },
    power: { unit: "W", dec: 0, metric: { name: "Power", color: t.series[0], pick: powerW }, zero: true },
    voltage: { unit: "V", dec: 2, metric: { name: "Voltage", color: t.series[0], pick: (x) => x.total_voltage } },
    current: { unit: "A", dec: 2, metric: { name: "Current", color: t.series[0], pick: (x) => x.current }, zero: true },
  };
  const cfg = trendCfg[trend];
  const cellMetrics: Metric[] = CELLS.map((c, idx) => ({ name: `Cell ${c}`, color: t.series[idx], pick: (x) => x[cellKey(c)] }));

  return (
    <div className="page">
      <StatusStrip d={device} nowS={clock} />

      <div className="overview-top">
        <PowerFlow r={r} info={info} bmsOnline={device?.ble_connected === 1} ctrl={ctrl} today={ctrlDay} />
        <div className="kpis">
          <Kpi icon={BatteryCharging} label="Pack voltage" value={r.total_voltage.toFixed(2)} unit="V" note={`${(r.total_voltage / 4).toFixed(3)} V per cell`} spark={sparks.voltage} color={t.series[0]} />
          <Kpi icon={Zap} label="Current" value={`${i > 0 ? "+" : ""}${i.toFixed(2)}`} unit="A" note={packState(r)} spark={sparks.current} color={t.series[2]} />
          <Kpi
            icon={Activity}
            label="Cell spread"
            value={spread.toFixed(0)}
            unit="mV"
            note={<StatusPill kind={spread < 30 ? "good" : spread < 80 ? "warning" : "serious"}>{spread < 30 ? "Balanced" : spread < 80 ? "Drifting" : "Unbalanced"}</StatusPill>}
            spark={sparks.spread}
            color={t.series[6]}
          />
          <Kpi
            icon={Thermometer}
            label="Temperature"
            value={hot === null ? "–" : hot.toFixed(1)}
            unit="°C"
            note={`MOS ${r.mosfet_temperature?.toFixed(0) ?? "–"} · T1 ${r.temperature_sensor_1?.toFixed(0) ?? "–"} · T2 ${r.temperature_sensor_2?.toFixed(0) ?? "–"}`}
            spark={sparks.temp}
            color={t.series[1]}
          />
        </div>
      </div>

      <MonthEnergy bms={monthRows} bmsLoading={monthLoading} ctrl={ctrlMonth} ctrlLoading={ctrlMonthLoading} tokens={t} />

      <TimeChart
        title={rangeLabel}
        icon={TrendingUp}
        unit={cfg.unit}
        decimals={cfg.dec}
        rows={rows}
        loading={loading}
        from={from}
        to={now}
        metrics={[cfg.metric]}
        tokens={t}
        yMin={cfg.yMin}
        yMax={cfg.yMax}
        zeroLine={cfg.zero}
        height={300}
        extra={<Segmented options={TREND} value={trend} onChange={setTrend} label="Metric" size="small" />}
      />

      <div className="grid-2">
        <CellsCard r={r} info={info} tokens={t} />
        <TodayCard rows={todayRows ?? []} ctrl={ctrlDay} nowS={clock} />
        <TimeChart
          title="Cell voltages"
          icon={Grid2x2}
          subtitle={rangeLabel}
          unit="V"
          decimals={3}
          rows={rows}
          loading={loading}
          from={from}
          to={now}
          metrics={cellMetrics}
          tokens={t}
          height={260}
        />
        <TempGauges r={r} rows={rows} rangeLabel={rangeLabel} tokens={t} />
        <UsageByHour rows={monthRows} tokens={t} />
        <MonthCalendar rows={monthRows} tokens={t} />
      </div>
      <p className="foot-note">
        <Gauge size={13} aria-hidden /> Live values update as the board reports; charts refresh every few minutes.
      </p>
    </div>
  );
}
