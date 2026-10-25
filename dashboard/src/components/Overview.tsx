import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BatteryCharging,
  Bluetooth,
  BluetoothOff,
  CalendarDays,
  Cpu,
  Gauge,
  Grid2x2,
  Pause,
  Thermometer,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cells, integrate, powerW, spreadMv, stats, todayStart } from "../analytics";
import type { Tokens } from "../theme";
import type { Device, Info, Reading } from "../types";
import { CELLS, cellKey } from "../types";
import { TimeChart, type Metric } from "./Chart";
import { ago, Card, HEALTH_LABEL, healthKind, linkHealth, rssiKind, rssiLabel, Segmented, Sparkline, StatusPill, type Kind } from "./ui";

const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`);

/** Pack state from the latest reading (±0.15 A dead band). */
function packState(r: Reading) {
  const i = r.current ?? 0;
  return i > 0.15 ? "Charging" : i < -0.15 ? "Discharging" : "Idle";
}

function SocRing({ soc, color, track }: { soc: number; color: string; track: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 128 128" role="img" aria-label={`${soc} percent charged`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke={track} strokeWidth="12" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, soc)) / 100) * c} ${c}`}
        transform="rotate(-90 64 64)"
      />
      <text x="64" y="62" textAnchor="middle" className="ring-value">
        {soc}
        <tspan className="ring-unit">%</tspan>
      </text>
      <text x="64" y="84" textAnchor="middle" className="ring-label">
        charged
      </text>
    </svg>
  );
}

