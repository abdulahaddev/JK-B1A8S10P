# OTA release 1.2.31

**Result:** FAILED: board did not reach 1.2.31 with the BMS connected in time

```
10:00:43  dist/jk-bms-1.2.31.ota.bin (1320640 bytes, md5 6816dd4bfa3937ff78033113ea56d6bc) served by tools/ota_server.py, checked locally
10:00:43  board healthy: fw=1.2.29 ble=1 ota='idle'
10:00:44  control/ota_check = "1.2.31"; waiting for the board's download check
10:01:45  download check: 1.2.31: ok
10:01:45  board healthy: fw=1.2.29 ble=1 ota='idle'
10:01:45  control/ota = "1.2.31"; watching device every 30s for up to 25 min
10:01:46  device @10:01:18: fw=1.2.29 ota='idle' reset=deep_sleep uptime=12897s ble=1 bms_rssi=-73
10:05:18  device @10:05:12: fw=1.2.29 ota='download failed 1.2.31 (error 0x12)' reset=deep_sleep uptime=13131s ble=0 bms_rssi=-73
10:05:18  update not installed: download failed 1.2.31 (error 0x12)
10:05:18  control/ota and control/ota_check removed
10:05:18  FAILED: board did not reach 1.2.31 with the BMS connected in time
```
