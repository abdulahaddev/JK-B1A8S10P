#pragma once
// Queue of 30 s BMS readings until Firebase has them, and the board's restart bookkeeping.
//
// Readings live in the flash ring of flash_log.h (jklog partition, ~6.3 days): kept through crashes, watchdog
// resets and power loss. Before 1.2.42 they were held in an RTC ring (lost on power loss) and a RAM ring
// (lost on a crash; saved to NVS only before the board's own restarts).
// RTC slow memory keeps the small things written often: boot counter, restart cause, a status note.
//
// Everything is called from ESPHome's main loop, so no locking is needed.

#include <cmath>
#include <cstdint>
#include <cstring>
#include <ctime>
#include <string>
#include "esp_attr.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "flash_log.h"

namespace telemetry {

static const int16_t NO_VALUE = INT16_MIN;  // stored for a NaN sensor, uploaded as "missing"

enum Flags : uint8_t { CHARGING = 1 << 0, DISCHARGING = 1 << 1, BALANCING = 1 << 2 };

struct __attribute__((packed)) Record {  // 28 bytes
  uint32_t ts;               // unix seconds
  uint16_t total_mv;         // total voltage, mV
  int16_t current_10ma;      // current, 10 mA
  uint16_t cell_mv[4];       // cell voltages, mV
  uint16_t capacity_10mah;   // capacity remaining, 0.01 Ah
  uint8_t soc;               // state of charge, %
  int16_t balancing_ma;      // balancing current, mA
  int16_t temp_dc[3];        // MOSFET, sensor 1, sensor 2 in 0.1 degC (NO_VALUE if missing)
  uint8_t flags;             // Flags
};

static_assert(sizeof(Record) <= flog::PAYLOAD, "reading fits a flash slot");
static const uint32_t RTC_MAGIC = 0x4A4B4232;  // "JKB2": the layout without the RTC ring (1.2.42)

// Why the board restarted itself last (kept across deep sleep, reported in device/restart_cause)
enum RestartCause : uint32_t { CAUSE_NONE = 0, CAUSE_REMOTE, CAUSE_SOFT_RESET, CAUSE_BLE_WATCHDOG, CAUSE_WIFI_WATCHDOG,
                            CAUSE_STUCK_SCRIPT, CAUSE_OTA_TIME_LIMIT, CAUSE_NET_WATCHDOG,
                            CAUSE_AFTER_POWER_ON, CAUSE_AFTER_BROWNOUT, CAUSE_OTA_FAILED };  // append only: kept in RTC

struct RtcState {
  uint32_t magic;
  uint32_t boot_count;
  uint32_t watchdog_resets;  // radio resets in a row by the BLE/WiFi watchdog (backoff)
  uint32_t restart_cause;    // RestartCause of the last self-initiated restart
  uint32_t run_uptime_s;     // uptime of the running firmware, updated every 30 s
  uint32_t shutdown_seen;    // 1 = ESPHome ran its shutdown hooks (OTA reboot, safe_reboot)
  char note[96];             // status to show again after our own restart (failed update)
};

RTC_NOINIT_ATTR static RtcState rtc_state;
static uint32_t prev_uptime_s = 0;  // how long the previous run lasted (0 after power-on: unknown)
static bool prev_shutdown = false;  // the previous run ended through ESPHome's shutdown hooks

// Call once at boot: RTC bookkeeping (cleared after power-on) and the flash rings
inline void begin() {
  const bool keep = rtc_state.magic == RTC_MAGIC && esp_reset_reason() != ESP_RST_POWERON &&
                    esp_reset_reason() != ESP_RST_BROWNOUT;
  if (!keep) {
    memset(&rtc_state, 0, sizeof(rtc_state));
    rtc_state.magic = RTC_MAGIC;
  }
  if (rtc_state.watchdog_resets > 16) rtc_state.watchdog_resets = 0;
  if (rtc_state.restart_cause > CAUSE_OTA_FAILED) rtc_state.restart_cause = CAUSE_NONE;
  if (memchr(rtc_state.note, 0, sizeof(rtc_state.note)) == nullptr) rtc_state.note[0] = 0;
  if (rtc_state.run_uptime_s > 60u * 86400u) rtc_state.run_uptime_s = 0;
  if (rtc_state.shutdown_seen > 1) rtc_state.shutdown_seen = 0;
  prev_uptime_s = keep ? rtc_state.run_uptime_s : 0;
  prev_shutdown = keep && rtc_state.shutdown_seen == 1;
  rtc_state.run_uptime_s = 0;
  rtc_state.shutdown_seen = 0;
  rtc_state.boot_count++;
  flog::begin();
}

inline size_t size() { return flog::readings.size(); }
inline uint32_t dropped() { return flog::readings.dropped(); }
inline uint32_t capacity() { return flog::readings.capacity(); }
inline uint32_t boot_count() { return rtc_state.boot_count; }

inline void push(const Record &r) {
  uint8_t p[flog::PAYLOAD] = {};
  memcpy(p, &r, sizeof(r));
  flog::readings.push(p);
}

// i-th oldest reading (0 = oldest), i < size(); ts = 0 if it cannot be read
inline Record peek(size_t i) {
  uint8_t p[flog::PAYLOAD];
  Record r{};
  if (flog::readings.peek((uint32_t) i, p)) memcpy(&r, p, sizeof(r));
  return r;
}

// The newest reading; ts = 0 if none
inline Record newest() {
  uint8_t p[flog::PAYLOAD];
  Record r{};
  if (flog::readings.peek_newest(p)) memcpy(&r, p, sizeof(r));
  return r;
}

// Mark the n oldest readings uploaded
inline void discard(size_t n) { flog::readings.discard((uint32_t) n); }

// Mark the newest reading uploaded, only if it is still the one with timestamp ts
inline bool discard_newest(uint32_t ts) {
  if (newest().ts != ts || ts == 0) return false;
  flog::readings.discard_newest();
  return true;
}

// An event for the flash log (uploaded to events/ like readings)
inline void event(flog::Code code, int32_t a = 0, int32_t b = 0, const char *text = nullptr) {
  flog::Event e{};
  const time_t now = ::time(nullptr);
  e.ts = now > 1700000000 ? (uint32_t) now : 0;
  e.up = (uint32_t) (esp_timer_get_time() / 1000000);
  e.boot = (uint16_t) rtc_state.boot_count;
  e.code = code;
  e.a = a;
  e.b = b;
  if (text != nullptr) strncpy(e.text, text, sizeof(e.text));
  flog::events.push((const uint8_t *) &e);
}

inline uint32_t &watchdog_resets() { return rtc_state.watchdog_resets; }
inline void note_uptime(uint32_t s) { rtc_state.run_uptime_s = s; }
inline void note_shutdown() { rtc_state.shutdown_seen = 1; }

// Record why we restart; read back after the next boot
inline void set_restart_cause(RestartCause c) {
  rtc_state.restart_cause = c;
  event(flog::EV_RESTART, (int32_t) c);
}
// The raw cause kept in RTC (0 after power-on)
inline uint32_t restart_cause_code() { return rtc_state.restart_cause; }

// A status line kept across our own restart, read once after the next boot ("" = none)
inline void set_note(const std::string &s) {
  strncpy(rtc_state.note, s.c_str(), sizeof(rtc_state.note) - 1);
  rtc_state.note[sizeof(rtc_state.note) - 1] = 0;
}
inline std::string take_note() {
  std::string s(rtc_state.note);
  rtc_state.note[0] = 0;
  return s;
}

inline const char *restart_cause() {
  // Only meaningful after a deep sleep wake; any other reset was not one of ours
  if (esp_reset_reason() != ESP_RST_DEEPSLEEP) return "none";
  switch (rtc_state.restart_cause) {
    case CAUSE_REMOTE: return "remote";
    case CAUSE_SOFT_RESET: return "after_soft_reset";
    case CAUSE_BLE_WATCHDOG: return "ble_watchdog";
    case CAUSE_WIFI_WATCHDOG: return "wifi_watchdog";
    case CAUSE_STUCK_SCRIPT: return "stuck_script";
    case CAUSE_OTA_TIME_LIMIT: return "ota_time_limit";
    case CAUSE_NET_WATCHDOG: return "net_watchdog";
    case CAUSE_AFTER_POWER_ON: return "after_power_on";
    case CAUSE_AFTER_BROWNOUT: return "after_brownout";
    case CAUSE_OTA_FAILED: return "ota_failed";
    default: return "none";
  }
}

inline int16_t scaled(float v, float scale) {
  return std::isnan(v) ? NO_VALUE : (int16_t) lroundf(v * scale);
}

inline const char *reset_reason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "power_on";
    case ESP_RST_EXT: return "external";
    case ESP_RST_SW: return "software";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "interrupt_watchdog";
    case ESP_RST_TASK_WDT: return "task_watchdog";
    case ESP_RST_WDT: return "other_watchdog";
    case ESP_RST_DEEPSLEEP: return "deep_sleep";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_SDIO: return "sdio";
    default: return "unknown";
  }
}

}  // namespace telemetry
