import { AlertTriangle, Eraser, KeyRound, Lock, RefreshCw, Radio, RotateCcw, SearchCheck, Send, Server, Terminal, Timer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clearLog, log, markSent, sentTime, useLog, type Command } from "../controlLog";
import { clearOta, clearRestart, requestOtaCheck, requestRestart, setCheckInterval, setOta, setOtaHost, setRadio, useControl } from "../data";
import { compareVersions, ensureReleases, loadDefaultBase, syncReleases, useReleases } from "../ota";
import { ALLOWED_DOMAINS, allowedBase } from "../otaHost";
import { sha256Hex } from "../sha256";
import type { Device } from "../types";
import { Ago, StatusPill } from "./ui";

// SHA-256 of the control password (sample: 987654321). Override with VITE_CONTROL_PASSWORD_SHA256 in .env.
// It only gates this page: the database rules still allow writes to control.
const PASSWORD_SHA256 = import.meta.env.VITE_CONTROL_PASSWORD_SHA256 || "8a9bcf1e51e812d0af8465a8dbcc9f741064bf0af3b3d08e6b0246437c19f7fb";
const UNLOCK_MS = 10 * 60 * 1000;
let unlockedUntil = 0;

function Modal({ title, icon, onClose, children, wide }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div className="card-title">
            <span className="card-icon" aria-hidden>
              {icon}
            </span>
            <h3>{title}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function PasswordDialog({ onOk, onCancel }: { onOk: () => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sha256Hex(value) === PASSWORD_SHA256) {
      unlockedUntil = Date.now() + UNLOCK_MS;
      log("info", "Remote control unlocked");
      onOk();
    } else {
      setError("Wrong password");
      setValue("");
    }
  };
  return (
    <Modal title="Remote control is locked" icon={<Lock size={16} />} onClose={onCancel}>
      <form onSubmit={submit} className="modal-body">
        <p className="sub">Enter the control password to update or restart the board.</p>
        <label className="field-label" htmlFor="ctl-pw">
          Password
        </label>
        <input id="ctl-pw" type="password" autoFocus autoComplete="current-password" value={value} onChange={(e) => (setValue(e.target.value), setError(""))} />
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!value}>
            <KeyRound size={14} aria-hidden /> Unlock
          </button>
        </div>
      </form>
    </Modal>
  );
}

