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

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstring>
#include <string>
#include <utility>
#include <vector>
#include "esp_http_client.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace net {

// JOB_STATUS and JOB_OTA_FILE are read by the script that sent them (ota_report, ota_install), not by a handler
enum Job : uint8_t { JOB_NONE = 0, JOB_UPLOAD, JOB_CONTROL, JOB_CHECK, JOB_PUT, JOB_STATUS, JOB_OTA_FILE };

struct Request {
  Job job = JOB_NONE;
  esp_http_client_method_t method = HTTP_METHOD_GET;
  std::string url;
  std::string body;
  std::vector<std::pair<std::string, std::string>> headers;
  std::vector<std::string> collect;  // response headers to keep, lower case
  size_t max_body = 0;               // response bytes to keep
  int timeout_ms = 8000;
};

struct Result {
  Job job = JOB_NONE;
  int status = -1;  // HTTP status; -1 = no response (DNS, connect, TLS, timeout)
  std::string error;
  std::string body;
  std::vector<std::pair<std::string, std::string>> headers;
  int content_length = 0;
  uint32_t took_ms = 0;

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

inline esp_err_t on_event(esp_http_client_event_t *e) {
  if (e->event_id != HTTP_EVENT_ON_HEADER || e->header_key == nullptr || e->header_value == nullptr) return ESP_OK;
  std::string key(e->header_key);
  for (auto &c : key) c = (char) tolower((unsigned char) c);
  for (const auto &want : req.collect) {
    if (key == want) res.headers.emplace_back(key, e->header_value);
  }
  return ESP_OK;
}

inline void perform() {
  esp_http_client_config_t cfg = {};
  cfg.url = req.url.c_str();
  cfg.method = req.method;
  cfg.timeout_ms = req.timeout_ms;
  cfg.disable_auto_redirect = true;
  cfg.user_agent = user_agent;
  cfg.buffer_size = 1024;
  cfg.buffer_size_tx = 1024;
  cfg.event_handler = on_event;
  esp_http_client_handle_t client = esp_http_client_init(&cfg);
  if (client == nullptr) {
    res.error = "client init failed";
    return;
  }
  for (const auto &h : req.headers) esp_http_client_set_header(client, h.first.c_str(), h.second.c_str());
  esp_err_t err = esp_http_client_open(client, (int) req.body.size());
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
  if (err == ESP_OK) {
    res.content_length = (int) esp_http_client_fetch_headers(client);
    const int status = esp_http_client_get_status_code(client);
    char buf[128];
    while (res.body.size() < req.max_body) {
      const int n = esp_http_client_read(client, buf, (int) std::min(sizeof(buf), req.max_body - res.body.size()));
      if (n <= 0) break;
      res.body.append(buf, (size_t) n);
    }
    res.status = status > 0 ? status : -1;
    if (status <= 0) res.error = "no status";
  } else {
    res.error = esp_err_to_name(err);
  }
  esp_http_client_cleanup(client);
}

inline void run(void *) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    res = Result{};
    res.job = req.job;
    const int64_t t0 = esp_timer_get_time();
    perform();
    res.took_ms = (uint32_t) ((esp_timer_get_time() - t0) / 1000);
    state.store(DONE);
  }
}

// Call once at boot, before the first submit
inline void begin(const char *ua) {
  user_agent = ua;
  // 8 KB: esp_http_client + mbedTLS handshake. Priority 1 like the ESPHome loop: WiFi, lwIP and BT tasks
  // still preempt it, and it yields while waiting on the network.
  xTaskCreatePinnedToCore(run, "net", 8192, nullptr, 1, &task, tskNO_AFFINITY);
}

inline bool busy() { return state.load() != IDLE; }

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
