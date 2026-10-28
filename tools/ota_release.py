"""Unattended remote OTA release and test for my-jk-bms-firebase.yaml.

Usage (from the repository root):
    python tools/ota_release.py              # next patch version, e.g. 1.2.34 -> 1.2.35
    python tools/ota_release.py 1.3.0        # explicit version
    python tools/ota_release.py --dry-run    # build and check everything, but no signal
    python tools/ota_release.py --ftp        # also upload over FTPS to an OTA site (ftp_* in secrets.yaml)
    python tools/ota_release.py --wait-healthy 30   # wait up to 30 min for a healthy board after the restart

Steps:
  1. Set fw_version in the config and build dist/jk-bms-<version>.ota.bin + .md5 (tools/publish_ota.py)
  2. Make the files available: by default tools/ota_server.py serves dist/ to the OTA host (the tunnel to
     this PC; this PC must stay on with ota_server.py and the tunnel running), checked here on
     127.0.0.1:8080. With --ftp: upload over FTPS and read them back through the site login.
  3. Restart the board (control/restart): a fresh radio state is when downloads get through
  4. As soon as it reports again with the BMS connected, set control/ota_host and control/ota.
     The board (1.2.33+) checks the file itself first and refuses a block page without a BMS outage.
  5. Watch the Firebase device node every 30 s until the board runs the new version with the BMS
     connected, or the timeout passes; the new firmware removes control/ota itself
  6. Remove control/ota and control/restart, so a leftover value cannot trigger anything later
  7. Write the timeline to logs/release-<version>.md
"""

import base64
import datetime
import hashlib
import json
import pathlib
import re
import ssl
import subprocess
import sys
import time
import urllib.request
from ftplib import FTP_TLS

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "my-jk-bms-firebase.yaml"
SECRETS = ROOT / "secrets.yaml"
DIST = ROOT / "dist"
LOGS = ROOT / "logs"

POLL_S = 30
CRASH_RESETS = ("panic", "interrupt_watchdog", "task_watchdog", "other_watchdog")
TIMEOUT_S = 25 * 60  # signal check (5 min before 1.2.11, 30 s since) + download + reboot + confirm + radio reset + reconnect


class Report:
    def __init__(self, path: pathlib.Path):
        self.path = path
        self.lines = []

    def log(self, msg: str) -> None:
        line = f"{datetime.datetime.now():%H:%M:%S}  {msg}"
        print(line, flush=True)
        self.lines.append(line)

    def save(self, title: str, result: str) -> None:
        LOGS.mkdir(exist_ok=True)
        body = [f"# {title}", "", f"**Result:** {result}", "", "```"] + self.lines + ["```", ""]
        self.path.write_text("\n".join(body), encoding="utf-8")
        print(f"\nReport: {self.path}")


def read_secrets() -> dict:
    secrets = {}
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        m = re.match(r'^([A-Za-z0-9_]+):\s*"(.*)"', line)
        if m:
            secrets[m.group(1)] = m.group(2)
    return secrets


def current_version() -> str:
    m = re.search(r'^(\s*fw_version:\s*")([^"]+)(")', CONFIG.read_text(encoding="utf-8"), re.MULTILINE)
    if not m:
        sys.exit(f"fw_version not found in {CONFIG.name}")
    return m.group(2)


def set_version(version: str) -> None:
    raw = CONFIG.read_bytes().decode("utf-8")
    new, n = re.subn(r'^(\s*fw_version:\s*")[^"]+(")', rf"\g<1>{version}\g<2>", raw, count=1, flags=re.MULTILINE)
    if n != 1:
        sys.exit("could not update fw_version")
    CONFIG.write_bytes(new.encode("utf-8"))


def next_patch(version: str) -> str:
    parts = version.split(".")
    if not parts[-1].isdigit():
        sys.exit(f"cannot bump {version!r}; pass the version explicitly")
    parts[-1] = str(int(parts[-1]) + 1)
    return ".".join(parts)


def firebase(secrets: dict, method: str, path: str, value=None):
    url = f"{secrets['firebase_db_url']}/{path}.json?auth={secrets['firebase_auth']}"
    data = None if value is None else json.dumps(value).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read() or b"null")


def ftp_upload(secrets: dict, files, report: Report) -> None:
    ftp = FTP_TLS(timeout=60)
    ftp.connect(secrets["ftp_host"], int(secrets.get("ftp_port", "21")))
    ftp.login(secrets["ftp_user"], secrets["ftp_password"])  # explicit TLS (AUTH TLS) before login
    ftp.prot_p()                                             # encrypt the data channel too
    for f in files:
        with open(f, "rb") as fh:
            ftp.storbinary(f"STOR {f.name}", fh)
        size = ftp.size(f.name)
        report.log(f"FTPS uploaded {f.name}: server size {size} (local {f.stat().st_size})")
        if size != f.stat().st_size:
            raise RuntimeError(f"size mismatch for {f.name}")
    ftp.quit()


