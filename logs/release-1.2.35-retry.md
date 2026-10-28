# OTA release 1.2.35

**Result:** FAILED: board did not reach 1.2.35

```
23:54:48  ota_server.py serves jk-bms-1.2.35.ota.bin (1317440 bytes), md5 1686b44350110c6bbce4a38fb18dd780, image starts with 0xE9
23:54:49  control/restart = "1793210088" (uptime before 1085s)
23:56:01  restarted: uptime=4s reset=deep_sleep
23:56:01  waiting for a healthy board: ble=0 ota='idle' boot=12 queued=2
23:57:02  board healthy: fw=1.2.34 ble=1 ota='idle'
23:57:03  control/ota = "1.2.35"; watching every 30s
23:57:03  device @23:56:33: fw=1.2.34 ota='idle' reset=deep_sleep uptime=44s ble=1 bms_rssi=-80
23:57:33  device @23:57:23: fw=1.2.34 ota='idle' reset=deep_sleep uptime=94s ble=1 bms_rssi=-80
23:58:03  device @23:58:00: fw=1.2.34 ota='downloading 1.2.35' reset=deep_sleep uptime=130s ble=0 bms_rssi=-80
00:02:06  device @00:01:49: fw=1.2.34 ota='update refused: check failed for 1.2.35 (.md5: HTTP 200, , 0 bytes)' reset=deep_sleep uptime=70s ble=0 bms_rssi=-80
00:02:06  update not installed: update refused: check failed for 1.2.35 (.md5: HTTP 200, , 0 bytes)
00:02:07  control/ota and control/restart removed
00:02:07  FAILED: board did not reach 1.2.35
```
