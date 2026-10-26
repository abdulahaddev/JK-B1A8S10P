// Remote-control console: what was sent and what the board reported back. Lives for the browser session.
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Control, Device } from "./types";

export type Level = "info" | "ok" | "warn" | "error";
export interface LogLine {
  id: number;
  at: number; // ms
  level: Level;
  text: string;
}

let lines: LogLine[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function log(level: Level, text: string) {
  lines = [...lines.slice(-299), { id: nextId++, at: Date.now(), level, text }];
  emit();
}

export function clearLog() {
  lines = [];
  emit();
}

export function useLog(): LogLine[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lines,
  );
}

const otaLevel = (s: string): Level =>
  /fail|error|rolled back|refus|not usable|no response|expired|stopped|cancelled/i.test(s) ? "error" : /confirmed|updated|running|: ok$/i.test(s) ? "ok" : "info";

// When this browser sent each command, to report how long the board took to act on it
export type Command = "ota" | "restart" | "ota_check";
const sentAt: Partial<Record<Command, number>> = {};
export const markSent = (c: Command) => (sentAt[c] = Date.now());
export const sentTime = (c: Command) => sentAt[c];
const LABEL: Record<Command, string> = { ota: "Update", restart: "Restart", ota_check: "Download check" };

function cleared(c: Command) {
  const at = sentAt[c];
  delete sentAt[c];
  log("ok", `${LABEL[c]} request removed from control${at ? ` (${Math.round((Date.now() - at) / 1000)} s after sending)` : ""}`);
}

/** Logs changes in the device and control nodes from the moment the app opens. */
export function useControlWatcher(d: Device | null | undefined, c: Control | null | undefined) {
  const prevD = useRef<Device | null>(null);
  const prevC = useRef<Control | null | undefined>(undefined);

  useEffect(() => {
    if (!d) return;
    const p = prevD.current;
    prevD.current = d;
    if (!p) {
      log("info", `Board on fw ${d.firmware_version ?? "?"}, BMS ${d.ble_connected === 1 ? "connected" : "not connected"}${d.ota_status ? `, update status "${d.ota_status}"` : ""}`);
      return;
    }
    if (d.firmware_version !== p.firmware_version) log("ok", `Firmware changed ${p.firmware_version ?? "?"} → ${d.firmware_version ?? "?"}`);
    if (d.ota_status !== p.ota_status && d.ota_status) log(otaLevel(d.ota_status), `Update status: ${d.ota_status}`);
    if (d.uptime_s !== undefined && p.uptime_s !== undefined && d.uptime_s < p.uptime_s)
      log("warn", `Board restarted (${d.reset_reason ?? "unknown reason"}${d.restart_cause && d.restart_cause !== "none" ? `, ${d.restart_cause}` : ""})`);
    if (d.ble_connected !== p.ble_connected) log(d.ble_connected === 1 ? "ok" : "warn", `BMS Bluetooth ${d.ble_connected === 1 ? "connected" : "disconnected"}`);
    if (d.ota_check && (d.ota_check !== p.ota_check || d.ota_check_ts !== p.ota_check_ts)) log(otaLevel(d.ota_check), `Download check ${d.ota_check}`);
    if (d.control_s !== undefined && d.control_s !== p.control_s) log("info", `Board reads control every ${d.control_s} s`);
    if (d.last_seen !== p.last_seen)
      log("info", `Board report received · WiFi ${d.wifi_rssi ?? "–"} dBm · ${d.buffered ?? 0} queued`);
  }, [d]);

  useEffect(() => {
    if (c === undefined) return;
    const p = prevC.current;
    prevC.current = c;
    if (p === undefined) {
      if (c?.ota) log("warn", `Pending: control/ota = "${c.ota}"`);
      if (c?.restart) log("warn", "Pending: restart request");
      if (c?.ota_check) log("warn", `Pending: download check of ${c.ota_check}`);
      if (c?.check_s) log("info", `Control read interval set to ${c.check_s} s`);
      return;
    }
    if (c?.ota !== p?.ota) c?.ota ? log("info", `control/ota = "${c.ota}" from ${c.ota_host ?? "(no host)"}`) : cleared("ota");
    if (c?.restart !== p?.restart) c?.restart ? log("info", "control/restart set") : cleared("restart");
    if (c?.ota_check !== p?.ota_check) c?.ota_check ? log("info", `control/ota_check = "${c.ota_check}"`) : cleared("ota_check");
    if (c?.check_s !== p?.check_s) log("info", c?.check_s ? `Control read interval set to ${c.check_s} s` : "Control read interval back to the default (300 s)");
  }, [c]);
}
