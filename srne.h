#pragma once
// SRNE solar controller over RS485 (Modbus RTU), read only. See docs/srne-shiner/COMMUNICATION.md.
//
// poll() does one small step per call and never waits, so a silent controller cannot stall BLE or uploads.
// The UART's RS485 mode switches DE/RE by itself. Live readings go into the flash ring flog::controller and
// upload like BMS readings. Today's totals, lifetime totals, settings and identity go to controller_info.
//
// Everything is called from ESPHome's main loop, so no locking is needed.

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <ctime>
#include <string>
#include "driver/uart.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "flash_log.h"

namespace srne {

static const uart_port_t PORT = UART_NUM_1;
static const uint8_t ADDRESS = 1;
static const uint32_t REPLY_TIMEOUT_MS = 500;
static const uint32_t GAP_MS = 20;
static const uint32_t LIVE_MS = 60000, TOTALS_MS = 300000, INFO_MS = 86400000;
static const uint16_t NO_STATUS = 0xFFFF;

struct __attribute__((packed)) Record {  // 29 bytes
  uint32_t ts;        // unix seconds
  uint16_t batt_dv;   // battery voltage, 0.1 V
  uint16_t charge_ca; // charge current, 0.01 A
  uint8_t soc;        // the controller's own estimate, %
  int8_t ctrl_temp;   // degC
  int8_t batt_temp;   // degC
  uint16_t load_dv;   // 0.1 V
  uint16_t load_ca;   // 0.01 A
  uint16_t load_w;
  uint16_t pv_dv;     // 0.1 V
  uint16_t pv_ca;     // 0.01 A
  uint16_t pv_w;
  uint16_t status;    // 0x0120: top bit load on, low byte charging stage (NO_STATUS: read failed)
  uint32_t faults;    // 0x0121, 0x0122
};
static_assert(sizeof(Record) <= flog::PAYLOAD, "reading fits a flash slot");

enum Job : uint8_t { JOB_LIVE, JOB_STATUS, JOB_TODAY, JOB_TOTALS, JOB_SETTINGS, JOB_IDENT, JOB_COUNT };
struct Spec {
  uint16_t addr;
  uint8_t count;
};
static const Spec SPECS[JOB_COUNT] = {{0x0100, 11}, {0x0120, 3}, {0x010B, 16}, {0x011B, 5}, {0xE002, 13}, {0x000A, 16}};

static uint16_t today[16], totals[5], settings[13], ident[16];
static bool have_today = false, have_totals = false, have_settings = false, have_ident = false;
static bool info_dirty = false, info_in_flight = false;
static uint32_t in_flight = 0;  // readings in the running upload
static uint32_t n_ok = 0, n_fail = 0, last_ok_ms = 0;

static bool up_ = false, waiting_ = false;
static uint32_t pending_ = 0, sent_ms_ = 0, idle_ms_ = 0, next_live_ = 0, next_totals_ = 0, next_info_ = 0;
static Job job_ = JOB_LIVE;
static uint8_t rx_[64];
static size_t got_ = 0;
static Record rec_{};

inline uint16_t crc16(const uint8_t *d, size_t n) {
  uint16_t c = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    c ^= d[i];
    for (int b = 0; b < 8; b++) c = (c & 1) ? (c >> 1) ^ 0xA001 : c >> 1;
  }
  return c;
}

inline uint32_t now_ms() { return (uint32_t) (esp_timer_get_time() / 1000); }
inline bool due(uint32_t now, uint32_t at) { return (int32_t) (now - at) >= 0; }

inline void begin(int tx, int rx, int de) {
  uart_config_t c{};
  c.baud_rate = 9600;
  c.data_bits = UART_DATA_8_BITS;
  c.parity = UART_PARITY_DISABLE;
  c.stop_bits = UART_STOP_BITS_1;
  c.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
  c.source_clk = UART_SCLK_DEFAULT;
  if (uart_driver_install(PORT, 256, 0, 0, nullptr, 0) != ESP_OK || uart_param_config(PORT, &c) != ESP_OK ||
      uart_set_pin(PORT, tx, rx, de, UART_PIN_NO_CHANGE) != ESP_OK ||
      uart_set_mode(PORT, UART_MODE_RS485_HALF_DUPLEX) != ESP_OK) {
    ESP_LOGE("srne", "UART setup failed");
    return;
  }
  up_ = true;
  const uint32_t now = now_ms();
  idle_ms_ = now;
  next_live_ = next_totals_ = next_info_ = now + 3000;
}

inline uint32_t silent_s() {
  if (last_ok_ms == 0) return now_ms() / 1000;
  return (now_ms() - last_ok_ms) / 1000;
}

