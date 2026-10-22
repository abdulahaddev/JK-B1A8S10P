#pragma once
// Offline buffer for 30s BMS readings while WiFi/Firebase is unreachable.
//
// Newest readings live in RTC slow memory (RTC_NOINIT_ATTR), which survives software
// reboots (watchdog, WiFi reboot_timeout, restart) but not power loss. When the RTC ring is
// full its oldest reading moves to a larger RAM ring, which is lost on any reboot.
// Uploads always take the oldest readings first (RAM, then RTC).
//
// Everything is called from ESPHome's main loop, so no locking is needed.

#include <cmath>
#include <cstdint>
#include "esp_attr.h"
#include "esp_system.h"

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

static const size_t RTC_CAPACITY = 280;  // 7.9 KB of the 8 KB RTC slow memory (8168 B usable)
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
  bool valid() const { return head < N && count <= N; }
};

struct RtcState {
  uint32_t magic;
  uint32_t boot_count;
  Ring<RTC_CAPACITY> ring;
};

RTC_NOINIT_ATTR static RtcState rtc_state;
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
  }
  rtc_state.boot_count++;
  ram_ring.head = 0;
  ram_ring.count = 0;
}

inline size_t size() { return ram_ring.count + rtc_state.ring.count; }
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
