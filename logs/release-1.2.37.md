# OTA release 1.2.37

**Result:** OK: board runs 1.2.37 with the BMS connected

```
00:43:28  ota_server.py serves jk-bms-1.2.37.ota.bin (1317840 bytes), md5 2bcf873d88e1239f9120af5012e3cc90, image starts with 0xE9
00:43:29  control/restart = "1793213009" (uptime before 583s)
00:44:42  restarted: uptime=10s reset=deep_sleep
00:44:43  board healthy: fw=1.2.36 ble=1 ota='idle'
00:44:43  control/ota = "1.2.37"; watching every 30s
00:44:43  device @00:44:35: fw=1.2.36 ota='idle' reset=deep_sleep uptime=10s ble=1 bms_rssi=-80
00:45:44  device @00:45:38: fw=1.2.36 ota='downloading 1.2.37' reset=deep_sleep uptime=73s ble=0 bms_rssi=-80
00:48:15  device @00:48:14: fw=1.2.37 ota='verifying 1.2.37' reset=software uptime=40s ble=0 bms_rssi=-83
00:48:46  device @00:48:37: fw=1.2.37 ota='idle' reset=deep_sleep uptime=11s ble=1 bms_rssi=-75
00:50:50  control/ota and control/restart removed
00:50:50  OK: board runs 1.2.37 with the BMS connected
```
