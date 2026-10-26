#pragma once
// Helpers for remote control: the OTA host allow-list and the last WiFi disconnect reason.
//
// The OTA base URL comes from Firebase (control/ota_host). The database rules are open, so the host
// is accepted only under a compiled-in domain: otherwise anyone who can write control could point
// the board at their own firmware.

#include <cctype>
#include <cstdint>
#include <string>

#include <esp_event.h>
#include <esp_wifi.h>

namespace otactl {

static const char *const ALLOWED_DOMAINS[] = {"nabatechworld.com", "wafacredence.com"};

// "https://host[:443][/path]" with host equal to, or a subdomain of, an allowed domain.
// Returns the normalized base URL (lowercase host, no trailing slash) or "" when refused.
inline std::string allowed_base(const std::string &url) {
  static const std::string scheme = "https://";
  if (url.size() <= scheme.size() || url.size() > 200) return "";
  for (size_t i = 0; i < scheme.size(); i++) {
    if (tolower((unsigned char) url[i]) != scheme[i]) return "";
  }
  for (char c : url) {
    if (c <= ' ' || c == '\\' || c == '"' || c == '?' || c == '#' || c == '%') return "";
  }
  const size_t start = scheme.size();
  const size_t slash = url.find('/', start);
  std::string authority = url.substr(start, slash == std::string::npos ? std::string::npos : slash - start);
  std::string path = slash == std::string::npos ? "" : url.substr(slash);
  if (authority.find('@') != std::string::npos) return "";  // no user:pass@host
  const size_t colon = authority.find(':');
  if (colon != std::string::npos) {
    if (authority.substr(colon) != ":443") return "";
    authority = authority.substr(0, colon);
  }
  std::string host;
  for (char c : authority) {
    if (!(isalnum((unsigned char) c) || c == '-' || c == '.')) return "";
    host += (char) tolower((unsigned char) c);
  }
  if (host.empty() || host.front() == '.' || host.back() == '.' || host.find("..") != std::string::npos) return "";
  bool ok = false;
  for (const char *d : ALLOWED_DOMAINS) {
    const std::string dom(d);
    if (host == dom || (host.size() > dom.size() && host.compare(host.size() - dom.size(), dom.size(), dom) == 0 &&
                        host[host.size() - dom.size() - 1] == '.')) {
      ok = true;
    }
  }
  if (!ok) return "";
  while (!path.empty() && path.back() == '/') path.pop_back();
  return scheme + host + path;
}

// Version names as the OTA files use them: letters, digits, '.', '-', '_'
inline std::string clean_version(const char *s) {
  std::string v;
  for (; s != nullptr && *s && v.size() < 32; s++) {
    if (isalnum((unsigned char) *s) || *s == '.' || *s == '-' || *s == '_') v += *s;
  }
  return v;
}

// WiFi disconnects, recorded from the ESP-IDF event (runs in the event task): the last one, its signal
// just before (last_rssi is sampled from the main loop every 30 s), and a count per reason code
static volatile uint8_t last_disc_reason = 0;
static volatile uint32_t last_disc_ms = 0;
static volatile int8_t last_rssi = 0;
static volatile int8_t disc_rssi = 0;
static volatile uint16_t disc_counts[256] = {};

inline void on_wifi_event(void *, esp_event_base_t, int32_t id, void *data) {
  if (id == WIFI_EVENT_STA_DISCONNECTED && data != nullptr) {
    const uint8_t reason = static_cast<wifi_event_sta_disconnected_t *>(data)->reason;
    last_disc_reason = reason;
    last_disc_ms = (uint32_t) (esp_timer_get_time() / 1000);
    disc_rssi = last_rssi;
    if (disc_counts[reason] < 0xFFFF) disc_counts[reason] = disc_counts[reason] + 1;
  }
}

inline void begin() {
  esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, &on_wifi_event, nullptr);
}

}  // namespace otactl
