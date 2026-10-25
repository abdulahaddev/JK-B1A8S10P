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

export interface Device {
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
  control_errors?: number;
  firmware_version?: string;
  ota_status?: string;
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
  ota?: string;
  restart?: string;
}

export const CELLS = [1, 2, 3, 4] as const;
export const cellKey = (n: (typeof CELLS)[number]) => `cell_voltage_${n}` as `cell_voltage_${typeof n}`;
