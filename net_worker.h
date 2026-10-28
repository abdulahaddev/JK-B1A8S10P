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
// Requests to the Firebase database (begin(..., keep_prefix)) go through one long-lived client, in one of
// three modes (control/keepalive):
//   off     a new client and connection per request (as before 1.2.39)
//   resume  a new connection per request, closed after the reply, but the client keeps the TLS session
//           ticket: the handshake is resumed (no certificate download and check, no key exchange)
//   keep    the connection stays open for the next request (skips DNS, TCP and TLS); a connection found
//           dead on reuse is retried at once on a fresh one, resumed from the ticket
//
// 1.2.39 crashed with a corrupted heap after 10 requests on one kept connection (29 Oct 02:09). Until the
// cause is known, every step of a request is bracketed by a heap integrity check, and the step the worker
// is in is kept in RTC memory: after a crash or a failed check the next boot reports where it was, and runs
// with the mode off for that boot (no crash loop into safe mode).

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <sys/time.h>
#include <string>
#include <utility>
#include <vector>
#include "esp_attr.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace net {

// JOB_STATUS and JOB_OTA_FILE are read by the script that sent them (ota_report, ota_install), not by a handler
enum Job : uint8_t { JOB_NONE = 0, JOB_UPLOAD, JOB_CONTROL, JOB_PUT, JOB_STATUS, JOB_OTA_FILE };

enum Mode : uint8_t { MODE_OFF = 0, MODE_RESUME, MODE_KEEP };

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

// Long-lived Firebase client (worker only, except the atomics)
static constexpr uint32_t KEEP_IDLE_MS = 60000;  // a kept connection is closed after this long unused
static std::string keep_prefix;                   // "https://<host>": requests below it use the long-lived client
static esp_http_client_handle_t keep = nullptr;
static bool keep_open = false;                    // its socket is (believed) connected
static int64_t keep_used_us = 0;
static std::vector<std::string> keep_headers;     // request headers the last request set on it
static std::atomic<uint8_t> mode{MODE_RESUME};    // control/keepalive
static std::atomic<bool> release_req{false};
static std::atomic<bool> close_req{false};
static std::atomic<bool> holding{false};          // the long-lived client exists (holds the TLS session ticket)
static int64_t open_us = 0;                       // this attempt's open() call
static int64_t connected_us = 0;                  // set by HTTP_EVENT_ON_CONNECTED: a new connection

// Counters for the device report
static std::atomic<uint32_t> n_reused{0};  // requests on an open connection
static std::atomic<uint32_t> n_new{0};     // new connections (long-lived client)
static std::atomic<uint32_t> n_stale{0};   // open connection found dead, retried on a new one
static std::atomic<uint32_t> first_ms{0};  // first connect of this boot: the full handshake
static std::atomic<uint32_t> new_ms{0};    // average of the later connects (session resumed)
static uint32_t new_ms_count = 0;

// ---- Debug: heap checks and the RTC breadcrumb ----
enum Phase : uint8_t {
  PH_IDLE = 0, PH_INIT, PH_SETUP, PH_OPEN, PH_WRITE, PH_HEADERS, PH_READ, PH_DRAIN, PH_CLOSE, PH_CLEANUP,
  PH_IDLE_CLOSE, PH_RELEASE, PH_MAIN, PH_COUNT
};
inline const char *phase_name(uint32_t p) {
  static const char *const N[PH_COUNT] = {"idle", "init", "setup", "open", "write", "headers", "read",
                                          "drain", "close", "cleanup", "idle_close", "release", "main_loop"};
  return p < PH_COUNT ? N[p] : "?";
}

static constexpr uint32_t DBG_MAGIC = 0x4E455444;  // "NETD"
// RTC slow memory is nearly full (the RTC part of the queue): kept small
struct Breadcrumb {
  uint32_t magic;
  uint32_t request;    // request number since boot
  uint8_t phase;       // the worker's step right now
  uint8_t mode;
  uint8_t reused;      // this request went out on an open connection
  uint8_t job;
  char fail[44];       // first failed heap check: "before|after <step>, request n, mode m"
};
RTC_NOINIT_ATTR static Breadcrumb crumb;
static std::string prev_report;                // what the previous run left, for the device report
static std::atomic<bool> heap_bad{false};      // a check failed this boot
static std::atomic<bool> forced_off{false};    // the mode stays off for this boot
static std::atomic<uint32_t> n_checks{0};
static std::atomic<uint32_t> check_max_us{0};
static uint32_t request_no = 0;

