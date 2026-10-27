# OTA release 1.2.31

**Result:** OK: board runs 1.2.31 with the BMS connected

```
10:06:31  control/restart = "1793073991" (uptime before 13201s); waiting for the restart (control read every 60 s)
10:08:02  restarted: uptime=5s reset=deep_sleep ota='idle'
10:08:03  control/restart removed
10:08:03  waiting for a healthy board: ble=0 ota='idle' boot=17 queued=0
10:08:33  board healthy: fw=1.2.29 ble=1 ota='idle'
10:08:34  control/ota = "1.2.31"; watching device every 30s for up to 25 min
10:08:34  device @10:08:05: fw=1.2.29 ota='idle' reset=deep_sleep uptime=36s ble=1 bms_rssi=-55
10:09:34  device @10:09:05: fw=1.2.29 ota='idle' reset=deep_sleep uptime=96s ble=1 bms_rssi=-55
10:11:36  device @10:11:13: fw=1.2.31 ota='verifying 1.2.31' reset=software uptime=12s ble=1 bms_rssi=-56
10:11:36  control/ota and control/restart removed
10:11:36  OK: board runs 1.2.31 with the BMS connected
```
