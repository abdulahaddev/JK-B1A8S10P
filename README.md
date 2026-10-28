# JK-B1A8S10P ESP32 monitor

ESPHome firmware that reads a JK-B1A8S10P BMS over Bluetooth LE, shows it on a 0.96" SSD1306
OLED and uploads it to a Firebase Realtime Database.

The `jk_bms_ble` component comes from [syssi/esphome-jk-bms](https://github.com/syssi/esphome-jk-bms),
pinned to the commit this project was tested with (see `external_components` in each config).

## Configs

| File | What it does |
|---|---|
| `my-jk-bms-firebase.yaml` | Main firmware: BLE + OLED + WiFi + Firebase upload |
| `my-jk-bms-bridge.yaml` | Minimal OTA bridge (no BLE): only installs the next full firmware, falls back after 60 min |

## Setup

1. Copy `secrets.example.yaml` to `secrets.yaml` and fill in WiFi and Firebase values.
   `secrets.yaml` is git-ignored.
2. Set `bms_mac_address` in the config to your BMS.
3. Flash and watch the log:

```bash
esphome run my-jk-bms-firebase.yaml --device COM8
```

## Firebase layout (`my-jk-bms-firebase.yaml`)

One multi-path `PATCH` to the database root about once a minute (sooner while catching up):

| Path | When | Contents |
|---|---|---|
| `telemetry/<unix_ts>` | every 30 s reading | `total_voltage`, `current`, `cell_voltage_1..4`, `capacity_remaining`, `state_of_charge`, `balancing_current`, `mosfet_temperature`, `temperature_sensor_1/2`, `charging`, `discharging`, `balancing` |
| `device` | every upload | `last_seen`, `uptime_s`, `boot_count`, `reset_reason`, `restart_cause`, `watchdog_resets`, `wifi_rssi`, `wifi_disconnects`, `ble_connected`, `ble_disconnects`, `bms_rssi`, `bms_adverts`, `free_heap`, `min_free_heap`, `max_block`, `buffered`, `dropped`, `upload_batch`, `upload_errors`, `control_errors`, `firmware_version`, `ota_status` |
| `info` | on change, at least daily | `errors`, switches, `heating`, `charging_cycles`, `cell_resistance_1..4`, `state_of_health`, `full_charge_capacity`, device model/versions/serial/date |
| `energy/<unix_ts>` | hourly | `total_charging_cycle_capacity` (Ah) |
| `crashes/<unix_ts>` | once after a crash | `reported_by`, `reset_reason`, `step`, `report` |

Readings wait in a buffer (`telemetry_buffer.h`) until Firebase confirms them: the newest 280 in RTC
memory (survive software reboots), older ones in a 580-reading RAM ring. About 7 hours at 30 s.

## Remote update (OTA)

The board reads `control` in Firebase every 5 minutes (30 s while testing):

- `control/ota = "<version>"`: download `jk-bms-<version>.ota.bin` (+ `.md5`) from `ota_base_url` with
  `ota_username`/`ota_password`, install, reboot. The new firmware confirms itself on its first
  successful upload, otherwise it rolls back after 10 minutes.
- `control/restart = <any new value>`: clean BLE disconnect, then a 1 s deep sleep restart.

`device/firmware_version` and `device/ota_status` show the result.

Unattended release and test (usually under 10 minutes, writes `logs/release-<version>.md`):

```bash
python tools/ota_release.py
```

It bumps `fw_version`, builds, uploads over FTPS (`ftp_host`/`ftp_user`/`ftp_password`), checks the
files through the site login, sets `control/ota`, watches `device` until the board runs the new
version with the BMS connected, then removes `control/ota`. `--dry-run` only builds and reads Firebase.

## Self-healing and diagnostics

The board is meant to run unattended, so it recovers on its own and reports what happened:

| Situation | What the board does | Where it shows |
|---|---|---|
| Software reset (OTA, crash, watchdog) | One 1 s deep sleep after the first upload, so BLE can reach the BMS again | `device/restart_cause = after_soft_reset` |
| No BMS frame for 10 min | Radio reset (1 s deep sleep); the wait doubles each time in a row (10/20/40/80 min) | `ble_watchdog`, `watchdog_resets` |
| Power-on, brownout or reset pin | 2 s deep sleep before WiFi and BLE start, so BLE reaches the BMS at once | `after_power_on`, `after_brownout` |
| Router visible but not joinable for 2 min | Radio reset (a stuck WiFi stack); the wait doubles each time in a row. Router off or out of range: nothing, readings buffer (~7 h) and upload when it is back | `wifi_watchdog` |
| WiFi joined but no upload or control read works for 5 min | Radio reset | `net_watchdog` |
| OTA install or restart script stuck > 3 min | Deep sleep restart | `stuck_script` |
| Crash | ESPHome's crash report (PC, backtraces of both cores) and the step the loop was in are uploaded once | `crashes/<ts>` |
| Firebase rejects a batch with 400 three times | The batch is dropped so the buffer cannot block | `upload_errors` |

A new firmware confirms itself on its first successful upload, then resets the radio once. An update runs
step by step, each step reported in `device/ota_status`: check the file (.md5 and the image start; the BMS
stays connected, a block page ends it here), BMS disconnect, Bluetooth off, download. A failed download
is reported, then the radio is reset (`ota_failed`).

Decode crash addresses with the ELF that `tools/publish_ota.py` keeps in `dist/`:

```bash
~/.platformio/packages/toolchain-xtensa-esp-elf/bin/xtensa-esp-elf-addr2line -pfiaC -e dist/jk-bms-<version>.elf <addresses>
```

`device` also reports `max_block` (largest free heap block), `control_errors` and `upload_errors`.
`tools/control.py` shows them in `status`. `tools/ota_release.py --wait-healthy <min>` signals an update
only once the board reports the BMS connected and no install in progress.

## Logs

`logs/` holds serial logs from test runs. They include the BMS passcodes printed in the device
info frame, so keep this repository private.