// Main loop and worker: true while the heap is intact. On the first failure: record it and force the mode off
inline bool heap_ok(Phase at, const char *when) {
  if (heap_bad.load()) return false;
  const int64_t t0 = esp_timer_get_time();
  const bool ok = heap_caps_check_integrity_all(true);  // prints the damaged block on the serial log
  const uint32_t us = (uint32_t) (esp_timer_get_time() - t0);
  n_checks.fetch_add(1);
  if (us > check_max_us.load()) check_max_us.store(us);
  if (ok) return true;
  heap_bad.store(true);
  forced_off.store(true);
  snprintf(crumb.fail, sizeof(crumb.fail), "%s %s, request %u, mode %u%s", when, phase_name(at),
           (unsigned) crumb.request, (unsigned) crumb.mode, crumb.reused ? " reused" : "");
  ESP_LOGE("net", "HEAP CORRUPT: %s", crumb.fail);
  return false;
}

inline void step(Phase p) {
  crumb.phase = p;
  heap_ok(p, "before");
}
inline void stepped(Phase p) { heap_ok(p, "after"); }

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

inline Mode cur_mode() { return forced_off.load() ? MODE_OFF : (Mode) mode.load(); }

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
  return cur_mode() != MODE_OFF && !keep_prefix.empty() && url.size() > keep_prefix.size() &&
         url.compare(0, keep_prefix.size(), keep_prefix) == 0 && url[keep_prefix.size()] == '/';
}

inline void close_keep(Phase why) {
  if (keep != nullptr && keep_open) {
    step(why);
    esp_http_client_close(keep);
    stepped(why);
  }
  keep_open = false;
}