inline void send(Job j) {
  job_ = j;
  const Spec &s = SPECS[j];
  uint8_t q[8] = {ADDRESS, 3, (uint8_t) (s.addr >> 8), (uint8_t) s.addr, 0, s.count, 0, 0};
  const uint16_t c = crc16(q, 6);
  q[6] = c & 0xFF;
  q[7] = c >> 8;
  uart_flush_input(PORT);
  uart_write_bytes(PORT, q, 8);  // fits the hardware FIFO: returns at once
  got_ = 0;
  sent_ms_ = now_ms();
  waiting_ = true;
}

inline uint16_t reg(uint8_t i) { return (uint16_t) ((rx_[3 + 2 * i] << 8) | rx_[4 + 2 * i]); }

inline void store() {
  uint8_t p[flog::PAYLOAD] = {};
  memcpy(p, &rec_, sizeof(rec_));
  flog::controller.push(p);
}

inline void on_reply(bool ok) {
  const Spec &s = SPECS[job_];
  if (ok) {
    n_ok++;
    last_ok_ms = now_ms();
  } else {
    n_fail++;
  }
  switch (job_) {
    case JOB_LIVE:
      if (!ok) {
        pending_ &= ~(1u << JOB_STATUS);  // no reading this round, shown as a gap
        break;
      }
      rec_ = Record{};
      rec_.ts = (uint32_t) ::time(nullptr);
      rec_.soc = (uint8_t) reg(0);
      rec_.batt_dv = reg(1);
      rec_.charge_ca = reg(2);
      rec_.ctrl_temp = (int8_t) (reg(3) >> 8);
      rec_.batt_temp = (int8_t) (reg(3) & 0xFF);
      rec_.load_dv = reg(4);
      rec_.load_ca = reg(5);
      rec_.load_w = reg(6);
      rec_.pv_dv = reg(7);
      rec_.pv_ca = reg(8);
      rec_.pv_w = reg(9);
      break;
    case JOB_STATUS:
      rec_.status = ok ? reg(0) : NO_STATUS;
      rec_.faults = ok ? ((uint32_t) reg(1) << 16) | reg(2) : 0;
      store();
      break;
    case JOB_TODAY:
      if (ok) {
        for (uint8_t i = 0; i < s.count; i++) today[i] = reg(i);
        have_today = info_dirty = true;
      }
      break;
    case JOB_TOTALS:
      if (ok) {
        for (uint8_t i = 0; i < s.count; i++) totals[i] = reg(i);
        have_totals = info_dirty = true;
      }
      break;
    case JOB_SETTINGS:
      if (ok) {
        for (uint8_t i = 0; i < s.count; i++) settings[i] = reg(i);
        have_settings = info_dirty = true;
      }
      break;
    case JOB_IDENT:
      if (ok) {
        for (uint8_t i = 0; i < s.count; i++) ident[i] = reg(i);
        have_ident = info_dirty = true;
      }
      break;
    default:
      break;
  }
}

// One step. Call often (every 50 ms); never waits.
inline void poll() {
  if (!up_) return;
  const uint32_t now = now_ms();
  if (waiting_) {
    const size_t want = SPECS[job_].count * 2 + 5;
    size_t avail = 0;
    uart_get_buffered_data_len(PORT, &avail);
    if (avail > 0 && got_ < want) {
      const int r = uart_read_bytes(PORT, rx_ + got_, std::min(avail, want - got_), 0);
      if (r > 0) got_ += r;
    }
    if (got_ >= want) {
      const bool ok = rx_[0] == ADDRESS && rx_[1] == 3 && rx_[2] == SPECS[job_].count * 2 &&
                      crc16(rx_, want - 2) == (uint16_t) (rx_[want - 2] | (rx_[want - 1] << 8));
      waiting_ = false;
      idle_ms_ = now;
      on_reply(ok);
    } else if (now - sent_ms_ >= REPLY_TIMEOUT_MS) {
      waiting_ = false;
      idle_ms_ = now;
      on_reply(false);
    }
    return;
  }
  if (now - idle_ms_ < GAP_MS) return;
  if (pending_ == 0) {
    // A reading needs a real clock
    if (due(now, next_live_) && ::time(nullptr) > 1700000000) {
      next_live_ = now + LIVE_MS;
      pending_ |= (1u << JOB_LIVE) | (1u << JOB_STATUS);
    }
    if (due(now, next_totals_)) {
      next_totals_ = now + TOTALS_MS;
      pending_ |= (1u << JOB_TODAY) | (1u << JOB_TOTALS);
    }
    // Daily, and retried with the totals until both have been read once
    if (due(now, next_info_) || (pending_ != 0 && (!have_settings || !have_ident))) {
      next_info_ = now + INFO_MS;
      pending_ |= (1u << JOB_SETTINGS) | (1u << JOB_IDENT);
    }
    if (pending_ == 0) return;
  }
  for (uint8_t j = 0; j < JOB_COUNT; j++) {
    if (pending_ & (1u << j)) {
      pending_ &= ~(1u << j);
      send((Job) j);
      return;
    }
  }
}

}  // namespace srne
