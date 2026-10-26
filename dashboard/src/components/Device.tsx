import { Bug, Cpu, HardDrive, History, Wifi } from "lucide-react";
import { useBoots, useCrashes } from "../data";
import type { Device as DeviceT, Info } from "../types";
import { Ago, ago, Card, rssiKind, rssiLabel, StatusPill } from "./ui";

// ESP-IDF wifi_err_reason_t of the last WiFi disconnect (device/wifi_disc_reason)
const WIFI_REASONS: Record<number, string> = {
  1: "unspecified",
  2: "authentication expired",
  3: "deauthenticated by the router",
  4: "inactivity (association expired)",
  5: "router has too many clients",
  6: "not authenticated",
  7: "not associated",
  8: "left the network",
  15: "WPA handshake timeout",
  16: "group key update timeout",
  23: "802.1X authentication failed",
  34: "router: too many unacknowledged frames (low ACK)",
  200: "beacon timeout (router not heard)",
  201: "router not found",
  202: "authentication failed (password?)",
  203: "association failed",
  204: "handshake timeout",
  205: "connection failed",
  206: "router restarted (TSF reset)",
  207: "roaming",
  209: "SA query timeout",
  210: "no router with compatible security",
  212: "router below the RSSI threshold",
};
const wifiReason = (code: number) => `${WIFI_REASONS[code] ?? "reason"} (${code})`;

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

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

export function DevicePage({ d, info }: { d: DeviceT | null | undefined; info?: Info | null }) {
  const boots = useBoots();
  const crashes = useCrashes();
  if (!d) return <div className="card empty" style={{ height: 200 }}>The board has not reported yet.</div>;
  const recent = [...boots].reverse().slice(0, 15);
  const heapPct = d.free_heap && d.min_free_heap ? Math.round((d.min_free_heap / d.free_heap) * 100) : null;
  return (
    <div className="page">
      <div className="grid-2">
        <Card title="Board" icon={Cpu} subtitle={d.last_seen ? <>Reported <Ago ts={d.last_seen} /></> : "Not reported yet"}>
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
              // 1.2.28+: the connected link's own signal; older boards only report the (stale) advertisement RSSI
              d.bms_link_rssi !== undefined
                ? ["BMS link signal", <StatusPill kind={rssiKind(d.bms_link_rssi)}>{rssiLabel(d.bms_link_rssi)}</StatusPill>]
                : ["BMS advert signal", <StatusPill kind={rssiKind(d.bms_rssi)}>{rssiLabel(d.bms_rssi)}</StatusPill>],
              ["BMS link", <StatusPill kind={d.ble_connected === 1 ? "good" : "critical"}>{d.ble_connected === 1 ? "Connected" : "Not connected"}</StatusPill>],
              ["WiFi drops", d.wifi_disconnects ?? 0],
              ...(d.wifi_disc_reason !== undefined
                ? [["Last WiFi drop", <>{wifiReason(d.wifi_disc_reason)}{d.wifi_disc_ts ? <> · {when(d.wifi_disc_ts)}</> : null}{d.wifi_disc_rssi ? <> · {d.wifi_disc_rssi} dBm before</> : null}</>] as [string, React.ReactNode]]
                : []),
              ...(d.wifi_disc_counts && Object.keys(d.wifi_disc_counts).length
                ? [["Drops by reason", Object.entries(d.wifi_disc_counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n}× ${wifiReason(Number(c))}`).join(", ")] as [string, React.ReactNode]]
                : []),
              ["BMS drops", d.ble_disconnects ?? 0],
              ...(d.ble_scan ? [["BLE scan", d.ble_scan] as [string, React.ReactNode]] : []),
              ...(d.ble_interval_req ? [["BLE interval request", d.ble_interval_req] as [string, React.ReactNode]] : []),
              ...(d.upload_fail
                ? [["Last upload failure", <>{d.upload_fail}{d.upload_fail_ts ? <> · {when(d.upload_fail_ts)}</> : null}</>] as [string, React.ReactNode]]
                : []),
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
              ["Last batch / limit", `${d.upload_batch ?? "–"} / ${d.upload_cap ?? "–"}`],
              ["Last upload took", d.upload_ms ? `${(d.upload_ms / 1000).toFixed(1)} s (avg ${((d.upload_ms_avg ?? 0) / 1000).toFixed(1)} s)` : "–"],
              ["Upload heap low", d.upload_heap_low ? `${(d.upload_heap_low / 1024).toFixed(1)} KB` : "–"],
              ["Learned cost", d.upload_heap_base ? `${(d.upload_heap_base / 1024).toFixed(1)} KB + ${((d.upload_heap_per ?? 0) / 1024).toFixed(2)} KB/reading` : "–"],
              ["Upload errors", d.upload_errors ?? 0],
              ["Control errors", d.control_errors ?? 0],
            ]}
          />
        </Card>
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
