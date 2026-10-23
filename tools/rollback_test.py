"""Remote rollback test: install a deliberately broken build and check the board returns by itself.

Usage (from the repository root, board on a confirmed firmware):
    python tools/rollback_test.py 1.2.9
    python tools/rollback_test.py 1.2.9 --no-ble   # board out of BMS range: don't require the BMS link

The test build is the current config with the OTA-site self-check pointed at a missing file, so the
new firmware uploads to Firebase but can never confirm itself. Expected: the board installs it, keeps
reporting, rolls back to the running version after ota_verify_timeout_ms (10 min), reports
"rolled back", and does not try that version again. Afterwards control/ota and the test files on the
OTA site are removed and the config is restored. Report: logs/rollback-test-<version>.md
"""

import datetime
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ota_release as rel  # noqa: E402

BROKEN_FROM = 'url: "${ota_base_url}/jk-bms-${fw_version}.ota.bin.md5"'
BROKEN_TO = 'url: "${ota_base_url}/jk-bms-${fw_version}-rollback-test-missing.md5"'
TIMEOUT_S = 30 * 60


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    need_ble = "--no-ble" not in sys.argv
    if len(args) != 1:
        print(__doc__)
        return 1
    version = args[0]
    secrets = rel.read_secrets()
    old = rel.current_version()
    report = rel.Report(rel.LOGS / f"rollback-test-{version}.md")
    report.log(f"rollback test: running {old}, broken test build {version}")

    raw = rel.CONFIG.read_bytes()
    if raw.decode("utf-8").count(BROKEN_FROM) != 1:
        sys.exit("self-check URL not found in the config")
    files = [rel.DIST / f"jk-bms-{version}.ota.bin", rel.DIST / f"jk-bms-{version}.ota.bin.md5"]
    try:
        rel.CONFIG.write_bytes(raw.replace(BROKEN_FROM.encode(), BROKEN_TO.encode()))
        rel.set_version(version)
        if subprocess.run([sys.executable, str(rel.ROOT / "tools/publish_ota.py")], cwd=rel.ROOT).returncode != 0:
            raise RuntimeError("build failed")
    finally:
        rel.CONFIG.write_bytes(raw)  # config back to the real firmware in every case
    report.log(f"built broken {files[0].name}; config restored to {rel.current_version()}")

    ok = False
    seen_new = False
    try:
        rel.ftp_upload(secrets, files, report)
        rel.firebase(secrets, "PUT", "control/ota", version)
        report.log(f'control/ota = "{version}"')
        start = time.time()
        last = None
        while time.time() - start < TIMEOUT_S:
            try:
                d = rel.firebase(secrets, "GET", "device") or {}
            except Exception as e:
                report.log(f"device read failed: {e}")
                time.sleep(rel.POLL_S)
                continue
            seen = datetime.datetime.fromtimestamp(d.get("last_seen", 0)).strftime("%H:%M:%S")
            state = (d.get("firmware_version"), d.get("ota_status"), d.get("reset_reason"), d.get("restart_cause"),
                     d.get("ble_connected"))
            if state != last:
                report.log(f"device @{seen}: fw={state[0]} ota={state[1]!r} reset={state[2]} cause={state[3]} "
                           f"uptime={d.get('uptime_s')}s ble={state[4]}")
                last = state
            if d.get("firmware_version") == version:
                seen_new = True
            if (seen_new and d.get("firmware_version") == old and "rolled back" in str(d.get("ota_status"))
                    and (d.get("ble_connected") == 1 or not need_ble)):
                ok = True
                break
            time.sleep(rel.POLL_S)
    except Exception as e:
        report.log(f"ERROR: {e}")
    finally:
        try:
            rel.firebase(secrets, "DELETE", "control/ota")
            report.log("control/ota removed")
        except Exception as e:
            report.log(f"could not remove control/ota: {e}")
        try:
            ftp = rel.FTP_TLS(timeout=60)
            ftp.connect(secrets["ftp_host"], int(secrets.get("ftp_port", "21")))
            ftp.login(secrets["ftp_user"], secrets["ftp_password"])
            ftp.prot_p()
            for f in files:
                ftp.delete(f.name)
            ftp.quit()
            report.log("broken test files removed from the OTA site")
        except Exception as e:
            report.log(f"could not remove test files: {e}")
        for f in files:
            f.unlink(missing_ok=True)

    result = (f"OK: {version} installed, never confirmed, rolled back to {old} with the BMS connected" if ok
              else f"FAILED: expected install of {version} then rollback to {old} (saw {version}: {seen_new})")
    report.log(result)
    report.save(f"Rollback test {version}", result)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
