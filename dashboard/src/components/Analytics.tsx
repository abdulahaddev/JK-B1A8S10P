import { Activity, BatteryCharging, BatteryMedium, Grid2x2, Plug, Thermometer, Zap } from "lucide-react";
import { useMemo } from "react";
import { cells, powerW, spreadMv } from "../analytics";
import type { Tokens } from "../theme";
import type { Reading } from "../types";
import { TimeChart, type Metric } from "./Chart";
import { PeriodComparison } from "./Compare";

/** History over the selected range; every chart picks its own comparison. */
export function Analytics({
  rows,
  loading,
  from,
  to,
  rangeLabel,
  tokens: t,
}: {
  rows: Reading[] | null;
  loading: boolean;
  from: number;
  to: number;
  rangeLabel: string;
  tokens: Tokens;
}) {
  const m = useMemo(() => {
    const one = (name: string, pick: Metric["pick"]): Metric[] => [{ name, color: t.series[0], pick }];
    return {
      soc: one("SOC", (r) => r.state_of_charge),
      voltage: one("Voltage", (r) => r.total_voltage),
      current: one("Current", (r) => r.current),
      power: one("Power", powerW),
      spread: one("Spread", spreadMv),
      cells: [0, 1, 2, 3].map((i) => ({ name: `Cell ${i + 1}`, color: t.series[i], pick: (r: Reading) => cells(r)[i] })),
      temps: [
        { name: "MOSFET", color: t.series[0], pick: (r: Reading) => r.mosfet_temperature },
        { name: "Sensor 1", color: t.series[1], pick: (r: Reading) => r.temperature_sensor_1 },
        { name: "Sensor 2", color: t.series[2], pick: (r: Reading) => r.temperature_sensor_2 },
      ],
    };
  }, [t]);

  const common = { rows, loading, from, to, tokens: t };
  return (
    <div className="page">
      <div className="grid-2">
        <TimeChart {...common} title="State of charge" icon={BatteryMedium} unit="%" decimals={0} metrics={m.soc} comparable better="up" yMin={0} yMax={100} />
        <TimeChart {...common} title="Pack voltage" icon={BatteryCharging} unit="V" metrics={m.voltage} comparable />
        <TimeChart {...common} title="Current" icon={Zap} subtitle="+ charging · − discharging" unit="A" metrics={m.current} comparable zeroLine />
        <TimeChart {...common} title="Power" icon={Plug} subtitle="+ charging · − load" unit="W" decimals={0} metrics={m.power} comparable zeroLine />
        <TimeChart {...common} title="Cell voltages" icon={Grid2x2} subtitle="All four cells on one scale" unit="V" decimals={3} metrics={m.cells} />
        <TimeChart {...common} title="Cell spread" icon={Activity} subtitle="Highest minus lowest cell" unit="mV" decimals={0} metrics={m.spread} comparable better="down" yMin={0} />
        <TimeChart {...common} title="Temperatures" icon={Thermometer} unit="°C" decimals={1} metrics={m.temps} className="span-2" />
        <PeriodComparison cur={rows} from={from} to={to} rangeLabel={rangeLabel} />
      </div>
    </div>
  );
}
