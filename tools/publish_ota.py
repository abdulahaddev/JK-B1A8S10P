"""Build an OTA release of my-jk-bms-firebase.yaml for the remote update.

Usage (from the repository root):
    python tools/publish_ota.py

Reads fw_version from the config, compiles it, and writes to dist/:
    jk-bms-<version>.ota.bin       the firmware image
    jk-bms-<version>.ota.bin.md5   its MD5, checked by the board before installing

Upload both files to the root of the OTA site, then set control/ota to "<version>" in Firebase.
"""

import hashlib
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "my-jk-bms-firebase.yaml"
BUILD_BIN = ROOT / ".esphome/build/jk-bms/.pioenvs/jk-bms/firmware.ota.bin"
DIST = ROOT / "dist"


def main() -> int:
    match = re.search(r'^\s*fw_version:\s*"([^"]+)"', CONFIG.read_text(encoding="utf-8"), re.MULTILINE)
    if not match:
        print(f"fw_version not found in {CONFIG.name}")
        return 1
    version = match.group(1)
    if not re.fullmatch(r"[0-9A-Za-z._-]+", version):
        print(f"fw_version {version!r} may only contain letters, digits, '.', '-' and '_'")
        return 1

    target = DIST / f"jk-bms-{version}.ota.bin"
    if target.exists():
        print(f"{target.name} already exists. Bump fw_version in {CONFIG.name} for a new release.")
        return 1

    print(f"Compiling {CONFIG.name} (fw_version {version})...")
    if subprocess.run(["esphome", "compile", CONFIG.name], cwd=ROOT).returncode != 0:
        print("Compile failed")
        return 1

    DIST.mkdir(exist_ok=True)
    shutil.copyfile(BUILD_BIN, target)
    md5 = hashlib.md5(target.read_bytes()).hexdigest()
    target.with_name(target.name + ".md5").write_text(md5, encoding="ascii")

    print()
    print(f"Release {version} ready in {DIST}:")
    print(f"  {target.name}  ({target.stat().st_size} bytes)")
    print(f"  {target.name}.md5  ({md5})")
    print()
    print("Next:")
    print("  1. Test this build on the bench (esphome run) before publishing.")
    print("  2. Upload both files to the root of the OTA site.")
    print(f'  3. In Firebase set control/ota to "{version}".')
    print("  4. Within 5 min device/ota_status shows the download; after the reboot it shows")
    print(f'     "verifying {version}", then "updated to {version}" after its first upload,')
    print('     or "rolled back" if the new firmware did not upload within 10 minutes.')
    return 0


if __name__ == "__main__":
    sys.exit(main())
