#!/usr/bin/env python3.12
"""
Self-hosted shared Game Boy service for Zo.
Streams PNG frames and accepts queued button input for shared rooms.
"""

import argparse
import io
import json
import logging
import threading
import time
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

warnings.filterwarnings("ignore", message="Using SDL2 binaries from pysdl2-dll.*", category=UserWarning)

from PIL import Image
from pyboy import PyBoy


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("zo-gameboy")
WARMUP_FRAMES = 480
ROOM_FPS = 30
TAP_HOLD_FRAMES = 8

parser = argparse.ArgumentParser(description="Zo shared Game Boy server")
parser.add_argument(
    "--rom",
    default="/usr/local/lib/python3.12/site-packages/pyboy/default_rom.gb",
    help="Path to Game Boy ROM (.gb)",
)
parser.add_argument("--port", type=int, default=1991)
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--tick-rate", type=int, default=0, help="0 disables speed limiting")
args = parser.parse_args()

if not Path(args.rom).exists():
    raise SystemExit(f"ROM not found: {args.rom}")


BUTTON_MAP = {
    "0": "right",
    "1": "left",
    "2": "up",
    "3": "down",
    "4": "a",
    "5": "b",
    "6": "select",
    "7": "start",
    "right": "right",
    "left": "left",
    "up": "up",
    "down": "down",
    "a": "a",
    "b": "b",
    "select": "select",
    "start": "start",
}
ACTION_MAP = {"tap", "press", "release"}

lock = threading.Lock()
rooms: dict[str, dict] = {}


def render_frame(pyboy: PyBoy) -> bytes:
    screen = pyboy.screen
    try:
        image = screen.image
        if image.mode != "RGB":
            image = image.convert("RGB")
    except Exception:
        array = screen.ndarray
        image = Image.fromarray(array if array.ndim == 3 else array, mode="RGB" if array.ndim == 3 else "L")
        if image.mode != "RGB":
            image = image.convert("RGB")

    image = image.resize((480, 432), Image.NEAREST)
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def get_room(name: str) -> dict:
    room_name = (name or "main")[:32]
    with lock:
        if room_name not in rooms:
            rooms[room_name] = {
                "name": room_name,
                "pyboy": None,
                "ticks": 0,
                "lock": threading.Lock(),
                "latest_frame": None,
                "desired_buttons": set(),
                "pressed_buttons": set(),
                "tap_frames": {},
                "tap_queue": [],
                "running": False,
                "worker": None,
            }
        return rooms[room_name]


def room_loop(room: dict) -> None:
    frame_delay = 1 / ROOM_FPS
    while True:
        with room["lock"]:
            if not room["running"]:
                return

            pyboy = room["pyboy"]
            if pyboy is None:
                return

            if room["tap_queue"]:
                next_button = room["tap_queue"].pop(0)
                room["tap_frames"][next_button] = TAP_HOLD_FRAMES

            desired_buttons = set(room["desired_buttons"]) | set(room["tap_frames"].keys())
            pressed_buttons = set(room["pressed_buttons"])

            for button in desired_buttons - pressed_buttons:
                pyboy.button_press(button)
            for button in pressed_buttons - desired_buttons:
                pyboy.button_release(button)

            pyboy.tick()
            room["ticks"] += 1
            room["pressed_buttons"] = desired_buttons

            next_tap_frames = {}
            for button, frames_left in room["tap_frames"].items():
                if frames_left > 1:
                    next_tap_frames[button] = frames_left - 1
            room["tap_frames"] = next_tap_frames
            room["latest_frame"] = render_frame(pyboy)

        time.sleep(frame_delay)


def init_room(room: dict) -> None:
    if room["pyboy"] is not None:
        return

    logger.info("[room=%s] starting emulator", room["name"])
    pyboy = PyBoy(
        args.rom,
        window="null",
        sound_emulated=False,
        sound_volume=0,
        log_level="ERROR",
    )
    pyboy.set_emulation_speed(args.tick_rate)
    for _ in range(WARMUP_FRAMES):
        pyboy.tick()

    room["ticks"] = WARMUP_FRAMES
    room["pyboy"] = pyboy
    room["latest_frame"] = render_frame(pyboy)
    room["running"] = True

    worker = threading.Thread(target=room_loop, args=(room,), daemon=True, name=f"room-{room['name']}")
    room["worker"] = worker
    worker.start()
    logger.info("[room=%s] emulator ready", room["name"])


