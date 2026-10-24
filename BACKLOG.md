# Backlog

## OTA-first memory handling (waiting)

When the update signal is read, the update gets priority over everything else:

1. Set an `ota_active` flag at once. Uploads, info/energy uploads and control checks skip while it is
   set; the display shows "OTA...".
2. Free memory in order: stop the BLE scan, clean disconnect, `ble.disable`, then wait until free heap
   and the largest free block are above a threshold (about 45 KB / 30 KB).
3. If memory is still short after ~10 s: store the target version in RTC memory and restart into an
   OTA-first boot (BLE off, uploads paused), connect WiFi, flash, and only then start normally.

The telemetry buffer is static memory (RTC ring + static RAM array), not heap, so it is kept: the RTC
readings survive the reboot and upload afterwards. On a download error the existing `on_error` turns
BLE and uploads back on; bootloader rollback still guards against a bad image.

## Upload batch recalibration (waiting)

The batch formula still assumes ~34 KB for a TLS session (measured before the 1.2.8 mbedTLS dynamic
buffers) plus a 24 KB reserve, so at ~54 KB free heap it sends 1-2 readings per request and a Q32 queue
takes ~15 min to clear. Recalibrate (TLS ~20 KB, reserve ~16 KB -> ~10 per batch), flash, and check
min_free_heap stays above ~20 KB during the next catch-up.
