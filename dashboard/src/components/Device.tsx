import { Bug, Cpu, HardDrive, History, RefreshCw, RotateCcw, Send, Wifi, X } from "lucide-react";
import { useState } from "react";
import { clearOta, clearRestart, requestRestart, setOta, useBoots, useControl, useCrashes } from "../data";
import type { Device as DeviceT, Info } from "../types";
import { ago, Card, StatusPill, type Kind } from "./ui";

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const rssiKind = (v?: number): Kind => (v === undefined || v === 0 ? "muted" : v > -67 ? "good" : v > -80 ? "warning" : "serious");
const rssiLabel = (v?: number) => (v === undefined || v === 0 ? "–" : `${v} dBm · ${v > -67 ? "Good" : v > -80 ? "Fair" : "Weak"}`);

function KV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DevicePage({ d, info, nowS }: { d: DeviceT | null | undefined; info?: Info | null; nowS: number }) {
  const boots = useBoots();
  const crashes = useCrashes();
  if (!d) return <div className="card empty" style={{ height: 200 }}>The board has not reported yet.</div>;
  const recent = [...boots].reverse().slice(0, 15);
  const heapPct = d.free_heap && d.min_free_heap ? Math.round((d.min_free_heap / d.free_heap) * 100) : null;
  return (
    <div className="page">
      <div className="grid-3">
        <Card title="Board" icon={Cpu} subtitle={d.last_seen ? `Reported ${ago(nowS - d.last_seen)} ago` : "Not reported yet"}>
          <KV
            items={[
              ["Firmware", d.firmware_version ?? "–"],
              ["Update status", d.ota_status ?? "–"],
              ["Uptime", d.uptime_s !== undefined ? ago(d.uptime_s) : "–"],
              ["Boots since power-on", d.boot_count ?? "–"],
              ["Last reset", `${d.reset_reason ?? "–"}${d.restart_cause && d.restart_cause !== "none" ? ` (${d.restart_cause})` : ""}`],
              ["Watchdog resets", d.watchdog_resets ?? 0],
            ]}
          />
        </Card>
        <Card title="Connectivity" icon={Wifi} subtitle="Signal and link drops">
          <KV
            items={[
              ["WiFi signal", <StatusPill kind={rssiKind(d.wifi_rssi)}>{rssiLabel(d.wifi_rssi)}</StatusPill>],
              ["BMS Bluetooth", <StatusPill kind={rssiKind(d.bms_rssi)}>{rssiLabel(d.bms_rssi)}</StatusPill>],
              ["BMS link", <StatusPill kind={d.ble_connected === 1 ? "good" : "critical"}>{d.ble_connected === 1 ? "Connected" : "Not connected"}</StatusPill>],
              ["WiFi drops", d.wifi_disconnects ?? 0],
              ["BMS drops", d.ble_disconnects ?? 0],
            ]}
          />
        </Card>
        <Card title="Memory & upload" icon={HardDrive} subtitle={heapPct !== null ? `Lowest free memory ${heapPct}% of current` : undefined}>
          <KV
            items={[
              ["Free memory", d.free_heap ? `${(d.free_heap / 1024).toFixed(0)} KB` : "–"],
              ["Lowest free", d.min_free_heap ? `${(d.min_free_heap / 1024).toFixed(0)} KB` : "–"],
              ["Largest block", d.max_block ? `${(d.max_block / 1024).toFixed(0)} KB` : "–"],
              ["Queued / dropped", `${d.buffered ?? 0} / ${d.dropped ?? 0}`],
              ["Upload errors", d.upload_errors ?? 0],
              ["Control errors", d.control_errors ?? 0],
            ]}
          />
        </Card>
      </div>

      <div className="grid-2">
        <ControlPanel d={d} />
        <Card title="BMS" icon={Cpu} subtitle={info?.device_model ?? "JK-B1A8S10P"}>
          <KV
            items={[
              ["Hardware / software", `${info?.hardware_version ?? "–"} / ${info?.software_version ?? "–"}`],
              ["Charge switch", info?.charging_switch === undefined ? "–" : info.charging_switch ? "On" : "Off"],
              ["Discharge switch", info?.discharging_switch === undefined ? "–" : info.discharging_switch ? "On" : "Off"],
              ["Balancer", info?.balancer_switch === undefined ? "–" : info.balancer_switch ? "On" : "Off"],
              ["Full-charge capacity", info?.full_charge_capacity !== undefined ? `${info.full_charge_capacity} Ah` : "–"],
              ["Errors", info?.errors ? <StatusPill kind="critical">{info.errors}</StatusPill> : <StatusPill kind="good">None</StatusPill>],
            ]}
          />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Restarts" icon={History} subtitle={`Latest ${recent.length} boots`}>
          {recent.length === 0 ? (
            <p className="sub">No boot history yet (needs firmware 1.2.23+).</p>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 320 }}>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Reason</th>
                    <th>Previous run</th>
                    <th>Firmware</th>
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
                      <td>
                        <span className="tag">{b.firmware_version}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Crash reports" icon={Bug} actions={crashes.length === 0 ? <StatusPill kind="good">None</StatusPill> : <StatusPill kind="serious">{crashes.length}</StatusPill>}>
          {crashes.length === 0 ? (
            <p className="sub">No crashes recorded.</p>
          ) : (
            <ul className="crashes">
              {[...crashes].reverse().map((c) => (
                <li key={c.ts}>
                  <div>
                    <b>{when(c.ts)}</b> <span className="tag">fw {c.reported_by}</span> {c.reset_reason} · step {c.step}
                  </div>
                  <details>
                    <summary>Report</summary>
                    <pre>{c.report?.replace(/; /g, "\n")}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ControlPanel({ d }: { d: DeviceT }) {
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
  const valid = /^[0-9A-Za-z._-]+$/.test(version) && version !== d.firmware_version;
  return (
    <Card title="Remote control" icon={RefreshCw} subtitle="Read by the board every 5 minutes">
      <div className="pending">
        <span>Pending update</span>
        {control?.ota ? <StatusPill kind="warning">{control.ota}</StatusPill> : <StatusPill kind="muted">None</StatusPill>}
        <span>Pending restart</span>
        {control?.restart ? <StatusPill kind="warning">Requested</StatusPill> : <StatusPill kind="muted">None</StatusPill>}
      </div>
      <label className="field-label" htmlFor="fw">
        Firmware update
      </label>
      <div className="control-row">
        <input id="fw" value={version} onChange={(e) => setVersion(e.target.value.trim())} placeholder={`Version, current ${d.firmware_version ?? "–"}`} />
        <button
          className="primary"
          disabled={!valid}
          onClick={() => window.confirm(`Install firmware ${version} on the board? It downloads jk-bms-${version}.ota.bin from the OTA site.`) && run(`Update to ${version}`, () => setOta(version))}
        >
          <Send size={14} aria-hidden /> Install
        </button>
        <button className="secondary" disabled={!control?.ota} onClick={() => run("Cancel update", clearOta)}>
          <X size={14} aria-hidden /> Cancel
        </button>
      </div>
      <label className="field-label">Restart</label>
      <div className="control-row">
        <button className="secondary" onClick={() => window.confirm("Restart the board (1 s radio reset)?") && run("Restart", requestRestart)}>
          <RotateCcw size={14} aria-hidden /> Restart board
        </button>
        <button className="secondary" disabled={!control?.restart} onClick={() => run("Clear restart", clearRestart)}>
          <X size={14} aria-hidden /> Clear request
        </button>
      </div>
      {msg && <p className="notice">{msg}</p>}
    </Card>
  );
}
