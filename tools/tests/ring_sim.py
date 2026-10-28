"""Line-by-line Python copy of flog::Ring (flash_log.h) on a simulated NOR flash, checked against a model.

Flash rules as on the chip: erase sets a 4 KB sector to 0xFF, a write can only clear bits (new = old & data).
"""
import random
import struct
import sys

SECTOR, SLOT = 4096, 32
SLOTS = SECTOR // SLOT
ITEMS = SLOTS - 1
PAYLOAD = 30
MAGIC = 0x4A4B4C31
ST_EMPTY, ST_STORED, ST_SENT, ST_BAD = 0xFF, 0x7F, 0x3F, 0x00


def crc8(b):
    c = 0
    for x in b:
        c ^= x
        for _ in range(8):
            c = ((c << 1) ^ 0x07) & 0xFF if c & 0x80 else (c << 1) & 0xFF
    return c


class Flash:
    def __init__(self, size):
        self.m = bytearray(b"\xff" * size)
        self.cut_after = None  # power cut: only this many bytes of the next write land, then raise

    def read(self, a, n):
        return bytes(self.m[a:a + n])

    def write(self, a, data):
        n = len(data)
        if self.cut_after is not None:
            n, self.cut_after = min(self.cut_after, n), None
            for i in range(n):
                self.m[a + i] &= data[i]
            raise PowerCut()
        self.m[a:a + n] = bytes(x & y for x, y in zip(self.m[a:a + n], data))
        return True

    def erase(self, a, n):
        if self.cut_after is not None:
            k, self.cut_after = self.cut_after, None
            self.m[a:a + min(k, n)] = b"\xff" * min(k, n)
            raise PowerCut()
        self.m[a:a + n] = b"\xff" * n
        return True


class PowerCut(Exception):
    pass


