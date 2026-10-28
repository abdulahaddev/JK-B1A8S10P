# OTA release 1.2.32

**Result:** FAILED: board did not reach 1.2.32 with the BMS connected in time

```
02:01:39  control/restart = "1793131299" (uptime before 605s); waiting for the restart (control read every 60 s)
02:04:41  restarted: uptime=11s reset=deep_sleep ota='idle'
02:04:41  control/restart removed
02:04:42  board healthy: fw=1.2.31 ble=1 ota='idle'
02:04:42  control/ota = "1.2.32"; watching device every 30s for up to 25 min
02:04:42  device @02:04:29: fw=1.2.31 ota='idle' reset=deep_sleep uptime=11s ble=1 bms_rssi=-54
02:05:13  device @02:05:09: fw=1.2.31 ota='downloading 1.2.32' reset=deep_sleep uptime=51s ble=0 bms_rssi=-54
02:08:15  device @02:07:58: fw=1.2.31 ota='download failed 1.2.32 (error 0x12 at 3 %, after 156 s)' reset=deep_sleep uptime=220s ble=0 bms_rssi=-70
02:08:15  update not installed: download failed 1.2.32 (error 0x12 at 3 %, after 156 s)
02:08:15  control/ota and control/restart removed
02:08:15  FAILED: board did not reach 1.2.32 with the BMS connected in time
```
