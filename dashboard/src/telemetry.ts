import type { Reading } from "./types";

/**
 * telemetry/<ts> as the board writes it since 1.2.42: integers as stored on the board, null = no value
 *   [mV, 10 mA, cell 1..4 mV, 10 mAh, SOC %, balancing mA, MOSFET, sensor 1, sensor 2 in 0.1 °C, flags]
 * flags: 1 charging, 2 discharging, 4 balancing. Firebase drops nulls, so an array can come back with holes,
 * or as an object with "0".."12" keys. Objects with named fields (before the migration) pass through.
 */
export function toReading(ts: number, v: unknown): Reading {
  let a: unknown[] | null = Array.isArray(v) ? v : null;
  if (!a && v && typeof v === "object" && Object.keys(v).every((k) => /^\d+$/.test(k))) {
    const o = v as Record<string, unknown>;
    a = Array.from({ length: 13 }, (_, i) => o[String(i)]);
  }
  if (!a) return { ...(v as object), ts } as Reading;
  const arr = a;
  const n = (i: number, scale: number) => (typeof arr[i] === "number" ? (arr[i] as number) / scale : undefined);
  const flags = typeof arr[12] === "number" ? (arr[12] as number) : 0;
  return {
    ts,
    total_voltage: n(0, 1000) ?? 0,
    current: n(1, 100),
    cell_voltage_1: n(2, 1000) ?? 0,
    cell_voltage_2: n(3, 1000) ?? 0,
    cell_voltage_3: n(4, 1000) ?? 0,
    cell_voltage_4: n(5, 1000) ?? 0,
    capacity_remaining: n(6, 100) ?? 0,
    state_of_charge: n(7, 1) ?? 0,
    balancing_current: n(8, 1000),
    mosfet_temperature: n(9, 10),
    temperature_sensor_1: n(10, 10),
    temperature_sensor_2: n(11, 10),
    charging: flags & 1 ? 1 : 0,
    discharging: flags & 2 ? 1 : 0,
    balancing: flags & 4 ? 1 : 0,
  };
}

/** A telemetry node (keyed by unix ts) as readings sorted by time. */
export function readings(obj: Record<string, unknown> | null): Reading[] {
  if (!obj) return [];
  return Object.entries(obj)
    .map(([k, v]) => toReading(Number(k), v))
    .sort((a, b) => a.ts - b.ts);
}
