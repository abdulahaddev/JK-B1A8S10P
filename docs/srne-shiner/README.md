# SRNE SHINER2430 over RS485 (Modbus RTU)

Findings from reading the controller with an ESP32 and a MAX485, November 2026. Manual:
[Shiner_User_Manual_V1.05.pdf](Shiner_User_Manual_V1.05.pdf). Reader code: [tools/srne_reader](../../tools/srne_reader).

**How far to trust this:** the manual gives the port, pinout, baud rate and setting ranges, but no register
map. Registers below come from the usual SRNE layout. "Read" means the controller answered there; meanings
are checked only where noted.

## Device

| Item | Value |
|---|---|
| Model | Shiner2430, max 24 V, 30 A charge, 20 A load |
| Serial number | 17020064 |
| Software / hardware | 00.01.00.03 / 02.00.00.01 |
| Modbus | RTU, address 1, 9600 baud, 8N1. It also answered id 255 |

## Wiring

**The manual numbers the RJ45 differently from our first notes, which were a mirror image. Use the manual
(page 17).**

| RJ45 pin | Signal | MAX485 / ESP32 |
|---|---|---|
| 1 | +5 V, 200 mA | not connected, keep clear of other pins |
| 2 | D+ | A |
| 3 | D− | B |
| 4 | Power / signal ground | MAX485 GND and ESP32 GND |
| 5, 6 | NC | |
| 7, 8 | CAN_H, CAN_L | |

| MAX485 | ESP32 |
|---|---|
| VCC | 3V3 (not 5 V: RO would drive a 5 V signal into GPIO16) |
| GND | GND |
| RO | GPIO16 |
| DI | GPIO17 |
| DE + RE | GPIO5 (D5) |

Confirm the pin numbering with a meter first: controller on, about 5 V between pins 1 and 4. The final A/B
orientation and meter result were not written down during testing. If nothing answers, swap A and B.

The small 4-pin TTL-COM port is a separate port and its power pin is 8.5 V. Do not connect to it.

## Troubleshooting we went through

| Symptom | Cause |
|---|---|
| esptool: "serial TX path seems to be down" | MAX485 RO on RX0 blocks flashing. Use GPIO16/17 |
| Own request echoed back, wrong bits, `00` after each frame | MAX485 VCC not connected |
| Silence, clean line, no bytes at any baud | Wrong RJ45 pins (mirrored numbering) |
| Random bytes, mostly `FF`, broken frames | Ground not shared between controller, MAX485 and ESP32 |
| Answers for a while, then silent | Ground missing again. Not the `0xE002` read, which ran repeatedly once the ground was good |

Do not use a short reply timeout: the reader waits up to 800 ms per request.

## Registers (function 03)

Values are big-endian 16-bit. Decoded from one controller; meanings are the usual SRNE layout.

### Identity, `0x000A`, 16 registers

| Register | Meaning | Read |
|---|---|---|
| `0x000A` | High byte max voltage, low byte rated charge current | `181E` = 24 V, 30 A |
| `0x000B` | High byte rated load current, low byte type | `1400` = 20 A, 0 |
| `0x000C`–`0x0013` | Model, ASCII | `    Shiner2430  ` |
| `0x0014`–`0x0015` | Software version | `0001 0003` |
| `0x0016`–`0x0017` | Hardware version | `0200 0001` |
| `0x0018`–`0x0019` | Serial number | `1702 0064` |
| `0x001A` | Modbus address | 1 |

### Live, `0x0100`, 11 registers

| Register | Meaning | Scale |
|---|---|---|
| `0x0100` | Controller's SOC | % |
| `0x0101` | Battery voltage | 0.1 V |
| `0x0102` | Charge current | 0.01 A |
| `0x0103` | High byte controller temp, low byte battery temp (25 °C may be a no-sensor default) | °C |
| `0x0104`–`0x0106` | Load voltage, current, power | 0.1 V, 0.01 A, 1 W |
| `0x0107`–`0x0109` | Solar voltage, current, power | 0.1 V, 0.01 A, 1 W |

### Today and lifetime, `0x010B`, 32 registers

| Register | Meaning |
|---|---|
| `0x010B`, `0x010C` | Lowest, highest battery voltage (0.1 V) |
| `0x010D`, `0x010E` | Peak charge, load current (0.01 A) |
| `0x010F`, `0x0110` | Peak charge, load power (W) |
| `0x0111`, `0x0112` | Ah charged, used |
| `0x0113`, `0x0114` | Wh generated, consumed |
| `0x0115` | Days running |
| `0x0116`, `0x0117` | Over-discharge count, full-charge count |
| `0x0118`–`0x011F` | Lifetime totals of Ah and Wh. Exact split not checked |
| `0x0120` | Top bit load on (tested). Low byte charging stage (2 seen, shown as MPPT, not checked) |
| `0x0121`, `0x0122` | Fault bits. All 0 so far, bit meanings not checked |

