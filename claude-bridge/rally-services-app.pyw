"""
Rally Services - Launches both Bridge and Watchdog as native Windows apps.
"""
import subprocess
import os
import sys
import time

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable

# Launch bridge app
subprocess.Popen(
    [PYTHON, os.path.join(APP_DIR, "bridge-app.pyw")],
    cwd=APP_DIR,
    creationflags=subprocess.CREATE_NO_WINDOW,
)

time.sleep(3)

# Launch watchdog app
subprocess.Popen(
    [PYTHON, os.path.join(APP_DIR, "watchdog-app.pyw")],
    cwd=APP_DIR,
    creationflags=subprocess.CREATE_NO_WINDOW,
)
