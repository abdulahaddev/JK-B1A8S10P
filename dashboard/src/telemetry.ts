import type { Ctrl, CtrlInfo, Reading } from "./types";

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

/** controller/<ts>: [battery 0.1 V, charge 0.01 A, SOC, controller °C, battery °C, load 0.1 V, 0.01 A, W, solar 0.1 V, 0.01 A, W, status, faults] */
export function toCtrl(ts: number, v: unknown): Ctrl | null {
  const o = v as Record<string, unknown> | unknown[] | null;
  if (!o || typeof o !== "object") return null;
  const at = (i: number) => {
    const x = Array.isArray(o) ? o[i] : o[String(i)];
    return typeof x === "number" ? x : undefined;
  };
  return {
    ts,
    batt_v: (at(0) ?? 0) / 10,
    charge_a: (at(1) ?? 0) / 100,
    soc: at(2) ?? 0,
    ctrl_temp: at(3) ?? 0,
    batt_temp: at(4) ?? 0,
    load_v: (at(5) ?? 0) / 10,
    load_a: (at(6) ?? 0) / 100,
    load_w: at(7) ?? 0,
    pv_v: (at(8) ?? 0) / 10,
    pv_a: (at(9) ?? 0) / 100,
    pv_w: at(10) ?? 0,
    status: at(11),
    faults: at(12) ?? 0,
  };
}

/** A controller node (keyed by unix ts) as readings sorted by time. */
export function ctrlRows(obj: Record<string, unknown> | null): Ctrl[] {
  if (!obj) return [];
  return Object.entries(obj)
    .map(([k, v]) => toCtrl(Number(k), v))
    .filter((x): x is Ctrl => x !== null)
    .sort((a, b) => a.ts - b.ts);
}

/** Model, versions and ratings from controller_info/ident. */
export function ctrlIdent(i: CtrlInfo | null | undefined) {
  const r = i?.ident;
  if (!r || r.length < 16) return null;
  const hex = (x: number) => x.toString(16).padStart(4, "0");
  const dotted = (a: number, b: number) => [a >> 8, a & 255, b >> 8, b & 255].map((x) => String(x).padStart(2, "0")).join(".");
  return {
    model: r.slice(2, 10).map((x) => String.fromCharCode(x >> 8, x & 255)).join("").trim(),
    maxV: r[0] >> 8,
    chargeA: r[0] & 255,
    loadA: r[1] >> 8,
    software: dotted(r[10], r[11]),
    hardware: dotted(r[12], r[13]),
    serial: hex(r[14]) + hex(r[15]),
  };
}

/** A telemetry node (keyed by unix ts) as readings sorted by time. */
export function readings(obj: Record<string, unknown> | null): Reading[] {
  if (!obj) return [];
  return Object.entries(obj)
    .map(([k, v]) => toReading(Number(k), v))
    .sort((a, b) => a.ts - b.ts);
}