const fmtSize = (b?: number) => (b ? `${Math.round(b / 1024)} KB` : "");
const fmtDate = (s?: number) =>
  s ? new Date(s * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "";

function Console() {
  const lines = useLog();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines]);
  return (
    <section className="console-wrap">
      <div className="console-head">
        <span>
          <Terminal size={14} aria-hidden /> Console
        </span>
        <button className="link-btn" onClick={clearLog}>
          <Eraser size={13} aria-hidden /> Clear
        </button>
      </div>
      <div className="console" ref={box} role="log" aria-live="polite">
        {lines.length === 0 && <div className="console-line muted">No events yet.</div>}
        {lines.map((l) => (
          <div key={l.id} className={`console-line lvl-${l.level}`}>
            <time>{new Date(l.at).toLocaleTimeString(undefined, { hour12: false })}</time>
            <span>{l.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const BLE_INTERVALS = [
  { ms: 0, label: "BLE interval: as the BMS sets it" },
  { ms: 50, label: "BLE interval: 50 ms" },
  { ms: 100, label: "BLE interval: 100 ms" },
  { ms: 200, label: "BLE interval: 200 ms" },
] as const;

const INTERVALS = [
  { s: 30, label: "30 s (testing)" },
  { s: 300, label: "5 min" },
  { s: 900, label: "15 min" },
  { s: 3600, label: "1 h" },
] as const;

/** A command still in control: how long since this browser sent it, flagged after two read intervals. */
function Pending({ what, interval }: { what: Command; interval: number }) {
  const at = sentTime(what);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!at) return <StatusPill kind="warning">pending</StatusPill>;
  const s = Math.round((Date.now() - at) / 1000);
  const late = s > 2 * interval;
  return (
    <StatusPill kind={late ? "serious" : "warning"}>
      pending {s < 90 ? `${s} s` : `${Math.round(s / 60)} min`}
      {late ? " · not read yet" : ""}
    </StatusPill>
  );
}

interface Confirm {
  title: string;
  text: string;
  label: string;
  run: () => void;
}

/** Small confirmation dialog above the Remote Control dialog; Escape or a click outside cancels it only. */
function ConfirmDialog({ c, onCancel }: { c: Confirm; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // capture phase: keeps the Remote Control dialog open
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal mini" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
        <div className="mini-body">
          <span className="mini-icon" aria-hidden>
            <AlertTriangle size={18} />
          </span>
          <div>
            <h3 id="confirm-title">{c.title}</h3>
            <p id="confirm-text">{c.text}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" onClick={c.run} autoFocus>
            {c.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlModal({ d, onClose }: { d: Device | null | undefined; onClose: () => void }) {
  const control = useControl();
  const [hostInput, setHostInput] = useState("");
  const base = allowedBase(hostInput.trim());
  const releases = useReleases(base);
  const [version, setVersion] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [intervalSel, setIntervalSel] = useState<number | null>(null); // null: show the value in control
  const [scanAlwaysSel, setScanAlwaysSel] = useState<boolean | null>(null);
  const [bleMsSel, setBleMsSel] = useState<number | null>(null);
  const current = d?.firmware_version;
  const fw128 = d?.control_s !== undefined; // 1.2.28+ reports its control interval
  const interval = d?.control_s ?? control?.check_s ?? 300;
  const chosen = intervalSel ?? control?.check_s ?? 300;
  const fw129 = d?.ble_scan !== undefined; // 1.2.29+ reports its BLE scan mode
  const scanAlways = scanAlwaysSel ?? control?.ble_scan_always ?? false;
  const bleMs = bleMsSel ?? control?.ble_interval_ms ?? 0;
  const radioChanged = scanAlways !== (control?.ble_scan_always ?? false) || bleMs !== (control?.ble_interval_ms ?? 0);

  // Host: the one in control, else the dev server's default (ota_base_url)
  const hostSet = useRef(false);
  useEffect(() => {
    if (hostSet.current || control === undefined) return;
    hostSet.current = true;
    const fromControl = allowedBase(control?.ota_host ?? "");
    if (fromControl) setHostInput(fromControl);
    else void loadDefaultBase().then((b) => setHostInput((h) => h || b));
  }, [control]);
  useEffect(() => {
    if (base) ensureReleases(base); // reads the host only when nothing is stored for it yet
  }, [base]);

  const send = async (what: string, fn: () => Promise<void>, cmd?: Command) => {
    setConfirm(null);
    log("info", `${what}: sending…`);
    try {
      await fn();
      if (cmd) markSent(cmd);
      log("ok", `${what}: sent. The board acts on it at its next control read (every ${interval} s).`);
    } catch (e) {
      log("error", `${what} failed: ${(e as Error).message}`);
    }
  };

  const sync = async () => {
    log("info", `Syncing firmware list from ${base}…`);
    await syncReleases(base);
  };
  // Report the outcome of every load once the modal is open
  const reported = useRef(releases.syncedAt ?? 0);
  useEffect(() => {
    if (releases.loading) return;
    if (releases.error) log("error", `Firmware list: ${releases.error}`);
    else if (releases.syncedAt && releases.syncedAt !== reported.current) log("ok", `Firmware list synced: ${releases.list?.length ?? 0} versions`);
    reported.current = releases.syncedAt ?? 0;
  }, [releases.loading, releases.error, releases.syncedAt, releases.list]);

  const sel = releases.list?.find((r) => r.version === version);
  const older = sel && current ? compareVersions(sel.version, current) < 0 : false;
  const status = d?.ota_status ?? "";
  const failedThis = !!sel && (status.startsWith("download failed " + sel.version) || status.startsWith("update refused")) && status.includes(sel.version);

  return (
    <Modal title="Remote control" icon={<RefreshCw size={16} />} onClose={onClose} wide>
      <div className="modal-body">
        <div className="rc-status">
          <span>
            Firmware <b>{current ?? "–"}</b>
          </span>
          <span>Last report {d?.last_seen ? <Ago ts={d.last_seen} /> : "–"}</span>
          <span>
            Update {control?.ota ? <Pending what="ota" interval={interval} /> : <StatusPill kind="muted">none</StatusPill>}
          </span>
          <span>
            Restart {control?.restart ? <Pending what="restart" interval={interval} /> : <StatusPill kind="muted">none</StatusPill>}
          </span>
          {control?.ota_check && (
            <span>
              Check <Pending what="ota_check" interval={interval} />
            </span>
          )}
          {status && (
            <span>
              Status <b>{status}</b>
            </span>
          )}
        </div>

        <div className="rc-grid">
          <section>
            <label className="field-label" htmlFor="rc-host">
              OTA host
            </label>
            <div className="control-row">
              <input
                id="rc-host"
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                placeholder="https://sub.wafacredence.com/path"
                spellCheck={false}
                aria-invalid={!base}
              />
              <button
                className="secondary"
                disabled={!base || base === allowedBase(control?.ota_host ?? "")}
                title="Store this host in control/ota_host"
                onClick={() =>
                  setConfirm({
                    title: "Set OTA host",
                    text: `Store ${base} as the OTA host? The board downloads updates and runs download checks from it (firmware 1.2.28+).`,
                    label: "Set host",
                    run: () => send(`OTA host ${base}`, () => setOtaHost(base)),
                  })
                }
              >
                <Server size={14} aria-hidden /> Set host
              </button>
            </div>
            {control?.ota_host && <p className="field-hint">In control now: {control.ota_host}</p>}
            {base ? (
              <p className="field-hint">Allowed: {ALLOWED_DOMAINS.join(", ")} and their subdomains, https only.</p>
            ) : (
              <p className="field-error">
                <AlertTriangle size={13} aria-hidden /> Not allowed: use https:// on {ALLOWED_DOMAINS.join(" or ")} (or a subdomain), no port or login.
              </p>
            )}

            <label className="field-label" htmlFor="rc-fw">
              Firmware update
            </label>
            <div className="control-row">
              <select id="rc-fw" className="select" value={version} onChange={(e) => setVersion(e.target.value)} disabled={!releases.list}>
                <option value="">{releases.list ? "Select a version…" : releases.loading ? "Loading versions…" : "No versions loaded"}</option>
                {releases.list?.map((r) => (
                  <option key={r.version} value={r.version} disabled={r.version === current}>
                    {r.version}
                    {r.version === current ? " · installed" : ""}
                    {r.size ? ` · ${fmtSize(r.size)}` : ""}
                    {r.uploaded ? ` · ${fmtDate(r.uploaded)}` : ""}
                  </option>
                ))}
              </select>
              <button className="secondary" onClick={sync} disabled={!base || releases.loading} title="Reload the list from this host">
                <RefreshCw size={14} className={releases.loading ? "spin" : ""} aria-hidden /> Sync
              </button>
            </div>
            {releases.error ? (
              <p className="field-error">
                <AlertTriangle size={13} aria-hidden /> {releases.error}
              </p>
            ) : (
              <p className="field-hint">
                {releases.syncedAt ? (
                  <>
                    {releases.list?.length} versions on this host, stored in this browser · last synced <Ago ts={releases.syncedAt / 1000} />
                  </>
                ) : releases.loading ? (
                  "Reading the host…"
                ) : (
                  "No list stored for this host. Press Sync to read it."
                )}
              </p>
            )}
            {older && <p className="field-warn">Older than the installed {current}.</p>}
            {d?.ota_check && <p className="field-hint">Last check: {d.ota_check}{d.ota_check_ts ? <> · <Ago ts={d.ota_check_ts} /></> : null}</p>}
            <div className="control-row">
              <button
                className="secondary"
                disabled={!sel || !base || !fw128}
                title={fw128 ? "The board fetches this version's .md5 once and reports the result" : "Needs firmware 1.2.28 or newer"}
                onClick={() =>
                  sel &&
                  setConfirm({
                    title: "Check download",
                    text: `Ask the board to fetch the .md5 of ${sel.version} from ${base} once and report the result?`,
                    label: "Check",
                    run: () => send(`Download check ${sel.version}`, () => requestOtaCheck(sel.version, base), "ota_check"),
                  })
                }
              >
                <SearchCheck size={14} aria-hidden /> Check download
              </button>
              <button
                className="primary"
                disabled={!sel || !base}
                onClick={() =>
                  sel &&
                  setConfirm({
                    title: `Install firmware ${sel.version}`,
                    text: `Install ${sel.version} (now ${current ?? "unknown"}) from ${base}? One attempt: the board pauses uploads and Bluetooth during the download, then reboots into the new firmware.`,
                    label: "Install",
                    run: () => send(`Update to ${sel.version}`, () => setOta(sel.version, base), "ota"),
                  })
                }
              >
                <Send size={14} aria-hidden /> {failedThis ? "Install again" : "Install"}
              </button>
              <button className="secondary" disabled={!control?.ota} onClick={() => send("Cancel update", clearOta)}>
                <X size={14} aria-hidden /> Cancel
              </button>
            </div>
          </section>

          <section>
            <label className="field-label">Restart</label>
            <p className="field-hint">Resets the radios for 1 s; the board reconnects by itself.</p>
            <div className="control-row">
              <button className="secondary" onClick={() =>
                  setConfirm({
                    title: "Restart board",
                    text: `Restart the board? It resets its radios for 1 s at its next control read (within ${interval} s); queued readings in restart-safe memory are kept.`,
                    label: "Restart",
                    run: () => send("Restart", requestRestart, "restart"),
                  })
                }>
                <RotateCcw size={14} aria-hidden /> Restart board
              </button>
              <button className="secondary" disabled={!control?.restart} onClick={() => send("Clear restart", clearRestart)}>
                <X size={14} aria-hidden /> Clear request
              </button>
            </div>

            <label className="field-label" htmlFor="rc-interval">
              Control read interval
            </label>
            <div className="control-row">
              <select id="rc-interval" className="select" value={String(chosen)} onChange={(e) => setIntervalSel(Number(e.target.value))}>
                {INTERVALS.map((o) => (
                  <option key={o.s} value={o.s}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                className="secondary"
                disabled={chosen === (control?.check_s ?? 300)}
                onClick={() =>
                  setConfirm({
                    title: "Change control read interval",
                    text: `Let the board read control every ${chosen} s (now ${control?.check_s ?? 300} s)? It applies after its next read; commands then take effect within ${chosen} s.`,
                    label: "Apply",
                    run: () => send(`Read interval ${chosen} s`, () => setCheckInterval(chosen)).then(() => setIntervalSel(null)),
                  })
                }
              >
                <Timer size={14} aria-hidden /> Apply
              </button>
            </div>
            <p className="field-hint">
              {fw128 ? `The board reads control every ${d?.control_s} s` : "Needs firmware 1.2.28 or newer (older boards read every 5 min)"}. Commands take effect within one interval.
            </p>
            {(control?.check_s ?? 300) < 300 && <p className="field-warn">30 s is for testing: each read is an HTTPS request. Set it back when done.</p>}

            <label className="field-label">Radio (WiFi and Bluetooth share one antenna)</label>
            <label className="check-row">
              <input type="checkbox" checked={!scanAlways} onChange={(e) => setScanAlwaysSel(!e.target.checked)} disabled={!fw129} />
              Scan for the BMS only while disconnected (frees radio time for WiFi)
            </label>
            <div className="control-row">
              <select className="select" value={String(bleMs)} onChange={(e) => setBleMsSel(Number(e.target.value))} disabled={!fw129} aria-label="BLE connection interval">
                {BLE_INTERVALS.map((o) => (
                  <option key={o.ms} value={o.ms}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                className="secondary"
                disabled={!fw129 || !radioChanged}
                onClick={() =>
                  setConfirm({
                    title: "Change radio settings",
                    text: `BLE scan: ${scanAlways ? "all the time" : "only while disconnected"}; BLE connection interval: ${bleMs ? `ask the BMS for ${bleMs} ms` : "leave as the BMS sets it"}. Applied at the board's next control read. If the BMS link gets unstable, set the interval back here.`,
                    label: "Apply",
                    run: () => send("Radio settings", () => setRadio(scanAlways, bleMs)).then(() => (setScanAlwaysSel(null), setBleMsSel(null))),
                  })
                }
              >
                <Radio size={14} aria-hidden /> Apply
              </button>
            </div>
            <p className="field-hint">
              {fw129
                ? `Board: scan ${d?.ble_scan}${d?.ble_interval_req ? `; interval request ${d.ble_interval_req}` : ""}. The BMS's answer to an interval request is not visible; judge it by WiFi and BMS drops.`
                : "Needs firmware 1.2.29 or newer."}
            </p>
          </section>
        </div>

        {confirm && <ConfirmDialog c={confirm} onCancel={() => setConfirm(null)} />}

        <Console />

        <div className="modal-actions">
          <button
            className="secondary"
            onClick={() => {
              unlockedUntil = 0;
              log("info", "Remote control locked");
              onClose();
            }}
          >
            <Lock size={14} aria-hidden /> Lock
          </button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Password first (remembered 10 min in this tab), then the control modal. */
export function RemoteControl({ open, onClose, device }: { open: boolean; onClose: () => void; device: Device | null | undefined }) {
  const [, unlocked] = useState(0);
  if (!open) return null;
  if (Date.now() > unlockedUntil) return <PasswordDialog onOk={() => unlocked((x) => x + 1)} onCancel={onClose} />;
  return <ControlModal d={device} onClose={onClose} />;
}
