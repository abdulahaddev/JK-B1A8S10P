#pragma once
// HTTPS requests off the main loop.
//
// ESPHome's http_request is blocking: every upload and control read held the main loop for 2-5 s, and a
// failed connect for 8-18 s (28 Oct USB logs: "interval took a long time ... 10755 ms"). Meanwhile no BMS
// frame was processed, frames piled up and failed their CRC, and the BMS link timed out (rsn 0x8).
//
// This worker runs one request at a time in its own FreeRTOS task. The main loop builds the request,
// submits it, keeps running, and picks the result up later with take(); everything that touches the
// telemetry buffer or globals stays in the main loop. The OTA download keeps ESPHome's own client: it
// starts only while the worker is idle.
//
// Requests to the Firebase database (begin(..., keep_prefix)) share one client that stays connected: the
// next request skips DNS, TCP connect and the TLS handshake, which took most of the 7-18 s per upload on
// the weak link. When a new connection is needed (idle close, server close, WiFi drop) the saved TLS
// session ticket shortens the handshake (no certificate download and check). A connection found dead on
// reuse is retried at once on a fresh one. control/keepalive = false goes back to one connection per request.

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <sys/time.h>
#include <string>
#include <utility>
#include <vector>
#include "esp_http_client.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace net {

// JOB_STATUS and JOB_OTA_FILE are read by the script that sent them (ota_report, ota_install), not by a handler
enum Job : uint8_t { JOB_NONE = 0, JOB_UPLOAD, JOB_CONTROL, JOB_PUT, JOB_STATUS, JOB_OTA_FILE };

struct Request {
  Job job = JOB_NONE;
  esp_http_client_method_t method = HTTP_METHOD_GET;
  std::string url;
  std::string body;
  std::vector<std::pair<std::string, std::string>> headers;
  std::vector<std::string> collect;  // response headers to keep, lower case
  size_t max_body = 0;               // response bytes to keep
  int timeout_ms = 8000;
  int retries = 0;                   // tries again (after 2 s) when there is no answer or an empty body
};

struct Result {
  Job job = JOB_NONE;
  int status = -1;  // HTTP status; -1 = no response (DNS, connect, TLS, timeout)
  std::string error;
  std::string body;
  std::vector<std::pair<std::string, std::string>> headers;
  int content_length = 0;
  uint32_t took_ms = 0;
  std::string date;  // the server's Date header (sets the clock before SNTP has synced)

  std::string header(const char *name) const {
    for (const auto &h : headers)
      if (h.first == name) return h.second;
    return "";
  }
};

enum State : int { IDLE = 0, BUSY, DONE };

static std::atomic<int> state{IDLE};
// The last finished request, filled by take() in the main loop and read by its handler there (an ESPHome
// global cannot hold this type: globals are declared before the includes)
static Result last;
static Request req;  // written by the main loop only while IDLE
static Result res;   // written by the worker only while BUSY
static TaskHandle_t task = nullptr;
static const char *user_agent = nullptr;

// Kept connection (worker only, except the atomics)
static constexpr uint32_t KEEP_IDLE_MS = 60000;  // closed after this long unused (well before servers drop it)
static std::string keep_prefix;                   // "https://<host>": requests below it use the kept client
static esp_http_client_handle_t keep = nullptr;
static bool keep_open = false;                    // its socket is (believed) connected
static int64_t keep_used_us = 0;
static std::vector<std::string> keep_headers;     // request headers the last request set on it
static std::atomic<bool> keep_on{true};           // control/keepalive
static std::atomic<bool> release_req{false};
static std::atomic<bool> close_req{false};
static std::atomic<bool> holding{false};          // the kept client exists (holds the TLS session ticket)
static int64_t open_us = 0;                       // this attempt's open() call
static int64_t connected_us = 0;                  // set by HTTP_EVENT_ON_CONNECTED: a new connection

// Counters for the device report
static std::atomic<uint32_t> n_reused{0};  // requests on an open connection
static std::atomic<uint32_t> n_new{0};     // new connections (kept client)
static std::atomic<uint32_t> n_stale{0};   // open connection found dead, retried on a new one
static std::atomic<uint32_t> first_ms{0};  // first connect of this boot: the full handshake
static std::atomic<uint32_t> new_ms{0};    // average of the later connects (session resumed)
static uint32_t new_ms_count = 0;

inline esp_err_t on_event(esp_http_client_event_t *e) {
  if (e->event_id == HTTP_EVENT_ON_CONNECTED) {
    connected_us = esp_timer_get_time();
    return ESP_OK;
  }
  if (e->event_id != HTTP_EVENT_ON_HEADER || e->header_key == nullptr || e->header_value == nullptr) return ESP_OK;
  std::string key(e->header_key);
  for (auto &c : key) c = (char) tolower((unsigned char) c);
  if (key == "date") res.date = e->header_value;
  for (const auto &want : req.collect) {
    if (key == want) res.headers.emplace_back(key, e->header_value);
  }
  return ESP_OK;
}

