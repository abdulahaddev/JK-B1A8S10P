#pragma once
// Rings of 32-byte slots in the "jklog" flash partition (partitions.csv): the reading queue and the event log.
//
// Kept through crashes, watchdog resets and power loss, unlike RTC and RAM. Each 4 KB sector starts with a
// header slot (magic, kind, sequence number); the other 127 slots hold one item each:
//   bytes 0..29  payload     byte 30  state: 0xFF empty, 0x7F stored, 0x3F sent     byte 31  CRC-8 of the payload
// Sectors are filled in partition order and wrap around; the newest sector has the highest sequence number.
// "Sent" only clears bits, so marking an item needs no erase. A sector is erased right before it is reused:
// one erase (~40 ms) per 127 items, i.e. about once an hour for 30 s readings. A write cut by power loss
// fails its CRC and is skipped.
//
// All calls come from ESPHome's main loop.

#include <algorithm>
#include <cstdint>
#include <cstring>
#include "esp_log.h"
#include "esp_partition.h"

namespace flog {

static const uint32_t SECTOR = 4096;
static const uint32_t SLOT = 32;
static const uint32_t SLOTS = SECTOR / SLOT;  // slot 0 is the sector header
static const uint32_t ITEMS = SLOTS - 1;      // items per sector
static const uint32_t PAYLOAD = 30;
static const uint32_t MAGIC = 0x4A4B4C31;     // "JKL1"
static const uint8_t ST_EMPTY = 0xFF, ST_STORED = 0x7F, ST_SENT = 0x3F;

inline uint8_t crc8(const uint8_t *p, size_t n) {
  uint8_t c = 0;
  while (n--) {
    c ^= *p++;
    for (int i = 0; i < 8; i++) c = (c & 0x80) ? (uint8_t) ((c << 1) ^ 0x07) : (uint8_t) (c << 1);
  }
  return c;
}

struct __attribute__((packed)) Header {
  uint32_t magic;
  uint32_t kind;  // which ring the sector belongs to
  uint32_t seq;   // 1, 2, 3 ... in write order
  uint8_t crc;    // CRC-8 of magic, kind, seq
  uint8_t pad[SLOT - 13];
};

class Ring {
 public:
  // first/sectors: the ring's part of the partition, in sectors
  void begin(const esp_partition_t *part, uint32_t first, uint32_t sectors, uint32_t kind) {
    part_ = part;
    first_ = first;
    sectors_ = sectors;
    kind_ = kind;
    ok_ = part_ != nullptr && sectors_ > 1 && (first_ + sectors_) * SECTOR <= part_->size;
    count_ = 0;
    head_ = tail_ = 0;
    head_open_ = false;
    if (!ok_) return;
    // Newest sector: the valid header with the highest sequence number
    int32_t newest = -1;
    seq_ = 0;
    for (uint32_t s = 0; s < sectors_; s++) {
      uint32_t q;
      if (header_seq(s, &q) && q >= seq_) {
        seq_ = q;
        newest = (int32_t) s;
      }
    }
    if (newest < 0) return;  // empty or foreign data: start at sector 0 (erased on the first write)
    // Head (next write): the first empty slot of the newest sector, else the start of the next sector
    head_ = (uint32_t) newest * ITEMS + ITEMS;
    for (uint32_t i = 0; i < ITEMS; i++) {
      if (state_at((uint32_t) newest * ITEMS + i) == ST_EMPTY) {
        head_ = (uint32_t) newest * ITEMS + i;
        break;
      }
    }
    head_open_ = head_ < (uint32_t) newest * ITEMS + ITEMS;
    head_ %= cap();
    // Walk the valid sectors from the oldest (the first valid one after the newest) up to the head:
    // the tail is the first stored item, count all of them
    bool found = false;
    for (uint32_t k = 1; k <= sectors_; k++) {
      const uint32_t s = ((uint32_t) newest + k) % sectors_;
      if (!valid_sector(s)) continue;
      for (uint32_t i = 0; i < ITEMS; i++) {
        const uint32_t x = s * ITEMS + i;
        if (s == (uint32_t) newest && head_open_ && x >= head_) break;
        if (stored(x)) {
          if (!found) tail_ = x;
          found = true;
          count_++;
        }
      }
    }
    if (!found) tail_ = head_;
  }

