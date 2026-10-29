// Overview infographics: power flow, temperature gauges, usage by hour, month calendar.
import ReactECharts from "echarts-for-react";
import { ArrowDownRight, ArrowUpRight, CalendarRange, Clock3, Pause, Thermometer, Waypoints } from "lucide-react";
import { useMemo } from "react";
import { byDay, hourProfile, integrate, powerW, stats, todayStart } from "../analytics";
import type { Tokens } from "../theme";
import type { Info, Reading } from "../types";
import { CategoryChart, FONT, fade, tooltipBase } from "./Chart";
import { Card } from "./ui";

const fmtH = (h: number) => (!Number.isFinite(h) ? "–" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : h < 24 * 14 ? `${(h / 24).toFixed(1)} days` : "2+ weeks");
const fmtWh = (wh: number) => (Math.abs(wh) >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${wh.toFixed(0)} Wh`);

// Scene layout (viewBox 0 15 900 170): charger, battery and loads on one row, centred at x 150, 450 and 750,
// i.e. 1/6, 1/2 and 5/6 of the width, so the HTML labels in the three-column grid below sit exactly under them.
// The drawing has no text: it scales with the card, the labels must not.
type Wire = [x1: number, y1: number, x2: number, y2: number];
const WIRES: Record<"charger" | "loads", Wire> = {
  charger: [208, 120, 408, 120], // charger → battery
  loads: [492, 120, 702, 120], // battery → loads
};

/**
 * One cable: a dashed stream and glowing dots moving in the flow direction, faster with more power.
 * The dots run on CSS keyframes, not SMIL animateMotion: SMIL elements remounted after the SVG's
 * timeline started could stay frozen in Chrome.
 */
function Cable({ wire, live, watts, kind }: { wire: Wire; live: boolean; watts: number; kind: "charge" | "use" }) {
  const [x1, y1, x2, y2] = wire;
  const d = `M ${x1} ${y1} L ${x2} ${y2}`;
  const dur = Math.max(0.6, Math.min(2.6, 2.6 - Math.log10(Math.max(1, watts)) * 0.75));
  const n = 4;
  return (
    <g className={`cable ${live ? `live ${kind}` : ""}`}>
      <path d={d} className="cable-track" />
      {live && (
        <>
          <path d={d} className="cable-stream" style={{ animationDuration: `${dur / 2}s` }} />
          {Array.from({ length: n }, (_, i) => (
            <circle
              key={i}
              r="5.5"
              className="cable-dot"
              style={
                {
                  "--x0": `${x1}px`,
                  "--y0": `${y1}px`,
                  "--x1": `${x2}px`,
                  "--y1": `${y2}px`,
                  animationDuration: `${dur}s`,
                  animationDelay: `${(-i * dur) / n}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}
    </g>
  );
}