class Ring:
    def begin(self, f, first, sectors, kind):
        self.f, self.first, self.sectors, self.kind = f, first, sectors, kind
        self.count = 0
        self.head = self.tail = 0
        self.head_open = False
        self.dropped = 0
        newest = -1
        self.seq = 0
        for s in range(sectors):
            q = self.header_seq(s)
            if q is not None and q >= self.seq:
                self.seq, newest = q, s
        if newest < 0:
            return
        self.head = newest * ITEMS + ITEMS
        for i in range(ITEMS):
            if self.erased(newest * ITEMS + i):
                self.head = newest * ITEMS + i
                break
        self.head_open = self.head < newest * ITEMS + ITEMS
        self.head %= self.cap()
        found = False
        for k in range(1, sectors + 1):
            s = (newest + k) % sectors
            if self.header_seq(s) is None:
                continue
            for i in range(ITEMS):
                x = s * ITEMS + i
                if s == newest and self.head_open and x >= self.head:
                    break
                if self.stored(x):
                    if not found:
                        self.tail = x
                    found = True
                    self.count += 1
        if not found:
            self.tail = self.head

    def cap(self):
        return self.sectors * ITEMS

    def span(self):
        if self.count == 0:
            return 0
        d = (self.head + self.cap() - self.tail) % self.cap()
        return self.cap() if d == 0 else d

    def addr(self, x):
        return (self.first + x // ITEMS) * SECTOR + (x % ITEMS + 1) * SLOT

    def header_seq(self, s):
        h = self.f.read((self.first + s) * SECTOR, 13)
        magic, kind, seq = struct.unpack("<III", h[:12])
        if magic != MAGIC or kind != self.kind or h[12] != crc8(h[:12]):
            return None
        return seq

    def erased(self, x):
        return self.f.read(self.addr(x), SLOT) == b"\xff" * SLOT

    def stored(self, x):
        b = self.f.read(self.addr(x), SLOT)
        return b[30] == ST_STORED and b[31] == crc8(b[:PAYLOAD])

    def read_payload(self, x):
        b = self.f.read(self.addr(x), SLOT)
        return b[:PAYLOAD] if b[31] == crc8(b[:PAYLOAD]) else None

    def push(self, payload):
        buf = payload + bytes([ST_STORED, crc8(payload)])
        for _ in range(3):
            if not self.head_open and not self.open_sector(self.head // ITEMS):
                return False
            x = self.head
            self.head = (self.head + 1) % self.cap()
            if self.head % ITEMS == 0:
                self.head_open = False
            self.f.write(self.addr(x), buf)
            if self.f.read(self.addr(x), SLOT) == buf:
                if self.count == 0:
                    self.tail = x
                self.count += 1
                return True
            self.f.write(self.addr(x) + 30, bytes([ST_BAD]))
        return False

    def peek(self, i):
        for k in range(self.span()):
            x = (self.tail + k) % self.cap()
            if not self.stored(x):
                continue
            if i == 0:
                return self.read_payload(x)
            i -= 1
        return None

    def peek_newest(self):
        for k in range(1, self.span() + 1):
            x = (self.head + self.cap() - k) % self.cap()
            if self.stored(x):
                return x, self.read_payload(x)
        return None, None

    def discard(self, n):
        for k in range(self.span()):
            if n == 0:
                break
            x = (self.tail + k) % self.cap()
            if not self.stored(x):
                continue
            self.mark_sent(x)
            n -= 1
        self.advance_tail()

    def discard_newest(self):
        x, p = self.peek_newest()
        if p is None:
            return
        self.mark_sent(x)
        self.advance_tail()

    def mark_sent(self, x):
        self.f.write(self.addr(x) + 30, bytes([ST_SENT]))
        if self.count > 0:
            self.count -= 1

    def advance_tail(self):
        if self.count == 0:
            self.tail = self.head
            return
        k = 0
        while k < self.cap() and not self.stored(self.tail):
            self.tail = (self.tail + 1) % self.cap()
            k += 1

    def open_sector(self, s):
        if self.header_seq(s) is not None and self.count > 0:
            lost = sum(1 for i in range(ITEMS) if self.stored(s * ITEMS + i))
            self.dropped += lost
            self.count -= min(self.count, lost)
            if self.tail // ITEMS == s:
                self.tail = ((s + 1) % self.sectors) * ITEMS
                self.advance_tail()
        self.f.erase((self.first + s) * SECTOR, SECTOR)
        self.seq += 1
        h = struct.pack("<III", MAGIC, self.kind, self.seq)
        h = h + bytes([crc8(h)]) + b"\xff" * (SLOT - 13)
        self.f.write((self.first + s) * SECTOR, h)
        self.head_open = True
        if self.count == 0:
            self.tail = self.head
        return True


# ---------------------------------------------------------------- checks
def item(i):
    return struct.pack("<I", i) + bytes((i * 7 + k) & 0xFF for k in range(PAYLOAD - 4))


def ident(p):
    return None if p is None else struct.unpack("<I", p[:4])[0]


def on_flash(r):
    """Ids of every stored item, by scanning all slots (independent of the ring's own state)."""
    ids = []
    for x in range(r.cap()):
        if r.header_seq(x // ITEMS) is not None and r.stored(x):
            ids.append(ident(r.read_payload(x)))
    return sorted(ids)


def check(r, model, where):
    ids = on_flash(r)
    assert r.count == len(ids), f"{where}: count {r.count} != stored {len(ids)}"
    assert ids == sorted(model), f"{where}: flash {ids[:5]}..{ids[-5:]} != model {sorted(model)[:5]}..{sorted(model)[-5:]}"
    # queue order: peek(0..) ascending, newest = max
    n = min(len(ids), 6)
    assert [ident(r.peek(i)) for i in range(n)] == ids[:n], f"{where}: peek order"
    if ids:
        assert ident(r.peek_newest()[1]) == ids[-1], f"{where}: newest"
        assert ident(r.peek(len(ids) - 1)) == ids[-1], f"{where}: peek last"
        assert ident(r.peek(len(ids))) is None, f"{where}: peek past end"


def reboot(f, sectors):
    r = Ring()
    r.begin(f, 0, sectors, 1)
    return r


def apply_drops(r, model, before):
    """Items erased by a wrap: the ring reports them in dropped; they must be the oldest of the model."""
    lost = r.dropped - before
    if lost:
        model.sort()
        del model[:lost]


def run(seed, sectors, steps, cuts):
    rnd = random.Random(seed)
    f = Flash(sectors * SECTOR)
    if seed % 3 == 0:  # foreign data in the partition (old app1/nvs bytes)
        for i in range(len(f.m)):
            f.m[i] = rnd.randrange(256)
    r = reboot(f, sectors)
    model = []
    nxt = 1
    for step in range(steps):
        op = rnd.random()
        try:
            if op < 0.55:
                if cuts and rnd.random() < 0.03:
                    f.cut_after = rnd.randrange(1, SLOT)
                before = r.dropped
                ok = r.push(item(nxt))
                assert ok
                apply_drops(r, model, before)
                model.append(nxt)
                nxt += 1
            elif op < 0.75:
                n = rnd.randrange(0, 5)
                r.discard(n)
                model.sort()
                del model[:n]
            elif op < 0.85:
                if model:
                    x, p = r.peek_newest()
                    r.discard_newest()
                    model.remove(max(model))
            elif op < 0.97:
                d = r.dropped
                r = reboot(f, sectors)
                r.dropped = d
            else:
                if cuts and rnd.random() < 0.5:
                    f.cut_after = rnd.randrange(1, SECTOR)  # cut during the next erase or write
                before = r.dropped
                r.push(item(nxt))
                apply_drops(r, model, before)
                model.append(nxt)
                nxt += 1
        except PowerCut:
            # power lost mid-write: reboot; the item being written may or may not have survived
            d = r.dropped
            r = reboot(f, sectors)
            ids = on_flash(r)
            model = [m for m in model if m in ids] + ([nxt] if nxt in ids else [])
            nxt += 1
            r.dropped = d
        check(r, model, f"seed {seed} step {step}")
    return nxt


if __name__ == "__main__":
    total = 0
    for seed in range(40):
        sectors = [2, 3, 5, 8][seed % 4]
        total += run(seed, sectors, 1500, cuts=seed % 2 == 1)
        print(f"  run {seed} ({sectors} sectors) ok", flush=True)
    print(f"ok: 40 runs, {total} pushes, rings of 2..16 sectors, wrap-around, reboots, power cuts, foreign data")
