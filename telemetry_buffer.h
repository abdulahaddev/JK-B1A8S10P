#pragma once
// Offline buffer for 30s BMS readings while WiFi/Firebase is unreachable.
//
// Newest readings live in RTC slow memory (RTC_NOINIT_ATTR), which survives software
// reboots (watchdog, WiFi reboot_timeout, restart) but not power loss. When the RTC ring is
// full its oldest reading moves to a larger RAM ring, which the board saves to NVS before its
// own restarts (save_ram / restore_ram); a crash or power loss still loses it.
// Uploads always take the oldest readings first (RAM, then RTC).
//
// Everything is called from ESPHome's main loop, so no locking is needed.

#include <cmath>
#include <cstdint>
#include "esp_attr.h"
#include "esp_system.h"
#include "nvs.h"

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

static const size_t RTC_CAPACITY = 280;  // 7.9 KB of the 8 KB RTC slow memory (8168 B usable, 7860 B used)
static const size_t RAM_CAPACITY = 580;  // 16.2 KB
static const uint32_t RTC_MAGIC = 0x4A4B4231;  // "JKB1"

template<size_t N> struct Ring {
  Record items[N];
  uint16_t head;  // index of the oldest record
  uint16_t count;

  bool full() const { return count == N; }
  const Record &at(size_t i) const { return items[(head + i) % N]; }
  void push(const Record &r) {  // overwrites the oldest record when full
    items[(head + count) % N] = r;
    if (count < N) count++;
    else head = (head + 1) % N;
  }
  Record pop() {
    Record r = items[head];
    head = (head + 1) % N;
    count--;
    return r;
  }
  void pop_back() { count--; }  // drop the newest record (count > 0)
  bool valid() const { return head < N && count <= N; }
};

// Why the board restarted itself last (kept across deep sleep, reported in device/restart_cause)
enum RestartCause : uint32_t { CAUSE_NONE = 0, CAUSE_REMOTE, CAUSE_SOFT_RESET, CAUSE_BLE_WATCHDOG, CAUSE_WIFI_WATCHDOG,
                            CAUSE_STUCK_SCRIPT, CAUSE_OTA_TIME_LIMIT, CAUSE_NET_WATCHDOG };  // append only: kept in RTC across updates

struct RtcState {
  uint32_t magic;
  uint32_t boot_count;
  Ring<RTC_CAPACITY> ring;
  uint32_t watchdog_resets;  // radio resets in a row by the BLE/WiFi watchdog (backoff); appended
  uint32_t restart_cause;    // RestartCause of the last self-initiated restart; appended
  uint32_t run_uptime_s;     // uptime of the running firmware, updated every 30 s; appended in 1.2.23
  uint32_t shutdown_seen;    // 1 = ESPHome ran its shutdown hooks (OTA reboot, safe_reboot); appended in 1.2.23
};

RTC_NOINIT_ATTR static RtcState rtc_state;
static uint32_t prev_uptime_s = 0;  // how long the previous run lasted (0 after power-on: unknown)
static bool prev_shutdown = false;  // the previous run ended through ESPHome's shutdown hooks
static Ring<RAM_CAPACITY> ram_ring;
static uint32_t dropped = 0;  // readings overwritten because both rings were full

// Call once at boot. Keeps the RTC ring across software reboots, clears it after power-on.
inline void begin() {
  bool keep = rtc_state.magic == RTC_MAGIC && rtc_state.ring.valid() &&
              esp_reset_reason() != ESP_RST_POWERON && esp_reset_reason() != ESP_RST_BROWNOUT;
  if (!keep) {
    rtc_state.magic = RTC_MAGIC;
    rtc_state.boot_count = 0;
    rtc_state.ring.head = 0;
    rtc_state.ring.count = 0;
    rtc_state.watchdog_resets = 0;
    rtc_state.restart_cause = CAUSE_NONE;
    rtc_state.run_uptime_s = 0;
    rtc_state.shutdown_seen = 0;
  }
  // Fields appended in 1.2.8 are garbage on the first boot after updating from an older firmware
  if (rtc_state.watchdog_resets > 16) rtc_state.watchdog_resets = 0;
  if (rtc_state.restart_cause > CAUSE_NET_WATCHDOG) rtc_state.restart_cause = CAUSE_NONE;
  if (rtc_state.run_uptime_s > 60u * 86400u) rtc_state.run_uptime_s = 0;
  if (rtc_state.shutdown_seen > 1) rtc_state.shutdown_seen = 0;
  prev_uptime_s = keep ? rtc_state.run_uptime_s : 0;
  prev_shutdown = keep && rtc_state.shutdown_seen == 1;
  rtc_state.run_uptime_s = 0;
  rtc_state.shutdown_seen = 0;
  rtc_state.boot_count++;
  ram_ring.head = 0;
  ram_ring.count = 0;
}

