import { AlertTriangle, Eraser, KeyRound, Lock, RefreshCw, RotateCcw, Send, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clearLog, log, useLog } from "../controlLog";
import { clearOta, clearRestart, requestRestart, setOta, useControl } from "../data";
import { compareVersions, ensureReleases, syncReleases, useReleases } from "../ota";
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
      ensureReleases(); // reads the OTA site only when no list is stored in this browser yet
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

function ControlModal({ d, onClose }: { d: Device | null | undefined; onClose: () => void }) {
  const control = useControl();
  const releases = useReleases();
  const [version, setVersion] = useState("");
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);
  const current = d?.firmware_version;

  const send = async (what: string, fn: () => Promise<void>) => {
    setConfirm(null);
    log("info", `${what}: sending…`);
    try {
      await fn();
      log("ok", `${what}: sent. The board reads it at its next check (every 5 min).`);
    } catch (e) {
      log("error", `${what} failed: ${(e as Error).message}`);
    }
  };

  const sync = async () => {
    log("info", "Syncing firmware list from the OTA site…");
    await syncReleases();
  };
  // Report the outcome of every load (including the one at app start) once the modal is open
  const reported = useRef(releases.syncedAt ?? 0);
  useEffect(() => {
    if (releases.loading) return;
    if (releases.error) log("error", `Firmware list: ${releases.error}`);
    else if (releases.syncedAt && releases.syncedAt !== reported.current) log("ok", `Firmware list synced: ${releases.list?.length ?? 0} versions`);
    reported.current = releases.syncedAt ?? 0;
  }, [releases.loading, releases.error, releases.syncedAt, releases.list]);

  const sel = releases.list?.find((r) => r.version === version);
  const older = sel && current ? compareVersions(sel.version, current) < 0 : false;

  return (
    <Modal title="Remote control" icon={<RefreshCw size={16} />} onClose={onClose} wide>
      <div className="modal-body">
        <div className="rc-status">
          <span>
            Firmware <b>{current ?? "–"}</b>
          </span>
          <span>Last report {d?.last_seen ? <Ago ts={d.last_seen} /> : "–"}</span>
          <span>
            Update {control?.ota ? <StatusPill kind="warning">{control.ota} pending</StatusPill> : <StatusPill kind="muted">none</StatusPill>}
          </span>
          <span>
            Restart {control?.restart ? <StatusPill kind="warning">pending</StatusPill> : <StatusPill kind="muted">none</StatusPill>}
          </span>
        </div>

        <div className="rc-grid">
          <section>
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
              <button className="secondary" onClick={sync} disabled={releases.loading} title="Reload the list from the OTA site">
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
                    {releases.list?.length} versions, stored in this browser · last synced <Ago ts={releases.syncedAt / 1000} />
                  </>
                ) : releases.loading ? (
                  "Reading the OTA site…"
                ) : (
                  "No list stored yet. Press Sync to read the OTA site."
                )}
              </p>
            )}
            {older && <p className="field-warn">Older than the installed {current}. A version that rolled back before is refused by the board.</p>}
            <div className="control-row">
              <button
                className="primary"
                disabled={!sel}
                onClick={() => sel && setConfirm({ text: `Install firmware ${sel.version} on the board?`, run: () => send(`Update to ${sel.version}`, () => setOta(sel.version)) })}
              >
                <Send size={14} aria-hidden /> Install
              </button>
              <button className="secondary" disabled={!control?.ota} onClick={() => send("Cancel update", clearOta)}>
                <X size={14} aria-hidden /> Cancel pending
              </button>
            </div>
          </section>

          <section>
            <label className="field-label">Restart</label>
            <p className="field-hint">Resets the radios for 1 s; the board reconnects by itself.</p>
            <div className="control-row">
              <button className="secondary" onClick={() => setConfirm({ text: "Restart the board?", run: () => send("Restart", requestRestart) })}>
                <RotateCcw size={14} aria-hidden /> Restart board
              </button>
              <button className="secondary" disabled={!control?.restart} onClick={() => send("Clear restart", clearRestart)}>
                <X size={14} aria-hidden /> Clear request
              </button>
            </div>
          </section>
        </div>

        {confirm && (
          <div className="confirm" role="alertdialog" aria-label={confirm.text}>
            <AlertTriangle size={16} aria-hidden />
            <span>{confirm.text}</span>
            <button className="secondary" onClick={() => setConfirm(null)}>
              Back
            </button>
            <button className="primary" onClick={confirm.run} autoFocus>
              Confirm
            </button>
          </div>
        )}

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
