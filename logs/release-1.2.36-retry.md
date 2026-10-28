# OTA release 1.2.36

**Result:** FAILED: board did not reach 1.2.36

```
00:24:21  ota_server.py serves jk-bms-1.2.36.ota.bin (1317760 bytes), md5 ab3ce91efebba233090e7902153e7eec, image starts with 0xE9
00:24:22  control/restart = "1793211861" (uptime before 392s)
00:25:13  restarted: uptime=10s reset=deep_sleep
00:25:14  board healthy: fw=1.2.34 ble=1 ota='idle'
00:25:15  control/ota = "1.2.36"; watching every 30s
00:25:15  device @00:25:03: fw=1.2.34 ota='idle' reset=deep_sleep uptime=10s ble=1 bms_rssi=-84
00:25:45  device @00:25:42: fw=1.2.34 ota='update 1.2.36: file ok' reset=deep_sleep uptime=49s ble=1 bms_rssi=-84
00:26:15  device @00:25:46: fw=1.2.34 ota='update 1.2.36: BMS disconnected' reset=deep_sleep uptime=53s ble=0 bms_rssi=-84
00:28:47  device @00:28:26: fw=1.2.34 ota='download failed 1.2.36 (error 0x12 at 2 %, after 131 s)' reset=deep_sleep uptime=3s ble=0 bms_rssi=-80
00:28:47  update not installed: download failed 1.2.36 (error 0x12 at 2 %, after 131 s)
00:28:48  control/ota and control/restart removed
00:28:48  FAILED: board did not reach 1.2.36
```
