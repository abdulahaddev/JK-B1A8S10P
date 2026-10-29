import { Bug, Cable, Cpu, HardDrive, History, ScrollText, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { useBoots, useCrashes, useEvents } from "../data";
import type { BoardEvent, Device as DeviceT, Info } from "../types";
import { Ago, ago, Card, rssiKind, rssiLabel, Segmented, StatusPill, type Kind } from "./ui";

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

// esp_reset_reason_t (boot events)
const RESET_REASONS: Record<number, string> = {
  1: "power on",
  2: "reset pin",
  3: "software restart",
  4: "crash",
  5: "interrupt watchdog",
  6: "task watchdog",
  7: "watchdog",
  8: "wake from deep sleep",
  9: "brownout",
  10: "SDIO",
};
// telemetry::RestartCause, in firmware order (restart events, and the cause before a boot)
const RESTART_CAUSES = [
  "none",
  "remote restart",
  "radio reset after a software reset",
  "BMS watchdog",
  "WiFi watchdog",
  "stuck script",
  "update took too long",
  "network watchdog",
  "radio reset after power-on",
  "radio reset after a brownout",
  "update failed",
];
const cause = (c?: number) => RESTART_CAUSES[c ?? 0] ?? `cause ${c}`;
const duration = (s: number) => (s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);

const EVENT_GROUPS = [
  { id: "all", label: "All" },
  { id: "board", label: "Board" },
  { id: "wifi", label: "WiFi" },
  { id: "bms", label: "BMS" },
  { id: "update", label: "Updates" },
  { id: "error", label: "Errors" },
] as const;
type EventGroup = (typeof EVENT_GROUPS)[number]["id"];
const GROUP_OF: Record<string, EventGroup> = {
  boot: "board",
  restart: "board",
  control: "board",
  crash: "error",
  upload_fail: "error",
  wifi_drop: "wifi",
  bms_connect: "bms",
  bms_disconnect: "bms",
  ota: "update",
};

/** One event as a label, a status kind and a plain-language detail. */
function describe(e: BoardEvent): { label: string; kind: Kind; detail: string } {
  switch (e.code) {
    case "boot":
      return { label: "Boot", kind: "muted", detail: `${RESET_REASONS[e.a ?? 0] ?? `reason ${e.a}`}${e.b ? ` · before: ${cause(e.b)}` : ""}${e.text ? ` · firmware ${e.text}` : ""}` };
    case "restart":
      return { label: "Restart", kind: e.a === 1 || e.a === 8 ? "muted" : "warning", detail: cause(e.a) };
    case "crash":
      return { label: "Crash", kind: "critical", detail: `in step ${e.text || "unknown"}` };
    case "wifi_drop":
      return { label: "WiFi drop", kind: "warning", detail: `${wifiReason(e.a ?? 0)}${e.b ? ` · ${e.b} dBm before` : ""}` };
    case "bms_connect":
      return { label: "BMS connected", kind: "good", detail: e.a !== undefined ? `${duration(e.a)} after boot` : "" };
    case "bms_disconnect":
      return { label: "BMS disconnected", kind: "warning", detail: e.a !== undefined && e.a >= 0 ? `after ${duration(e.a)} connected` : "" };
    case "ota":
      return { label: "Update", kind: /fail|refus|stopped|rolled/i.test(e.text ?? "") ? "serious" : "muted", detail: e.text ?? "" };
    case "upload_fail":
      return {
        label: "Upload failed",
        kind: "serious",
        detail: `${e.a && e.a > 0 ? `HTTP ${e.a}` : "no response"}${e.text ? ` (${e.text})` : ""}${e.b ? ` · ${(e.b / 1000).toFixed(1)} s` : ""}`,
      };
    case "control":
      return { label: "Setting", kind: "muted", detail: e.text === "keepalive" ? `Kept connection ${e.a ? "on" : "off"}` : e.text ?? "" };
    default:
      return { label: e.code, kind: "muted", detail: e.text ?? "" };
  }
}

/** The board's flash event log (events/, fw 1.2.42+), newest first, filtered by group. */
function EventLog() {
  const events = useEvents(300);
  const [group, setGroup] = useState<EventGroup>("all");
  const shown = useMemo(() => (events ?? []).filter((e) => group === "all" || GROUP_OF[e.code] === group), [events, group]);
  return (
    <Card
      title="Event log"
      icon={ScrollText}
      subtitle={events ? `Latest ${events.length} events from the board's flash log` : "Loading…"}
      className="span-2"
      actions={<Segmented options={EVENT_GROUPS} value={group} onChange={setGroup} label="Event type" size="small" />}
    >
      {events && events.length === 0 ? (
        <p className="sub">No events yet (needs firmware 1.2.42+).</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const x = describe(e);
                return (
                  <tr key={e.key}>
                    <td title={`boot ${e.boot}, ${e.up} s after start`}>{e.ts ? when(e.ts) : <span className="muted">boot {e.boot} · +{e.up} s</span>}</td>
                    <td>
                      <StatusPill kind={x.kind}>{x.label}</StatusPill>
                    </td>
                    <td>{x.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="sub">No events of this type.</p>}
        </div>
      )}
    </Card>
  );
}

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
              [
                "Flash log",
                d.flash_log === undefined ? (
                  "–"
                ) : d.flash_log ? (
                  <StatusPill kind="good">Active</StatusPill>
                ) : (
                  <StatusPill kind="warning">Missing: flash the factory image</StatusPill>
                ),
              ],
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
              [
                "Queued in flash",
                d.queue_capacity
                  ? `${d.buffered ?? 0} of ${d.queue_capacity} (≈ ${duration((d.buffered ?? 0) * 30)}; holds ${duration(d.queue_capacity * 30)})`
                  : `${d.buffered ?? 0}`,
              ],
              ["Dropped (queue full)", d.dropped ?? 0],
              ["Events waiting", d.events_queued ?? "–"],
              ["Last batch / limit", `${d.upload_batch ?? "–"} / ${d.upload_cap ?? "–"}`],
              ["Last upload took", d.upload_ms ? `${(d.upload_ms / 1000).toFixed(1)} s (avg ${((d.upload_ms_avg ?? 0) / 1000).toFixed(1)} s)` : "–"],
              ["Upload heap low", d.upload_heap_low ? `${(d.upload_heap_low / 1024).toFixed(1)} KB` : "–"],
              ["Learned cost", d.upload_heap_base ? `${(d.upload_heap_base / 1024).toFixed(1)} KB + ${((d.upload_heap_per ?? 0) / 1024).toFixed(2)} KB/reading` : "–"],
              ["Upload errors", d.upload_errors ?? 0],
              ["Control errors", d.control_errors ?? 0],
            ]}
          />
        </Card>
        <Card
          title="Firebase connection"
          icon={Cable}
          subtitle="Uploads and control reads since boot"
          actions={
            d.net_keepalive === undefined ? undefined : (
              <StatusPill kind={d.net_keepalive ? "good" : "muted"}>{d.net_keepalive ? "Kept open" : "New per request"}</StatusPill>
            )
          }
        >
          <KV
            items={[
              ["Requests on the open connection", d.net_reused ?? "–"],
              ["New connections", d.net_new ?? "–"],
              ["Dead connections recovered", d.net_stale ?? "–"],
              [
                "Request task stack free",
                d.net_stack_free === undefined ? (
                  "–"
                ) : (
                  <StatusPill kind={d.net_stack_free < 1024 ? "critical" : d.net_stack_free < 2048 ? "warning" : "good"}>{`${(d.net_stack_free / 1024).toFixed(1)} KB`}</StatusPill>
                ),
              ],
            ]}
          />
          <p className="sub">Switch the kept connection in Remote control.</p>
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
        <EventLog />
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