def queue_input(room: dict, raw_button: str, raw_action: str) -> dict:
    with room["lock"]:
        init_room(room)

        button = BUTTON_MAP.get(str(raw_button).strip().lower())
        action = str(raw_action or "tap").strip().lower()

        if not button:
            raise ValueError(f"invalid button: {raw_button}")
        if action not in ACTION_MAP:
            raise ValueError(f"invalid action: {raw_action}")

        if action == "tap":
            room["tap_queue"].append(button)
        elif action == "press":
            room["desired_buttons"].add(button)
        elif action == "release":
            room["desired_buttons"].discard(button)
            room["tap_frames"].pop(button, None)
            room["tap_queue"] = [queued for queued in room["tap_queue"] if queued != button]

        return {
            "button": button,
            "action": action,
            "queueDepth": len(room["tap_queue"]),
            "heldButtons": sorted(room["desired_buttons"]),
        }


def capture_frame(room: dict) -> bytes:
    with room["lock"]:
        init_room(room)
        frame = room["latest_frame"]
        if frame is None:
            frame = render_frame(room["pyboy"])
            room["latest_frame"] = frame
        return frame


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt: str, *args) -> None:
        logger.debug("%s " + fmt, self.client_address[0], *args)

    def respond_json(self, body: dict, status: int = 200) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/image":
            room = get_room(qs.get("room", ["main"])[0])
            try:
                frame = capture_frame(room)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                self.send_header("X-Room", room["name"])
                self.send_header("X-Ticks", str(room["ticks"]))
                self.send_header("Content-Length", str(len(frame)))
                self.end_headers()
                self.wfile.write(frame)
            except Exception:
                logger.exception("[room=%s] image request failed", room["name"])
                self.send_error(500, "Emulator error")
            return

        if path == "/" or path == "/healthz":
            self.respond_json({"ok": True, "service": "zo-gameboy"})
            return

        if path == "/control":
            room = get_room(qs.get("room", ["main"])[0])
            button = qs.get("button", [""])[0]
            action = qs.get("action", ["tap"])[0]
            callback = qs.get("callback", [""])[0]
            try:
                result = queue_input(room, button, action)
                if callback:
                    self.send_response(302)
                    self.send_header("Location", callback)
                    self.end_headers()
                else:
                    self.respond_json({"ok": True, "room": room["name"], **result})
            except Exception:
                logger.exception("[room=%s] control request failed", room["name"])
                self.send_error(400, "Control error")
            return

        if path == "/rooms":
            with lock:
                info = {
                    name: {
                        "ticks": room["ticks"],
                        "has_rom": room["pyboy"] is not None,
                        "queueDepth": len(room["tap_queue"]),
                        "heldButtons": sorted(room["desired_buttons"]),
                    }
                    for name, room in rooms.items()
                }
            self.respond_json(info)
            return

        self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/input":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            body = json.loads(raw.decode() if raw else "{}")
            room = get_room(str(body.get("room", "main")))
            button = str(body.get("button", ""))
            action = str(body.get("action", "tap"))
            result = queue_input(room, button, action)
            self.respond_json({"ok": True, "room": room["name"], **result})
        except Exception:
            logger.exception("input request failed")
            self.send_error(400, "Bad request")


server = ThreadingHTTPServer((args.host, args.port), Handler)
logger.info("server listening on http://%s:%s", args.host, args.port)
logger.info("ROM: %s", args.rom)

try:
    server.serve_forever()
except KeyboardInterrupt:
    logger.info("shutting down")
    workers = []
    with lock:
        for room in rooms.values():
            with room["lock"]:
                room["running"] = False
                if room["worker"] is not None:
                    workers.append(room["worker"])
                if room["pyboy"] is not None:
                    room["pyboy"].stop()
    for worker in workers:
        worker.join(timeout=1)
    server.shutdown()
