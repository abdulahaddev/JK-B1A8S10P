# OTA release 1.2.17

**Result:** OK: board runs 1.2.17 with the BMS connected

```
11:01:20  release 1.2.16 -> 1.2.17
11:03:06  built jk-bms-1.2.17.ota.bin (1304544 bytes, md5 945c24795ff55603b8daff9e3b49b305)
11:03:07  board before: fw=1.2.16 ble=1 last_seen=11:03:03
11:03:15  FTPS uploaded jk-bms-1.2.17.ota.bin: server size 1304544 (local 1304544)
11:03:16  FTPS uploaded jk-bms-1.2.17.ota.bin.md5: server size 32 (local 32)
11:03:21  site serves jk-bms-1.2.17.ota.bin (1304544 bytes), md5 matches
11:03:21  board healthy: fw=1.2.16 ble=1 ota='idle'
11:03:21  control/ota = "1.2.17"; watching device every 30s for up to 25 min
11:03:22  device @11:03:03: fw=1.2.16 ota='idle' reset=deep_sleep uptime=131s ble=1 bms_rssi=-82
11:04:22  device @11:04:08: fw=1.2.16 ota='download failed 1.2.17 (try 1/5)' reset=deep_sleep uptime=196s ble=0 bms_rssi=-82
11:09:29  device read failed: <urlopen error [Errno 11001] getaddrinfo failed>
11:09:59  device read failed: <urlopen error [Errno 11001] getaddrinfo failed>
11:12:31  device @11:12:01: fw=1.2.16 ota='download failed 1.2.17 (try 1/5)' reset=power_on uptime=80s ble=0 bms_rssi=-89
11:14:35  device @11:14:18: fw=1.2.17 ota='verifying 1.2.17' reset=software uptime=60s ble=0 bms_rssi=-90
11:15:36  device @11:15:16: fw=1.2.17 ota='idle' reset=deep_sleep uptime=51s ble=1 bms_rssi=-88
11:15:37  control/ota removed
11:15:37  OK: board runs 1.2.17 with the BMS connected
```
