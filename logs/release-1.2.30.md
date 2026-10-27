# OTA release 1.2.30

**Result:** FAILED: board did not reach 1.2.30 with the BMS connected in time

```
05:48:07  files in dist/ served by tools/ota_server.py via the OTA host; board-style fetch verified: md5 8158c70f7b9447faaae36d3c0ce5acc9
05:48:07  board healthy: fw=1.2.29 ble=1 ota='idle'
05:48:08  control/ota = "1.2.30"; watching device every 30s for up to 25 min
05:48:08  device @05:47:44: fw=1.2.29 ota='idle' reset=deep_sleep uptime=2013s ble=1 bms_rssi=-55
05:49:09  device @05:48:44: fw=1.2.29 ota='idle' reset=deep_sleep uptime=2073s ble=1 bms_rssi=-55
05:50:09  device @05:49:44: fw=1.2.29 ota='idle' reset=deep_sleep uptime=2133s ble=1 bms_rssi=-55
05:51:40  device @05:51:12: fw=1.2.29 ota='download failed 1.2.30 (error 0x12)' reset=deep_sleep uptime=2222s ble=1 bms_rssi=-51
05:51:40  update not installed: download failed 1.2.30 (error 0x12)
05:51:41  control/ota removed
05:51:41  FAILED: board did not reach 1.2.30 with the BMS connected in time
```
