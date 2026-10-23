#pragma once
// Deep sleep with both radios stopped first.
//
// esp_deep_sleep_start() while BLE and WiFi are still running can deadlock in the PHY shutdown
// (phy_close_rf -> phy_enter_critical spinlock) and end in an interrupt watchdog reset instead of a
// sleep. That reset is a software reset, which asks for another radio reset: a crash loop. Seen with
// crash reports from 1.2.13 (crashes/ in Firebase), decoded:
//   esp_deep_sleep_start -> esp_sleep_start -> phy_close_rf -> phy_enter_critical -> spinlock_acquire

#include <cstdint>
#include <esp_bt.h>
#include <esp_bt_main.h>
#include <esp_sleep.h>
#include <esp_wifi.h>

inline void radio_sleep(uint32_t us) {
  if (esp_bluedroid_get_status() == ESP_BLUEDROID_STATUS_ENABLED) esp_bluedroid_disable();
  if (esp_bluedroid_get_status() == ESP_BLUEDROID_STATUS_INITIALIZED) esp_bluedroid_deinit();
  if (esp_bt_controller_get_status() == ESP_BT_CONTROLLER_STATUS_ENABLED) esp_bt_controller_disable();
  if (esp_bt_controller_get_status() == ESP_BT_CONTROLLER_STATUS_INITED) esp_bt_controller_deinit();
  esp_wifi_disconnect();
  esp_wifi_stop();
  esp_sleep_enable_timer_wakeup(us);
  esp_deep_sleep_start();
}
