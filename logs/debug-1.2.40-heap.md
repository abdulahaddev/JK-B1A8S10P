# 1.2.39/1.2.40 heap corruption: TLS session resumption with dynamic mbedTLS buffers

**Result:** the heap is corrupted inside `mbedtls_ssl_read` (ESP-IDF dynamic buffer wrapper) on a
connection resumed from a TLS session ticket. Kept connections without a reconnect ran clean.

| Run | Mode | What happened |
|---|---|---|
| 1.2.39, 29 Oct 02:04-02:09 | keep | 1 full handshake, 10 reused requests ok; crash (heap free list) in the BT task's malloc |
| 1.2.40, 02:40-02:44 | keep | 1 full handshake, 8 reused ok; crash on the next request, a new (resumed) connection: `crash in headers, request 15, mode 2, job 1` |
| 1.2.40, 02:50-02:51 | resume | first resumed connect ok (2213 ms vs 3201 ms full); crash on the second: `crash in headers, request 20, mode 1, job 1` |

1.2.40 checks the heap before and after every request step: the check before `headers` passed both times,
so the damage happens while the reply is read. Backtrace of the 02:44 crash (dist/jk-bms-1.2.40.elf):

```
tlsf_malloc <- multi_heap_malloc <- heap_caps_malloc <- esp_coex_common_malloc_internal_wrapper
<- esf_buf_alloc <- ieee80211_output_do <- esp_wifi_internal_tx <- ... <- tcp_send_empty_ack <- tcp_recved
<- lwip_recv_tcp <- mbedtls_net_recv <- mbedtls_ssl_fetch_input <- mbedtls_ssl_read
<- __wrap_mbedtls_ssl_read (port/dynamic/esp_ssl_tls.c:360) <- esp_tls_conn_read <- esp_http_client_fetch_headers
<- net::perform() <- net::run()
EXCVADDR 0xfeb98b11 (overwritten TLSF free-list pointer)
```

Config at the time: ESP-IDF 5.5.4, CONFIG_MBEDTLS_DYNAMIC_BUFFER, CONFIG_MBEDTLS_DYNAMIC_FREE_CONFIG_DATA,
CONFIG_MBEDTLS_CLIENT_SSL_SESSION_TICKETS, CONFIG_ESP_TLS_CLIENT_SESSION_TICKETS, TLS 1.2,
CONFIG_HEAP_POISONING_COMPREHENSIVE (1.2.40). After each crash the board ran with the mode off for that
boot, and control/keepalive was set to "off".
