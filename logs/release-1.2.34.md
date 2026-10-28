# OTA release 1.2.34

**Result:** FAILED: board did not reach 1.2.34

```
21:49:31  jk-bms-1.2.34.ota.bin (1323216 bytes) uploaded over FTPS to the OTA host, read back through the login: md5 matches, first byte 0xE9
21:49:32  control/ota = "1.2.34"; watching (1.2.33 reports each step)
21:49:32  device @21:49:21: fw=1.2.33 ota='idle' reset=deep_sleep uptime=913s ble=1 bms_rssi=-70
21:50:02  device @21:50:03: fw=1.2.33 ota='update refused: check failed for 1.2.34 (.md5: HTTP 200, text/html, 64 bytes)' reset=deep_sleep uptime=956s ble=1 bms_rssi=-70
21:50:02  update not installed: update refused: check failed for 1.2.34 (.md5: HTTP 200, text/html, 64 bytes)
21:50:03  control/ota removed
21:50:03  FAILED: board did not reach 1.2.34
```
