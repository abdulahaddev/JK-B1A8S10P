# OTA release 1.2.38

**Result:** FAILED: board did not reach 1.2.38

```
01:00:19  ota_server.py serves jk-bms-1.2.38.ota.bin (1317856 bytes), md5 dd8f497fbbe884473d14f631a6966990, image starts with 0xE9
01:00:19  control/restart = "1793214019" (uptime before 671s)
01:03:46  restarted: uptime=4s reset=deep_sleep
01:03:46  board healthy: fw=1.2.37 ble=1 ota='idle'
01:03:47  control/ota = "1.2.38"; watching every 30s
01:03:47  device @01:03:28: fw=1.2.37 ota='idle' reset=deep_sleep uptime=4s ble=1 bms_rssi=-73
01:04:18  device @01:04:19: fw=1.2.37 ota='downloading 1.2.38' reset=deep_sleep uptime=56s ble=0 bms_rssi=-73
01:07:20  device @01:07:02: fw=1.2.37 ota='download failed 1.2.38 (error 0x12 at 2 %, after 161 s)' reset=deep_sleep uptime=219s ble=0 bms_rssi=-73
01:07:20  update not installed: download failed 1.2.38 (error 0x12 at 2 %, after 161 s)
01:07:20  control/ota and control/restart removed
01:07:20  FAILED: board did not reach 1.2.38
```
