# OTA release 1.2.18

**Result:** OK: board runs 1.2.18 with the BMS connected

```
11:15:43  release 1.2.17 -> 1.2.18
11:17:26  built jk-bms-1.2.18.ota.bin (1304672 bytes, md5 dac309151283065c3caa766a4ee57b1a)
11:17:26  board before: fw=1.2.17 ble=1 last_seen=11:17:06
11:17:32  FTPS uploaded jk-bms-1.2.18.ota.bin: server size 1304672 (local 1304672)
11:17:33  FTPS uploaded jk-bms-1.2.18.ota.bin.md5: server size 32 (local 32)
11:17:44  site serves jk-bms-1.2.18.ota.bin (1304672 bytes), md5 matches
11:17:44  waiting for a healthy board: ble=0 ota='idle' boot=3
11:18:14  board healthy: fw=1.2.17 ble=1 ota='idle'
11:18:15  control/ota = "1.2.18"; watching device every 30s for up to 25 min
11:18:15  device @11:18:06: fw=1.2.17 ota='idle' reset=deep_sleep uptime=221s ble=1 bms_rssi=-91
11:20:18  device @11:19:56: fw=1.2.18 ota='verifying 1.2.18' reset=software uptime=11s ble=0 bms_rssi=-87
11:21:20  device @11:21:09: fw=1.2.18 ota='verifying 1.2.18' reset=software uptime=83s ble=0 bms_rssi=-90
11:22:52  device @11:22:35: fw=1.2.18 ota='idle' reset=deep_sleep uptime=72s ble=1 bms_rssi=-90
11:22:52  control/ota removed
11:22:52  OK: board runs 1.2.18 with the BMS connected
```
