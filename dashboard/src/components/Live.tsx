import type { Device, Info, Reading } from "../types";
import { CELLS, cellKey } from "../types";
import { cells, powerW, spreadMv } from "../analytics";
import type { Tokens } from "../theme";

export type Health = "online" | "delayed" | "offline" | "unknown";

export function linkHealth(d: Device | null | undefined, nowS: number): Health {
  if (!d?.last_seen) return "unknown";
  const age = nowS - d.last_seen;
  return age < 120 ? "online" : age < 900 ? "delayed" : "offline";
}

export const ago = (s: number) =>
  s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 86400)} d`;

const HEALTH_LABEL: Record<Health, string> = {
  online: "Online",
  delayed: "Delayed",
  offline: "Offline",
  unknown: "No data",
};

/** Status indicator: icon + label, never color alone. */
export function StatusPill({ kind, children }: { kind: "good" | "warning" | "serious" | "critical" | "muted"; children: React.ReactNode }) {
  const icon = { good: "●", warning: "▲", serious: "▲", critical: "■", muted: "○" }[kind];
  return (
    <span className={`pill pill-${kind}`}>
      <span aria-hidden>{icon}</span> {children}
    </span>
  );
}

export function StatusStrip({ device, nowS, latest }: { device: Device | null | undefined; nowS: number; latest?: Reading }) {
  const h = linkHealth(device, nowS);
  const kind = h === "online" ? "good" : h === "delayed" ? "warning" : h === "offline" ? "critical" : "muted";
  const ble = device?.ble_connected === 1;
  const queued = device?.buffered ?? 0;
  return (
    <div className="strip">
      <StatusPill kind={kind}>
        Board {HEALTH_LABEL[h]}
        {device?.last_seen ? ` · ${ago(nowS - device.last_seen)} ago` : ""}
      </StatusPill>
      <StatusPill kind={ble ? "good" : "critical"}>BMS {ble ? "connected" : "not connected"}</StatusPill>
      {queued > 2 && <StatusPill kind="warning">{queued} readings queued</StatusPill>}
      <span className="strip-meta">
        fw {device?.firmware_version ?? "–"}
        {latest && ` · last reading ${ago(nowS - latest.ts)} ago`}
      </span>
    </div>
  );
}

function Tile({ label, value, unit, note, children }: { label: string; value: string; unit?: string; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {value}
        {unit && <span className="tile-unit">{unit}</span>}
      </div>
      {children}
      {note && <div className="tile-note">{note}</div>}
    </div>
  );
}

export function Kpis({ r, info, tokens }: { r?: Reading; info?: Info | null; tokens: Tokens }) {
  if (!r) return <div className="kpis"><div className="tile empty">Waiting for the first reading…</div></div>;
  const i = r.current ?? 0;
  const state = i > 0.15 ? "Charging" : i < -0.15 ? "Discharging" : "Idle";
  const full = info?.full_charge_capacity;
  const hours = Math.abs(i) > 0.15 ? (i > 0 && full ? (full - r.capacity_remaining) / i : r.capacity_remaining / -i) : null;
  const spread = spreadMv(r);
  const temps = [r.mosfet_temperature, r.temperature_sensor_1, r.temperature_sensor_2].filter((x): x is number => x !== undefined);
  return (
    <div className="kpis">
      <Tile label="State of charge" value={`${r.state_of_charge}`} unit="%" note={full ? `${r.capacity_remaining.toFixed(1)} of ${full.toFixed(0)} Ah` : `${r.capacity_remaining.toFixed(1)} Ah left`}>
        <div className="soc-bar" role="img" aria-label={`${r.state_of_charge} percent`}>
          <div style={{ width: `${r.state_of_charge}%`, background: tokens.series[0] }} />
        </div>
      </Tile>
      <Tile label="Pack voltage" value={r.total_voltage.toFixed(2)} unit="V" note={`${(r.total_voltage / 4).toFixed(3)} V per cell avg`} />
      <Tile
        label="Current"
        value={`${i > 0 ? "+" : ""}${i.toFixed(2)}`}
        unit="A"
        note={<StatusPill kind={state === "Idle" ? "muted" : "good"}>{state}</StatusPill>}
      />
      <Tile label="Power" value={`${Math.abs(powerW(r)).toFixed(0)}`} unit="W" note={hours !== null ? `${i > 0 ? "Full" : "Empty"} in ~${hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`}` : "No load"} />
      <Tile
        label="Cell spread"
        value={spread.toFixed(0)}
        unit="mV"
        note={<StatusPill kind={spread < 30 ? "good" : spread < 80 ? "warning" : "serious"}>{spread < 30 ? "Balanced" : spread < 80 ? "Drifting" : "Unbalanced"}</StatusPill>}
      />
      <Tile label="Temperature" value={temps.length ? Math.max(...temps).toFixed(1) : "–"} unit="°C" note={`MOSFET ${r.mosfet_temperature?.toFixed(1) ?? "–"} · T1 ${r.temperature_sensor_1?.toFixed(1) ?? "–"} · T2 ${r.temperature_sensor_2?.toFixed(1) ?? "–"}`} />
    </div>
  );
}

/** Four cells against a fixed LiFePO4 working scale; highest and lowest are labeled. */
export function CellsCard({ r, info, tokens }: { r?: Reading; info?: Info | null; tokens: Tokens }) {
  if (!r) return null;
  const v = cells(r);
  const lo = 3.0, hi = 3.65;
  const maxV = Math.max(...v), minV = Math.min(...v);
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>Cells</h3>
          <p className="sub">
            Spread {((maxV - minV) * 1000).toFixed(0)} mV · balancing {r.balancing ? "on" : "off"}
            {r.balancing_current ? ` (${(r.balancing_current * 1000).toFixed(0)} mA)` : ""}
          </p>
        </div>
      </header>
      <div className="cells">
        {CELLS.map((c, idx) => {
          const val = r[cellKey(c)];
          const pct = Math.min(100, Math.max(0, ((val - lo) / (hi - lo)) * 100));
          const tag = val === maxV ? "highest" : val === minV ? "lowest" : "";
          const res = info?.[`cell_resistance_${c}` as keyof Info] as number | undefined;
          return (
            <div className="cell" key={c}>
              <div className="cell-name">Cell {c}</div>
              <div className="cell-track">
                <div className="cell-fill" style={{ width: `${pct}%`, background: tokens.series[idx] }} />
              </div>
              <div className="cell-val">
                <b>{val.toFixed(3)} V</b>
                {tag && <span className="cell-tag">{tag}</span>}
                {res !== undefined && <span className="cell-res">{(res * 1000).toFixed(1)} mΩ</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="sub scale">Scale {lo.toFixed(2)}–{hi.toFixed(2)} V (LiFePO4 working range)</p>
    </section>
  );
}