inline size_t size() { return ram_ring.count + rtc_state.ring.count; }
// Readings in the RAM ring: the older part of the queue, lost on any reboot (an OTA install included)
inline size_t ram_size() { return ram_ring.count; }
inline uint32_t boot_count() { return rtc_state.boot_count; }

inline void push(const Record &r) {
  if (rtc_state.ring.full()) {
    if (ram_ring.full()) dropped++;
    ram_ring.push(rtc_state.ring.pop());
  }
  rtc_state.ring.push(r);
}

// i-th oldest record (0 = oldest), i < size()
inline const Record &peek(size_t i) {
  return i < ram_ring.count ? ram_ring.at(i) : rtc_state.ring.at(i - ram_ring.count);
}

// Remove the n oldest records after they were uploaded
inline void discard(size_t n) {
  for (; n > 0 && size() > 0; n--) {
    if (ram_ring.count > 0) ram_ring.pop();
    else rtc_state.ring.pop();
  }
}

// Remove the newest record after it was uploaded, only if it is still the one with timestamp ts
inline bool discard_newest(uint32_t ts) {
  if (size() == 0 || peek(size() - 1).ts != ts) return false;
  if (rtc_state.ring.count > 0) rtc_state.ring.pop_back();  // pushes always land in the RTC ring
  else ram_ring.pop_back();
  return true;
}

// The RAM ring across the board's own restarts (radio reset, remote restart, OTA reboot): saved to NVS
// right before, restored at the next boot and removed from NVS. Without this a watchdog radio reset after
// a long outage lost every reading older than the RTC ring (27 Oct: 187 readings). Power loss still loses
// it. Written only when the RAM ring holds readings (> 280 queued), so flash wear stays negligible.
static const char *NVS_QUEUE_NS = "jkqueue";

inline bool save_ram() {
  if (ram_ring.count == 0) return true;
  nvs_handle_t h;
  if (nvs_open(NVS_QUEUE_NS, NVS_READWRITE, &h) != ESP_OK) return false;
  const bool ok = nvs_set_blob(h, "ram", &ram_ring, sizeof(ram_ring)) == ESP_OK && nvs_commit(h) == ESP_OK;
  nvs_close(h);
  return ok;
}

// Call once at boot, after begin(). Returns the readings restored (the older part of the queue).
inline size_t restore_ram() {
  nvs_handle_t h;
  if (nvs_open(NVS_QUEUE_NS, NVS_READWRITE, &h) != ESP_OK) return 0;
  size_t len = sizeof(ram_ring);
  const esp_err_t err = nvs_get_blob(h, "ram", &ram_ring, &len);
  if (err != ESP_ERR_NVS_NOT_FOUND) {
    // A saved ring from a firmware with another layout (size differs) or a damaged one is dropped
    if (err != ESP_OK || len != sizeof(ram_ring) || !ram_ring.valid()) {
      ram_ring.head = 0;
      ram_ring.count = 0;
    }
    nvs_erase_key(h, "ram");  // restored once; a copy left by a failed erase would only upload duplicates
    nvs_commit(h);
  }
  nvs_close(h);
  return ram_ring.count;
}

inline uint32_t &watchdog_resets() { return rtc_state.watchdog_resets; }
inline void note_uptime(uint32_t s) { rtc_state.run_uptime_s = s; }
inline void note_shutdown() { rtc_state.shutdown_seen = 1; }

// Record why we restart; read back after the next boot
inline void set_restart_cause(RestartCause c) { rtc_state.restart_cause = c; }

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
