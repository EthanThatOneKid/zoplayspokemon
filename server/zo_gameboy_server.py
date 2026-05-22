#!/usr/bin/env python3.12
"""
Self-hosted shared Game Boy service for Zo.
Streams PNG frames and accepts queued button input.

POC: one live emulator process (`GLOBAL_ROOM_NAME`); `room` query/body fields are ignored for routing.
"""
import argparse
import hashlib
import io
import json
import logging
import os
import sys
import threading
import time
import traceback
import uuid
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
TAP_HOLD_FRAMES = 6
TAP_SETTLE_FRAMES = {
    "right": 2, "left": 2, "up": 2, "down": 2,
    "a": 8, "b": 7, "select": 7, "start": 10,
}
HELD_SETTLE_FRAMES = {
    "right": 2, "left": 2, "up": 2, "down": 2,
    "a": 4, "b": 4, "select": 4, "start": 5,
}

parser = argparse.ArgumentParser(description="Zo shared Game Boy server")
parser.add_argument("--rom", default="/usr/local/lib/python3.12/site-packages/pyboy/default_rom.gb")
parser.add_argument("--port", type=int, default=1991)
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--tick-rate", type=int, default=0, help="0 disables speed limiting")
parser.add_argument(
    "--data-dir",
    default=os.environ.get(
        "ZO_GAMEBOY_DATA_DIR",
        str(Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "zo-gameboy"),
    ),
    help="directory used for per-room snapshots",
)
args = parser.parse_args()

if not Path(args.rom).exists():
    raise SystemExit(f"ROM not found: {args.rom}")

DATA_DIR = Path(args.data_dir).expanduser().resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOT_FILENAME = "snapshot.state"
META_FILENAME = "meta.json"
SAVE_DEBOUNCE_SECONDS = 3.0
SAVE_CHECKPOINT_SECONDS = 60.0
LOOKUP_PATH = Path(__file__).with_name("pokecrystal_lookup.json")

if LOOKUP_PATH.exists():
    try:
        LOOKUP_DATA = json.loads(LOOKUP_PATH.read_text())
    except Exception:
        logger.exception("failed to load lookup data")
        LOOKUP_DATA = {"items": [], "pokemon": []}
else:
    LOOKUP_DATA = {"items": [], "pokemon": []}

POKEMON_NAMES = LOOKUP_DATA.get("pokemon", [])
ITEM_NAMES = LOOKUP_DATA.get("items", [])

WRAM = {
    "party_count": 0xDCD7,
    "party_species": 0xDCD8,
    "party_mon1": 0xDCDF,
    "num_items": 0xD892,
    "items": 0xD893,
    "num_key_items": 0xD8BC,
    "key_items": 0xD8BD,
    "num_balls": 0xD8D7,
    "balls": 0xD8D8,
    "num_pc_items": 0xD8F1,
    "pc_items": 0xD8F2,
    "map_group": 0xDCB5,
    "map_number": 0xDCB6,
    "cur_landmark": 0xC2D9,
}

