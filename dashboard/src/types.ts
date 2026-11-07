// Shapes of the Firebase nodes written by my-jk-bms-firebase.yaml

export interface Reading {
  ts: number; // unix seconds (the telemetry key)
  total_voltage: number;
  current?: number; // A, + charging / - discharging
  cell_voltage_1: number;
  cell_voltage_2: number;
  cell_voltage_3: number;
  cell_voltage_4: number;
  capacity_remaining: number; // Ah
  state_of_charge: number; // %
  balancing_current?: number;
  mosfet_temperature?: number;
  temperature_sensor_1?: number;
  temperature_sensor_2?: number;
  charging: number;
  discharging: number;
  balancing: number;
}

/** controller/<ts>: the solar controller's live values (fw 1.3.1+). */
export interface Ctrl {
  ts: number;
  batt_v: number;
  charge_a: number; // what the controller puts out (BMS current is the battery's net)
  soc: number; // the controller's own estimate: not shown as the battery's state
  ctrl_temp: number;
  batt_temp: number;
  load_v: number;
  load_a: number;
  load_w: number;
  pv_v: number;
  pv_a: number;
  pv_w: number;
  status?: number; // 0x0120: top bit load on, low byte charging stage
  faults: number;
}

/** controller_info: raw registers, see docs/srne-shiner/README.md (fw 1.3.1+). */
export interface CtrlInfo {
  updated?: number;
  today?: number[]; // 0x010B..: min V, max V, peak charge A, peak load A, peak charge W, peak load W, Ah in, Ah out, Wh in, Wh out, days, ...
  totals?: number[]; // 0x011B..: lifetime Ah used (low), Wh generated (high, low), Wh consumed (high, low)
  settings?: number[]; // 0xE002..: capacity, system V, type, over V, limit, equalize, boost, float, boost return, reconnect, warning, disconnect, cutoff
  ident?: number[]; // 0x000A..: max V/charge A, load A/type, model (8), software (2), hardware (2), serial (2)
}

export interface Device {
  ctrl_silent_s?: number; // seconds since the controller last answered (fw 1.3.1+)
  ctrl_ok?: number;
  ctrl_fail?: number;
  ctrl_queued?: number;
  ctrl_dropped?: number;
  last_seen?: number;
  uptime_s?: number;
  boot_count?: number;
  reset_reason?: string;
  restart_cause?: string;
  watchdog_resets?: number;
  wifi_rssi?: number;
  wifi_disconnects?: number;
  ble_connected?: number;
  ble_disconnects?: number;
  bms_rssi?: number;
  free_heap?: number;
  min_free_heap?: number;
  max_block?: number;
  buffered?: number;
  dropped?: number;
  upload_errors?: number;
  upload_batch?: number; // readings in the last request
  upload_cap?: number; // adaptive batch limit (fw 1.2.27+)
  upload_ms?: number; // how long the last upload blocked (fw 1.2.27+)
  upload_ms_avg?: number; // learned upload time
  upload_heap_low?: number; // heap low point of the last upload
  upload_heap_base?: number; // learned fixed heap cost per request
  upload_heap_per?: number; // learned heap cost per reading
  // fw 1.2.28+
  control_s?: number; // control read interval in use
  wifi_disc_reason?: number; // ESP-IDF wifi_err_reason_t of the last disconnect
  wifi_disc_ts?: number;
  upload_fail?: string; // why the last upload failed
  upload_fail_ts?: number;
  bms_link_rssi?: number; // signal of the connected BMS link
  // fw 1.2.29+
  wifi_disc_rssi?: number; // WiFi signal just before the last drop
  wifi_disc_counts?: Record<string, number>; // drops since boot per reason code
  control_errors?: number;
  firmware_version?: string;
  ota_status?: string;
  // fw 1.2.41+: one kept connection to Firebase (control/keepalive)
  net_keepalive?: number; // 1 = on
  net_reused?: number; // requests sent on an open connection since boot
  net_new?: number; // new connections since boot
  net_stale?: number; // open connections found dead and retried on a new one
  net_stack_free?: number; // lowest free stack of the request task, bytes
  // fw 1.2.42+: reading queue and event log in the jklog flash partition
  flash_log?: number; // 1 = partition present (0: installed without the factory image)
  queue_capacity?: number; // readings the flash queue holds
  events_queued?: number; // events not uploaded yet
}

/** events/<ts>-<boot>-<uptime>-<seq> (fw 1.2.42+): the board's flash event log. */
export interface BoardEvent {
  key: string;
  ts: number; // unix s; 0 when logged before the clock was set in an earlier boot
  boot: number;
  up: number; // seconds since that boot
  code: "boot" | "wifi_drop" | "bms_connect" | "bms_disconnect" | "ota" | "restart" | "upload_fail" | "crash" | "control" | string;
  a?: number;
  b?: number;
  text?: string;
}

export interface Info {
  updated?: number;
  errors?: string;
  charging_switch?: number;
  discharging_switch?: number;
  balancer_switch?: number;
  heating?: number;
  charging_cycles?: number;
  state_of_health?: number;
  full_charge_capacity?: number;
  device_model?: string;
  hardware_version?: string;
  software_version?: string;
  cell_resistance_1?: number;
  cell_resistance_2?: number;
  cell_resistance_3?: number;
  cell_resistance_4?: number;
}

export interface Boot {
  ts: number;
  firmware_version?: string;
  boot_count?: number;
  reset_reason?: string;
  restart_cause?: string;
  prev_uptime_s?: number;
  prev_step?: string;
  prev_shutdown?: number;
}

export interface Crash {
  ts: number;
  reported_by?: string;
  reset_reason?: string;
  step?: string;
  report?: string;
}

export interface Control {
  ota?: string; // version to install (one attempt; the board removes it when done)
  ota_host?: string; // OTA base URL under an allowed domain (fw 1.2.28+), kept
  check_s?: number; // control read interval in seconds, 30..3600 (fw 1.2.28+), kept
  keepalive?: string | boolean; // "keep" (or true) = one kept connection to Firebase (fw 1.2.41+), kept
  restart?: string;
}

export const CELLS = [1, 2, 3, 4] as const;
export const cellKey = (n: (typeof CELLS)[number]) => `cell_voltage_${n}` as `cell_voltage_${typeof n}`;
