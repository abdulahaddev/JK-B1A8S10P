"""Interactive console for the board's Firebase control node.

Usage (from the repository root):
    python tools/control.py

Commands:
    status              control node and a short device summary
    ota <version>       set control/ota (checks the files exist on the OTA site first)
    ota clear           remove control/ota
    restart             set control/restart to a new value (the board restarts once)
    restart clear       remove control/restart
    device              full device node
    readings [n]        last n telemetry readings (default 5)
    help                this list
    exit                close

The board reads control every 30 seconds, so a change takes effect at its next check.
"""

import base64
import datetime
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SECRETS = ROOT / "secrets.yaml"
CONFIG = ROOT / "my-jk-bms-firebase.yaml"

if os.name == "nt":
    os.system("")  # enable ANSI colors in the Windows console
USE_COLOR = sys.stdout.isatty()


def color(text, code):
    return f"\033[{code}m{text}\033[0m" if USE_COLOR else str(text)


def ok(text):
    return color(text, "32")


def warn(text):
    return color(text, "33")


def bad(text):
    return color(text, "31")


def dim(text):
    return color(text, "90")


def bold(text):
    return color(text, "1")


def read_secrets():
    secrets = {}
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        m = re.match(r'^([A-Za-z0-9_]+):\s*"(.*)"', line)
        if m:
            secrets[m.group(1)] = m.group(2)
    return secrets


SECRETS_DATA = read_secrets()


def firebase(method, path, value=None, query=""):
    url = f"{SECRETS_DATA['firebase_db_url']}/{path}.json?auth={SECRETS_DATA['firebase_auth']}{query}"
    data = None if value is None else json.dumps(value).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read() or b"null")


def site_has(name):
    """True/False if the OTA site has the file, None if it cannot be checked."""
    base = SECRETS_DATA.get("ota_base_url")
    if not base:
        return None
    req = urllib.request.Request(f"{base}/{name}", method="HEAD")
    token = base64.b64encode(f"{SECRETS_DATA.get('ota_username', '')}:{SECRETS_DATA.get('ota_password', '')}".encode())
    req.add_header("Authorization", "Basic " + token.decode())
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as e:
        return False if e.code == 404 else None
    except Exception:
        return None


def ago(ts):
    if not ts:
        return "never"
    s = int(time.time() - ts)
    if s < 0:
        return "now"
    if s < 90:
        return f"{s}s ago"
    if s < 5400:
        return f"{s // 60}m {s % 60}s ago"
    return f"{s // 3600}h {s % 3600 // 60}m ago"


def hhmm(ts):
    return datetime.datetime.fromtimestamp(ts).strftime("%H:%M:%S") if ts else "-"


def row(label, value):
    print(f"  {label:<18} {value}")


def cmd_status(_args):
    control = firebase("GET", "control") or {}
    d = firebase("GET", "device") or {}
    print(bold("control"))
    row("ota", ok(control["ota"]) if "ota" in control else dim("(none)"))
    row("restart", warn(control["restart"]) if "restart" in control else dim("(none)"))
    print(bold("device"))
    last = d.get("last_seen", 0)
    stale = time.time() - last > 180
    row("last report", (bad if stale else ok)(f"{hhmm(last)}  ({ago(last)})"))
    row("firmware", d.get("firmware_version", "-"))
    row("ota status", d.get("ota_status", "-"))
    row("reset / uptime", f"{d.get('reset_reason', '-')} / {d.get('uptime_s', '-')}s  (boot {d.get('boot_count', '-')})")
    ble = d.get("ble_connected")
    row("BMS link", (ok("connected") if ble == 1 else bad("not connected"))
        + dim(f"  rssi {d.get('bms_rssi', '-')} dBm, {d.get('ble_disconnects', 0)} drops"))
    row("WiFi", f"rssi {d.get('wifi_rssi', '-')} dBm" + dim(f", {d.get('wifi_disconnects', 0)} disconnects"))
    row("buffer", f"{d.get('buffered', '-')} waiting, {d.get('dropped', '-')} dropped")
    row("free heap", f"{d.get('free_heap', '-')} (min {d.get('min_free_heap', '-')}, largest block {d.get('max_block', '-')})")
    row("self restarts", f"last cause {d.get('restart_cause', '-')}, {d.get('watchdog_resets', '-')} watchdog resets in a row")
    errors = (d.get("upload_errors", 0) or 0) + (d.get("control_errors", 0) or 0)
    row("errors", (warn if errors else ok)(f"{d.get('upload_errors', '-')} upload, {d.get('control_errors', '-')} control")
        + dim("  since boot"))


