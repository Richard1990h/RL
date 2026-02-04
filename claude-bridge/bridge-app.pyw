"""
Claude Bridge - Native Windows Application
Wraps the bridge web dashboard (localhost:9876) in a native Windows window.
Starts the Node.js bridge process if not already running.
Single-instance: only one bridge app window at a time.
"""
import subprocess
import sys
import os
import time
import socket
import ctypes
import webview

BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
BRIDGE_SCRIPT = os.path.join(BRIDGE_DIR, "claude-bridge.js")
ICON_PATH = os.path.join(BRIDGE_DIR, "..", "src", "app", "favicon.ico")
PORT = 9876
URL = f"http://localhost:{PORT}"
MUTEX_NAME = "Global\\RallyLive_ClaudeBridge_Mutex"


def check_single_instance():
    """Ensure only one instance runs. Returns mutex handle or exits."""
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, True, MUTEX_NAME)
    last_error = ctypes.get_last_error()
    # ERROR_ALREADY_EXISTS = 183
    if last_error == 183:
        kernel32.CloseHandle(mutex)
        # Try to bring existing window to front
        ctypes.windll.user32.MessageBoxW(
            None, "Claude Bridge is already running.", "Claude Bridge", 0x40
        )
        sys.exit(0)
    return mutex


def is_port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except (ConnectionRefusedError, OSError):
        return False


def start_bridge_process():
    """Start the Node.js bridge if not already running."""
    if is_port_open(PORT):
        return None  # Already running

    proc = subprocess.Popen(
        ["node", BRIDGE_SCRIPT],
        cwd=BRIDGE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    # Wait for it to bind
    for _ in range(30):
        if is_port_open(PORT):
            break
        time.sleep(0.5)

    return proc


def main():
    mutex = check_single_instance()
    bridge_proc = start_bridge_process()

    icon = ICON_PATH if os.path.exists(ICON_PATH) else None

    window = webview.create_window(
        "Claude Bridge",
        URL,
        width=920,
        height=720,
        min_size=(600, 400),
        background_color="#0a0a0f",
    )

    webview.start(icon=icon)

    # Clean up bridge process if we started it
    if bridge_proc and bridge_proc.poll() is None:
        bridge_proc.terminate()

    # Release mutex
    ctypes.windll.kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