A power cycle appears to reset these: `0x0115` went from 1 to 0, and today's peak fell from 4.94 A, 61 W.

### Settings, `0xE002`, 13 registers

Everything but capacity matches the LI column in the manual (section 8.1), which also checks the decode.

| Register | Meaning | Read |
|---|---|---|
| `0xE002` | Battery capacity (Ah) | 200, **now 100** |
| `0xE003` | System voltage | `0C0C` (12 V) |
| `0xE004` | Battery type | 4 (LI) |
| `0xE005` | Over-voltage disconnect | 16.0 V |
| `0xE006` | Charge limit | 15.5 V |
| `0xE007` | Equalize | 14.4 V |
| `0xE008` | Boost | 14.4 V |
| `0xE009` | Float (LI has no float stage) | 14.4 V |
| `0xE00A` | Boost reconnect | 13.2 V |
| `0xE00B` | Over-discharge restore (load reconnect) | 12.6 V |
| `0xE00C` | Under-voltage warning | 12.0 V |
| `0xE00D` | Over-discharge (load disconnect) | 11.1 V |
| `0xE00E` | Over-discharge cutoff | 10.6 V |

On LI these voltages are fixed. The manual allows editing them under USE LI only (9–17 V). Values above are
as read on 2026-11-06, the menu may have changed them since.

Suggested for the 100 Ah LiFePO4 pack, based on the BMS data: USE LI, load disconnect 12.0 V, reconnect
12.8 V, boost 14.2–14.4 V. These apply to the LOAD terminals only.

### Writing (function 06)

Tested once: capacity is not in the screen menu, so it was written over Modbus.

- Request and matching reply: `01 06 E0 02 00 64 1E 21` (`0xE002` = 100)
- Read back as 100, the other 12 settings unchanged, still 100 after a power cycle of the controller only

Load switching, also tested once:

- Request and matching reply: `01 06 01 0A 00 01 69 F4` (`0x010A` = 1, load on)
- Load went from 0.0 V to 12.9 V, then drew 0.84 A, 10 W with a test load
- `0x0120` went from `0002` to `8002`, so the top bit means load on. `0x010A` reads back as 1
- Load mode read at `0xE01D` was 15, the manual's default. `0xE01D` is the usual SRNE address, and that 15 means
  manual mode is from the manual's default, not checked further
- Writing 0 to turn it off is untested

No other register has been written.

### Daily history, `0xF000`, 10 registers per address

The manual says "Save the last 200 days of historical data", but does not say how to read it.

| Offset | Meaning, assuming the `0x010B` order | Read at `0xF000` |
|---|---|---|
| 0, 1 | Lowest, highest battery voltage | 12.9 V, 13.0 V |
| 2, 3 | Peak charge, load current | 1.49 A, 0 |
| 4, 5 | Peak charge, load power | 19 W, 0 |
| 6, 7 | Ah charged, used | 0, 0 |
| 8, 9 | Wh generated, consumed | 0, 0 |

- `0xF000` looks like the current day. `0xF001` returned zeros, not a shifted copy, so each address looks
  like one whole day, not one register.
- `0xF002`, `0xF00A`, `0xF014`, `0xF01E`, `0xF0C8`, `0xF100`, `0xF200` returned zeros. `0xF800` did not answer.
- Records have no date, only a position.

**Not proven yet:** that past days are stored, how a new day is detected, and whether a power cut clears them.

**Next check:** with a small load on the LOAD terminals and the controller left powered through a real night,
read `0xF000` and `0xF001`. If `0xF001` holds the previous day, including the load's Ah and Wh, history works.

## Design for adding this to the firmware

Agreed direction, not built yet: one board, the existing ESP32 and `my-jk-bms-firebase.yaml`.

- Why not the others: Modbus adds very little load (last report 56 KB minimum free heap, 61 KB largest block,
  but only 5 minutes after a boot, so watch it). The S3 N16R8 is the upgrade if memory or storage runs out, but
  needs BLE, OTA and watchdogs retested. Two boards double the upkeep. The ESP8266 has no BLE and little TLS memory.
- UART2 on GPIO16/17, DE/RE on GPIO5. The firmware's pin settings don't use these. The OLED is on 21/22.
- Modbus must not block the main loop, so a silent controller cannot stall BLE or uploads.
- BMS and controller fail separately. A silent controller is reported, and never resets the radio.
- Poll live data every 60 s, daily totals every 5 min, settings and identity at boot and once a day.
- Firebase: `controller/<ts>` and `controller_info` in the same PATCH, BMS paths unchanged.
- Offline storage: the 640 KB flash ring is shared. BMS alone gives about 6.3 days, plus controller every 60 s
  about 4.2 days, every 5 min while offline about 5.8 days (only with working daily history).
- Daily history backfill only after the check above passes.
- Keep the board's current power supply. The port's 5 V, 200 mA is too little for it.
