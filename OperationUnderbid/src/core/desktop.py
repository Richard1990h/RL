#!/usr/bin/env python3
"""
desktop.py — Screen capture + human-like mouse/keyboard for Operation Underbid.
Runs as a persistent child process; parent (Node) sends JSON commands on stdin,
gets JSON responses on stdout. One command per line. Thread-safe.

Commands:
  {"cmd":"screenshot"}
  {"cmd":"mouse_move","x":100,"y":200}
  {"cmd":"click","x":100,"y":200,"button":"left","double":false}
  {"cmd":"scroll","x":100,"y":200,"direction":"down","amount":3}
  {"cmd":"type","text":"hello world"}
  {"cmd":"key","keys":["ctrl","a"]}
  {"cmd":"ping"}
  {"cmd":"quit"}
"""

import sys
import json
import time
import math
import random
import base64
import threading
import platform
from io import BytesIO

IS_WINDOWS = platform.system() == "Windows"

# ─── Screen capture ───────────────────────────────────────────────────────────
try:
    import mss
    import mss.tools
    _mss = mss.mss()
    HAS_MSS = True
except Exception:
    HAS_MSS = False

# ─── Input control ────────────────────────────────────────────────────────────
try:
    import pynput.mouse as _mouse_mod
    import pynput.keyboard as _keyboard_mod
    _mouse = _mouse_mod.Controller()
    _keyboard = _keyboard_mod.Controller()
    HAS_PYNPUT = True
except Exception:
    HAS_PYNPUT = False

# ─── Bezier curve for natural mouse paths ────────────────────────────────────
def _bezier_points(p0, p1, p2, p3, steps=30):
    """Cubic Bezier curve between p0→p3 with control points p1,p2."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t**2*p2[0] + t**3*p3[0]
        y = (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t**2*p2[1] + t**3*p3[1]
        pts.append((int(x), int(y)))
    return pts

def _human_move(tx: int, ty: int):
    """Move mouse to (tx, ty) along a randomised Bezier path."""
    if not HAS_PYNPUT:
        return
    cx, cy = _mouse.position
    dist = math.hypot(tx - cx, ty - cy)
    steps = max(10, int(dist / 8))

    # Random control points — creates natural arc + possible overshoot
    off = random.randint(20, 60)
    p1 = (cx + random.randint(-off, off), cy + random.randint(-off, off))
    p2 = (tx + random.randint(-off, off), ty + random.randint(-off, off))
    path = _bezier_points((cx, cy), p1, p2, (tx, ty), steps=steps)

    for px, py in path:
        _mouse.position = (px, py)
        time.sleep(random.uniform(0.003, 0.010))

    # Small correction jitter — humans never land perfectly
    _mouse.position = (tx + random.randint(-2, 2), ty + random.randint(-2, 2))
    time.sleep(random.uniform(0.04, 0.12))
    _mouse.position = (tx, ty)

# ─── Human-like typing ────────────────────────────────────────────────────────
# Inter-key delay distribution sampled from real typing studies (~70–140 WPM)
def _human_type(text: str):
    if not HAS_PYNPUT:
        return
    for i, ch in enumerate(text):
        # Occasional typo
        if random.random() < 0.015 and ch.isalpha():
            typo = random.choice('qwertyuiopasdfghjklzxcvbnm')
            _keyboard.type(typo)
            time.sleep(random.uniform(0.08, 0.25))
            _keyboard.press(_keyboard_mod.Key.backspace)
            _keyboard.release(_keyboard_mod.Key.backspace)
            time.sleep(random.uniform(0.05, 0.15))

        _keyboard.type(ch)

        # Delay: space/Enter gets a longer pause (simulates thinking)
        if ch in (' ', '\n', '.', ','):
            time.sleep(random.uniform(0.08, 0.22))
        else:
            time.sleep(random.uniform(0.045, 0.145))

        # Occasional mid-sentence pause
        if random.random() < 0.005:
            time.sleep(random.uniform(0.4, 1.2))

# ─── Screenshot ───────────────────────────────────────────────────────────────
def _screenshot_b64() -> str:
    if not HAS_MSS:
        return ""
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        buf = mss.tools.to_png(shot.rgb, shot.size)
        return base64.b64encode(buf).decode()

# ─── Key mapping ─────────────────────────────────────────────────────────────
from pynput.keyboard import Key as _K

_KEY_MAP = {
    "ctrl": _K.ctrl, "shift": _K.shift, "alt": _K.alt,
    "enter": _K.enter, "return": _K.enter,
    "tab": _K.tab, "escape": _K.esc, "esc": _K.esc,
    "backspace": _K.backspace, "delete": _K.delete,
    "space": _K.space, "up": _K.up, "down": _K.down,
    "left": _K.left, "right": _K.right,
    "home": _K.home, "end": _K.end,
    "pageup": _K.page_up, "pagedown": _K.page_down,
    "f1": _K.f1, "f2": _K.f2, "f3": _K.f3, "f4": _K.f4,
    "f5": _K.f5, "f6": _K.f6, "f7": _K.f7, "f8": _K.f8,
}

def _press_keys(keys: list):
    """Press a key combination, e.g. ['ctrl', 'a']."""
    if not HAS_PYNPUT:
        return
    mapped = [_KEY_MAP.get(k.lower(), k) for k in keys]
    for k in mapped:
        _keyboard.press(k)
        time.sleep(0.02)
    for k in reversed(mapped):
        _keyboard.release(k)
        time.sleep(0.02)

# ─── Main loop ────────────────────────────────────────────────────────────────
def _process(cmd: dict) -> dict:
    c = cmd.get("cmd", "")
    try:
        if c == "ping":
            return {"ok": True, "pynput": HAS_PYNPUT, "mss": HAS_MSS}

        elif c == "screenshot":
            b64 = _screenshot_b64()
            return {"ok": True, "image": b64}

        elif c == "mouse_move":
            _human_move(int(cmd["x"]), int(cmd["y"]))
            return {"ok": True}

        elif c == "click":
            x, y = int(cmd["x"]), int(cmd["y"])
            _human_move(x, y)
            import pynput.mouse as _m
            btn = _m.Button.right if cmd.get("button") == "right" else _m.Button.left
            if cmd.get("double"):
                _mouse.click(btn, 2)
            else:
                _mouse.click(btn, 1)
            time.sleep(random.uniform(0.05, 0.15))
            return {"ok": True}

        elif c == "scroll":
            x, y = int(cmd["x"]), int(cmd["y"])
            _human_move(x, y)
            amount = int(cmd.get("amount", 3))
            delta = -amount if cmd.get("direction", "down") == "down" else amount
            _mouse.scroll(0, delta)
            time.sleep(random.uniform(0.1, 0.3))
            return {"ok": True}

        elif c == "type":
            _human_type(str(cmd["text"]))
            return {"ok": True}

        elif c == "key":
            _press_keys(cmd.get("keys", []))
            return {"ok": True}

        elif c == "quit":
            sys.exit(0)

        else:
            return {"ok": False, "error": f"Unknown cmd: {c}"}

    except Exception as e:
        return {"ok": False, "error": str(e)}

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({"ok": False, "error": f"JSON parse error: {e}"}) + "\n")
            sys.stdout.flush()
            continue

        result = _process(cmd)
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