  bool ok() const { return ok_; }
  uint32_t size() const { return count_; }
  uint32_t capacity() const { return cap(); }
  uint32_t dropped() const { return dropped_; }

  bool push(const uint8_t *payload) {
    if (!ok_) return false;
    if (!head_open_ && !open_sector(head_ / ITEMS)) return false;
    uint8_t buf[SLOT];
    memcpy(buf, payload, PAYLOAD);
    buf[30] = ST_STORED;
    buf[31] = crc8(payload, PAYLOAD);
    if (esp_partition_write(part_, addr(head_), buf, SLOT) != ESP_OK) return false;
    if (count_ == 0) tail_ = head_;
    count_++;
    head_ = (head_ + 1) % cap();
    if (head_ % ITEMS == 0) head_open_ = false;  // the next write opens (erases) the next sector
    return true;
  }

  // i-th oldest stored item (i < size())
  bool peek(uint32_t i, uint8_t *payload) const {
    const uint32_t n = span();
    for (uint32_t k = 0; k < n; k++) {
      const uint32_t x = (tail_ + k) % cap();
      if (!stored(x)) continue;
      if (i-- == 0) return read_payload(x, payload);
    }
    return false;
  }

  // The newest stored item
  bool peek_newest(uint8_t *payload, uint32_t *at = nullptr) const {
    const uint32_t n = span();
    for (uint32_t k = 1; k <= n; k++) {
      const uint32_t x = (head_ + cap() - k) % cap();
      if (stored(x)) {
        if (at) *at = x;
        return read_payload(x, payload);
      }
    }
    return false;
  }

  // Mark the n oldest stored items sent
  void discard(uint32_t n) {
    const uint32_t m = span();
    for (uint32_t k = 0; k < m && n > 0; k++) {
      const uint32_t x = (tail_ + k) % cap();
      if (!stored(x)) continue;
      mark_sent(x);
      n--;
    }
    advance_tail();
  }

  // Mark the newest stored item sent
  void discard_newest() {
    uint32_t x;
    uint8_t tmp[PAYLOAD];
    if (!peek_newest(tmp, &x)) return;
    mark_sent(x);
    advance_tail();
  }

 private:
  const esp_partition_t *part_ = nullptr;
  uint32_t first_ = 0, sectors_ = 0, kind_ = 0, seq_ = 0, count_ = 0, dropped_ = 0;
  uint32_t head_ = 0, tail_ = 0;  // item index 0 .. cap()-1: sector * ITEMS + slot - 1
  bool head_open_ = false, ok_ = false;

  uint32_t cap() const { return sectors_ * ITEMS; }
  // Items from the tail up to the head (the whole ring when it is full)
  uint32_t span() const {
    if (count_ == 0) return 0;
    const uint32_t d = (head_ + cap() - tail_) % cap();
    return d == 0 ? cap() : d;
  }
  size_t addr(uint32_t x) const {
    return (size_t) (first_ + x / ITEMS) * SECTOR + (size_t) (x % ITEMS + 1) * SLOT;
  }

  bool header_seq(uint32_t s, uint32_t *q) const {
    Header h;
    if (esp_partition_read(part_, (size_t) (first_ + s) * SECTOR, &h, sizeof(h)) != ESP_OK) return false;
    if (h.magic != MAGIC || h.kind != kind_ || h.crc != crc8((const uint8_t *) &h, 12)) return false;
    *q = h.seq;
    return true;
  }
  bool valid_sector(uint32_t s) const {
    uint32_t q;
    return header_seq(s, &q);
  }

  uint8_t state_at(uint32_t x) const {
    uint8_t st = 0;
    esp_partition_read(part_, addr(x) + 30, &st, 1);
    return st;
  }
  bool read_payload(uint32_t x, uint8_t *payload) const {
    uint8_t buf[SLOT];
    if (esp_partition_read(part_, addr(x), buf, SLOT) != ESP_OK || buf[31] != crc8(buf, PAYLOAD)) return false;
    memcpy(payload, buf, PAYLOAD);
    return true;
  }
  bool stored(uint32_t x) const {
    uint8_t buf[SLOT];
    if (esp_partition_read(part_, addr(x), buf, SLOT) != ESP_OK) return false;
    return buf[30] == ST_STORED && buf[31] == crc8(buf, PAYLOAD);
  }