inline esp_http_client_handle_t make_client(bool kept) {
  esp_http_client_config_t cfg = {};
  cfg.url = req.url.c_str();
  cfg.method = req.method;
  cfg.timeout_ms = req.timeout_ms;
  cfg.disable_auto_redirect = true;
  cfg.user_agent = user_agent;
  cfg.buffer_size = 1024;
  cfg.buffer_size_tx = 1024;
  cfg.event_handler = on_event;
#if CONFIG_ESP_TLS_CLIENT_SESSION_TICKETS
  cfg.save_client_session = kept;  // the ticket lives in this client until cleanup
#endif
  return esp_http_client_init(&cfg);
}

inline bool is_kept(const std::string &url) {
  return keep_on.load() && !keep_prefix.empty() && url.size() > keep_prefix.size() &&
         url.compare(0, keep_prefix.size(), keep_prefix) == 0 && url[keep_prefix.size()] == '/';
}

inline void close_keep() {
  if (keep != nullptr && keep_open) esp_http_client_close(keep);
  keep_open = false;
}

inline void drop_keep() {
  close_keep();
  if (keep != nullptr) esp_http_client_cleanup(keep);
  keep = nullptr;
  keep_headers.clear();
  holding.store(false);
}

// Reads what is left of the reply, so the next request on this connection starts clean; false = it did not end
inline bool drain(esp_http_client_handle_t client) {
  char buf[128];
  for (size_t total = 0; !esp_http_client_is_complete_data_received(client) && total < 16384;) {
    const int n = esp_http_client_read(client, buf, sizeof(buf));
    if (n <= 0) break;
    total += (size_t) n;
  }
  return esp_http_client_is_complete_data_received(client);
}

// One attempt. Returns true when it went out on an already open connection (the kept one)
inline bool perform() {
  const bool kept = is_kept(req.url);
  esp_http_client_handle_t client = nullptr;
  bool reused = false;
  if (kept) {
    if (keep == nullptr) {
      keep = make_client(true);
      keep_open = false;
      if (keep != nullptr) holding.store(true);
    } else {
      esp_http_client_set_url(keep, req.url.c_str());
      esp_http_client_set_method(keep, req.method);
      esp_http_client_set_timeout_ms(keep, req.timeout_ms);
      for (const auto &k : keep_headers) esp_http_client_delete_header(keep, k.c_str());
    }
    keep_headers.clear();
    client = keep;
    reused = keep_open;
  } else {
    client = make_client(false);
  }
  if (client == nullptr) {
    res.error = "client init failed";
    return false;
  }
  for (const auto &h : req.headers) {
    esp_http_client_set_header(client, h.first.c_str(), h.second.c_str());
    if (kept) keep_headers.push_back(h.first);
  }
  open_us = esp_timer_get_time();
  connected_us = 0;
  esp_err_t err = esp_http_client_open(client, (int) req.body.size());
  if (kept && connected_us != 0) {
    reused = false;  // it had to connect after all
    const uint32_t ms = (uint32_t) ((connected_us - open_us) / 1000);
    if (n_new.fetch_add(1) == 0) {
      first_ms.store(ms);
    } else {
      new_ms_count++;
      new_ms.store((new_ms.load() * (new_ms_count - 1) + ms) / new_ms_count);
    }
  }
  size_t left = req.body.size();
  const char *p = req.body.data();
  while (err == ESP_OK && left > 0) {
    const int n = esp_http_client_write(client, p, (int) left);
    if (n <= 0) err = ESP_FAIL;
    else {
      p += n;
      left -= (size_t) n;
    }
  }
  bool ended = false;  // the whole reply was read: the connection can carry the next request
  if (err == ESP_OK) {
    const int64_t len = esp_http_client_fetch_headers(client);
    res.content_length = len > 0 ? (int) len : 0;
    const int status = len < 0 ? -1 : esp_http_client_get_status_code(client);
    char buf[128];
    while (status > 0 && res.body.size() < req.max_body) {
      const int n = esp_http_client_read(client, buf, (int) std::min(sizeof(buf), req.max_body - res.body.size()));
      if (n <= 0) break;
      res.body.append(buf, (size_t) n);
    }
    res.status = status > 0 ? status : -1;
    if (status <= 0) res.error = len < 0 ? "no reply" : "no status";
    ended = status > 0 && kept && drain(client) && esp_http_client_is_persistent_connection(client);
  } else {
    res.error = esp_err_to_name(err);
  }
  if (kept) {
    keep_open = ended;
    if (ended) keep_used_us = esp_timer_get_time();
    else esp_http_client_close(client);
    if (reused && res.status > 0) n_reused.fetch_add(1);
  } else {
    esp_http_client_cleanup(client);
  }
  return reused;
}