LANDMARK_NAMES = {
    0: "SPECIAL",
    1: "NEW BARK TOWN",
    2: "ROUTE 29",
    3: "CHERRYGROVE CITY",
    4: "ROUTE 30",
    5: "ROUTE 31",
    6: "VIOLET CITY",
    7: "SPROUT TOWER",
    8: "ROUTE 32",
    9: "RUINS OF ALPH",
    10: "UNION CAVE",
    11: "ROUTE 33",
    12: "AZALEA TOWN",
    13: "SLOWPOKE WELL",
    14: "ILEX FOREST",
    15: "ROUTE 34",
    16: "GOLDENROD CITY",
    17: "RADIO TOWER",
    18: "ROUTE 35",
    19: "NATIONAL PARK",
    20: "ROUTE 36",
    21: "ROUTE 37",
    22: "ECRUTEAK CITY",
    23: "TIN TOWER",
    24: "BURNED TOWER",
    25: "ROUTE 38",
    26: "ROUTE 39",
    27: "OLIVINE CITY",
    28: "LIGHTHOUSE",
    29: "BATTLE TOWER",
    30: "ROUTE 40",
    31: "WHIRL ISLANDS",
    32: "ROUTE 41",
    33: "CIANWOOD CITY",
    34: "ROUTE 42",
    35: "MT. MORTAR",
    36: "MAHOGANY TOWN",
    37: "ROUTE 43",
    38: "LAKE OF RAGE",
    39: "ROUTE 44",
    40: "ICE PATH",
    41: "BLACKTHORN CITY",
    42: "DRAGON'S DEN",
    43: "ROUTE 45",
    44: "DARK CAVE",
    45: "ROUTE 46",
    46: "SILVER CAVE",
    47: "PALLET TOWN",
    48: "ROUTE 1",
    49: "VIRIDIAN CITY",
    50: "ROUTE 2",
    51: "PEWTER CITY",
    52: "ROUTE 3",
    53: "MT. MOON",
    54: "ROUTE 4",
    55: "CERULEAN CITY",
    56: "ROUTE 24",
    57: "ROUTE 25",
    58: "ROUTE 5",
    59: "UNDERGROUND",
    60: "ROUTE 6",
    61: "VERMILION CITY",
    62: "DIGLETT'S CAVE",
    63: "ROUTE 7",
    64: "ROUTE 8",
    65: "ROUTE 9",
    66: "ROCK TUNNEL",
    67: "ROUTE 10",
    68: "POWER PLANT",
    69: "LAVENDER TOWN",
    70: "LAV RADIO TOWER",
    71: "ROUTE 11",
    72: "ROUTE 12",
    73: "ROUTE 13",
    74: "ROUTE 14",
    75: "ROUTE 15",
    76: "ROUTE 16",
    77: "ROUTE 17",
    78: "ROUTE 18",
    79: "FUCHSIA CITY",
    80: "ROUTE 19",
    81: "ROUTE 20",
    82: "SEAFOAM ISLANDS",
    83: "CINNABAR ISLAND",
    84: "ROUTE 21",
    85: "ROUTE 22",
    86: "VICTORY ROAD",
    87: "ROUTE 23",
    88: "INDIGO PLATEAU",
    89: "ROUTE 26",
    90: "ROUTE 27",
    91: "TOHJO FALLS",
    92: "ROUTE 28",
    93: "FAST SHIP",
}

PARTY_MON_STRUCT_LENGTH = 48
PARTY_NICKNAME_LENGTH = 11
ITEM_NAME_LENGTH = 13
MAX_PARTY = 6

BUTTON_MAP = {
    "0": "right", "1": "left", "2": "up", "3": "down",
    "4": "a", "5": "b", "6": "select", "7": "start",
    "right": "right", "left": "left", "up": "up", "down": "down",
    "a": "a", "b": "b", "select": "select", "start": "start",
}
ACTION_MAP = {"tap", "press", "release"}

lock = threading.Lock()
rooms: dict[str, dict] = {}

# POC: single live emulator; ?room= / JSON room are ignored for isolation (still echoed where helpful).
GLOBAL_ROOM_NAME = "main"


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


ROM_SHA256 = sha256_file(args.rom)

def read_u8(pyboy: PyBoy, addr: int) -> int:
    return int(pyboy.memory[addr]) & 0xFF

def read_u16(pyboy: PyBoy, addr: int) -> int:
    return read_u8(pyboy, addr) | (read_u8(pyboy, addr + 1) << 8)

def read_bytes(pyboy: PyBoy, addr: int, length: int) -> list[int]:
    return [read_u8(pyboy, addr + i) for i in range(length)]

def decode_nul_terminated_name(raw: list[int]) -> str:
    out = []
    for b in raw:
        if b in (0x50, 0x00):
            break
        if 0 < b < len(ITEM_NAMES):
            out.append(chr(b))
        else:
            out.append(f"{b:02X}")
    return "".join(out).strip() or "?"