  void mark_sent(uint32_t x) {
    const uint8_t st = ST_SENT;
    if (esp_partition_write(part_, addr(x) + 30, &st, 1) == ESP_OK && count_ > 0) count_--;
  }

  void advance_tail() {
    if (count_ == 0) {
      tail_ = head_;
      return;
    }
    for (uint32_t k = 0; k < cap() && !stored(tail_); k++) tail_ = (tail_ + 1) % cap();
  }

  // Erase a sector for reuse; stored items still in it are lost (counted in dropped)
  bool open_sector(uint32_t s) {
    if (valid_sector(s) && count_ > 0) {
      uint32_t lost = 0;
      for (uint32_t i = 0; i < ITEMS; i++) {
        if (stored(s * ITEMS + i)) lost++;
      }
      dropped_ += lost;
      count_ -= std::min(count_, lost);
      if (tail_ / ITEMS == s) {
        tail_ = ((s + 1) % sectors_) * ITEMS;
        advance_tail();
      }
    }
    if (esp_partition_erase_range(part_, (size_t) (first_ + s) * SECTOR, SECTOR) != ESP_OK) return false;
    Header h;
    memset(&h, 0xFF, sizeof(h));
    h.magic = MAGIC;
    h.kind = kind_;
    h.seq = ++seq_;
    h.crc = crc8((const uint8_t *) &h, 12);
    if (esp_partition_write(part_, (size_t) (first_ + s) * SECTOR, &h, sizeof(h)) != ESP_OK) return false;
    head_open_ = true;
    if (count_ == 0) tail_ = head_;
    return true;
  }
};

// The partition: readings in the first 144 sectors (576 KB, ~6.3 days at 30 s), events in the last 16 (64 KB)
static const uint32_t READING_SECTORS = 144;
static const uint32_t EVENT_SECTORS = 16;
static Ring readings;
static Ring events;

inline bool begin() {
  const esp_partition_t *p = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, (esp_partition_subtype_t) 0x40, "jklog");
  if (p == nullptr) {
    ESP_LOGE("flog", "partition jklog not found: readings and events are not kept");
    return false;
  }
  readings.begin(p, 0, READING_SECTORS, 1);
  events.begin(p, READING_SECTORS, EVENT_SECTORS, 2);
  return readings.ok() && events.ok();
}

// ---- Events ----
enum Code : uint8_t {
  EV_BOOT = 1,         // a: reset reason (esp_reset_reason_t), b: restart cause, text: firmware version
  EV_WIFI_DROP,        // a: disconnect reason, b: RSSI before
  EV_BMS_CONNECT,      // a: seconds since boot
  EV_BMS_DISCONNECT,   // a: seconds connected
  EV_OTA,              // text: short status
  EV_RESTART,          // a: restart cause (telemetry::RestartCause), text: why
  EV_UPLOAD_FAIL,      // a: HTTP status or -1, text: error
  EV_CRASH,            // text: the step the previous run crashed in
  EV_CONTROL,          // text: what control changed
};

struct __attribute__((packed)) Event {  // 30 bytes
  uint32_t ts;      // unix seconds, 0 while the clock is not set
  uint32_t up;      // seconds since boot (gives the time of a ts = 0 event from the same boot)
  uint16_t boot;    // boot counter
  uint8_t code;     // Code
  uint8_t pad;
  int32_t a;
  int32_t b;
  char text[10];    // not 0-terminated when full
};
static_assert(sizeof(Event) == PAYLOAD, "event size");

inline const char *code_name(uint8_t c) {
  switch (c) {
    case EV_BOOT: return "boot";
    case EV_WIFI_DROP: return "wifi_drop";
    case EV_BMS_CONNECT: return "bms_connect";
    case EV_BMS_DISCONNECT: return "bms_disconnect";
    case EV_OTA: return "ota";
    case EV_RESTART: return "restart";
    case EV_UPLOAD_FAIL: return "upload_fail";
    case EV_CRASH: return "crash";
    case EV_CONTROL: return "control";
    default: return "?";
  }
}

}  // namespace flog
