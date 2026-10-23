"""Remote restart test: request N restarts in a row and check each is a clean deep-sleep restart.

Usage (from the repository root):
    python tools/restart_test.py [count]      # default 4

Each round sets a new control/restart value and waits for the board to come back with
reset_reason "deep_sleep" and restart_cause "remote" and one more boot. A crash on the way shows up
as another reset reason and a new crashes/ entry. Afterwards control/restart is removed.
Report: logs/restart-test-<time>.md
"""

import datetime
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ota_release as rel  # noqa: E402

ROUND_TIMEOUT_S = 6 * 60


def main() -> int:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    secrets = rel.read_secrets()
    report = rel.Report(rel.LOGS / f"restart-test-{datetime.datetime.now():%Y%m%d-%H%M}.md")
    crashes_before = len(rel.firebase(secrets, "GET", "crashes") or {})
    passed = 0
    try:
        for n in range(1, count + 1):
            d = rel.firebase(secrets, "GET", "device") or {}
            boot = d.get("boot_count", 0)
            token = str(int(time.time()))
            rel.firebase(secrets, "PUT", "control/restart", token)
            report.log(f"round {n}: control/restart = {token}, board boot {boot} fw {d.get('firmware_version')}")
            start = time.time()
            while time.time() - start < ROUND_TIMEOUT_S:
                time.sleep(15)
                try:
                    d = rel.firebase(secrets, "GET", "device") or {}
                except Exception as e:
                    report.log(f"  device read failed: {e}")
                    continue
                if d.get("boot_count", 0) > boot and d.get("uptime_s", 0) >= 20:
                    clean = (d.get("reset_reason") == "deep_sleep" and d.get("restart_cause") == "remote"
                             and d.get("boot_count") == boot + 1)
                    report.log(f"  back after {int(time.time() - start)}s: boot {d.get('boot_count')} "
                               f"reset={d.get('reset_reason')} cause={d.get('restart_cause')} "
                               f"ble={d.get('ble_connected')} -> {'clean' if clean else 'NOT CLEAN'}")
                    passed += clean
                    break
            else:
                report.log("  board did not come back in time")
    finally:
        rel.firebase(secrets, "DELETE", "control/restart")
        report.log("control/restart removed")
    crashes_after = len(rel.firebase(secrets, "GET", "crashes") or {})
    report.log(f"crash reports: {crashes_before} before, {crashes_after} after")
    ok = passed == count and crashes_after == crashes_before
    result = f"{'OK' if ok else 'FAILED'}: {passed}/{count} clean restarts, {crashes_after - crashes_before} new crashes"
    report.log(result)
    report.save("Remote restart test", result)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
