# OTA release 1.2.27

**Result:** OK in the end: board runs 1.2.27, confirmed 02:44 on 27 Oct. The scripted attempts below failed.

## Outcome (27 Oct, from Firebase boots/ and device/)

- 00:44 and 02:26: the board's downloads failed with 0x80 (first byte not an ESP32 image) while the
  OTA host served it something else; from this PC the same URL returned the real file.
- 02:19: refused at once because 1.2.25 had used all 5 tries on 1.2.27 (counter resets only on a
  restart); remote restart at 02:21, signalled again 02:22, try 1 failed 02:26, signal cleared 02:26:56.
- The host was then pointed (CNAME, Cloudflare tunnel) at tools/ota_server.py on the release PC, with
  the OTA login required; signalled again outside the script.
- 02:44:14 boot 1.2.27 (software reset after flashing); 02:44:44 radio reset after_soft_reset, which
  runs only once the new firmware confirmed itself on its first upload. control/ were empty afterwards.
- First minutes on 1.2.27: upload errors 0, batch limit 2 -> 3, upload ~1.9 s, heap low point 39 KB.

## Scripted attempt at 02:19

```
02:19:44  files already on the OTA site (uploaded 00:27, board-style fetch verified: md5 487451a08af653379ef076830e73b76a)
02:19:45  board healthy: fw=1.2.25 ble=1 ota='download failed 1.2.27 (try 5/5, error 0x80)'
02:19:45  control/ota = "1.2.27"; watching device every 30s for up to 25 min
02:19:45  device @02:19:46: fw=1.2.25 ota='download failed 1.2.27 (try 5/5, error 0x80)' reset=deep_sleep uptime=3823s ble=1 bms_rssi=-72
02:19:45  all download tries failed: download failed 1.2.27 (try 5/5, error 0x80)
02:19:45  control/ota removed
02:19:45  FAILED: board did not reach 1.2.27 with the BMS connected in time
```
