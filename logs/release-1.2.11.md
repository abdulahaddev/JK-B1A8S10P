# OTA release 1.2.11

**Result:** OK: board runs 1.2.11 with the BMS connected

```
09:30:17  release 1.2.11 -> 1.2.11
09:32:12  built jk-bms-1.2.11.ota.bin (1304304 bytes, md5 5afffe9ed092a773fa6cd0fe7d243edf)
09:32:13  board before: fw=1.2.10 ble=1 last_seen=09:32:05
09:32:16  FTPS uploaded jk-bms-1.2.11.ota.bin: server size 1304304 (local 1304304)
09:32:17  FTPS uploaded jk-bms-1.2.11.ota.bin.md5: server size 32 (local 32)
09:32:26  site serves jk-bms-1.2.11.ota.bin (1304304 bytes), md5 matches
09:32:26  board healthy: fw=1.2.10 ble=1 ota='idle'
09:32:27  control/ota = "1.2.11"; watching device every 30s for up to 25 min
09:32:27  device @09:32:05: fw=1.2.10 ota='idle' reset=deep_sleep uptime=736s ble=1 bms_rssi=-83
09:32:58  device @09:32:45: fw=1.2.10 ota='idle' reset=deep_sleep uptime=776s ble=1 bms_rssi=-83
09:33:28  device @09:33:15: fw=1.2.10 ota='idle' reset=deep_sleep uptime=806s ble=1 bms_rssi=-83
09:33:58  device @09:33:45: fw=1.2.10 ota='idle' reset=deep_sleep uptime=836s ble=1 bms_rssi=-83
09:34:29  device @09:34:05: fw=1.2.10 ota='idle' reset=deep_sleep uptime=856s ble=1 bms_rssi=-83
09:35:00  device @09:34:35: fw=1.2.10 ota='idle' reset=deep_sleep uptime=886s ble=1 bms_rssi=-83
09:36:01  device @09:35:58: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=969s ble=1 bms_rssi=-84
09:36:32  device @09:36:18: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=989s ble=1 bms_rssi=-84
09:37:02  device @09:36:38: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=1009s ble=1 bms_rssi=-84
09:37:32  device @09:37:19: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=1050s ble=1 bms_rssi=-84
09:38:03  device @09:37:39: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=1070s ble=1 bms_rssi=-84
09:38:33  device @09:38:09: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=1100s ble=1 bms_rssi=-84
09:39:04  device @09:38:39: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=1130s ble=1 bms_rssi=-84
09:39:34  device @09:39:09: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=1160s ble=1 bms_rssi=-84
09:40:04  device @09:39:39: fw=1.2.10 ota='download failed 1.2.11 (try 1/3)' reset=deep_sleep uptime=1190s ble=1 bms_rssi=-84
09:45:39  device @09:44:50: fw=1.2.10 ota='download failed 1.2.11 (try 2/3)' reset=deep_sleep uptime=1501s ble=0 bms_rssi=-76
09:49:13  device @09:49:04: fw=1.2.10 ota='download failed 1.2.11 (try 2/3)' reset=deep_sleep uptime=1755s ble=0 bms_rssi=-76
09:50:44  device @09:50:14: fw=1.2.10 ota='download failed 1.2.11 (try 2/3)' reset=deep_sleep uptime=1825s ble=0 bms_rssi=-76
09:54:20  device @09:54:06: fw=1.2.11 ota='verifying 1.2.11' reset=software uptime=149s ble=0 bms_rssi=-92
09:55:21  device @09:55:10: fw=1.2.11 ota='idle' reset=deep_sleep uptime=40s ble=1 bms_rssi=-84
09:55:22  control/ota removed
09:55:22  OK: board runs 1.2.11 with the BMS connected
```
