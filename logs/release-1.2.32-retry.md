# OTA release 1.2.32

**Result:** FAILED: board did not reach 1.2.32 with the BMS connected in time

```
02:09:58  control/restart = "1793131798" (uptime before 290s); waiting for the restart (control read every 60 s)
02:11:29  restarted: uptime=10s reset=deep_sleep ota='idle'
02:11:29  control/restart removed
02:11:29  board healthy: fw=1.2.31 ble=1 ota='idle'
02:11:30  control/ota = "1.2.32"; watching device every 30s for up to 25 min
02:11:30  device @02:11:19: fw=1.2.31 ota='idle' reset=deep_sleep uptime=10s ble=1 bms_rssi=-51
02:12:01  device @02:11:54: fw=1.2.31 ota='downloading 1.2.32' reset=deep_sleep uptime=46s ble=0 bms_rssi=-51
02:13:01  device @02:12:54: fw=1.2.31 ota='download failed 1.2.32 (error 0x12 at 37 %, after 17 s)' reset=deep_sleep uptime=105s ble=0 bms_rssi=-70
02:13:01  update not installed: download failed 1.2.32 (error 0x12 at 37 %, after 17 s)
02:13:02  control/ota and control/restart removed
02:13:02  FAILED: board did not reach 1.2.32 with the BMS connected in time
```