inline void drop_keep() {
  close_keep(PH_RELEASE);
  if (keep != nullptr) {
    step(PH_CLEANUP);
    esp_http_client_cleanup(keep);
    stepped(PH_CLEANUP);
  }
  keep = nullptr;
  keep_headers.clear();
  holding.store(false);
  crumb.phase = PH_IDLE;
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

// One attempt. Returns true when it went out on an already open connection (keep mode)
inline bool perform() {
  const Mode m = cur_mode();
  const bool kept = is_kept(req.url);
  crumb.request = ++request_no;
  crumb.mode = kept ? m : MODE_OFF;
  crumb.job = req.job;
  crumb.reused = 0;
  esp_http_client_handle_t client = nullptr;
  bool reused = false;
  if (kept) {
    if (keep == nullptr) {
      step(PH_INIT);
      keep = make_client(true);
      stepped(PH_INIT);
      keep_open = false;
      if (keep != nullptr) holding.store(true);
    } else {
      step(PH_SETUP);
      esp_http_client_set_url(keep, req.url.c_str());
      esp_http_client_set_method(keep, req.method);
      esp_http_client_set_timeout_ms(keep, req.timeout_ms);
      for (const auto &k : keep_headers) esp_http_client_delete_header(keep, k.c_str());
      stepped(PH_SETUP);
    }
    keep_headers.clear();
    client = keep;
    reused = keep_open;
  } else {
    step(PH_INIT);
    client = make_client(false);
    stepped(PH_INIT);
  }
  if (client == nullptr) {
    res.error = "client init failed";
    crumb.phase = PH_IDLE;
    return false;
  }
  for (const auto &h : req.headers) {
    esp_http_client_set_header(client, h.first.c_str(), h.second.c_str());
    if (kept) keep_headers.push_back(h.first);
  }
  crumb.reused = reused;
  step(PH_OPEN);
  open_us = esp_timer_get_time();
  connected_us = 0;
  esp_err_t err = esp_http_client_open(client, (int) req.body.size());
  stepped(PH_OPEN);
  if (kept && connected_us != 0) {
    reused = false;  // it had to connect after all
    crumb.reused = 0;
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
  if (err == ESP_OK && left > 0) step(PH_WRITE);
  while (err == ESP_OK && left > 0) {
    const int n = esp_http_client_write(client, p, (int) left);
    if (n <= 0) err = ESP_FAIL;
    else {
      p += n;
      left -= (size_t) n;
    }
  }
  if (req.body.size() > 0) stepped(PH_WRITE);
  bool ended = false;  // the whole reply was read: the connection can carry the next request
  if (err == ESP_OK) {
    step(PH_HEADERS);
    const int64_t len = esp_http_client_fetch_headers(client);
    stepped(PH_HEADERS);
    res.content_length = len > 0 ? (int) len : 0;
    const int status = len < 0 ? -1 : esp_http_client_get_status_code(client);
    char buf[128];
    step(PH_READ);
    while (status > 0 && res.body.size() < req.max_body) {
      const int n = esp_http_client_read(client, buf, (int) std::min(sizeof(buf), req.max_body - res.body.size()));
      if (n <= 0) break;
      res.body.append(buf, (size_t) n);
    }
    stepped(PH_READ);
    res.status = status > 0 ? status : -1;
    if (status <= 0) res.error = len < 0 ? "no reply" : "no status";
    if (status > 0 && kept && m == MODE_KEEP) {
      step(PH_DRAIN);
      ended = drain(client) && esp_http_client_is_persistent_connection(client);
      stepped(PH_DRAIN);
    }
  } else {
    res.error = esp_err_to_name(err);
  }
  if (kept) {
    // resume: always closed here; the client and its session ticket stay for the next request
    keep_open = ended;
    if (ended) {
      keep_used_us = esp_timer_get_time();
    } else {
      step(PH_CLOSE);
      esp_http_client_close(client);
      stepped(PH_CLOSE);
    }
    if (reused && res.status > 0) n_reused.fetch_add(1);
  } else {
    step(PH_CLEANUP);
    esp_http_client_cleanup(client);
    stepped(PH_CLEANUP);
  }
  crumb.phase = PH_IDLE;
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
    if (release_req.exchange(false) || cur_mode() == MODE_OFF) {
      drop_keep();
    } else if (close_req.exchange(false) || cur_mode() != MODE_KEEP ||
               (keep_open && (esp_timer_get_time() - keep_used_us) / 1000 >= KEEP_IDLE_MS)) {
      close_keep(PH_IDLE_CLOSE);  // the client and its session ticket stay: the next connect is resumed
      crumb.phase = PH_IDLE;
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

// Call once at boot, before the first submit. keep_url: requests below it use the long-lived client
inline void begin(const char *ua, const char *keep_url = nullptr) {
  // What the previous run left: the step it was in when it ended, and a failed heap check
  const esp_reset_reason_t why = esp_reset_reason();
  const bool crashed = why == ESP_RST_PANIC || why == ESP_RST_INT_WDT || why == ESP_RST_TASK_WDT || why == ESP_RST_WDT;
  if (crumb.magic == DBG_MAGIC && why != ESP_RST_POWERON) {
    crumb.fail[sizeof(crumb.fail) - 1] = 0;
    char buf[160];
    if (crumb.fail[0] != 0) {
      snprintf(buf, sizeof(buf), "heap check failed: %s", crumb.fail);
    } else if (crashed) {
      snprintf(buf, sizeof(buf), "crash in %s, request %u, mode %u%s, job %u", phase_name(crumb.phase),
               (unsigned) crumb.request, (unsigned) crumb.mode, crumb.reused ? " reused" : "", (unsigned) crumb.job);
    } else {
      buf[0] = 0;
    }
    prev_report = buf;
    // after a heap fault or a crash with the long-lived client in use: this boot runs with the mode off
    if (crumb.fail[0] != 0 || (crashed && crumb.mode != MODE_OFF)) forced_off.store(true);
  }
  memset(&crumb, 0, sizeof(crumb));
  crumb.magic = DBG_MAGIC;
  if (!prev_report.empty()) ESP_LOGW("net", "previous run: %s%s", prev_report.c_str(), forced_off.load() ? " (mode off for this boot)" : "");

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

// Main loop: close the connection and free the long-lived client (OTA download, radio reset); wait for !held()
inline void release() {
  if (task == nullptr || !holding.load()) return;
  release_req.store(true);
  xTaskNotifyGive(task);
}
inline bool held() { return holding.load(); }

// Main loop: WiFi dropped, a kept socket is dead; close it but keep the session ticket
inline void reset_connection() {
  if (task == nullptr || !holding.load()) return;
  close_req.store(true);
  xTaskNotifyGive(task);
}

// Main loop: control/keepalive
inline void set_mode(Mode m) {
  if (mode.exchange(m) == m) return;
  if (m == MODE_OFF) release();
  else if (m == MODE_RESUME) reset_connection();
}

// Main loop, every few seconds: catches damage done between requests (by another task)
inline void check_idle() {
  if (crumb.phase == PH_IDLE) heap_ok(PH_MAIN, "in");
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
