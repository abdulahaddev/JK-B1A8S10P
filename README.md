# JK-B1A8S10P ESP32 monitor

ESPHome firmware that reads a JK-B1A8S10P BMS over Bluetooth LE, shows it on a 0.96" SSD1306
OLED and uploads it to a Firebase Realtime Database.

The `jk_bms_ble` component comes from [syssi/esphome-jk-bms](https://github.com/syssi/esphome-jk-bms),
pinned to the commit this project was tested with (see `external_components` in each config).

## Configs

| File | What it does |
|---|---|
| `my-jk-bms-firebase.yaml` | Main firmware: BLE + OLED + WiFi + Firebase upload |
| `my-jk-bms-display.yaml` | BLE + OLED + WiFi, no upload |
| `my-jk-bms-wifi.yaml` | BLE + WiFi + status LEDs |
| `my-jk-bms-led.yaml` | BLE + status LEDs, no WiFi |
| `my-jk-bms.yaml` | Minimal BLE-only config |

## Setup

1. Copy `secrets.example.yaml` to `secrets.yaml` and fill in WiFi and Firebase values.
   `secrets.yaml` is git-ignored.
2. Set `bms_mac_address` in the config to your BMS.
3. Flash and watch the log:

```bash
esphome run my-jk-bms-firebase.yaml --device COM8
```

## Logs

`logs/` holds serial logs from test runs. They include the BMS passcodes printed in the device
info frame, so keep this repository private.
