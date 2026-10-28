# OTA release 1.2.34 (sandbox host)

**Result:** OK: board runs 1.2.34 with the BMS connected

```
21:55:10  jk-bms-1.2.34.ota.bin (1323216 bytes) served from dist/ by tools/ota_server.py via the sandbox host; local read: md5 matches, first byte 0xE9
21:55:10  control/ota = "1.2.34"; watching (1.2.33 reports each step)
21:55:10  device @21:54:20: fw=1.2.33 ota='update refused: check failed for 1.2.34 (.md5: HTTP 200, text/html, 64 bytes)' reset=deep_sleep uptime=1213s ble=1 bms_rssi=-70
21:55:41  device @21:55:29: fw=1.2.33 ota='downloading 1.2.34' reset=deep_sleep uptime=1282s ble=0 bms_rssi=-70
21:56:41  device @21:56:36: fw=1.2.34 ota='verifying 1.2.34' reset=software uptime=15s ble=0 bms_rssi=-82
21:57:12  device @21:57:05: fw=1.2.34 ota='idle' reset=deep_sleep uptime=2s ble=0 bms_rssi=-81
21:58:12  device @21:57:45: fw=1.2.34 ota='idle' reset=deep_sleep uptime=42s ble=1 bms_rssi=-81
21:58:13  control/ota removed by the board itself
21:58:13  control/ota removed
21:58:13  OK: board runs 1.2.34 with the BMS connected
```