def item_name_from_id(item_id: int) -> str:
    if 0 <= item_id < len(ITEM_NAMES):
        name = ITEM_NAMES[item_id]
        return name or f"ITEM_{item_id:02X}"
    return f"ITEM_{item_id:02X}"

def pokemon_name_from_id(species_id: int) -> str:
    if 0 <= species_id < len(POKEMON_NAMES):
        name = POKEMON_NAMES[species_id]
        return name or f"MON_{species_id:02X}"
    return f"MON_{species_id:02X}"

def parse_party(pyboy: PyBoy) -> list[dict]:
    count = min(MAX_PARTY, read_u8(pyboy, WRAM["party_count"]))
    species = read_bytes(pyboy, WRAM["party_species"], MAX_PARTY)
    party = []
    for i in range(count):
        base = WRAM["party_mon1"] + i * PARTY_MON_STRUCT_LENGTH
        species_id = species[i] if i < len(species) else 0
        nickname = decode_nul_terminated_name(read_bytes(pyboy, base + 0x17, PARTY_NICKNAME_LENGTH))
        item_id = read_u8(pyboy, base + 0x01)
        level = read_u8(pyboy, base + 0x20)
        hp = read_u16(pyboy, base + 0x19)
        max_hp = read_u16(pyboy, base + 0x1B)
        party.append({
            "slot": i + 1,
            "speciesId": species_id,
            "species": pokemon_name_from_id(species_id),
            "nickname": nickname,
            "itemId": item_id,
            "item": item_name_from_id(item_id) if item_id else "",
            "level": level,
            "hp": hp,
            "maxHp": max_hp,
        })
    return party

def parse_pocket(pyboy: PyBoy, count_addr: int, data_addr: int, slot_bytes: int, value_name: str) -> list[dict]:
    count = read_u8(pyboy, count_addr)
    items = []
    raw = read_bytes(pyboy, data_addr, slot_bytes * 20)
    for i in range(count):
        if slot_bytes == 2:
            item_id = raw[i * 2]
            qty = raw[i * 2 + 1]
        else:
            item_id = raw[i]
            qty = 1
        items.append({
            "slot": i + 1,
            "itemId": item_id,
            "item": item_name_from_id(item_id),
            "quantity": qty,
        })
    return items

def decode_location(pyboy: PyBoy) -> dict:
    map_group = read_u8(pyboy, WRAM["map_group"])
    map_number = read_u8(pyboy, WRAM["map_number"])
    landmark_id = read_u8(pyboy, WRAM["cur_landmark"])
    return {
        "mapGroup": map_group,
        "mapNumber": map_number,
        "landmarkId": landmark_id,
        "landmark": LANDMARK_NAMES.get(landmark_id, ""),
    }

def build_memory_snapshot(room: dict) -> dict:
    pyboy = room.get("pyboy")
    if pyboy is None:
        return {"room": room.get("name", GLOBAL_ROOM_NAME), "ready": False}
    return {
        "room": room["name"],
        "ready": True,
        "ticks": room["ticks"],
        "savedAt": room["saved_at"],
        "hasSnapshot": room["has_snapshot"],
        "location": decode_location(pyboy),
        "party": parse_party(pyboy),
        "items": parse_pocket(pyboy, WRAM["num_items"], WRAM["items"], 2, "items"),
        "keyItems": parse_pocket(pyboy, WRAM["num_key_items"], WRAM["key_items"], 1, "keyItems"),
        "balls": parse_pocket(pyboy, WRAM["num_balls"], WRAM["balls"], 2, "balls"),
        "pcItems": parse_pocket(pyboy, WRAM["num_pc_items"], WRAM["pc_items"], 2, "pcItems"),
    }


def room_storage_name(room_name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in {"-", "_"} else "_" for c in room_name.strip().lower())
    cleaned = cleaned.strip("._-")
    return cleaned[:48] or hashlib.sha256(room_name.encode()).hexdigest()[:16]


def room_dir(room: dict) -> Path:
    return DATA_DIR / room_storage_name(room["name"])