inline void run(void *) {
  for (;;) {
    // While a connection is kept, wake up when it has been idle too long and close it
    TickType_t wait = portMAX_DELAY;
    if (keep_open) {
      const int64_t idle_ms = (esp_timer_get_time() - keep_used_us) / 1000;
      wait = idle_ms >= KEEP_IDLE_MS ? 0 : pdMS_TO_TICKS(KEEP_IDLE_MS - (uint32_t) idle_ms);
    }
    ulTaskNotifyTake(pdTRUE, wait);
    if (release_req.exchange(false) || !keep_on.load()) {
      drop_keep();
    } else if (close_req.exchange(false) || (keep_open && (esp_timer_get_time() - keep_used_us) / 1000 >= KEEP_IDLE_MS)) {
      close_keep();  // the handle and its session ticket stay: the next connect is a short handshake
    }
    if (state.load() != BUSY) continue;
    res = Result{};
    res.job = req.job;
    const int64_t t0 = esp_timer_get_time();
    if (perform() && res.status < 0) {
      // The open connection was dead (server or router closed it): once more at once, on a new one
      n_stale.fetch_add(1);
      res = Result{};
      res.job = req.job;
      perform();
    }
    for (int i = 0; i < req.retries && (res.status < 0 || res.body.empty()); i++) {
      vTaskDelay(pdMS_TO_TICKS(2000));
      res = Result{};
      res.job = req.job;
      perform();
    }
    res.took_ms = (uint32_t) ((esp_timer_get_time() - t0) / 1000);
    state.store(DONE);
  }
}

// Call once at boot, before the first submit. keep_url: requests below it share one kept connection
inline void begin(const char *ua, const char *keep_url = nullptr) {
  user_agent = ua;
  if (keep_url != nullptr) {
    keep_prefix = keep_url;
    while (!keep_prefix.empty() && keep_prefix.back() == '/') keep_prefix.pop_back();
  }
  // 8 KB: esp_http_client + mbedTLS handshake. Priority 1 like the ESPHome loop: WiFi, lwIP and BT tasks
  // still preempt it, and it yields while waiting on the network.
  xTaskCreatePinnedToCore(run, "net", 8192, nullptr, 1, &task, tskNO_AFFINITY);
}

inline bool busy() { return state.load() != IDLE; }

// Main loop: close the kept connection and free its client (OTA download, radio reset); wait for !held()
inline void release() {
  if (task == nullptr || !holding.load()) return;
  release_req.store(true);
  xTaskNotifyGive(task);
}
inline bool held() { return holding.load(); }

// Main loop: WiFi dropped, the kept socket is dead; close it but keep the session ticket
inline void reset_connection() {
  if (task == nullptr || !holding.load()) return;
  close_req.store(true);
  xTaskNotifyGive(task);
}

// Main loop: control/keepalive (off = one connection per request, as before 1.2.39)
inline void set_keep(bool on) {
  if (keep_on.exchange(on) == on || on) return;
  release();
}

inline uint32_t stack_free() { return task == nullptr ? 0 : (uint32_t) uxTaskGetStackHighWaterMark(task); }

// "Wed, 28 Oct 2026 15:34:39 GMT" -> unix seconds, 0 when it does not parse
inline int64_t parse_http_date(const std::string &s) {
  static const char *MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";
  char mon[4] = {0};
  int d, y, h, mi, sec;
  if (sscanf(s.c_str(), "%*3s, %d %3s %d %d:%d:%d", &d, mon, &y, &h, &mi, &sec) != 6) return 0;
  const char *p = strstr(MONTHS, mon);
  if (p == nullptr || (p - MONTHS) % 3 != 0) return 0;
  const int m = (int) (p - MONTHS) / 3 + 1;
  // days since 1970-01-01 of a civil date (H. Hinnant's days_from_civil)
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned) (y - era * 400);
  const unsigned doy = (153u * (unsigned) (m + (m > 2 ? -3 : 9)) + 2) / 5 + (unsigned) d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const int64_t days = (int64_t) era * 146097 + doe - 719468;
  return days * 86400 + h * 3600 + mi * 60 + sec;
}

// Set the system clock from a reply's Date header (to the second); SNTP corrects it once it syncs
inline bool set_clock_from(const Result &r) {
  const int64_t t = r.date.empty() ? 0 : parse_http_date(r.date);
  if (t < 1700000000) return false;
  struct timeval tv = {(time_t) t, 0};
  return settimeofday(&tv, nullptr) == 0;
}

// Main loop only, while !busy()
inline bool submit(Request r) {
  if (task == nullptr || state.load() != IDLE) return false;
  req = std::move(r);
  state.store(BUSY);
  xTaskNotifyGive(task);
  return true;
}

// Main loop: the finished request's result, once
inline bool take(Result &out) {
  if (state.load() != DONE) return false;
  out = std::move(res);
  req = Request{};
  state.store(IDLE);
  return true;
}

}  // namespace net