/** Charger → battery → loads, drawn like an inverter app: the live cable streams in the direction the energy moves. */
export function PowerFlow({ r, info, todayRows, bmsOnline }: { r: Reading; info?: Info | null; todayRows: Reading[]; bmsOnline: boolean }) {
  const p = powerW(r);
  const i = r.current ?? 0;
  const charging = p > 2, using = p < -2;
  const w = Math.abs(p);
  const StateIcon = charging ? ArrowUpRight : using ? ArrowDownRight : Pause;
  const storedWh = r.capacity_remaining * r.total_voltage;
  const full = info?.full_charge_capacity;
  const today = integrate(todayRows.filter((x) => x.ts >= todayStart()));
  const soc = Math.max(0, Math.min(100, r.state_of_charge));
  const level = soc < 20 ? "low" : soc < 50 ? "mid" : "high";
  const hours = charging ? (full ? (full - r.capacity_remaining) / i : null) : using ? r.capacity_remaining / -i : null;
  // Battery inside: x 415..485, y 47..169
  const fillH = (122 * soc) / 100;
  const nodes = [
    { label: "Charger", value: charging ? `${w.toFixed(0)} W` : "0 W", sub: `${fmtWh(today.chargeWh)} today`, tone: charging ? "charge" : "" },
    { label: "Battery", value: `${soc}%`, sub: `${fmtWh(storedWh)} stored`, tone: `soc-${level}` },
    { label: "Loads", value: using ? `${w.toFixed(0)} W` : "0 W", sub: `${fmtWh(today.dischargeWh)} today`, tone: using ? "use" : "" },
  ];
  const facts: [string, string][] = [
    ["Voltage", `${r.total_voltage.toFixed(2)} V`],
    ["Current", `${i > 0 ? "+" : ""}${i.toFixed(2)} A`],
    ["Remaining", `${r.capacity_remaining.toFixed(1)}${full ? ` / ${full.toFixed(0)}` : ""} Ah`],
    [charging ? "Full in" : using ? "Empty in" : "Time left", hours !== null && Number.isFinite(hours) ? fmtH(hours) : "–"],
    ["Health", info?.state_of_health !== undefined ? `${info.state_of_health}%` : "–"],
    ["Cycles", info?.charging_cycles !== undefined ? String(info.charging_cycles) : "–"],
  ];
  // Current over the middle of the live cable (HTML, so it keeps its size); idle cables get none
  const amps = `${Math.abs(i).toFixed(1)} A`;
  const wireTags = [
    { key: "charger", wire: WIRES.charger, live: charging, kind: "charge" },
    { key: "loads", wire: WIRES.loads, live: using, kind: "use" },
  ];
  return (
    <Card
      title="Power flow"
      icon={Waypoints}
      subtitle="Live · net of charger and loads"
      className="flow-card"
      actions={
        <span className={`state ${charging ? "state-charging" : using ? "state-discharging" : "state-idle"}`}>
          <StateIcon size={15} aria-hidden /> {charging ? "Charging" : using ? "Discharging" : "Idle"}
        </span>
      }
    >
      <div className="flow-stage">
        <div className="scene-wrap">
        <svg
          className={`scene ${charging ? "is-charging" : ""} ${using ? "is-using" : ""}`}
          viewBox="0 15 900 170"
          role="img"
          aria-label={`${charging ? `Charging the battery at ${w.toFixed(0)} W` : using ? `Battery supplying ${w.toFixed(0)} W to the loads` : "Idle"}, battery ${soc} percent`}
        >
          <defs>
            <clipPath id="batt-in">
              <rect x="415" y="47" width="70" height="122" rx="5" />
            </clipPath>
            <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b6fd1" />
              <stop offset="1" stopColor="#1e3f8a" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* cables first, so the devices sit on top of their ends */}
          <Cable wire={WIRES.charger} live={charging} watts={w} kind="charge" />
          <Cable wire={WIRES.loads} live={using} watts={w} kind="use" />

          {/* charger: sun over a solar panel, centred on x 150 */}
          <g transform="translate(20 24)">
            <g className={`sun ${charging ? "on" : ""}`} transform="translate(130 38)">
              <g className="rays">
                {Array.from({ length: 8 }, (_, k) => (
                  <line key={k} x1="0" y1="-24" x2="0" y2="-17" transform={`rotate(${k * 45})`} />
                ))}
              </g>
              <circle r="12" />
            </g>
            <g className="panel">
              <polygon points="80,68 180,68 196,124 64,124" fill="url(#panel)" />
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={`v${f}`} x1={80 + 100 * f} y1="68" x2={64 + 132 * f} y2="124" />
              ))}
              {[1 / 3, 2 / 3].map((f) => (
                <line key={`h${f}`} x1={80 - 16 * f} y1={68 + 56 * f} x2={180 + 16 * f} y2={68 + 56 * f} />
              ))}
              <polygon points="80,68 180,68 196,124 64,124" className="panel-edge" />
              <line x1="130" y1="124" x2="130" y2="142" className="stand" />
              <line x1="108" y1="142" x2="152" y2="142" className="stand" />
            </g>
          </g>

          {/* battery: an upright cell with a terminal, filled from the bottom and split into five bars;
              centred on x 450; the LED on the terminal is the BMS Bluetooth link */}
          <rect x="433" y="27" width="34" height="14" rx="3" className="batt-cap" />
          <rect x="408" y="40" width="84" height="136" rx="12" className="batt-body" />
          <g clipPath="url(#batt-in)">
            <rect x="415" y={169 - fillH} width="70" height={fillH} className={`liquid liquid-${level}`} />
            {[1, 2, 3, 4].map((k) => (
              <line key={k} x1="415" x2="485" y1={47 + (122 * k) / 5} y2={47 + (122 * k) / 5} className="batt-gap" />
            ))}
          </g>
          {charging && <path d="M 456 82 L 434 114 H 448 L 443 138 L 466 104 H 452 Z" className="bolt" />}
          <circle cx="450" cy="34" r="3.5" className={`hub-led ${bmsOnline ? "on" : ""}`}>
            <title>{bmsOnline ? "BMS connected" : "BMS not connected"}</title>
          </circle>

          {/* loads: a house whose windows light up, centred on x 750 */}
          <g className={`house ${using ? "on" : ""}`} transform="translate(-22 0)">
            <polygon points="712,96 772,46 832,96" className="roof" />
            <rect x="724" y="94" width="96" height="60" className="walls" />
            <rect x="736" y="106" width="20" height="18" rx="2" className="win" />
            <rect x="788" y="106" width="20" height="18" rx="2" className="win" />
            <rect x="763" y="120" width="18" height="34" rx="2" className="door" />
            <rect x="800" y="54" width="11" height="24" className="chimney" />
          </g>
        </svg>
          {wireTags
            .filter((x) => x.live)
            .map(({ key, wire: [x1, y1, x2], kind }) => (
              <span key={key} className={`wire-tag ${kind}`} style={{ left: `${((x1 + x2) / 2 / 900) * 100}%`, top: `${((y1 - 15) / 170) * 100}%` }}>
                {amps}
              </span>
            ))}
        </div>
        <div className="flow-nodes">
          {nodes.map((n) => (
            <div key={n.label} className={`flow-node ${n.tone}`}>
              <span>{n.label}</span>
              <b>{n.value}</b>
              <small>{n.sub}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="flow-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}

const SENSORS = [
  { key: "mosfet_temperature", name: "MOSFET" },
  { key: "temperature_sensor_1", name: "Sensor 1" },
  { key: "temperature_sensor_2", name: "Sensor 2" },
] as const;

/** Dial per temperature sensor: green below 45 °C, amber to 60 °C, red above. */
export function TempGauges({ r, rows, rangeLabel, tokens: t }: { r: Reading; rows: Reading[] | null; rangeLabel: string; tokens: Tokens }) {
  const lo = -10, hi = 80;
  const at = (c: number) => (c - lo) / (hi - lo);
  const option = (v: number | undefined) => ({
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge",
        min: lo,
        max: hi,
        startAngle: 210,
        endAngle: -30,
        radius: "92%",
        center: ["50%", "58%"],
        splitNumber: 3,
        axisLine: { lineStyle: { width: 10, color: [[at(45), t.good], [at(60), t.warning], [1, t.critical]] } },
        progress: { show: false },
        pointer: { length: "58%", width: 4, itemStyle: { color: t.ink2 } },
        anchor: { show: true, size: 8, itemStyle: { color: t.ink2 } },
        axisTick: { show: false },
        splitLine: { length: 10, distance: -10, lineStyle: { color: t.surface, width: 2 } },
        axisLabel: { distance: 14, color: t.muted, fontSize: 10, fontFamily: FONT },
        detail: { valueAnimation: true, offsetCenter: [0, "42%"], fontSize: 18, fontWeight: 700, fontFamily: FONT, color: t.ink, formatter: (x: number) => (v === undefined ? "–" : `${x.toFixed(1)}°`) },
        data: [{ value: v ?? lo }],
        animationDuration: 400,
      },
    ],
  });
  const ranges = SENSORS.map((s) => (rows ? stats(rows, (x) => x[s.key]) : null));
  return (
    <Card title="Temperatures" icon={Thermometer} subtitle="Green to 45 °C, amber to 60 °C">
      <div className="gauges">
        {SENSORS.map((s, i) => (
          <div className="gauge" key={s.key}>
            <ReactECharts option={option(r[s.key])} notMerge style={{ height: 150 }} />
            <span className="gauge-name">{s.name}</span>
            <small>{ranges[i] ? `${rangeLabel}: ${ranges[i]!.min.toFixed(0)}–${ranges[i]!.max.toFixed(0)} °C` : ""}</small>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Average charging and load power per hour of the day over this month's readings. */
export function UsageByHour({ rows, tokens: t }: { rows: Reading[] | null; tokens: Tokens }) {
  const d = useMemo(() => {
    const all = rows ?? [];
    const charge = hourProfile(all, (r) => Math.max(0, powerW(r)));
    const load = hourProfile(all, (r) => Math.max(0, -powerW(r)));
    const peak = load.reduce<number>((b, v, h) => ((v ?? -1) > (load[b] ?? -1) ? h : b), 0);
    return {
      cats: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`),
      peak: load[peak] ? `Busiest hour ${String(peak).padStart(2, "0")}:00 · ${load[peak]!.toFixed(0)} W on average` : "No load this month yet",
      series: [
        { name: "Charging", color: t.series[2], data: charge.map((v) => (v === null ? null : +v.toFixed(1))) },
        { name: "Load", color: t.series[1], data: load.map((v) => (v === null ? null : +v.toFixed(1))) },
      ],
    };
  }, [rows, t]);
  return <CategoryChart title="Power by hour of day" icon={Clock3} subtitle={`This month · ${d.peak}`} categories={d.cats} series={d.series} unit="W" decimals={0} tokens={t} height={260} />;
}

const isoDay = (s: number) => {
  const x = new Date(s * 1000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

/** This month as a calendar, each day shaded by the energy used. */
export function MonthCalendar({ rows, tokens: t }: { rows: Reading[] | null; tokens: Tokens }) {
  const option = useMemo(() => {
    const now = new Date();
    const days = byDay(rows ?? []);
    const byIso = new Map(days.map((x) => [isoDay(x.day), x]));
    const max = Math.max(100, ...days.map((x) => x.dischargeWh));
    const first = isoDay(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const last = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() / 1000);
    return {
      backgroundColor: "transparent",
      tooltip: {
        ...tooltipBase(t),
        trigger: "item",
        formatter: (x: { value: [string, number] }) => {
          const d = byIso.get(x.value[0]);
          const head = `<div style="color:${t.muted};font-size:11px">${new Date(x.value[0] + "T12:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</div>`;
          return d
            ? `${head}<b>${fmtWh(d.dischargeWh)}</b> used · <b>${fmtWh(d.chargeWh)}</b> charged<br/>SOC ${d.socMin.toFixed(0)}–${d.socMax.toFixed(0)} %`
            : `${head}No readings`;
        },
      },
      visualMap: { show: false, min: 0, max, inRange: { color: [fade(t.series[1], 0.08), fade(t.series[1], 0.95)] } },
      calendar: {
        range: [first, last],
        orient: "vertical",
        top: 28,
        left: 8,
        right: 8,
        bottom: 4,
        cellSize: ["auto", "auto"],
        splitLine: { show: false },
        itemStyle: { color: t.grid, borderColor: t.surface, borderWidth: 4, borderRadius: 6 },
        dayLabel: { firstDay: 1, nameMap: "en", color: t.muted, fontSize: 11, fontFamily: FONT },
        monthLabel: { show: false },
        yearLabel: { show: false },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: days.map((x) => [isoDay(x.day), +x.dischargeWh.toFixed(0)]),
          label: { show: true, color: t.ink, fontSize: 11, fontFamily: FONT, formatter: (x: { value: [string, number] }) => `${+x.value[0].slice(8)}\n{s|${fmtWh(x.value[1])}}`, rich: { s: { fontSize: 9, color: t.ink2 } } },
          itemStyle: { borderColor: t.surface, borderWidth: 4, borderRadius: 6 },
        },
      ],
    };
  }, [rows, t]);
  const month = new Date().toLocaleDateString(undefined, { month: "long" });
  return (
    <Card title="Month at a glance" icon={CalendarRange} subtitle={`${month} · darker = more energy used`}>
      <ReactECharts option={option} notMerge style={{ height: 300 }} />
    </Card>
  );
}

