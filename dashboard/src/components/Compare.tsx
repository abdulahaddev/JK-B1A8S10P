import { Scale } from "lucide-react";
import { useState } from "react";
import { integrate, spreadMv, stats } from "../analytics";
import { useShifted } from "../data";
import type { Reading } from "../types";
import { Card, COMPARES, Delta, Segmented, type CompareId } from "./ui";

interface Row {
  label: string;
  unit: string;
  dec: number;
  now: number | null;
  prev: number | null;
  /** Which direction is "better" for the change cue; undefined = neutral (no good/bad reading). */
  better?: "up" | "down";
}

const OPTIONS = COMPARES.filter((c) => c.id !== "none").map((c) => ({ id: c.id, label: c.label }));

/** This period vs a period the viewer picks here, metric by metric. */
export function PeriodComparison({ cur, from, to, rangeLabel }: { cur: Reading[] | null; from: number; to: number; rangeLabel: string }) {
  const [compareId, setCompareId] = useState<CompareId>("prev");
  const compare = COMPARES.find((c) => c.id === compareId)!;
  const prev = useShifted(from, to, compare.shift(to - from));
  const c = cur ?? [], p = prev.rows;
  const sc = stats(c, (r) => r.state_of_charge), sp = p ? stats(p, (r) => r.state_of_charge) : null;
  const vc = stats(c, (r) => r.total_voltage), vp = p ? stats(p, (r) => r.total_voltage) : null;
  const dc = stats(c, spreadMv), dp = p ? stats(p, spreadMv) : null;
  const tc = stats(c, (r) => r.mosfet_temperature), tp = p ? stats(p, (r) => r.mosfet_temperature) : null;
  const fc = integrate(c), fp = p ? integrate(p) : null;
  const rows: Row[] = [
    { label: "Average SOC", unit: "%", dec: 1, now: sc?.avg ?? null, prev: sp?.avg ?? null },
    { label: "Lowest SOC", unit: "%", dec: 0, now: sc?.min ?? null, prev: sp?.min ?? null, better: "up" },
    { label: "Average voltage", unit: "V", dec: 2, now: vc?.avg ?? null, prev: vp?.avg ?? null },
    { label: "Energy charged", unit: "Wh", dec: 0, now: fc.chargeWh, prev: fp?.chargeWh ?? null },
    { label: "Energy used", unit: "Wh", dec: 0, now: fc.dischargeWh, prev: fp?.dischargeWh ?? null },
    { label: "Worst cell spread", unit: "mV", dec: 0, now: dc?.max ?? null, prev: dp?.max ?? null, better: "down" },
    { label: "Peak MOSFET temp", unit: "°C", dec: 1, now: tc?.max ?? null, prev: tp?.max ?? null, better: "down" },
  ];
  return (
    <Card
      title="Period comparison"
      icon={Scale}
      subtitle={`${rangeLabel} against ${compare.label.toLowerCase()}`}
      className="span-2"
      actions={<Segmented options={OPTIONS} value={compareId} onChange={setCompareId} label="Compare with" size="small" />}
    >
      <div className={`table-wrap ${prev.loading ? "stale" : ""}`}>
        <table className="compare">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">{rangeLabel}</th>
              <th className="num">{compare.label}</th>
              <th className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num strong">{r.now === null ? "–" : `${r.now.toFixed(r.dec)} ${r.unit}`}</td>
                <td className="num muted">{r.prev === null ? (prev.loading ? "…" : "no data") : `${r.prev.toFixed(r.dec)} ${r.unit}`}</td>
                <td className="num">
                  <Delta now={r.now} prev={r.prev} dec={r.dec} unit={r.unit} better={r.better} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
