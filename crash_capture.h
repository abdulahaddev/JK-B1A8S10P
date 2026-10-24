#pragma once
// Crash reports for a board that is only reachable remotely.
//
// ESPHome's ESP32 crash handler already saves the crash PC and backtraces of both cores across the
// panic reboot, but only prints them to the serial log. The firmware reprints that report at boot,
// collects its lines here (logger on_message, tag "esp32.crash"), and uploads them once to
// crashes/<ts>. Decode the addresses with the release's ELF:
//   xtensa-esp32-elf-addr2line -pfiaC -e dist/jk-bms-<version>.elf <addresses>
//
// A breadcrumb (crash::step) records which blocking step the main loop was in. It lives in RTC
// memory, so after a watchdog reset it says where the previous run got stuck.

#include <cstdint>
#include <string>
#include "esp_attr.h"
#include "esp_system.h"

namespace crash {

enum Step : uint32_t {
  STEP_IDLE = 0,
  STEP_UPLOAD,       // Firebase PATCH
  STEP_CONTROL,      // control.json GET
  STEP_OTA_CHECK,    // OTA site check of a new firmware
  STEP_OTA_FLASH,    // OTA download
  STEP_RADIO_RESET,  // BLE disconnect + deep sleep
};

RTC_NOINIT_ATTR static uint32_t current_step;  // breadcrumb of the running firmware
static uint32_t last_step = STEP_IDLE;         // breadcrumb of the previous run, if it crashed
static uint32_t prev_step = STEP_IDLE;         // breadcrumb of the previous run, whatever ended it
static std::string report;                     // ESPHome's crash report lines, "; "-separated

inline void step(Step s) { current_step = s; }

inline bool crashed() {
  switch (esp_reset_reason()) {
    case ESP_RST_PANIC: case ESP_RST_INT_WDT: case ESP_RST_TASK_WDT: case ESP_RST_WDT:
      return true;
    default:
      return false;
  }
}

// Call once at boot, before anything sets a step
inline void begin() {
  prev_step = current_step <= STEP_RADIO_RESET ? current_step : STEP_IDLE;
  last_step = crashed() && current_step <= STEP_RADIO_RESET ? current_step : STEP_IDLE;
  current_step = STEP_IDLE;
}

inline const char *step_name(uint32_t s) {
  switch (s) {
    case STEP_UPLOAD: return "upload";
    case STEP_CONTROL: return "control";
    case STEP_OTA_CHECK: return "ota_check";
    case STEP_OTA_FLASH: return "ota_flash";
    case STEP_RADIO_RESET: return "radio_reset";
    default: return "loop";
  }
}

// logger on_message hook: keep the lines of the crash report (bounded)
inline void collect(const char *tag, const char *message) {
  if (tag == nullptr || std::string(tag) != "esp32.crash" || report.size() > 900) return;
  // message is the formatted log line: drop the "[E][tag:123]: " prefix and color codes
  std::string line(message);
  const size_t prefix = line.find("]: ");
  if (prefix != std::string::npos) line.erase(0, prefix + 3);
  const size_t color = line.find('\033');
  if (color != std::string::npos) line.erase(color);
  const size_t start = line.find_first_not_of(' ');
  if (start == std::string::npos || line.rfind("Use: addr2line", start) == start) return;
  if (!report.empty()) report += "; ";
  report += line.substr(start);
}

inline const char *last_step_name() { return step_name(last_step); }
inline const char *prev_step_name() { return step_name(prev_step); }

}  // namespace crash
