# OTA release 1.2.9

**Result:** FAILED: board did not reach 1.2.9 with the BMS connected in time

```
07:30:31  release 1.2.9 -> 1.2.9
07:31:15  built jk-bms-1.2.9.ota.bin (1304208 bytes, md5 580060e1b016f8cf62dfebab0f92e9ff)
07:31:16  board before: fw=1.2.8 ble=1 last_seen=07:31:09
07:31:26  FTPS uploaded jk-bms-1.2.9.ota.bin: server size 1304208 (local 1304208)
07:31:27  FTPS uploaded jk-bms-1.2.9.ota.bin.md5: server size 32 (local 32)
07:31:34  site serves jk-bms-1.2.9.ota.bin (1304208 bytes), md5 matches
07:31:34  control/ota = "1.2.9"; watching device every 30s for up to 25 min
07:31:35  device @07:31:09: fw=1.2.8 ota='idle' reset=deep_sleep uptime=1635s ble=1 bms_rssi=-53
07:32:05  device @07:31:39: fw=1.2.8 ota='idle' reset=deep_sleep uptime=1665s ble=1 bms_rssi=-53
07:32:35  device @07:32:09: fw=1.2.8 ota='idle' reset=deep_sleep uptime=1695s ble=1 bms_rssi=-53
07:33:06  device @07:32:49: fw=1.2.8 ota='idle' reset=deep_sleep uptime=1735s ble=1 bms_rssi=-53
07:33:36  device @07:33:09: fw=1.2.8 ota='idle' reset=deep_sleep uptime=1755s ble=1 bms_rssi=-53
07:34:07  device @07:33:39: fw=1.2.8 ota='idle' reset=deep_sleep uptime=1785s ble=1 bms_rssi=-53
07:35:08  device @07:34:49: fw=1.2.8 ota='download failed 1.2.9 (try 1/3)' reset=deep_sleep uptime=1855s ble=0 bms_rssi=-75
07:36:09  device @07:35:59: fw=1.2.8 ota='download failed 1.2.9 (try 1/3)' reset=deep_sleep uptime=1925s ble=0 bms_rssi=-75
07:37:10  device @07:37:09: fw=1.2.8 ota='download failed 1.2.9 (try 1/3)' reset=deep_sleep uptime=1995s ble=0 bms_rssi=-75
07:38:41  device @07:38:19: fw=1.2.8 ota='download failed 1.2.9 (try 1/3)' reset=deep_sleep uptime=2065s ble=0 bms_rssi=-75
07:39:43  device @07:39:29: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2135s ble=0 bms_rssi=-75
07:40:43  device @07:40:39: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2205s ble=0 bms_rssi=-75
07:42:15  device @07:41:49: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2275s ble=0 bms_rssi=-75
07:43:16  device @07:42:59: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2345s ble=0 bms_rssi=-75
07:44:17  device @07:44:09: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2415s ble=0 bms_rssi=-75
07:45:48  device @07:45:19: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2485s ble=0 bms_rssi=-75
07:46:49  device @07:46:29: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2555s ble=0 bms_rssi=-75
07:47:50  device @07:47:39: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2625s ble=0 bms_rssi=-75
07:48:51  device @07:48:49: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2695s ble=0 bms_rssi=-75
07:50:22  device @07:49:59: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2765s ble=0 bms_rssi=-75
07:51:23  device @07:51:09: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2835s ble=0 bms_rssi=-75
07:52:24  device @07:52:19: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2905s ble=0 bms_rssi=-75
07:53:56  device @07:53:29: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=2975s ble=0 bms_rssi=-75
07:54:57  device @07:54:39: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=3045s ble=0 bms_rssi=-75
07:55:57  device @07:55:49: fw=1.2.8 ota='downloading 1.2.9' reset=deep_sleep uptime=3115s ble=0 bms_rssi=-75
07:56:59  control/ota removed
07:56:59  FAILED: board did not reach 1.2.9 with the BMS connected in time
```
