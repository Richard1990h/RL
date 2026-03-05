"""
Claude Bridge - Native Windows Application
Wraps the bridge web dashboard (localhost:9876) in a native Windows window.
UI shell only -- bridge and scanner are managed by watchdog.js.
Single-instance: only one bridge app window at a time.
"""
import sys
import os
import socket
import ctypes
import webview

BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
ICON_PATH = os.path.join(BRIDGE_DIR, "..", "..", "src", "app", "favicon.ico")
PORT = 9876
URL = f"http://localhost:{PORT}"
MUTEX_NAME = "Global\\RallyLive_ClaudeBridge_Mutex"


def check_single_instance():
    """Ensure only one instance runs. Returns mutex handle or exits."""
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    mutex = kernel32.CreateMutexW(None, True, MUTEX_NAME)
    last_error = ctypes.get_last_error()
    if last_error == 183:  # ERROR_ALREADY_EXISTS
        kernel32.CloseHandle(mutex)
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


def main():
    mutex = check_single_instance()

    if not is_port_open(PORT):
        ctypes.windll.user32.MessageBoxW(
            None,
            f"Bridge is not running on port {PORT}.\nStart the watchdog first.",
            "Claude Bridge",
            0x30,  # MB_ICONWARNING
        )
        sys.exit(0)

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

    ctypes.windll.kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
