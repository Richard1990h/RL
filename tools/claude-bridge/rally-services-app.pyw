"""
Rally Services - Launches both Bridge and Watchdog as native Windows apps.
Single-instance: only one rally-services launcher at a time.
"""
import subprocess
import os
import sys
import time
import ctypes

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable
MUTEX_NAME = "Global\\RallyLive_RallyServices_Mutex"


def check_single_instance():
    """Ensure only one instance runs. Returns mutex handle or exits."""
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    mutex = kernel32.CreateMutexW(None, True, MUTEX_NAME)
    last_error = ctypes.get_last_error()
    if last_error == 183:  # ERROR_ALREADY_EXISTS
        kernel32.CloseHandle(mutex)
        ctypes.windll.user32.MessageBoxW(
            None, "Rally Services is already running.", "Rally Services", 0x40
        )
        sys.exit(0)
    return mutex


mutex = check_single_instance()

# Launch watchdog app FIRST (it starts the Node.js watchdog process)
subprocess.Popen(
    [PYTHON, os.path.join(APP_DIR, "watchdog-app.pyw")],
    cwd=APP_DIR,
    creationflags=subprocess.CREATE_NO_WINDOW,
)

time.sleep(3)

# Launch bridge app (webview UI that connects to the already-running bridge)
subprocess.Popen(
    [PYTHON, os.path.join(APP_DIR, "bridge-app.pyw")],
    cwd=APP_DIR,
    creationflags=subprocess.CREATE_NO_WINDOW,
)
