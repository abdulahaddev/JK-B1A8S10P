# OTA release 1.2.36

**Result:** FAILED: board did not reach 1.2.36

```
00:15:09  ota_server.py serves jk-bms-1.2.36.ota.bin (1317760 bytes), md5 ab3ce91efebba233090e7902153e7eec, image starts with 0xE9
00:15:10  control/restart = "1793211310" (uptime before 661s)
00:20:20  restarted: uptime=152s reset=deep_sleep
00:20:20  board healthy: fw=1.2.34 ble=1 ota='idle'
00:20:21  control/ota = "1.2.36"; watching every 30s
00:20:21  device @00:20:03: fw=1.2.34 ota='idle' reset=deep_sleep uptime=152s ble=1 bms_rssi=-83
00:21:22  device @00:21:13: fw=1.2.34 ota='idle' reset=deep_sleep uptime=222s ble=1 bms_rssi=-83
00:22:53  device @00:22:43: fw=1.2.34 ota='idle' reset=deep_sleep uptime=312s ble=1 bms_rssi=-83
00:23:53  device @00:23:27: fw=1.2.34 ota='update refused: check failed for 1.2.36 (.md5: HTTP -1, ESP_ERR_HTTP_CONNECT, 0 bytes)' reset=deep_sleep uptime=355s ble=1 bms_rssi=-83
00:23:53  update not installed: update refused: check failed for 1.2.36 (.md5: HTTP -1, ESP_ERR_HTTP_CONNECT, 0 bytes)
00:23:54  control/ota and control/restart removed
00:23:54  FAILED: board did not reach 1.2.36
```
