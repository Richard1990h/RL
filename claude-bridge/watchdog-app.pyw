"""
Rally Watchdog - Native Windows Application
Wraps the watchdog web dashboard (localhost:9877) in a native Windows window.
Starts the Node.js watchdog process if not already running.
Single-instance: only one watchdog app window at a time.
"""
import subprocess
import sys
import os
import time
import socket
import ctypes
import webview

BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
WATCHDOG_SCRIPT = os.path.join(BRIDGE_DIR, "watchdog.js")
ICON_PATH = os.path.join(BRIDGE_DIR, "..", "src", "app", "favicon.ico")
PORT = 9877
URL = f"http://localhost:{PORT}"
MUTEX_NAME = "Global\\RallyLive_Watchdog_Mutex"


def check_single_instance():
    """Ensure only one instance runs. Returns mutex handle or exits."""
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, True, MUTEX_NAME)
    last_error = ctypes.get_last_error()
    # ERROR_ALREADY_EXISTS = 183
    if last_error == 183:
        kernel32.CloseHandle(mutex)
        ctypes.windll.user32.MessageBoxW(
            None, "Rally Watchdog is already running.", "Rally Watchdog", 0x40
        )
        sys.exit(0)
    return mutex


def is_port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except (ConnectionRefusedError, OSError):
        return False


def start_watchdog_process():
    """Start the Node.js watchdog if not already running."""
    if is_port_open(PORT):
        return None  # Already running

    proc = subprocess.Popen(
        ["node", WATCHDOG_SCRIPT],
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
    watchdog_proc = start_watchdog_process()

    icon = ICON_PATH if os.path.exists(ICON_PATH) else None

    window = webview.create_window(
        "Rally Watchdog",
        URL,
        width=1020,
        height=720,
        min_size=(700, 400),
        background_color="#0a0a0f",
    )

    webview.start(icon=icon)

    # Clean up watchdog process if we started it
    if watchdog_proc and watchdog_proc.poll() is None:
        watchdog_proc.terminate()

    # Release mutex
    ctypes.windll.kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
