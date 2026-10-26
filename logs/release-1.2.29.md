# OTA release 1.2.29

**Result:** FAILED: board did not reach 1.2.29 with the BMS connected in time

```
05:02:12  files in dist/ served by tools/ota_server.py via the OTA host; board-style fetch verified: md5 f06348262eeee28768c1076732f74fa6
05:02:12  board healthy: fw=1.2.28 ble=1 ota='idle'
05:02:13  control/ota = "1.2.29"; watching device every 30s for up to 25 min
05:02:13  device @05:01:38: fw=1.2.28 ota='idle' reset=deep_sleep uptime=3263s ble=1 bms_rssi=-51
05:02:43  device @05:02:38: fw=1.2.28 ota='idle' reset=deep_sleep uptime=3323s ble=1 bms_rssi=-51
05:04:44  device @05:04:27: fw=1.2.28 ota='download failed 1.2.29 (error 0x12)' reset=deep_sleep uptime=3433s ble=0 bms_rssi=-51
05:04:44  update not installed: download failed 1.2.29 (error 0x12)
05:04:45  control/ota removed
05:04:45  FAILED: board did not reach 1.2.29 with the BMS connected in time
```
