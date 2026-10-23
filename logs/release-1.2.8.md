# OTA release 1.2.8

**Result:** OK: board runs 1.2.8 with the BMS connected

```
06:37:22  release 1.2.8 -> 1.2.8
06:37:52  built jk-bms-1.2.8.ota.bin (1302368 bytes, md5 53ca1c2b368ab7cfefacb5a3660b5c25)
06:37:52  board before: fw=1.2.7 ble=1 last_seen=06:37:48
06:37:57  FTPS uploaded jk-bms-1.2.8.ota.bin: server size 1302368 (local 1302368)
06:37:58  FTPS uploaded jk-bms-1.2.8.ota.bin.md5: server size 32 (local 32)
06:38:02  site serves jk-bms-1.2.8.ota.bin (1302368 bytes), md5 matches
06:38:02  control/ota = "1.2.8"; watching device every 30s for up to 25 min
06:38:02  device @06:37:48: fw=1.2.7 ota='idle' reset=deep_sleep uptime=1406s ble=1 bms_rssi=-58
06:56:17  device read failed: The read operation timed out
06:56:48  device @06:56:42: fw=1.2.8 ota='verifying 1.2.8' reset=software uptime=22s ble=1 bms_rssi=-52
06:56:49  control/ota removed
06:56:49  OK: board runs 1.2.8 with the BMS connected
```
