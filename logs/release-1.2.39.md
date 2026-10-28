# OTA release 1.2.39

**Result:** OTA FAILED: download failed 1.2.39 (error 0x12 at 1 %, after 158 s). Installed by USB (factory image) afterwards: runs 1.2.39, BMS connected, kept connection active (first handshake 2351 ms, 3 requests reused at 101 s uptime)

```
01:57:01  ota_server.py serves jk-bms-1.2.39.ota.bin (1322000 bytes), md5 e730c54f0160d99c0f1c177b480ea917, image starts with 0xE9
01:57:01  control/restart = "1793217421" (uptime before 1514s)
01:57:43  restarted: uptime=13s reset=deep_sleep
01:57:43  board healthy: fw=1.2.38 ble=1 ota='idle'
01:57:44  control/ota = "1.2.39"; watching every 30s
01:57:44  device @01:57:33: fw=1.2.38 ota='idle' reset=deep_sleep uptime=13s ble=1 bms_rssi=-85
01:58:14  device @01:58:12: fw=1.2.38 ota='update 1.2.39: file ok' reset=deep_sleep uptime=52s ble=1 bms_rssi=-85
01:58:45  device @01:58:20: fw=1.2.38 ota='downloading 1.2.39' reset=deep_sleep uptime=61s ble=0 bms_rssi=-85
(watcher stopped here; checked by hand afterwards)
02:03:xx  device: fw=1.2.38 ota='download failed 1.2.39 (error 0x12 at 1 %, after 158 s)' restart_cause=ota_failed uptime=32s ble=1; control/ota removed by the board
```
