# Backlog

## Firmware 1.2.28 plan (next)

1. **OTA host from Firebase, allowed domains only.** `control/ota_host` holds the base URL (any
   subdomain or path, e.g. `https://ota.wafacredence.com/fw`). The firmware accepts it only if
   it is `https://` and its host is exactly, or a subdomain of, a compiled-in domain:
   `nabatechworld.com`, `wafacredence.com`. Match on the parsed host only: `host == d` or
   `host` ends with `"." + d` (so `evilwafacredence.com` and `wafacredence.com.evil.net` are
   refused); no userinfo (`user@`), no port other than 443. Missing or refused: set
   `ota_status = "update refused: no/unknown OTA host"`, DELETE `control/ota`, stop. The OTA login
   stays compiled in (never in Firebase: the database rules are open). The allow-list is what keeps
   anyone with write access to `control` from installing their own firmware.
2. **Single OTA attempt.** No retry counter, backoff or per-version failed-try bookkeeping: one
   download per signal, then the board DELETEs `control/ota` itself and reports the result in
   `ota_status`. Re-signal to try again. (Rollback after a failed confirmation stays.)
3. **On-demand download check instead of the boot check.** Remove the every-30-s-for-15-min check
   of the board's own `.md5` (`ota_source_ok`, `device/ota_source`): up to ~30 logged-in requests
   per boot when it fails, which bot protection reads as a bot. New: `control/ota_check = "<version>"`
   (optionally with `ota_host`): at its next control read the board GETs that version's `.md5` once
   and writes `device/ota_check = "<version>: ok"` or the exact failure (HTTP status, content type,
   size, or DNS/connect/TLS), then DELETEs `control/ota_check`. Skipped while an install or radio
   reset runs. Dashboard: "Check download" button in the Remote Control dialog, result in its
   console; Install stays the separate step.
4. **Pause uploads from the moment an update is accepted** (not only while `ota_install` runs):
   the queue stays as it is and uploads after the reboot (or after a failed attempt). Replaces the
   1.2.27 "wait for an empty backlog" gate, see the note below.
5. **Control read interval from Firebase.** `control/check_s` (seconds) sets how often the board
   reads `control`: clamped to 30 s .. 3600 s; missing or invalid = 300 s. Not stored in flash:
   every boot starts at 300 s and picks the value up at its first read (which runs ~30 s after
   WiFi and time are up, instead of 5 min after boot, so a restarted board is reachable at once).
   The board reports the interval in use as `device/control_s`. The fixed `ota_check_interval`
   becomes a 10 s ticker comparing `millis()` with the last read, like the upload timing. Each read
   is one HTTPS GET (~2-5 s of blocked loop), so 30 s is for testing; restart and update requests
   take effect within one interval. Dashboard: interval selector (30 s / 5 min / 15 min / 1 h) in
   the Remote Control dialog.
6. **Commands clear themselves through the board.** Every command the board acts on is removed
   from `control` by the board once handled, success or failure, with the result in `device/`:
   - `restart`: DELETE `control/restart`, then restart (the restart_hash in flash still prevents a
     second restart if the DELETE fails); `boots/` records `restart_cause: remote` as now.
   - `ota`: failed download or refused host: DELETE at once, result in `ota_status`. Success: the
     board reboots straight from the flash, so the new firmware DELETEs `control/ota` at its
     confirmation (first good upload) if it still names its own version; a rolled-back board
     DELETEs it at its first control read and reports "rolled back".
   - `ota_check`: DELETE after the check (item 3).
   - `check_s` is a setting, not a command: it stays.
   Delete only what was handled: GET control with `X-Firebase-ETag: true`, DELETE with `if-match`
   that ETag, so a command written in between is not lost (on a 412 the board re-reads next time).
   Dashboard and tools/ota_release.py keep clearing too, as a fallback.
7. **WiFi / upload diagnostics (current values, no history):** last WiFi disconnect reason code
   and when; stage of the last failed upload (DNS / connect / TLS / HTTP status); the BMS link's
   own RSSI (ble_client rssi of the connected link) instead of the stale advertisement RSSI.

**Dashboard, in the same release** (Remote Control dialog and Device page; works with 1.2.27
boards too, hiding what they do not report):

- **OTA host:** selector of base URLs under the allowed domains (default from the dev server's
  `ota_base_url`, editable path/subdomain), validated with the same host rule as the firmware
  before anything is written. Install writes `control/ota_host` together with `control/ota`.
- **Firmware list per host:** the `/ota-site` proxy targets the selected host (allowed domains
  only, login from `secrets.yaml` per host); the localStorage cache is kept per host; Sync stays
  manual (bot protection).
