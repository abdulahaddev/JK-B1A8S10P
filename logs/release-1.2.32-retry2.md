# OTA release 1.2.32

**Result:** FAILED: board did not reach 1.2.32 with the BMS connected in time

```
02:21:52  control/restart = "1793132511" (uptime before 622s); waiting for the restart (control read every 60 s)
02:22:22  restarted: uptime=3s reset=deep_sleep ota='idle'
02:22:22  control/restart removed
02:22:23  board healthy: fw=1.2.31 ble=1 ota='idle'
02:22:23  control/ota = "1.2.32"; watching device every 30s for up to 25 min
02:22:24  device @02:22:20: fw=1.2.31 ota='idle' reset=deep_sleep uptime=3s ble=1 bms_rssi=-54
02:22:54  device @02:22:51: fw=1.2.31 ota='update accepted 1.2.32' reset=deep_sleep uptime=33s ble=1 bms_rssi=-54
02:23:24  device @02:23:02: fw=1.2.31 ota='downloading 1.2.32' reset=deep_sleep uptime=44s ble=0 bms_rssi=-54
02:26:26  device @02:25:57: fw=1.2.31 ota='download failed 1.2.32 (error 0x12 at 1 %, after 166 s)' reset=deep_sleep uptime=219s ble=0 bms_rssi=-54
02:26:26  update not installed: download failed 1.2.32 (error 0x12 at 1 %, after 166 s)
02:26:27  control/ota and control/restart removed
02:26:27  FAILED: board did not reach 1.2.32 with the BMS connected in time
```
