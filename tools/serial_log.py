"""Capture the board's serial log without resetting it (DTR/RTS stay low).

Usage (from the repository root):
    python tools/serial_log.py COM8 logs/<name>.log [minutes]

Each line gets a PC timestamp. Runs until the time is up (default 60 min) or Ctrl+C.
Lines from the crash handler and watchdogs are also echoed to the console.
URL credentials (auth=...) are redacted: ESPHome prints full request URLs on HTTP errors.
"""

import datetime
import re
import sys
import time

import serial

port, path = sys.argv[1], sys.argv[2]
minutes = float(sys.argv[3]) if len(sys.argv) > 3 else 60
WATCH = ("esp32.crash", "watchdog", "Guru Meditation", "rst:", "Backtrace", "abort", "[E]", "[W][ota", "[W][radio")

ser = serial.Serial()
ser.port = port
ser.baudrate = 115200
ser.timeout = 1
ser.dtr = False
ser.rts = False
ser.open()
end = time.time() + minutes * 60
with open(path, "a", encoding="utf-8", errors="replace") as out:
    buf = b""
    while time.time() < end:
        try:
            buf += ser.read(4096)
        except serial.SerialException as e:  # port vanished (board unplugged); keep trying
            out.write(f"{datetime.datetime.now():%H:%M:%S.%f} [serial_log] {e}\n")
            time.sleep(2)
            try:
                ser.close()
                ser.open()
            except serial.SerialException:
                pass
            continue
        *lines, buf = buf.split(b"\n")
        for raw in lines:
            line = raw.decode("utf-8", errors="replace").rstrip("\r")
            line = re.sub(r"auth=[A-Za-z0-9_\-]+", "auth=REDACTED", line)
            stamped = f"{datetime.datetime.now():%H:%M:%S.%f}"[:-3] + " " + line
            out.write(stamped + "\n")
            if any(w in line for w in WATCH):
                print(stamped, flush=True)
        out.flush()
ser.close()
