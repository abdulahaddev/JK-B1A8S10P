import { integrate, pctChange, spreadMv, stats } from "../analytics";
import type { Reading } from "../types";

interface Row {
  label: string;
  unit: string;
  dec: number;
  now: number | null;
  prev: number | null;
  /** Which direction is "better" for the change cue; undefined = neutral (no good/bad reading). */
  better?: "up" | "down";
}

/** This period vs the comparison period, metric by metric. */
export function PeriodComparison({ cur, prev, curLabel, prevLabel }: { cur: Reading[]; prev: Reading[] | null; curLabel: string; prevLabel: string }) {
  const sc = stats(cur, (r) => r.state_of_charge), sp = prev ? stats(prev, (r) => r.state_of_charge) : null;
  const vc = stats(cur, (r) => r.total_voltage), vp = prev ? stats(prev, (r) => r.total_voltage) : null;
  const dc = stats(cur, spreadMv), dp = prev ? stats(prev, spreadMv) : null;
  const tc = stats(cur, (r) => r.mosfet_temperature), tp = prev ? stats(prev, (r) => r.mosfet_temperature) : null;
  const fc = integrate(cur), fp = prev ? integrate(prev) : null;
  const rows: Row[] = [
    { label: "Average SOC", unit: "%", dec: 1, now: sc?.avg ?? null, prev: sp?.avg ?? null },
    { label: "Lowest SOC", unit: "%", dec: 0, now: sc?.min ?? null, prev: sp?.min ?? null, better: "up" },
    { label: "Average voltage", unit: "V", dec: 2, now: vc?.avg ?? null, prev: vp?.avg ?? null },
    { label: "Energy in (charge)", unit: "Wh", dec: 0, now: fc.chargeWh, prev: fp?.chargeWh ?? null },
    { label: "Energy out (load)", unit: "Wh", dec: 0, now: fc.dischargeWh, prev: fp?.dischargeWh ?? null },
    { label: "Max cell spread", unit: "mV", dec: 0, now: dc?.max ?? null, prev: dp?.max ?? null, better: "down" },
    { label: "Max MOSFET temp", unit: "°C", dec: 1, now: tc?.max ?? null, prev: tp?.max ?? null, better: "down" },
  ];
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>Period comparison</h3>
          <p className="sub">
            {curLabel} vs {prevLabel}
          </p>
        </div>
      </header>
      {!prev ? (
        <p className="sub">Pick a comparison above to see the change per metric.</p>
      ) : (
        <table className="compare">
          <thead>
            <tr>
              <th></th>
              <th>{curLabel}</th>
              <th>{prevLabel}</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ch = r.now !== null && r.prev !== null ? pctChange(r.prev, r.now) : null;
              const dir = ch === null || Math.abs(ch) < 0.5 ? 0 : ch > 0 ? 1 : -1;
              const cue = !r.better || dir === 0 ? "neutral" : (dir > 0) === (r.better === "up") ? "good" : "bad";
              return (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{r.now === null ? "–" : `${r.now.toFixed(r.dec)} ${r.unit}`}</td>
                  <td className="num muted">{r.prev === null ? "–" : `${r.prev.toFixed(r.dec)} ${r.unit}`}</td>
                  <td className={`num delta delta-${cue}`}>
                    {ch === null ? "–" : `${dir > 0 ? "▲" : dir < 0 ? "▼" : "■"} ${Math.abs(ch).toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
