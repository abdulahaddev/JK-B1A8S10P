import { useState } from "react";
import { clearOta, clearRestart, requestRestart, setOta, useBoots, useControl, useCrashes } from "../data";
import type { Device } from "../types";
import { ago, StatusPill } from "./Live";

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const rssiKind = (v?: number) => (v === undefined || v === 0 ? "muted" : v > -67 ? "good" : v > -80 ? "warning" : "serious");

export function DeviceHealth({ d, nowS }: { d: Device | null | undefined; nowS: number }) {
  const boots = useBoots();
  const crashes = useCrashes();
  if (!d) return null;
  const items: [string, React.ReactNode][] = [
    ["Firmware", d.firmware_version ?? "–"],
    ["Update status", d.ota_status ?? "–"],
    ["Uptime", d.uptime_s !== undefined ? ago(d.uptime_s) : "–"],
    ["Boots since power-on", d.boot_count ?? "–"],
    ["Last reset", `${d.reset_reason ?? "–"}${d.restart_cause && d.restart_cause !== "none" ? ` (${d.restart_cause})` : ""}`],
    ["WiFi signal", <StatusPill kind={rssiKind(d.wifi_rssi)}>{d.wifi_rssi ?? "–"} dBm</StatusPill>],
    ["BMS signal", <StatusPill kind={rssiKind(d.bms_rssi)}>{d.bms_rssi || "–"} dBm</StatusPill>],
    ["BMS / WiFi drops", `${d.ble_disconnects ?? 0} / ${d.wifi_disconnects ?? 0}`],
    ["Free memory", d.free_heap ? `${(d.free_heap / 1024).toFixed(0)} KB (low ${((d.min_free_heap ?? 0) / 1024).toFixed(0)} KB)` : "–"],
    ["Queue / dropped", `${d.buffered ?? 0} / ${d.dropped ?? 0}`],
    ["Upload / control errors", `${d.upload_errors ?? 0} / ${d.control_errors ?? 0}`],
  ];
  const recent = [...boots].reverse().slice(0, 12);
  return (
    <section className="card span-2">
      <header className="card-head">
        <div>
          <h3>Device health</h3>
          <p className="sub">{d.last_seen ? `Reported ${ago(nowS - d.last_seen)} ago` : "Not reported yet"}</p>
        </div>
      </header>
      <dl className="kv">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="two-col">
        <div>
          <h4>Restarts</h4>
          {recent.length === 0 ? (
            <p className="sub">No boot history yet (needs firmware 1.2.23+).</p>
          ) : (
            <div className="table-wrap short">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Reason</th>
                    <th>Previous run</th>
                    <th>fw</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((b) => (
                    <tr key={b.ts}>
                      <td>{when(b.ts)}</td>
                      <td>
                        {b.reset_reason}
                        {b.restart_cause && b.restart_cause !== "none" ? ` · ${b.restart_cause}` : ""}
                      </td>
                      <td>
                        {b.prev_uptime_s ? ago(b.prev_uptime_s) : "–"}
                        {b.prev_step && b.prev_step !== "loop" ? ` · in ${b.prev_step}` : ""}
                      </td>
                      <td>{b.firmware_version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h4>Crash reports</h4>
          {crashes.length === 0 ? (
            <p className="sub">
              <StatusPill kind="good">None</StatusPill>
            </p>
          ) : (
            <ul className="crashes">
              {[...crashes].reverse().map((c) => (
                <li key={c.ts}>
                  <b>{when(c.ts)}</b> · fw {c.reported_by} · {c.reset_reason} · step {c.step}
                  <details>
                    <summary>Report</summary>
                    <pre>{c.report?.replace(/; /g, "\n")}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function ControlPanel({ d }: { d: Device | null | undefined }) {
  const control = useControl();
  const [version, setVersion] = useState("");
  const [msg, setMsg] = useState("");
  const run = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
      setMsg(`${what} sent. The board reads it at its next check (every 5 min).`);
    } catch (e) {
      setMsg(`${what} failed: ${(e as Error).message}`);
    }
  };
  const valid = /^[0-9A-Za-z._-]+$/.test(version) && version !== d?.firmware_version;
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>Remote control</h3>
          <p className="sub">
            Pending: update {control?.ota ?? "none"} · restart {control?.restart ? "requested" : "none"}
          </p>
        </div>
      </header>
      <div className="control-row">
        <input value={version} onChange={(e) => setVersion(e.target.value.trim())} placeholder="Version, e.g. 1.2.25" aria-label="Firmware version" />
        <button
          disabled={!valid}
          onClick={() => window.confirm(`Install firmware ${version} on the board? It downloads jk-bms-${version}.ota.bin from the OTA site.`) && run(`Update to ${version}`, () => setOta(version))}
        >
          Install update
        </button>
        <button className="ghost" disabled={!control?.ota} onClick={() => run("Cancel update", clearOta)}>
          Cancel
        </button>
      </div>
      <div className="control-row">
        <button className="ghost" onClick={() => window.confirm("Restart the board (1 s radio reset)?") && run("Restart", requestRestart)}>
          Restart board
        </button>
        <button className="ghost" disabled={!control?.restart} onClick={() => run("Clear restart", clearRestart)}>
          Clear restart
        </button>
      </div>
      {msg && <p className="sub">{msg}</p>}
    </section>
  );
}
