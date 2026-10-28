"""telemetry/<ts> in Firebase: the board writes integer arrays since firmware 1.2.42.

    [mV, 10 mA, cell 1..4 mV, 10 mAh, SOC %, balancing mA, MOSFET, sensor 1, sensor 2 in 0.1 degC, flags]

null = no value. flags: 1 charging, 2 discharging, 4 balancing. Readings written before 1.2.42 were objects
with named fields in volts, amps and degrees; to_array() converts one (tools/migrate_telemetry.py).
"""

FIELDS = [  # (name, scale) in array order, flags last
    ("total_voltage", 1000), ("current", 100),
    ("cell_voltage_1", 1000), ("cell_voltage_2", 1000), ("cell_voltage_3", 1000), ("cell_voltage_4", 1000),
    ("capacity_remaining", 100), ("state_of_charge", 1), ("balancing_current", 1000),
    ("mosfet_temperature", 10), ("temperature_sensor_1", 10), ("temperature_sensor_2", 10),
]
FLAGS = [("charging", 1), ("discharging", 2), ("balancing", 4)]


def decode(value) -> dict:
    """A reading as named fields in volts, amps, degrees (either format)."""
    if isinstance(value, dict):
        if value and all(k.isdigit() for k in value):  # an array Firebase returned as an object (many nulls)
            value = [value.get(str(i)) for i in range(len(FIELDS) + 1)]
        else:
            return dict(value)
    if not isinstance(value, list):
        return {}
    v = list(value) + [None] * (len(FIELDS) + 1 - len(value))
    out = {}
    for i, (name, scale) in enumerate(FIELDS):
        if v[i] is not None:
            out[name] = v[i] / scale if scale != 1 else v[i]
    flags = v[len(FIELDS)] or 0
    for name, bit in FLAGS:
        out[name] = 1 if flags & bit else 0
    return out


def to_array(reading: dict) -> list:
    """An old object reading as the board's integer array (rounded like the board stores it)."""
    out = []
    for name, scale in FIELDS:
        x = reading.get(name)
        out.append(None if x is None else int(round(float(x) * scale)))
    flags = 0
    for name, bit in FLAGS:
        if reading.get(name):
            flags |= bit
    out.append(flags)
    return out