def room_snapshot_path(room: dict) -> Path:
    return room_dir(room) / SNAPSHOT_FILENAME


def room_meta_path(room: dict) -> Path:
    return room_dir(room) / META_FILENAME


def load_room_meta(room: dict) -> dict:
    meta_path = room_meta_path(room)
    if not meta_path.exists():
        return {}
    try:
        return json.loads(meta_path.read_text())
    except Exception:
        logger.exception("[room=%s] failed to read metadata", room["name"])
        return {}


def update_snapshot_status_locked(room: dict) -> None:
    snapshot_path = room_snapshot_path(room)
    room["has_snapshot"] = snapshot_path.exists()
    room["snapshot_bytes"] = snapshot_path.stat().st_size if snapshot_path.exists() else 0
    meta = load_room_meta(room)
    room["saved_at"] = int(meta.get("savedAt") or 0)


def save_room_snapshot_locked(room: dict, reason: str) -> None:
    pyboy = room["pyboy"]
    if pyboy is None:
        return

    target_dir = room_dir(room)
    target_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = room_snapshot_path(room)
    temp_snapshot_path = snapshot_path.with_suffix(snapshot_path.suffix + ".tmp")
    temp_meta_path = room_meta_path(room).with_suffix(".json.tmp")
    saved_at_ms = int(time.time() * 1000)

    with temp_snapshot_path.open("wb") as fh:
        pyboy.save_state(fh)

    meta = {
        "room": room["name"],
        "romPath": str(Path(args.rom).resolve()),
        "romSha256": ROM_SHA256,
        "savedAt": saved_at_ms,
        "inputVersion": room["input_version"],
        "frameVersion": room["frame_version"],
        "ticks": room["ticks"],
        "frameHash": room["latest_hash"],
        "reason": reason,
    }
    temp_meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n")
    temp_snapshot_path.replace(snapshot_path)
    temp_meta_path.replace(room_meta_path(room))

    room["dirty"] = False
    room["save_requested_at"] = 0.0
    room["last_saved_monotonic"] = time.monotonic()
    room["saved_at"] = saved_at_ms
    room["has_snapshot"] = True
    room["snapshot_bytes"] = snapshot_path.stat().st_size
    logger.info("[room=%s] snapshot saved (%s)", room["name"], reason)


def load_room_snapshot_locked(room: dict, pyboy: PyBoy) -> bool:
    snapshot_path = room_snapshot_path(room)
    if not snapshot_path.exists():
        update_snapshot_status_locked(room)
        return False

    meta = load_room_meta(room)
    meta_rom_sha = str(meta.get("romSha256") or "")
    if meta_rom_sha and meta_rom_sha != ROM_SHA256:
        logger.warning("[room=%s] snapshot ROM hash mismatch; skipping load", room["name"])
        update_snapshot_status_locked(room)
        return False

    try:
        with snapshot_path.open("rb") as fh:
            pyboy.load_state(fh)
        room["ticks"] = int(meta.get("ticks") or 0)
        room["input_version"] = int(meta.get("inputVersion") or 0)
        room["frame_version"] = int(meta.get("frameVersion") or 0)
        room["saved_at"] = int(meta.get("savedAt") or 0)
        room["has_snapshot"] = True
        room["snapshot_bytes"] = snapshot_path.stat().st_size
        room["last_saved_monotonic"] = time.monotonic()
        logger.info("[room=%s] snapshot restored", room["name"])
        return True
    except Exception:
        logger.exception("[room=%s] failed to restore snapshot", room["name"])
        update_snapshot_status_locked(room)
        return False


def render_frame(pyboy: PyBoy) -> bytes:
    screen = pyboy.screen
    try:
        image = screen.image
        if image.mode != "RGB":
            image = image.convert("RGB")
    except Exception:
        array = screen.ndarray
        image = Image.fromarray(array if array.ndim == 3 else array,
                                mode="RGB" if array.ndim == 3 else "L")
        if image.mode != "RGB":
            image = image.convert("RGB")
    image = image.resize((480, 432), Image.NEAREST)
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def frame_hash(frame_bytes: bytes) -> str:
    return hashlib.sha256(frame_bytes).hexdigest()[:16]


