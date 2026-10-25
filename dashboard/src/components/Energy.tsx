import { BatteryMedium, BatteryCharging, Clock, Plug, ArrowDownToLine, ArrowUpFromLine, Sigma, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { byDay, hourProfile, powerW, todayStart } from "../analytics";
import type { Tokens } from "../theme";
import type { Reading } from "../types";
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

/** The last 7 full days + today: energy per day, SOC range per day, hour-of-day profiles. */
export function Energy({ rows, loading, tokens: t }: { rows: Reading[] | null; loading: boolean; tokens: Tokens }) {
  const d = useMemo(() => {
    const all = rows ?? [];
    const days = byDay(all);
    const cats = days.map((x) => new Date(x.day * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));
    const t0 = todayStart();
    const today = all.filter((r) => r.ts >= t0);
    const yesterday = all.filter((r) => r.ts >= t0 - 86400 && r.ts < t0);
    const past = all.filter((r) => r.ts < t0);
    const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
    const soc = (r: Reading) => r.state_of_charge;
    const load = (r: Reading) => -Math.min(0, powerW(r));
    const full = days.filter((x) => x.day < t0);
    const sum = (k: "chargeWh" | "dischargeWh") => days.reduce((a, x) => a + x[k], 0);
    return {
      cats,
      charged: sum("chargeWh"),
      used: sum("dischargeWh"),
      avgUsed: full.length ? full.reduce((a, x) => a + x.dischargeWh, 0) / full.length : null,
      days: days.length,
      energy: [
        { name: "Charged", color: t.series[2], data: days.map((x) => x.chargeWh) },
        { name: "Used", color: t.series[1], data: days.map((x) => x.dischargeWh) },
      ],
      socLow: days.map((x) => x.socMin),
      socHigh: days.map((x) => x.socMax),
      hours,
      socProfile: [
        { name: "Today", color: t.series[0], data: hourProfile(today, soc) },
        { name: "Yesterday", color: t.series[1], data: hourProfile(yesterday, soc) },
        { name: "7-day average", color: t.muted, data: hourProfile(past, soc), dashed: true },
      ],
      loadProfile: [
        { name: "Today", color: t.series[0], data: hourProfile(today, load) },
        { name: "Yesterday", color: t.series[1], data: hourProfile(yesterday, load) },
        { name: "7-day average", color: t.muted, data: hourProfile(past, load), dashed: true },
      ],
    };
  }, [rows, t]);

  const net = d.charged - d.used;
  return (
    <div className={`page ${loading && !rows ? "stale" : ""}`}>
      <div className="kpis kpis-4">
        <Total icon={ArrowDownToLine} label="Charged" value={d.charged.toFixed(0)} unit="Wh" note={`Over ${d.days} days`} color={t.series[2]} />
        <Total icon={ArrowUpFromLine} label="Used" value={d.used.toFixed(0)} unit="Wh" note={`Over ${d.days} days`} color={t.series[1]} />
        <Total icon={Sigma} label="Average use per day" value={d.avgUsed === null ? "–" : d.avgUsed.toFixed(0)} unit="Wh" note="Full days only" color={t.series[0]} />
        <Total icon={Scale} label="Net" value={`${net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(0)}`} unit="Wh" note={net >= 0 ? "More in than out" : "More out than in"} color={t.series[6]} />
      </div>
      <div className="grid-2">
        <CategoryChart title="Energy per day" icon={BatteryCharging} subtitle="Integrated from current" categories={d.cats} series={d.energy} unit="Wh" decimals={0} tokens={t} />
        <RangeChart title="Daily SOC range" icon={BatteryMedium} subtitle="Lowest to highest charge each day" categories={d.cats} low={d.socLow} high={d.socHigh} unit="%" color={t.series[0]} tokens={t} yMin={0} yMax={100} />
        <CategoryChart title="SOC by hour of day" icon={Clock} subtitle="Today and yesterday against the 7-day average" categories={d.hours} series={d.socProfile} unit="%" decimals={0} tokens={t} kind="line" />
        <CategoryChart title="Load by hour of day" icon={Plug} subtitle="Average discharge power" categories={d.hours} series={d.loadProfile} unit="W" decimals={0} tokens={t} kind="line" />
      </div>
    </div>
  );
}