- **Check download:** button next to Install; writes `control/ota_check`, shows
  `device/ota_check` in the console when the board answers. Install stays a separate step.
- **Command lifecycle in the console:** sent -> picked up by the board -> cleared by the board ->
  result (`ota_status`, `ota_check`, restart seen in `boots/`). A command still pending after two
  control intervals is flagged ("board has not read it yet").
- **Control interval:** selector 30 s / 5 min / 15 min / 1 h writing `control/check_s`; shows the
  interval in use (`device/control_s`) and when the next read is due, so "how long until it acts"
  is visible. Warn when 30 s is left on.
- **Single attempt:** no "try n/5" wording; a failed install shows the reason and an Install again
  button.
- **Device page:** last WiFi disconnect reason (with a readable name for the code) and time, stage
  of the last failed upload, BMS link RSSI (live) instead of the advertisement RSSI; drop
  `ota_source`.

Backlog gate note: the queue is static memory (RTC ring 280 + RAM ring 580), so draining it frees
no heap. Its only real risk is the reboot after flashing: the RTC ring (newest 280, ~2.3 h)
survives a software restart, the RAM ring (older readings) does not. So before installing, only
wait while the RAM ring is not empty (uploads drain it first, oldest-first), at most 30 min; with
<= 280 queued, install at once with uploads paused.

## OTA-first memory handling (waiting)

When the update signal is read, the update gets priority over everything else:

1. Set an `ota_active` flag at once. Uploads, info/energy uploads and control checks skip while it is
   set; the display shows "OTA...".
2. Free memory in order: stop the BLE scan, clean disconnect, `ble.disable`, then wait until free heap
   and the largest free block are above a threshold (about 45 KB / 30 KB).
3. If memory is still short after ~10 s: store the target version in RTC memory and restart into an
   OTA-first boot (BLE off, uploads paused), connect WiFi, flash, and only then start normally.

The telemetry buffer is static memory (RTC ring + static RAM array), not heap, so it is kept: the RTC
readings survive the reboot and upload afterwards. On a download error the existing `on_error` turns
BLE and uploads back on; bootloader rollback still guards against a bad image.

## Upload batch recalibration (waiting)

The batch formula still assumes ~34 KB for a TLS session (measured before the 1.2.8 mbedTLS dynamic
buffers) plus a 24 KB reserve, so at ~54 KB free heap it sends 1-2 readings per request and a Q32 queue
takes ~15 min to clear. Recalibrate (TLS ~20 KB, reserve ~16 KB -> ~10 per batch), flash, and check
min_free_heap stays above ~20 KB during the next catch-up.

## Remote charging / discharging switches (deferred)

The firmware already has the jk_bms_ble `charging`, `discharging` and `balancer` switches (they write
the BMS setting register over BLE), but nothing triggers them: no api / web_server / mqtt, and no
`control` command. Only their states are reported (`info/charging_switch` etc.).

Safety: **the ESP32 is powered from the BMS output.** Discharging off cuts the board's own power, and
nothing can switch it back on remotely. So a remote "discharging off" is not allowed (the firmware
must refuse it) unless the board gets a separate supply. Charging off only with a confirmation and an
automatic switch-back after a set time, so a forgotten switch cannot run the battery flat. Each
change reported in `device/` and kept in a small history (who / when / what).

## Hourly summaries for a "Last month" graph range (waiting)

The dashboard's range dropdown offers Last hour / day / week from raw readings (~2,880 a day, ~300 B
each: a week is ~6 MB, a month would be ~26 MB per load). For a month, the board would write one
`hourly/<ts>` record per hour next to the energy counter: min / avg / max of SOC, voltage, current,
power, cell spread and temperatures (720 records, ~200 KB a month), charted as min-max bands with
the average line. History starts from the release that adds it.

## Reuse the TLS connection between uploads (waiting)

Every upload opens a new TLS connection to Firebase; the handshake (several round trips plus key
exchange) costs more radio time and main-loop blocking than the readings themselves. ESPHome's
`http_request` closes the connection after each request, so keeping it open needs a custom
component on `esp_http_client` (keep-alive, reconnect on error, close before OTA and radio resets so
the download gets the memory). Check the heap held by an idle open session against the OTA reserve.

## Remote-only safety rules (from the 1.2.23-1.2.25 night)

Every remote step must have a remote way back before it is taken:

- Never change control/ota while an update is in flight; wait for the board to report the result.
- The bridge must accept control/restart and must fall back to the previous full firmware by itself
  if it installs nothing within ~30 min (keep the previous app slot; do not confirm the bridge
  until the target is downloaded, or write the full image back from a second partition).
- A failed confirmation check must never roll back a firmware that runs and uploads.
- Two download sources (hosting + a second host), so one site's bot protection cannot strand the board.
