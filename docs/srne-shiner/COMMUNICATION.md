# SRNE SHINER2430 communication

How an ESP32 talks to the controller over RS485 with Modbus RTU. Register meanings, wiring details and test
history are in [README.md](README.md).

**Sources:** port settings come from the [manual](Shiner_User_Manual_V1.05.pdf). Frame format is standard
Modbus RTU. Example frames were captured from our controller. Items marked *standard Modbus* or *not tested*
were not seen on this controller.

## Overview

The controller never sends anything by itself. The ESP32 asks, and the controller answers that one request.

```
ESP32 (master)                MAX485                  SHINER2430 (slave)
  GPIO17 TX  ---- DI ------>  |      |
  GPIO16 RX  <--- RO -------  |      | A <--> D+ pin 2
  GPIO5      ---- DE + RE ->  |      | B <--> D- pin 3
  GND        ---- GND ------  |      | GND -- GND pin 4
  3V3        ---- VCC ------  |      |
```

- **Data is only as fresh as the last read.** The ESP32 chooses how often to poll.
- **A dead link looks like silence.** The controller cannot report a problem by itself, so a timeout is the
  only sign.
- **One master only.** Another Modbus master on the same two wires would collide with the ESP32. Disconnect
  any dongle or PC adapter.

## Physical layer

| Item | Value |
|---|---|
| Port | RJ45, labelled RS485/CAN in the manual |
| Electrical | RS485, half duplex: one direction at a time on one pair |
| UART | 9600 baud, 8 data bits, no parity, 1 stop bit |
| Address | 1 by default, also answered 255 |
| Adjustable | Baud 1200–115200, address 1–247, in the controller menu |
| Port power | 5 V, 200 mA, not used by this design |

A ground wire between all three devices is required. Without it we saw random bytes, broken frames and
silence.

## Direction control

RS485 is half duplex, so the ESP32 switches the MAX485 for each request. DE and RE are tied together on GPIO5:

| GPIO5 | DE | RE | MAX485 state |
|---|---|---|---|
| High | Driver on | Receiver off | Transmit |
| Low | Driver off | Receiver on | Listen, the normal state |

Sequence for one request:

1. Clear anything left in the receive buffer.
2. Set GPIO5 high and wait 2 ms.
3. Send the frame, and wait until the UART has really finished sending (`Serial2.flush()`).
4. Wait 200 µs, then set GPIO5 low.
5. Read the reply until it is complete or the timeout passes.

Going low too early cuts off the last byte. Going low too late can miss the start of the reply.

## Frame format

A frame is raw binary, not text, and ends with a CRC. A silent gap separates frames.

```
| address | function | data ...  | CRC low | CRC high |
  1 byte    1 byte     N bytes     1 byte    1 byte
```

**Byte order:** register addresses and values are big-endian, high byte first. The CRC is the opposite, low
byte first.

### CRC-16 (Modbus)

Calculated over everything before the CRC. Start value `0xFFFF`, reflected polynomial `0xA001`.

```cpp
uint16_t crc16(const uint8_t *d, size_t n) {
  uint16_t c = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    c ^= d[i];
    for (int b = 0; b < 8; b++) c = (c & 1) ? (c >> 1) ^ 0xA001 : c >> 1;
  }
  return c;  // send c & 0xFF first, then c >> 8
}
```

Reject any reply with a wrong CRC. On a noisy line, reply bytes can look almost right.

## Function 03: read registers

**Request, always 8 bytes:**

| Byte | Example | Meaning |
|---|---|---|
| 0 | `01` | Address |
| 1 | `03` | Read registers |
| 2, 3 | `01 00` | First register, `0x0100` |
| 4, 5 | `00 01` | Number of registers, 1 |
| 6, 7 | `85 F6` | CRC |

**Reply, `5 + 2 × count` bytes:**

| Byte | Example | Meaning |
|---|---|---|
| 0 | `01` | Address |
| 1 | `03` | Same function |
| 2 | `02` | Data bytes, `2 × count` |
| 3, 4 | `00 58` | Value, `0x58` = 88, so 88% SOC |
| 5, 6 | `B9 BE` | CRC |

### Example: several registers in one request

Reading 11 registers from `0x0100` gets all live values at once:

```
Request: 01 03 01 00 00 0B 05 F1
Reply:   01 03 16 00 57 00 81 00 89 20 19 00 00 00 00 00 00 00 91 00 7C 00 12 00 00 98 CD
```

| Register | Raw | Decoded |
|---|---|---|
| `0x0100` SOC | `00 57` | 87% |
| `0x0101` battery voltage | `00 81` | 129 × 0.1 = 12.9 V |
| `0x0102` charge current | `00 89` | 137 × 0.01 = 1.37 A |
| `0x0103` temperatures | `20 19` | High byte 32 °C controller, low byte 25 °C battery |
| `0x0104` load voltage | `00 00` | 0.0 V |
| `0x0105` load current | `00 00` | 0.00 A |
| `0x0106` load power | `00 00` | 0 W |
| `0x0107` solar voltage | `00 91` | 145 × 0.1 = 14.5 V |
| `0x0108` solar current | `00 7C` | 124 × 0.01 = 1.24 A |
| `0x0109` solar power | `00 12` | 18 W |
| `0x010A` load command | `00 00` | 0, load off |