function Link({ icon: Icon, label, value, detail, kind }: { icon: LucideIcon; label: string; value: string; detail: string; kind: Kind }) {
  return (
    <div className={`link link-${kind}`}>
      <span className="link-icon" aria-hidden>
        <Icon size={17} />
      </span>
      <div className="link-body">
        <span className="link-label">{label}</span>
        <b>
          <span className={`dot dot-${kind}`} aria-hidden />
          {value}
        </b>
        <span className="link-detail">{detail}</span>
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
  const boardDetail = d?.last_seen
    ? [`${ago(nowS - d.last_seen)} ago`, d.firmware_version && `fw ${d.firmware_version}`, live && d.uptime_s !== undefined && `up ${ago(d.uptime_s)}`, queued > 2 && `${queued} queued`]
        .filter(Boolean)
        .join(" · ")
    : "Waiting for the first report";
  const wifiOk = live && d?.wifi_rssi !== undefined && d.wifi_rssi !== 0;
  return (
    <div className="links">
      <Link icon={Cpu} label="Board" value={HEALTH_LABEL[h]} detail={boardDetail} kind={queued > 2 && h === "online" ? "warning" : healthKind(h)} />
      <Link
        icon={wifiOk ? Wifi : WifiOff}
        label="WiFi"
        value={!live ? "Unknown" : wifiOk ? (rssiLabel(d?.wifi_rssi).split(" · ")[1] ?? "Connected") : "No signal"}
        detail={`${d?.wifi_rssi ? `${live ? "" : "Last "}${d.wifi_rssi} dBm` : "–"} · ${d?.wifi_disconnects ?? 0} drops`}
        kind={!live ? "muted" : wifiOk ? rssiKind(d?.wifi_rssi) : "critical"}
      />
      <Link
        icon={ble ? Bluetooth : BluetoothOff}
        label="BMS Bluetooth"
        value={!live ? `Last: ${ble ? "connected" : "disconnected"}` : ble ? "Connected" : "Disconnected"}
        detail={`${d?.bms_rssi ? `${d.bms_rssi} dBm` : "–"} · ${d?.ble_disconnects ?? 0} drops`}
        kind={!live ? "muted" : ble ? rssiKind(d?.bms_rssi) : "critical"}
      />
    </div>
  );
}

function Hero({ r, info, d, nowS, tokens: t }: { r: Reading; info?: Info | null; d: Device | null | undefined; nowS: number; tokens: Tokens }) {
  const i = r.current ?? 0;
  const state = packState(r);
  const full = info?.full_charge_capacity;
  const hours = state === "Idle" ? null : i > 0 ? (full ? (full - r.capacity_remaining) / i : null) : r.capacity_remaining / -i;
  const p = powerW(r);
  const StateIcon = state === "Charging" ? ArrowUpRight : state === "Discharging" ? ArrowDownRight : Pause;
  const low = r.state_of_charge < 20;
  const stale = nowS - r.ts > 900;
  return (
    <section className="card hero">
      <div className="hero-main">
        <SocRing soc={r.state_of_charge} color={low ? t.critical : t.series[0]} track={t.grid} />
        <div className="hero-body">
          <div className="hero-top">
            <span className={`state state-${state.toLowerCase()}`}>
              <StateIcon size={15} aria-hidden /> {state}
            </span>
            {low && <StatusPill kind="critical">Low charge</StatusPill>}
            {stale && <StatusPill kind="warning">Reading {ago(nowS - r.ts)} old</StatusPill>}
          </div>
          <div className="hero-power">
            {state === "Idle" ? "0" : `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(0)}`}
            <span>W</span>
          </div>
          <p className="hero-note">
            {hours !== null && Number.isFinite(hours) ? `${state === "Charging" ? "Full" : "Empty"} in about ${fmtHours(hours)}` : state === "Idle" ? "No load right now" : "Estimating…"}
          </p>
          <div className="hero-facts">
            <div>
              <span>Remaining</span>
              <b>
                {r.capacity_remaining.toFixed(1)}
                {full ? ` / ${full.toFixed(0)}` : ""} Ah
              </b>
            </div>
            <div>
              <span>Health</span>
              <b>{info?.state_of_health !== undefined ? `${info.state_of_health}%` : "–"}</b>
            </div>
            <div>
              <span>Cycles</span>
              <b>{info?.charging_cycles ?? "–"}</b>
            </div>
          </div>
        </div>
      </div>
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
  const lo = 3.0, hi = 3.65;
  const maxV = Math.max(...v), minV = Math.min(...v);
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const spread = (maxV - minV) * 1000;
  return (
    <Card
      title="Cells"
      icon={Grid2x2}
      subtitle={`Average ${avg.toFixed(3)} V · range ${lo.toFixed(2)}–${hi.toFixed(2)} V`}
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
              <div className="cell-meta">
                {tag && <span className={`cell-tag tag-${tag.toLowerCase()}`}>{tag}</span>}
                {res !== undefined && <span>{(res * 1000).toFixed(1)} mΩ</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="sub cells-foot">Balancing {r.balancing ? `on${r.balancing_current ? ` · ${(r.balancing_current * 1000).toFixed(0)} mA` : ""}` : "off"}</p>
    </Card>
  );
}

function TodayCard({ rows }: { rows: Reading[] }) {
  const today = rows.filter((r) => r.ts >= todayStart());
  const f = integrate(today);
  const soc = stats(today, (r) => r.state_of_charge);
  const pk = stats(today, (r) => -Math.min(0, powerW(r)));
  const items: [string, string, string][] = [
    ["Charged", f.chargeWh.toFixed(0), "Wh"],
    ["Used", f.dischargeWh.toFixed(0), "Wh"],
    ["SOC range", soc ? `${soc.min.toFixed(0)}–${soc.max.toFixed(0)}` : "–", "%"],
    ["Peak load", pk ? pk.max.toFixed(0) : "–", "W"],
  ];
  return (
    <Card title="Today" icon={CalendarDays} subtitle="Since midnight, integrated from current">
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
  loading,
  now,
  device,
  clock,
  tokens: t,
}: {
  latest?: Reading;
  info?: Info | null;
  rows: Reading[] | null;
  loading: boolean;
  now: number;
  device: Device | null | undefined;
  clock: number; // live wall clock for "x ago"
  tokens: Tokens;
}) {
  const [trend, setTrend] = useState<TrendId>("soc");
  const sparks = useMemo(() => {
    const recent = (rows ?? []).filter((r) => r.ts >= now - 6 * 3600);
    const step = Math.max(1, Math.floor(recent.length / 60));
    const thin = recent.filter((_, i) => i % step === 0);
    return {
      voltage: thin.map((r) => r.total_voltage),
      current: thin.map((r) => r.current ?? 0),
      spread: thin.map(spreadMv),
      temp: thin.map((r) => r.mosfet_temperature ?? 0),
    };
  }, [rows, now]);

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

  return (
    <div className="page">
      <div className="overview-top">
        <Hero r={r} info={info} d={device} nowS={clock} tokens={t} />
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

      <TimeChart
        title="Last 24 hours"
        icon={TrendingUp}
        unit={cfg.unit}
        decimals={cfg.dec}
        rows={rows}
        loading={loading}
        from={now - 86400}
        to={now}
        metrics={[cfg.metric]}
        tokens={t}
        comparable
        yMin={cfg.yMin}
        yMax={cfg.yMax}
        zeroLine={cfg.zero}
        height={300}
        extra={<Segmented options={TREND} value={trend} onChange={setTrend} label="Metric" size="small" />}
      />

      <div className="grid-2">
        <CellsCard r={r} info={info} tokens={t} />
        <TodayCard rows={rows ?? []} />
      </div>
      <p className="foot-note">
        <Gauge size={13} aria-hidden /> Live values update as the board reports; charts refresh every few minutes.
      </p>
    </div>
  );
}
