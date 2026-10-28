# OTA 1.2.32 -> 1.2.25

**Result:** FAILED: board did not reach 1.2.25

```
20:17:17  control/ota = "1.2.25" (from the new OTA host); watching
20:17:17  device @20:16:57: fw=1.2.32 ota='idle' reset=deep_sleep uptime=763s ble=1 bms_rssi=-88
20:17:48  device @20:17:48: fw=1.2.32 ota='downloading 1.2.25' reset=deep_sleep uptime=814s ble=0 bms_rssi=-88
20:18:18  device @20:18:00: fw=1.2.32 ota='download failed 1.2.25 (error 0x80 at 0 %, after 1 s)' reset=deep_sleep uptime=826s ble=0 bms_rssi=-88
20:18:18  update not installed: download failed 1.2.25 (error 0x80 at 0 %, after 1 s)
20:18:18  control/ota removed
20:18:18  FAILED: board did not reach 1.2.25
```
