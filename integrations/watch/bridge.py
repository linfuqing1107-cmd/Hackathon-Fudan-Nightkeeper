"""Local BLE engineering validation, isolated from clinical demo records."""
import argparse
import asyncio
import json
import secrets
import threading
import time
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

SERVICE = "0000180d-0000-1000-8000-00805f9b34fb"
CHARACTERISTIC = "00002a37-0000-1000-8000-00805f9b34fb"


def parse_measurement(packet):
    if not packet or packet[0] & 0xE0:
        raise ValueError("Invalid flags")
    flags, offset = packet[0], 1

    def take(size):
        nonlocal offset
        if offset + size > len(packet):
            raise ValueError("Truncated measurement")
        value = int.from_bytes(packet[offset:offset + size], "little")
        offset += size
        return value

    bpm = take(2 if flags & 1 else 1)
    contact = bool(flags & 2) if flags & 4 else None
    energy = take(2) if flags & 8 else None
    rr = []
    if flags & 16:
        if offset == len(packet):
            raise ValueError("Missing RR intervals")
        while offset < len(packet):
            rr.append(take(2) * 1000 / 1024)
    if offset != len(packet):
        raise ValueError("Unexpected trailing bytes")
    return {"bpm": bpm, "contact": contact, "energyKj": energy, "rrMs": rr,
            "quality": "NO_CONTACT" if contact is False else "ZERO" if bpm == 0 else "RECEIVED"}


class Capture:
    def __init__(self, source):
        self.source = source
        self.session = secrets.token_hex(8)
        self.lock = threading.Lock()
        self.samples = deque(maxlen=600)
        self.status = "WAITING"
        self.count = self.errors = 0
        self.last = None

    def set_status(self, status):
        with self.lock:
            self.status = status

    def receive(self, packet):
        try:
            sample = parse_measurement(packet)
        except ValueError:
            with self.lock:
                self.errors += 1
            return
        with self.lock:
            self.count += 1
            self.last = time.monotonic()
            self.samples.append({**sample, "sequence": self.count,
                "receivedAt": datetime.now(timezone.utc).isoformat(), "rawHex": packet.hex()})

    def snapshot(self):
        with self.lock:
            age = None if self.last is None else round(time.monotonic() - self.last, 1)
            stale = age is None or age > 10 or self.status != "CONNECTED"
            latest = self.samples[-1] if self.samples else None
            return {"schemaVersion": "nightkeeper.watch.v1", "session": self.session,
                "source": self.source, "status": self.status, "ageSeconds": age,
                "stale": stale, "packetCount": self.count, "invalidPackets": self.errors,
                "liveBpm": latest["bpm"] if latest and not stale and latest["quality"] == "RECEIVED" else None,
                "blePacketsObserved": self.source == "BLE" and self.count > 0,
                "service": SERVICE, "characteristic": CHARACTERISTIC,
                "samples": list(self.samples), "retentionLimit": 600,
                "notice": "Engineering capture only; not clinical validation or device identity attestation. Host receipt times, not device measurement times."}


def make_server(capture, port, token, workspace_port=3101):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Do not log capability tokens or health readings.

        def do_GET(self):
            url = urlsplit(self.path)
            if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
                self.send_error(403)
                return
            supplied = parse_qs(url.query).get("token", [""])[0]
            if not secrets.compare_digest(supplied, token):
                self.send_error(403)
                return
            if url.path == "/":
                body = Path(__file__).with_name("dashboard.html").read_bytes()
                body = body.replace(b"http://127.0.0.1:3101/", f"http://127.0.0.1:{workspace_port}/".encode())
                mime = "text/html; charset=utf-8"
            elif url.path in ("/state", "/report"):
                body = json.dumps(capture.snapshot(), ensure_ascii=False).encode()
                mime = "application/json; charset=utf-8"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            if url.path == "/report":
                self.send_header("Content-Disposition", 'attachment; filename="watch-capture.json"')
            self.end_headers()
            self.wfile.write(body)

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


async def run_ble(capture, desktop=False):
    from bleak import BleakScanner, BleakClient
    capture.set_status("SCANNING")
    devices = list((await BleakScanner.discover(timeout=10, return_adv=True)).values())
    if not devices:
        raise RuntimeError("No devices discovered; enable Bluetooth and watch HR broadcast")
    for i, (device, adv) in enumerate(devices, 1):
        print(f"{i}: {device.name or 'Unnamed'} | {device.address} | HR advertised: {SERVICE in adv.service_uuids}")
    if desktop:
        import tkinter as tk
        from tkinter import simpledialog
        root = tk.Tk()
        root.withdraw()
        labels = '\n'.join(f'{i}: {d.name or "Unnamed"} / {d.address}' for i, (d, _) in enumerate(devices, 1))
        try:
            index = simpledialog.askinteger("Nightkeeper", labels + '\nSelect your device number:', minvalue=1, maxvalue=len(devices), parent=root)
        finally:
            root.destroy()
        if index is None:
            capture.set_status("DISCONNECTED")
            return
    else:
        index = int(input("Select ONLY your consenting participant's device number (Ctrl+C cancels): "))
    if not 1 <= index <= len(devices):
        raise ValueError("Invalid device number")
    device = devices[index - 1][0]
    capture.set_status("CONNECTING")
    async with BleakClient(device, disconnected_callback=lambda _: capture.set_status("DISCONNECTED")) as client:
        service = client.services.get_service(SERVICE)
        characteristic = service.get_characteristic(CHARACTERISTIC) if service else None
        if not characteristic or "notify" not in characteristic.properties:
            raise RuntimeError("Selected device does not expose a notifiable standard HR characteristic")
        await client.start_notify(characteristic, lambda _, packet: capture.receive(bytes(packet)))
        capture.set_status("CONNECTED")
        while client.is_connected:
            await asyncio.sleep(0.5)
    capture.set_status("DISCONNECTED")


async def run_replay(capture):
    capture.set_status("CONNECTED")
    index = 0
    while True:
        # Synthetic protocol fixtures, never presented as hardware measurements.
        bpm = (72, 73, 71, 75, 74, 72)[index % 6]
        capture.receive(bytes([0x16, bpm, 0x00, 0x04]))
        index += 1
        await asyncio.sleep(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["ble", "replay"])
    parser.add_argument("--consent", action="store_true", help="Confirm participant consent before BLE scanning")
    parser.add_argument("--port", type=int, default=3102)
    parser.add_argument("--workspace-port", type=int, default=3101)
    parser.add_argument("--desktop", action="store_true")
    args = parser.parse_args()
    if args.mode == "ble" and not args.consent:
        parser.error("BLE requires participant consent: add --consent only after obtaining consent")
    capture = Capture(args.mode.upper())
    token = secrets.token_urlsafe(32)
    server = make_server(capture, args.port, token, args.workspace_port)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Nightkeeper {capture.source}: http://127.0.0.1:{server.server_port}/?token={token}", flush=True)
    print("Local memory only. Export is optional and contains health data. Ctrl+C stops and clears memory.", flush=True)
    try:
        asyncio.run(run_ble(capture, args.desktop) if args.mode == "ble" else run_replay(capture))
        print("Disconnected. Restart to reconnect to your selected device.", flush=True)
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    except Exception as error:
        capture.set_status("ERROR")
        print(f"Connection failed ({type(error).__name__}). Check permission, broadcast and selected device. Ctrl+C to exit.", flush=True)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
