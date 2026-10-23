# Rollback test 1.2.12

**Result:** OK: 1.2.12 installed, never confirmed, rolled back to 1.2.11 with the BMS connected

```
09:55:38  rollback test: running 1.2.11, broken test build 1.2.12
09:57:14  built broken jk-bms-1.2.12.ota.bin; config restored to 1.2.11
09:57:17  FTPS uploaded jk-bms-1.2.12.ota.bin: server size 1304336 (local 1304336)
09:57:18  FTPS uploaded jk-bms-1.2.12.ota.bin.md5: server size 32 (local 32)
09:57:19  control/ota = "1.2.12"
09:57:19  device @09:57:10: fw=1.2.11 ota='idle' reset=deep_sleep cause=after_soft_reset uptime=160s ble=1
09:57:50  device @09:57:40: fw=1.2.11 ota='downloading 1.2.12' reset=deep_sleep cause=after_soft_reset uptime=190s ble=0
10:01:24  device @10:01:20: fw=1.2.12 ota='verifying 1.2.12' reset=software cause=none uptime=61s ble=0
10:11:34  device @10:11:30: fw=1.2.11 ota='rolled back, running 1.2.11' reset=software cause=none uptime=62s ble=0
10:11:34  control/ota removed
10:11:35  broken test files removed from the OTA site
10:11:35  OK: 1.2.12 installed, never confirmed, rolled back to 1.2.11 with the BMS connected
```
