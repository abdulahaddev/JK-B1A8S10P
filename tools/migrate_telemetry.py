"""Convert the old telemetry/<ts> objects in Firebase to the integer arrays firmware 1.2.42 writes.

Usage (from the repository root):
    python tools/migrate_telemetry.py            # dry run: backup, count, show a sample; nothing written
    python tools/migrate_telemetry.py --apply    # backup, convert in place (PATCH in chunks), verify

The backup (all of telemetry/ as it was) goes to backups/telemetry-<time>.json (not committed). Early readings
with extra fields keep only the array fields (the rest stays in the backup). Readings that
are already arrays are left alone, so the script can run again after an interruption. Run it after the board
runs 1.2.42, so no more objects arrive.
"""

import datetime
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ota_release as r  # noqa: E402  (secrets and the Firebase helper)
from telemetry_format import FIELDS, FLAGS, decode, to_array  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUPS = ROOT / "backups"
CHUNK = 500


def get_all(secrets: dict) -> dict:
    url = f"{secrets['firebase_db_url']}/telemetry.json?auth={secrets['firebase_auth']}"
    with r.urllib.request.urlopen(url, timeout=300) as resp:
        return json.loads(resp.read() or b"null") or {}


def same(a: dict, b: dict) -> bool:
    """The array fields equal within the board's stored resolution. Extra fields of early readings (power,
    cell resistance, cycles ... before the 13-field format) are not kept; they stay in the backup."""
    for name in [n for n, _ in FIELDS] + [n for n, _ in FLAGS]:
        x, y = a.get(name), b.get(name)
        if x is None or y is None:
            if x != y:
                return False
        elif abs(float(x) - float(y)) > 0.0051:
            return False
    return True


def main() -> int:
    apply = "--apply" in sys.argv
    secrets = r.read_secrets()
    t0 = time.time()
    data = get_all(secrets)
    BACKUPS.mkdir(exist_ok=True)
    backup = BACKUPS / f"telemetry-{datetime.datetime.now():%Y%m%d-%H%M%S}.json"
    backup.write_text(json.dumps(data), encoding="utf-8")
    objects = {k: v for k, v in data.items() if isinstance(v, dict) and not all(x.isdigit() for x in v)}
    print(f"{len(data)} readings ({time.time() - t0:.1f} s), {len(objects)} to convert; backup {backup} "
          f"({backup.stat().st_size // 1024} KB)")
    converted = {k: to_array(v) for k, v in objects.items()}
    bad = [k for k, v in objects.items() if not same(decode(converted[k]), v)]
    if bad:
        print(f"{len(bad)} readings would change beyond rounding, e.g. {bad[0]}: {objects[bad[0]]} -> {converted[bad[0]]}")
        return 1
    if objects:
        k = sorted(objects)[-1]
        print(f"sample {k}:\n  {json.dumps(objects[k])}\n  -> {json.dumps(converted[k])}")
    if not apply:
        print("dry run: nothing written (use --apply)")
        return 0
    keys = sorted(converted)
    for i in range(0, len(keys), CHUNK):
        part = {k: converted[k] for k in keys[i:i + CHUNK]}
        r.firebase(secrets, "PATCH", "telemetry", part)
        print(f"  {min(i + CHUNK, len(keys))}/{len(keys)}", flush=True)
    # Verify: everything is an array now and decodes to the old values
    after = get_all(secrets)
    left = [k for k in keys if not isinstance(after.get(k), list)]
    wrong = [k for k in keys if k not in left and not same(decode(after[k]), objects[k])]
    print(f"verify: {len(after)} readings, {len(left)} still objects, {len(wrong)} differ")
    return 0 if not left and not wrong else 1


if __name__ == "__main__":
    sys.exit(main())