def cmd_ota(args):
    if not args:
        print(warn("usage: ota <version> | ota clear"))
        return
    if args[0] == "clear":
        firebase("DELETE", "control/ota")
        print(ok("control/ota removed"))
        return
    version = args[0]
    if not re.fullmatch(r"[0-9A-Za-z._-]+", version):
        print(bad("version may only contain letters, digits, '.', '-' and '_'"))
        return
    running = (firebase("GET", "device") or {}).get("firmware_version")
    if running == version:
        print(warn(f"the board already runs {version}; nothing would happen"))
        return
    missing = []
    for name in (f"jk-bms-{version}.ota.bin", f"jk-bms-{version}.ota.bin.md5"):
        found = site_has(name)
        mark = ok("found") if found else (bad("missing") if found is False else warn("could not check"))
        print(f"  {name:<28} {mark}")
        if found is False:
            missing.append(name)
    if missing:
        print(bad("not set: upload the missing files first"))
        return
    firebase("PUT", "control/ota", version)
    print(ok(f'control/ota = "{version}"') + dim(f"  (board {running} installs it at its next check, within 30 s)"))


def cmd_restart(args):
    if args and args[0] == "clear":
        firebase("DELETE", "control/restart")
        print(ok("control/restart removed"))
        return
    token = str(int(time.time()))
    firebase("PUT", "control/restart", token)
    print(ok(f'control/restart = "{token}"') + dim("  (board restarts once at its next check, within 30 s)"))
    print(dim("  run 'restart clear' afterwards"))


def cmd_device(_args):
    d = firebase("GET", "device") or {}
    for k in sorted(d):
        v = d[k]
        if k == "last_seen":
            v = f"{v}  ({hhmm(v)}, {ago(v)})"
        row(k, v)


def cmd_readings(args):
    n = int(args[0]) if args and args[0].isdigit() else 5
    data = firebase("GET", "telemetry", query=f"&orderBy=%22%24key%22&limitToLast={n}") or {}
    if not data:
        print(dim("(no readings)"))
        return
    print(dim(f"  {'time':<9} {'volt':>7} {'curr':>7} {'soc':>4}  cells"))
    for k in sorted(data, key=int):
        r = data[k]
        cells = " ".join(f"{r.get(f'cell_voltage_{i}', 0):.3f}" for i in range(1, 5))
        print(f"  {hhmm(int(k)):<9} {r.get('total_voltage', 0):>7.3f} {r.get('current', 0):>+7.2f} "
              f"{r.get('state_of_charge', 0):>3}%  {cells}")


def cmd_help(_args):
    print(__doc__.split("Commands:")[1].split("The board")[0].rstrip())


COMMANDS = {
    "status": cmd_status, "s": cmd_status,
    "ota": cmd_ota,
    "restart": cmd_restart,
    "device": cmd_device, "d": cmd_device,
    "readings": cmd_readings, "r": cmd_readings,
    "help": cmd_help, "?": cmd_help,
}


def main():
    print(bold("JK-BMS control") + dim(f"  ({SECRETS_DATA.get('firebase_db_url', '?')})"))
    print(dim("type 'help' for commands, 'exit' to close"))
    cmd_status([])
    while True:
        try:
            line = input("\n" + color("jk-bms> ", "36")).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        name, *args = line.split()
        if name.lower() in ("exit", "quit", "q"):
            break
        fn = COMMANDS.get(name.lower())
        if fn is None:
            print(warn(f"unknown command '{name}'; type 'help'"))
            continue
        try:
            fn(args)
        except urllib.error.URLError as e:
            print(bad(f"network error: {e}"))
        except Exception as e:
            print(bad(f"error: {e}"))
    print(dim("bye"))


if __name__ == "__main__":
    main()