The reader treats each temperature byte as a signed 8-bit value. Temperatures below 0 °C are *not tested*, and
SRNE may encode them differently.

### Example: identity

```
Request: 01 03 00 0A 00 01 A4 08
Reply:   01 03 02 18 1E 32 4C
```

`0x18` = 24 V maximum, `0x1E` = 30 A rated charge current.

## Function 06: write one register

The reply is an exact copy of the request. Anything else means the write was not confirmed.

| Byte | Example | Meaning |
|---|---|---|
| 0 | `01` | Address |
| 1 | `06` | Write one register |
| 2, 3 | `01 0A` | Register, `0x010A` load command |
| 4, 5 | `00 01` | Value, 1 = on |
| 6, 7 | `69 F4` | CRC |

Writes tested so far:

| Purpose | Frame | Result |
|---|---|---|
| Load on | `01 06 01 0A 00 01 69 F4` | Load went on, top bit of `0x0120` set |
| Capacity 100 Ah | `01 06 E0 02 00 64 1E 21` | Read back as 100, kept through a power cycle, a factory reset restored 200 |

After a write, read the register back, because a matching reply only shows that the frame arrived.

## Errors

| What happens | Likely meaning | What to do |
|---|---|---|
| No bytes before the timeout | Controller off, wiring or address wrong, or unmapped register | Count the failure, retry at the next poll |
| Bad CRC or wrong length | Noise, usually a missing ground or wrong wires | Discard the reply |
| Bytes while idle, mostly `FF` | Line noise | Check the ground |
| Own request comes back, with `00` after it | MAX485 not properly powered | Check VCC |
| Function byte `0x83` or `0x86`, then an error code | Controller refused the request (*standard Modbus*, not seen yet) | Log the code and don't retry at once |

Standard Modbus exception replies are 5 bytes: address, function + `0x80`, code, CRC. Common codes are `01`
illegal function, `02` illegal address and `03` illegal value. `0xF800` gave no reply at all on this
controller, so an unmapped register can also look like a timeout.

## Timing

At 9600 baud with 8N1, one byte is 10 bits, about 1.04 ms.

| Frame | Bytes | Time on the wire |
|---|---|---|
| Any request | 8 | about 8.3 ms |
| 1 register reply | 7 | about 7.3 ms |
| 11 registers (live) | 27 | about 28 ms |
| 16 registers (identity) | 37 | about 39 ms |

- **Reply delay:** not measured. A 300 ms window worked for the history scan, and the reader allows 800 ms. Use
  at least 300 ms.
- **Between requests:** the reader waits 100 ms, the history scan waited 20 ms over 211 reads with no failures.
  Standard Modbus needs at least 3.5 characters of silence, about 4 ms here.
- **Largest read tested:** 16 registers. Do not ask for more in one request until it's been tried.
- **Register groups:** every group below was read as one request. Reading across groups is *not tested*.

## Polling plan for the firmware

| Data | Request | Interval |
|---|---|---|
| Live values | `0x0100` × 11 | 60 s |
| Status and faults | `0x0120` × 3 | 60 s |
| Today and lifetime | `0x010B` × 16, `0x011B` × 16 | 5 min |
| Settings | `0xE002` × 13 | Boot and daily |
| Identity | `0x000A` × 16 | Boot and daily |
| Daily history | `0xF000` + n × 10, one per day | After an outage, once history is proven |

## Implementation rules

The reader in [tools/srne_reader](../../tools/srne_reader) waits in a blocking loop, which is fine for testing.
**The real firmware must not block**, so a silent controller cannot stall BLE or uploads. Use a small state
machine that does one step per main loop:

```
IDLE      next poll due: clear RX, GPIO5 high, go to TX_WAIT
TX_WAIT   after 2 ms: write the frame, go to TX_DONE
TX_DONE   when the UART has finished: GPIO5 low, go to RX
RX        reply complete: check CRC, decode, go to IDLE
          timeout: count a failure, go to IDLE
```

- Check the length, address, function, byte count and CRC before using a value.
- Never reuse old values after a failure. Mark the reading as missing.
- Count failures and report them to Firebase. A silent controller must not reset the radio.
- Write only on an explicit request, once, and read the value back. Never write as part of a retry or at boot,
  or a restart could switch the load back on.

## Test commands

The reader is read-only and prints each raw reply. From `tools/srne_reader`:

```bash
pio run -t upload
```

```bash
python read.py 20
```

`read.py` prints the board's serial output for that many seconds. It's set to COM8.
