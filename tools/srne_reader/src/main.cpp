// Read-only SRNE probe: Modbus RTU function 03 only, never writes a register.
#include <Arduino.h>
static const int PIN_RX = 16, PIN_TX = 17, PIN_DE = 5;
static uint8_t slave_id = 1;

static uint16_t crc16(const uint8_t *d, size_t n) {
  uint16_t c = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    c ^= d[i];
    for (int b = 0; b < 8; b++) c = (c & 1) ? (c >> 1) ^ 0xA001 : c >> 1;
  }
  return c;
}

// Returns the number of registers read, 0 on no/bad reply
static int read_regs(uint8_t id, uint16_t addr, uint8_t count, uint16_t *out, bool verbose = true) {
  uint8_t q[8] = {id, 3, (uint8_t)(addr >> 8), (uint8_t)addr, 0, count, 0, 0};
  uint16_t c = crc16(q, 6);
  q[6] = c & 0xFF; q[7] = c >> 8;
  while (Serial2.available()) Serial2.read();
  digitalWrite(PIN_DE, HIGH);
  delay(2);
  Serial2.write(q, 8);
  Serial2.flush();
  delayMicroseconds(200);
  digitalWrite(PIN_DE, LOW);
  uint8_t buf[160];
  size_t total = 0;
  uint32_t start = millis();
  while (millis() - start < 800 && total < sizeof(buf)) {
    if (Serial2.available()) buf[total++] = Serial2.read();
  }
  if (verbose) {
    Serial.printf("  0x%04X x%u id=%u raw[%u]:", addr, count, id, (unsigned) total);
    for (size_t i = 0; i < total; i++) Serial.printf(" %02X", buf[i]);
    Serial.println();
  }
  // The transceiver echoes our request; the reply is a valid frame somewhere after it
  uint8_t *r = nullptr;
  const size_t want = count * 2 + 5;
  for (size_t i = 0; i + want <= total; i++) {
    if (buf[i] == id && buf[i + 1] == 3 && buf[i + 2] == count * 2 &&
        crc16(buf + i, want - 2) == (uint16_t) (buf[i + want - 2] | (buf[i + want - 1] << 8))) { r = buf + i; break; }
  }
  for (size_t i = 0; verbose && i + 5 <= total; i++) {
    if (buf[i] == id && buf[i + 1] == 0x83 && crc16(buf + i, 3) == (uint16_t) (buf[i + 3] | (buf[i + 4] << 8))) {
      Serial.printf("  modbus exception %u\n", buf[i + 2]);
    }
  }
  if (r == nullptr) return 0;
  for (int i = 0; i < count; i++) out[i] = (r[3 + 2 * i] << 8) | r[4 + 2 * i];
  return count;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_DE, OUTPUT);
  digitalWrite(PIN_DE, LOW);
  Serial2.begin(9600, SERIAL_8N1, PIN_RX, PIN_TX);
}

void loop() {
  uint16_t v[32];
  Serial.println("\n=== SRNE probe ===");
  if (!read_regs(slave_id, 0x000A, 16, v)) {
    Serial.println("no reply, scanning ids 1..5 and 255");
    for (int id : {1, 2, 3, 4, 5, 255}) {
      if (read_regs(id, 0x000A, 1, v) || read_regs(id, 0x0100, 1, v)) { slave_id = id; Serial.printf("FOUND id=%d\n", id); break; }
    }
    delay(2000);
    return;
  }
  Serial.printf("max_voltage=%u V rated_charge=%u A rated_discharge=%u A type=%u\n", v[0] >> 8, v[0] & 0xFF, v[1] >> 8, v[1] & 0xFF);
  char model[17] = {0};
  for (int i = 0; i < 8; i++) { model[2 * i] = v[2 + i] >> 8; model[2 * i + 1] = v[2 + i] & 0xFF; }
  Serial.printf("model='%s'\n", model);
  Serial.printf("sw=%04X%04X hw=%04X%04X\n", v[10], v[11], v[12], v[13]);
  Serial.printf("serial_regs=%04X%04X\n", v[14], v[15]);
  if (read_regs(slave_id, 0x001A, 1, v)) Serial.printf("modbus_addr=%u\n", v[0]);
  delay(100);
  if (read_regs(slave_id, 0x0100, 11, v)) {
    Serial.printf("soc=%u%% batt=%.1fV charge=%.2fA ctrl_temp=%d batt_temp=%d\n", v[0], v[1] * 0.1, v[2] * 0.01, (int8_t)(v[3] >> 8), (int8_t)(v[3] & 0xFF));
    Serial.printf("load=%.1fV %.2fA %uW pv=%.1fV %.2fA %uW\n", v[4] * 0.1, v[5] * 0.01, v[6], v[7] * 0.1, v[8] * 0.01, v[9]);
  }
  delay(100);
  read_regs(slave_id, 0x010B, 16, v);
  delay(100);
  read_regs(slave_id, 0x011B, 16, v);
  delay(100);
  if (read_regs(slave_id, 0xE002, 13, v)) {
    Serial.printf("capacity=%uAh sysV=%04X type=%u overV=%.1f limit=%.1f equal=%.1f boost=%.1f float=%.1f boost_ret=%.1f lvr=%.1f warn=%.1f lvd=%.1f limit_low=%.1f\n",
      v[0], v[1], v[2], v[3] * .1, v[4] * .1, v[5] * .1, v[6] * .1, v[7] * .1, v[8] * .1, v[9] * .1, v[10] * .1, v[11] * .1, v[12] * .1);
  }
  delay(100);
  // Daily history: one 10-register record per address, 0xF000 looks like the current day
  for (uint16_t a : {0xF000, 0xF001, 0xF002}) {
    read_regs(slave_id, a, 10, v);
    delay(100);
  }
  delay(5000);
}
