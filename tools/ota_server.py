"""Serve the firmware files from this PC, as a stand-in for the OTA site.

Usage (from the repository root):
    python tools/ota_server.py              # http://127.0.0.1:8080 (for a tunnel running on this PC)
    python tools/ota_server.py --port 9000

Serves dist/jk-bms-<version>.ota.bin and .ota.bin.md5 (from tools/publish_ota.py) at the same paths
the board uses on the OTA site, so a tunnel to this port plus a DNS change of the ota_base_url host is
all the board needs; its firmware stays unchanged.

  - Same login as the OTA site (ota_username / ota_password in secrets.yaml). Requests without it get
    401 with a Basic challenge: the board's download sends credentials only after that challenge.
  - Only jk-bms-*.ota.bin(.md5) files directly in dist/ are served; nothing else on this PC.
  - "/" lists them in the OTA site's index format, so the dashboard's firmware Sync works too.
  - Every request is logged with the client, user agent, status and bytes sent.
"""

import argparse
import base64
import datetime
import hmac
import html
import pathlib
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from ota_release import read_secrets

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
NAME = re.compile(r"^jk-bms-[0-9A-Za-z._-]+\.ota\.bin(\.md5)?$")
CHUNK = 16 * 1024


def firmware_files():
    return sorted((p for p in DIST.glob("jk-bms-*") if p.is_file() and NAME.match(p.name)), key=lambda p: p.name)


def make_handler(expected_auth: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "jk-bms-ota"
        sys_version = ""
        sent = 0

        def log_message(self, fmt, *args):  # one line per request, set in finish_log
            pass

        def finish_log(self, status: int) -> None:
            ua = self.headers.get("User-Agent", "-")
            print(f"{datetime.datetime.now():%H:%M:%S}  {self.client_address[0]:<15} {self.command} {self.path} "
                  f"-> {status} ({self.sent} bytes)  {ua}", flush=True)

        def authorized(self) -> bool:
            if not expected_auth:
                return True
            return hmac.compare_digest(self.headers.get("Authorization", ""), expected_auth)

        def reply(self, status: int, body: bytes, ctype: str = "text/plain; charset=utf-8", extra=None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
                self.sent = len(body)
            self.finish_log(status)

        def index(self) -> bytes:
            rows = []
            for p in firmware_files():
                st = p.stat()
                rows.append(
                    f'<tr><td data-sort="{html.escape(p.name)}"><a href="/{html.escape(p.name)}">{html.escape(p.name)}</a></td>'
                    f'<td data-sort="{int(st.st_mtime)}">{datetime.datetime.fromtimestamp(st.st_mtime):%Y-%m-%d %H:%M}</td>'
                    f'<td data-sort="{st.st_size}">{st.st_size // 1024}k</td></tr>'
                )
            return ("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Index of /</title></head><body>"
                    "<table><tr><th>Name</th><th>Modified</th><th>Size</th></tr>" + "".join(rows) +
                    "</table></body></html>").encode()

        def do_GET(self):
            self.sent = 0
            if not self.authorized():
                self.reply(401, b"login required\n", extra={"WWW-Authenticate": 'Basic realm="jk-bms-ota"'})
                return
            path = self.path.split("?", 1)[0]
            if path == "/":
                self.reply(200, self.index(), "text/html; charset=utf-8")
                return
            name = path.lstrip("/")
            target = DIST / name
            if "/" in name or not NAME.match(name) or not target.is_file():
                self.reply(404, b"not found\n")
                return
            size = target.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", "text/plain" if name.endswith(".md5") else "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                try:
                    with open(target, "rb") as fh:
                        while chunk := fh.read(CHUNK):
                            self.wfile.write(chunk)
                            self.sent += len(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # the board gave up mid-download; it retries by itself
            self.finish_log(200 if self.sent == size or self.command == "HEAD" else 499)

        do_HEAD = do_GET

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve dist/ firmware files for the board's OTA download.")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--host", default="127.0.0.1", help="0.0.0.0 to also accept other machines on the LAN")
    args = parser.parse_args()

    secrets = read_secrets()
    user, password = secrets.get("ota_username", ""), secrets.get("ota_password", "")
    expected = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode() if user else ""
    if not expected:
        print("warning: no ota_username in secrets.yaml, serving WITHOUT a login")

    server = ThreadingHTTPServer((args.host, args.port), make_handler(expected))
    print(f"Serving {DIST} on http://{args.host}:{args.port}  (login {'on' if expected else 'OFF'})")
    for p in firmware_files():
        print(f"  /{p.name}  {p.stat().st_size} bytes")
    print("Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
