# Backlog

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
exchange) costs more radio time and main-loop blocking than the readings themselves. Since 1.2.33 the
requests run in `net_worker.h` on `esp_http_client`, so keep-alive fits there (reconnect on error,
close before OTA and radio resets so the download gets the memory). Check the heap held by an idle open session against the OTA reserve.

## Remote-only safety rules (from the 1.2.23-1.2.25 night)

Every remote step must have a remote way back before it is taken:

- Never change control/ota while an update is in flight; wait for the board to report the result.
- The bridge must accept control/restart and must fall back to the previous full firmware by itself
  if it installs nothing within ~30 min (keep the previous app slot; do not confirm the bridge
  until the target is downloaded, or write the full image back from a second partition).
- A failed confirmation check must never roll back a firmware that runs and uploads.
- Two download sources (hosting + a second host), so one site's bot protection cannot strand the board.