def get_room(_ignored_room_param: str) -> dict:
    room_name = GLOBAL_ROOM_NAME
    with lock:
        if room_name not in rooms:
            rooms[room_name] = {
                "name": room_name,
                "pyboy": None,
                "ticks": 0,
                "lock": threading.Lock(),
                "latest_frame": None,
                "latest_hash": "",
                "desired_buttons": set(),
                "pressed_buttons": set(),
                "tap_frames": {},
                "tap_queue": [],
                "pending_presentations": [],
                "running": False,
                "worker": None,
                "input_version": 0,
                "frame_version": 0,
                "last_input_at": 0,
                "last_frame_at": 0,
                "dirty": False,
                "save_requested_at": 0.0,
                "last_saved_monotonic": 0.0,
                "saved_at": 0,
                "has_snapshot": False,
                "snapshot_bytes": 0,
            }
        return rooms[room_name]


def presentation_delay_frames(button: str, action: str, queue_depth: int) -> int:
    if action == "tap":
        settle = TAP_SETTLE_FRAMES.get(button, 6)
        return max(1, queue_depth * TAP_HOLD_FRAMES + settle)
    return max(1, HELD_SETTLE_FRAMES.get(button, 2))


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
                nxt = room["tap_queue"].pop(0)
                room["tap_frames"][nxt] = TAP_HOLD_FRAMES

            desired = set(room["desired_buttons"]) | set(room["tap_frames"].keys())
            pressed = set(room["pressed_buttons"])
            for b in desired - pressed:
                pyboy.button_press(b)
            for b in pressed - desired:
                pyboy.button_release(b)

            pyboy.tick()
            room["ticks"] += 1
            room["pressed_buttons"] = desired

            next_tap = {b: f - 1 for b, f in room["tap_frames"].items() if f > 1}
            room["tap_frames"] = next_tap

            raw_frame = render_frame(pyboy)
            room["latest_frame"] = raw_frame
            room["latest_hash"] = frame_hash(raw_frame)

            due = []
            remaining = []
            for ver, ready in room["pending_presentations"]:
                if room["ticks"] >= ready:
                    due.append(ver)
                else:
                    remaining.append((ver, ready))
            room["pending_presentations"] = remaining
            if due:
                room["frame_version"] = max(room["frame_version"], max(due))
                room["last_frame_at"] = int(time.time() * 1000)

            now_monotonic = time.monotonic()
            should_checkpoint = room["dirty"] and (
                (room["save_requested_at"] and now_monotonic - room["save_requested_at"] >= SAVE_DEBOUNCE_SECONDS)
                or (room["last_saved_monotonic"] and now_monotonic - room["last_saved_monotonic"] >= SAVE_CHECKPOINT_SECONDS)
            )
            if should_checkpoint:
                try:
                    save_room_snapshot_locked(room, "checkpoint")
                except Exception:
                    logger.exception("[room=%s] snapshot save failed", room["name"])

        time.sleep(frame_delay)