def site_get(secrets: dict, name: str) -> bytes:
    req = urllib.request.Request(f"{secrets['ota_base_url']}/{name}")
    token = base64.b64encode(f"{secrets['ota_username']}:{secrets['ota_password']}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as resp:
        return resp.read()


def local_get(secrets: dict, name: str) -> bytes:
    """A file as tools/ota_server.py serves it on this PC (the OTA host tunnels to it)."""
    req = urllib.request.Request(f"http://127.0.0.1:8080/{name}")
    token = base64.b64encode(f"{secrets['ota_username']}:{secrets['ota_password']}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def restart(secrets: dict, report: Report, minutes: int = 10) -> bool:
    """Ask for a radio reset and wait until the board reports a new boot."""
    before = (firebase(secrets, "GET", "device") or {}).get("uptime_s", 0)
    token = str(int(time.time()))
    firebase(secrets, "PUT", "control/restart", token)
    report.log(f'control/restart = "{token}" (uptime before {before}s)')
    end = time.time() + minutes * 60
    try:
        while time.time() < end:
            time.sleep(10)
            try:
                d = firebase(secrets, "GET", "device") or {}
            except Exception as e:
                report.log(f"device read failed: {e}")
                continue
            if d.get("uptime_s", before) < before:
                report.log(f"restarted: uptime={d.get('uptime_s')}s reset={d.get('reset_reason')}")
                return True
        return False
    finally:
        firebase(secrets, "DELETE", "control/restart")


def healthy(d: dict) -> bool:
    fresh = time.time() - d.get("last_seen", 0) < 180
    busy = str(d.get("ota_status", "")).startswith(("downloading", "verifying"))
    return fresh and d.get("ble_connected") == 1 and not busy


def wait_healthy(secrets: dict, minutes: int, report: Report) -> bool:
    start = time.time()
    last = None
    while True:
        try:
            d = firebase(secrets, "GET", "device") or {}
        except Exception as e:
            report.log(f"device read failed: {e}")
            d = {}
        if healthy(d):
            report.log(f"board healthy: fw={d.get('firmware_version')} ble=1 ota={d.get('ota_status')!r}")
            return True
        state = (d.get("ble_connected"), d.get("ota_status"), d.get("boot_count"), d.get("buffered"))
        if state != last:
            report.log(f"waiting for a healthy board: ble={state[0]} ota={state[1]!r} boot={state[2]} queued={state[3]}")
            last = state
        if time.time() - start > minutes * 60:
            return False
        time.sleep(POLL_S)


def watch(secrets: dict, version: str, report: Report) -> bool:
    start = time.time()
    last = None
    start_status = None
    while time.time() - start < TIMEOUT_S:
        try:
            d = firebase(secrets, "GET", "device") or {}
        except Exception as e:  # network hiccup on this PC; keep watching
            report.log(f"device read failed: {e}")
            time.sleep(POLL_S)
            continue
        seen = datetime.datetime.fromtimestamp(d.get("last_seen", 0)).strftime("%H:%M:%S")
        state = (d.get("firmware_version"), d.get("ota_status"), d.get("reset_reason"), d.get("uptime_s"),
                 d.get("ble_connected"), d.get("bms_rssi"))
        if state != last:
            report.log(f"device @{seen}: fw={state[0]} ota={state[1]!r} reset={state[2]} uptime={state[3]}s "
                       f"ble={state[4]} bms_rssi={state[5]}")
            last = state
        if d.get("firmware_version") == version and d.get("ble_connected") == 1:
            return True
        # Fail fast instead of waiting out the timeout, but only on a status reported after the signal
        # (a stale "try 5/5" from an earlier round once ended a release at its first poll)
        status = str(d.get("ota_status", ""))
        if start_status is None:
            start_status = status
        fresh = status != start_status
        tries = re.search(r"\(try (\d+)/(\d+)", status)
        if fresh and tries and tries.group(1) == tries.group(2) and version in status:
            report.log(f"all download tries failed: {status}")
            return False
        # 1.2.28+: one attempt per signal, and a refused host
        if fresh and version in status and (status.startswith("download failed") and not tries
                                            or status.startswith("update refused")):
            report.log(f"update not installed: {status}")
            return False
        if "rolled back" in status and d.get("firmware_version") != version:
            report.log(f"update rolled back: {status}")
            return False
        if d.get("reset_reason") in CRASH_RESETS and d.get("uptime_s", 999) < 120:
            report.log(f"board crashed ({d.get('reset_reason')}); see crashes/ in Firebase")
            return False
        time.sleep(POLL_S)
    return False


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    wait_min = 10
    if "--wait-healthy" in sys.argv:
        i = sys.argv.index("--wait-healthy")
        wait_min = int(sys.argv[i + 1])
        args = [a for a in args if a != sys.argv[i + 1]]
    secrets = read_secrets()
    use_ftp = "--ftp" in sys.argv
    needed = ["firebase_db_url", "firebase_auth", "ota_base_url", "ota_username", "ota_password"]
    if use_ftp:
        needed += ["ftp_host", "ftp_user", "ftp_password"]
    missing = [k for k in needed if not secrets.get(k)]
    if missing:
        print(f"missing in secrets.yaml: {', '.join(missing)}")
        return 1

    old = current_version()
    version = args[0] if args else next_patch(old)
    report = Report(LOGS / f"release-{version}{'-dry-run' if dry_run else ''}.md")
    report.log(f"release {old} -> {version}{' (dry run)' if dry_run else ''}")

    # 1. build
    set_version(version)
    if subprocess.run([sys.executable, str(ROOT / "tools/publish_ota.py")], cwd=ROOT).returncode != 0:
        set_version(old)
        report.log("build failed; fw_version restored")
        report.save(f"OTA release {version}", "FAILED (build)")
        return 1
    files = [DIST / f"jk-bms-{version}.ota.bin", DIST / f"jk-bms-{version}.ota.bin.md5"]
    md5 = files[1].read_text().strip()
    report.log(f"built {files[0].name} ({files[0].stat().st_size} bytes, md5 {md5})")

    d = firebase(secrets, "GET", "device") or {}
    report.log(f"board before: fw={d.get('firmware_version')} ble={d.get('ble_connected')} "
               f"last_seen={datetime.datetime.fromtimestamp(d.get('last_seen', 0)):%H:%M:%S}")
    if dry_run:
        report.log("dry run: skipping publish, restart, signal and watch; fw_version restored, build removed")
        set_version(old)
        for f in files:
            f.unlink()
        report.save(f"OTA release {version} (dry run)", "build and Firebase read OK")
        return 0

    try:
        # 2. make the files available and check them as the board will get them
        if use_ftp:
            ftp_upload(secrets, files, report)
            body = site_get(secrets, files[0].name)
            served_md5 = site_get(secrets, files[1].name).decode().strip()
            where = "site"
        else:
            body = local_get(secrets, files[0].name)
            served_md5 = local_get(secrets, files[1].name).decode().strip()
            where = "ota_server.py (127.0.0.1:8080)"
        if hashlib.md5(body).hexdigest() != md5 or served_md5 != md5 or body[:1] != b"\xe9":
            raise RuntimeError(f"{where} does not serve the build")
        report.log(f"{where} serves {files[0].name} ({len(body)} bytes), md5 matches, image starts with 0xE9")

        # 3. restart first, 4. signal as soon as the board is back with the BMS, 5. watch
        if not restart(secrets, report):
            raise RuntimeError("board did not restart within 10 min; not signalled")
        if not wait_healthy(secrets, wait_min, report):
            raise RuntimeError(f"board not healthy {wait_min} min after the restart; not signalled")
        # 1.2.28+ downloads from control/ota_host (allowed domains only); older boards ignore it
        firebase(secrets, "PUT", "control/ota_host", secrets["ota_base_url"])
        firebase(secrets, "PUT", "control/ota", version)
        report.log(f'control/ota = "{version}"; watching device every {POLL_S}s for up to {TIMEOUT_S // 60} min')
        ok = watch(secrets, version, report)
        if ok:
            for _ in range(12):  # the new firmware removes control/ota itself
                if not (firebase(secrets, "GET", "control") or {}).get("ota"):
                    report.log("control/ota removed by the board itself")
                    break
                time.sleep(10)
    except Exception as e:
        report.log(f"ERROR: {e}")
        ok = False
    finally:
        # 6. never leave a pending signal behind
        for path in ("control/ota", "control/restart"):
            try:
                firebase(secrets, "DELETE", path)
            except Exception as e:
                report.log(f"could not remove {path}: {e}")
        report.log("control/ota and control/restart removed")

    result = (f"OK: board runs {version} with the BMS connected" if ok
              else f"FAILED: board did not reach {version} with the BMS connected in time")
    report.log(result)
    report.save(f"OTA release {version}", result)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
