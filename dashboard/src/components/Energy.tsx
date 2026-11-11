import { BatteryMedium, Clock, Plug, Sun, House, Sigma, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { byDay, ctrlByDay, hourProfile, todayStart } from "../analytics";
import type { Tokens } from "../theme";
import type { Ctrl, Reading } from "../types";
import { CategoryChart, RangeChart } from "./Chart";

function Total({ icon: Icon, label, value, unit, note, color }: { icon: LucideIcon; label: string; value: string; unit: string; note: string; color: string }) {
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
      <div className="kpi-note">{note}</div>
    </div>
  );
}

/** The last 7 full days + today: solar and load per day from the controller, SOC from the BMS, hour-of-day profiles. */
export function Energy({ rows, ctrlRows, loading, tokens: t }: { rows: Reading[] | null; ctrlRows: Ctrl[] | null; loading: boolean; tokens: Tokens }) {
  const d = useMemo(() => {
    const all = rows ?? [];
    const ctl = ctrlRows ?? [];
    const t0 = todayStart();
    const span = (n: number) => Array.from({ length: n }, (_, k) => t0 - (n - 1 - k) * 86400);
    const dayList = span(8);
    const cats = dayList.map((x) => new Date(x * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));
    const cd = new Map(ctrlByDay(ctl).map((x) => [x.day, x]));
    const bd = new Map(byDay(all).map((x) => [x.day, x]));
    const cDays = dayList.map((x) => cd.get(x));
    const bDays = dayList.map((x) => bd.get(x));
    const part = <T extends { ts: number }>(a: T[]) => ({
      today: a.filter((r) => r.ts >= t0),
      yesterday: a.filter((r) => r.ts >= t0 - 86400 && r.ts < t0),
      past: a.filter((r) => r.ts < t0),
    });
    const b = part(all), c = part(ctl);
    const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
    const soc = (r: Reading) => r.state_of_charge;
    const load = (r: Ctrl) => r.load_w;
    const solar = (r: Ctrl) => r.pv_w;
    const have = cDays.filter((x) => x !== undefined) as NonNullable<(typeof cDays)[number]>[];
    const full = have.filter((x) => x.day < t0);
    const profile = <T extends { ts: number }>(p: { today: T[]; yesterday: T[]; past: T[] }, pick: (r: T) => number) => [
      { name: "Today", color: t.series[0], data: hourProfile(p.today, pick) },
      { name: "Yesterday", color: t.series[1], data: hourProfile(p.yesterday, pick) },
      { name: "7-day average", color: t.muted, data: hourProfile(p.past, pick), dashed: true },
    ];
    return {
      cats,
      solar: have.reduce((a, x) => a + x.solarWh, 0),
      used: have.reduce((a, x) => a + x.loadWh, 0),
      avgUsed: full.length ? full.reduce((a, x) => a + x.loadWh, 0) / full.length : null,
      days: have.length,
      energy: [
        { name: "Solar generated", color: t.series[2], data: cDays.map((x) => (x ? +x.solarWh.toFixed(0) : null)) },
        { name: "Load used", color: t.series[1], data: cDays.map((x) => (x ? +x.loadWh.toFixed(0) : null)) },
      ],
      socLow: bDays.map((x) => x?.socMin ?? null),
      socHigh: bDays.map((x) => x?.socMax ?? null),
      hours,
      socProfile: profile(b, soc),
      loadProfile: profile(c, load),
      solarProfile: profile(c, solar),
    };
  }, [rows, ctrlRows, t]);

  const net = d.solar - d.used;
  return (
    <div className={`page ${loading && !rows ? "stale" : ""}`}>
      <div className="kpis kpis-4">
        <Total icon={Sun} label="Solar generated" value={d.solar.toFixed(0)} unit="Wh" note={`Over ${d.days} days`} color={t.series[2]} />
        <Total icon={House} label="Load used" value={d.used.toFixed(0)} unit="Wh" note={`Over ${d.days} days`} color={t.series[1]} />
        <Total icon={Sigma} label="Average use per day" value={d.avgUsed === null ? "–" : d.avgUsed.toFixed(0)} unit="Wh" note="Full days only" color={t.series[0]} />
        <Total icon={Scale} label="Solar minus load" value={`${net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(0)}`} unit="Wh" note={net >= 0 ? "Solar covered the load" : "Load needed the battery"} color={t.series[6]} />
      </div>
      <div className="grid-2">
        <CategoryChart title="Energy per day" icon={Sun} subtitle="Solar and load from the controller" categories={d.cats} series={d.energy} unit="Wh" decimals={0} tokens={t} />
        <RangeChart title="Daily SOC range" icon={BatteryMedium} subtitle="Lowest to highest charge each day, from the BMS" categories={d.cats} low={d.socLow} high={d.socHigh} unit="%" color={t.series[0]} tokens={t} yMin={0} yMax={100} />
        <CategoryChart title="SOC by hour of day" icon={Clock} subtitle="Today and yesterday against the 7-day average" categories={d.hours} series={d.socProfile} unit="%" decimals={0} tokens={t} kind="line" />
        <CategoryChart title="Load by hour of day" icon={Plug} subtitle="Average load power, from the controller" categories={d.hours} series={d.loadProfile} unit="W" decimals={0} tokens={t} kind="line" />
        <CategoryChart title="Solar by hour of day" icon={Sun} subtitle="Average solar power, from the controller" categories={d.hours} series={d.solarProfile} unit="W" decimals={0} tokens={t} kind="line" />
      </div>
    </div>
  );
}
