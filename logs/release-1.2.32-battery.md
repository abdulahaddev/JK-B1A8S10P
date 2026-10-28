# OTA release 1.2.32 (the new OTA host)

**Result:** FAILED: board did not reach 1.2.32 with the BMS connected in time

```
02:44:23  files uploaded over FTPS to the new OTA host and read back through its login: md5 0172ee08adc58fa0a5f42983e5684918
02:44:24  control/ota_host = new host; control/restart = "1793133864" (uptime before 393s)
02:44:55  restarted: uptime=11s reset=deep_sleep
02:44:56  board healthy: fw=1.2.31 ble=1 ota='idle'
02:44:56  control/ota_check = "1.2.32"; waiting for the board's download check
02:46:19  download check: 1.2.32: ok
02:46:19  control/ota = "1.2.32"; watching device every 30s for up to 25 min
02:46:20  device @02:46:13: fw=1.2.31 ota='idle' reset=deep_sleep uptime=91s ble=1 bms_rssi=-51
02:47:20  device @02:47:13: fw=1.2.31 ota='idle' reset=deep_sleep uptime=151s ble=1 bms_rssi=-51
02:47:51  device @02:47:33: fw=1.2.31 ota='downloading 1.2.32' reset=deep_sleep uptime=171s ble=0 bms_rssi=-51
02:48:51  device @02:48:27: fw=1.2.31 ota='download failed 1.2.32 (error 0x12 at 14 %, after 12 s)' reset=deep_sleep uptime=226s ble=0 bms_rssi=-54
02:48:51  update not installed: download failed 1.2.32 (error 0x12 at 14 %, after 12 s)
02:48:52  control/ota, ota_check and restart removed
02:48:52  FAILED: board did not reach 1.2.32 with the BMS connected in time
```