def init_room(room: dict) -> None:
    if room["pyboy"] is not None:
        return
    logger.info("[room=%s] starting emulator", room["name"])
    pb = PyBoy(args.rom, window="null", sound_emulated=False, sound_volume=0, log_level="ERROR")
    pb.set_emulation_speed(args.tick_rate)
    loaded_snapshot = load_room_snapshot_locked(room, pb)
    if loaded_snapshot:
        room["dirty"] = False
        room["save_requested_at"] = 0.0
    else:
        for _ in range(WARMUP_FRAMES):
            pb.tick()
        room["ticks"] = WARMUP_FRAMES
    room["pyboy"] = pb
    frame = render_frame(pb)
    room["latest_frame"] = frame
    room["latest_hash"] = frame_hash(frame)
    room["last_frame_at"] = int(time.time() * 1000)
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
            room["tap_queue"] = [b for b in room["tap_queue"] if b != button]

        room["input_version"] += 1
        room["last_input_at"] = int(time.time() * 1000)
        room["dirty"] = True
        room["save_requested_at"] = time.monotonic()
        qd = len(room["tap_queue"])
        ready = room["ticks"] + presentation_delay_frames(button, action, qd)
        room["pending_presentations"].append((room["input_version"], ready))

        return {
            "button": button,
            "action": action,
            "queueDepth": qd,
            "heldButtons": sorted(room["desired_buttons"]),
            "acceptedInputVersion": room["input_version"],
            "presentedFrameVersion": room["frame_version"],
            "frameHash": room["latest_hash"],
            "lastInputAt": room["last_input_at"],
            "lastFrameAt": room["last_frame_at"],
        }


def capture_frame(room: dict) -> tuple[bytes, str]:
    with room["lock"]:
        init_room(room)
        frame = room["latest_frame"]
        h = room["latest_hash"]
        if frame is None:
            frame = render_frame(room["pyboy"])
            h = frame_hash(frame)
            room["latest_frame"] = frame
            room["latest_hash"] = h
        return frame, h


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        logger.debug("%s " + fmt, self.client_address[0], *args)

    def respond_json(self, body, status=200):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/image":
            room = get_room(qs.get("room", ["main"])[0])
            try:
                frame, h = capture_frame(room)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                self.send_header("X-Room", room["name"])
                self.send_header("X-Ticks", str(room["ticks"]))
                self.send_header("X-Input-Version", str(room["input_version"]))
                self.send_header("X-Frame-Version", str(room["frame_version"]))
                self.send_header("X-Hash", h)
                self.send_header("ETag", f'"{h}"')
                self.send_header("X-Queue-Depth", str(len(room["tap_queue"])))
                self.send_header("Content-Length", str(len(frame)))
                self.end_headers()
                self.wfile.write(frame)
            except Exception:
                logger.exception("[room=%s] image request failed", room["name"])
                self.send_error(500, "Emulator error")
            return

        if path in ("/", "/healthz"):
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
                    n: {
                        "ticks": r["ticks"],
                        "has_rom": r["pyboy"] is not None,
                        "queueDepth": len(r["tap_queue"]),
                        "heldButtons": sorted(r["desired_buttons"]),
                        "acceptedInputVersion": r["input_version"],
                        "presentedFrameVersion": r["frame_version"],
                        "frameHash": r["latest_hash"],
                        "lastInputAt": r["last_input_at"],
                        "lastFrameAt": r["last_frame_at"],
                        "dirty": r["dirty"],
                        "hasSnapshot": r["has_snapshot"],
                        "savedAt": r["saved_at"],
                        "snapshotBytes": r["snapshot_bytes"],
                    }
                    for n, r in rooms.items()
                }
            self.respond_json(info)
            return

        if path == "/memory":
            room = get_room(qs.get("room", ["main"])[0])
            with room["lock"]:
                snapshot = build_memory_snapshot(room)
            self.respond_json(snapshot)
            return

        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/input":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            body = json.loads(raw.decode() if raw else "{}")
            room = get_room(str(body.get("room", "main")))
            result = queue_input(room, str(body.get("button", "")), str(body.get("action", "tap")))
            self.respond_json({"ok": True, "room": room["name"], **result})
        except Exception:
            logger.exception("input request failed")
            self.send_error(400, "Bad request")


server = ThreadingHTTPServer((args.host, args.port), Handler)
logger.info("server listening on http://%s:%s", args.host, args.port)
logger.info("ROM: %s", args.rom)
logger.info("data dir: %s", DATA_DIR)

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
                    try:
                        save_room_snapshot_locked(room, "shutdown")
                    except Exception:
                        logger.exception("[room=%s] shutdown snapshot save failed", room["name"])
                    room["pyboy"].stop()
    for w in workers:
        w.join(timeout=1)
    server.shutdown()
