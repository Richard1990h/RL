"""
Rally Watchdog — production service manager with web dashboard.

Manages three services:
  1. Claude Bridge   (node claude-bridge.js)  — port 9876
  2. Rally Live      (npm run dev)            — port 4500
  3. Cloudflare Tunnel (cloudflared tunnel run)

Dashboard served at http://localhost:9877 with health monitoring,
automatic restart on failure, and real-time log capture.

Dependencies: psutil (pip install psutil)

Usage: python watchdog.py
"""

from __future__ import annotations

import json
import logging
import os
import re
import signal
import socket
import ssl
import subprocess
import sys
import threading
import time
import webbrowser
from dataclasses import dataclass, field
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

try:
    import psutil
except ImportError:
    print("psutil is required — install with:  pip install psutil", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
#  Configuration
# ---------------------------------------------------------------------------

WATCHDOG_PORT       = 9877
HEALTH_INTERVAL_SEC = 10
MAX_HEALTH_FAILS    = 3
MAX_LOG_LINES       = 200
RESTART_DELAY_SEC   = 2.0
MARK_RUNNING_SEC    = 3.0

BRIDGE_DIR    = Path(__file__).resolve().parent
RALLY_LIVE_DIR = BRIDGE_DIR.parent
USERPROFILE   = os.environ.get("USERPROFILE", r"C:\Users\Richard")
CLOUDFLARED_CONFIG = str(Path(USERPROFILE) / ".cloudflared" / "rally-config.yml")

_CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

log = logging.getLogger("watchdog")


# ---------------------------------------------------------------------------
#  Data structures
# ---------------------------------------------------------------------------

@dataclass
class LogEntry:
    timestamp: str
    text: str
    type: str = "info"


@dataclass
class ServiceConfig:
    key: str
    name: str
    command: str
    args: list[str]
    cwd: str
    port: Optional[int]
    health_url: Optional[str]


@dataclass
class ServiceState:
    config: ServiceConfig
    status: str                         = "stopped"
    pid: Optional[int]                  = None
    process: Optional[subprocess.Popen] = None
    up_since: Optional[float]           = None   # epoch‑ms (JS‑compat for dashboard)
    restart_count: int                  = 0
    health_fail_count: int              = 0
    last_error: Optional[str]           = None
    last_restart_reason: Optional[str]  = None
    last_restart_time: Optional[float]  = None   # epoch‑ms
    logs: list[LogEntry]                = field(default_factory=list)


# ---------------------------------------------------------------------------
#  Process utilities (psutil)
# ---------------------------------------------------------------------------

def find_pid_on_port(port: int) -> Optional[int]:
    """Return the PID listening on *port*, or ``None``."""
    try:
        for conn in psutil.net_connections(kind="tcp"):
            if (conn.laddr.port == port
                    and conn.status == psutil.CONN_LISTEN
                    and conn.pid
                    and conn.pid != 0):
                return conn.pid
    except (psutil.AccessDenied, OSError):
        pass
    return None


def kill_pid(pid: int) -> None:
    """Terminate a single process by PID (best effort)."""
    try:
        psutil.Process(pid).kill()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass


def kill_process_tree(pid: int) -> None:
    """Kill a process and every descendant."""
    try:
        parent = psutil.Process(pid)
        for child in parent.children(recursive=True):
            try:
                child.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        parent.kill()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass


def kill_process_on_port(port: int) -> None:
    """Kill whatever is listening on *port*."""
    pid = find_pid_on_port(port)
    if pid:
        kill_pid(pid)
        log.info("Killed stale process PID %d on port %d", pid, port)


def _iter_cloudflared_rally_pids():
    """Yield PIDs of cloudflared.exe processes whose command line contains rally-config.yml."""
    try:
        for proc in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                name = proc.info.get("name") or ""
                if "cloudflared" not in name.lower():
                    continue
                cmdline = " ".join(proc.info.get("cmdline") or [])
                if "rally-config.yml" in cmdline:
                    yield proc.info["pid"]
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
    except Exception:
        pass


def find_existing_rally_tunnel() -> Optional[int]:
    """Return the PID of a running cloudflared rally tunnel, or ``None``."""
    return next(_iter_cloudflared_rally_pids(), None)


def kill_stale_cloudflared() -> None:
    """Kill every cloudflared process that references rally-config.yml."""
    for pid in _iter_cloudflared_rally_pids():
        kill_pid(pid)
        log.info("Killed stale cloudflared PID %d (rally tunnel)", pid)


# ---------------------------------------------------------------------------
#  ServiceManager — thread‑safe core
# ---------------------------------------------------------------------------

class ServiceManager:
    """Owns all service state, health checking, and lifecycle operations."""

    def __init__(self, configs: list[ServiceConfig]) -> None:
        self._lock = threading.Lock()
        self._shutting_down = False
        self._health_timer: Optional[threading.Timer] = None
        self._ssl_ctx = ssl.create_default_context()
        self._ssl_ctx.check_hostname = False
        self._ssl_ctx.verify_mode = ssl.CERT_NONE

        self.services: dict[str, ServiceState] = {
            cfg.key: ServiceState(config=cfg) for cfg in configs
        }

    # -- helpers ----------------------------------------------------------

    @property
    def shutting_down(self) -> bool:
        return self._shutting_down

    def _now_ms(self) -> float:
        return time.time() * 1000

    def _add_log(self, svc: ServiceState, text: str, log_type: str = "info") -> None:
        entry = LogEntry(
            timestamp=datetime.now().strftime("%H:%M:%S"),
            text=text,
            type=log_type,
        )
        svc.logs.append(entry)
        if len(svc.logs) > MAX_LOG_LINES:
            svc.logs = svc.logs[-MAX_LOG_LINES:]

    # -- start / stop / restart -------------------------------------------

    def start(self, key: str, reason: str = "manual") -> None:
        with self._lock:
            svc = self.services[key]
            if svc.status in ("running", "starting"):
                return
            self._start_locked(svc, reason)

    def _start_locked(self, svc: ServiceState, reason: str) -> None:
        cfg = svc.config

        # On initial boot, adopt an already‑running process
        if reason == "initial":
            adopted_pid = self._try_adopt(svc)
            if adopted_pid is not None:
                return

        # Clear the port / stale tunnel before spawning
        if cfg.port:
            kill_process_on_port(cfg.port)
        if cfg.key == "cloudflare":
            kill_stale_cloudflared()

        svc.status = "starting"
        svc.health_fail_count = 0
        self._add_log(svc, f"Starting: {reason}")
        log.info("Starting %s — %s", cfg.name, reason)

        try:
            child = subprocess.Popen(
                [cfg.command, *cfg.args],
                cwd=cfg.cwd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=_CREATE_NO_WINDOW,
                env=os.environ.copy(),
            )
        except Exception as exc:
            svc.status = "error"
            svc.last_error = str(exc)
            self._add_log(svc, f"Spawn failed: {exc}", "error")
            log.error("%s spawn failed: %s", cfg.name, exc)
            return

        svc.process = child
        svc.pid = child.pid
        svc.up_since = self._now_ms()
        if reason != "initial":
            svc.last_restart_reason = reason
            svc.last_restart_time = self._now_ms()

        # I/O capture threads
        threading.Thread(
            target=self._stream_reader, args=(svc, child.stdout, "info"),
            daemon=True,
        ).start()
        threading.Thread(
            target=self._stream_reader, args=(svc, child.stderr, "error"),
            daemon=True,
        ).start()

        # Exit watcher
        threading.Thread(
            target=self._watch_exit, args=(svc, child),
            daemon=True,
        ).start()

        # Transition starting → running after the process has had time to bind
        threading.Timer(MARK_RUNNING_SEC, self._mark_running, args=(svc, child)).start()

    def _try_adopt(self, svc: ServiceState) -> Optional[int]:
        cfg = svc.config
        pid: Optional[int] = None

        if cfg.key == "cloudflare":
            pid = find_existing_rally_tunnel()
        elif cfg.port:
            pid = find_pid_on_port(cfg.port)

        if pid is None:
            return None

        svc.status = "running"
        svc.pid = pid
        svc.up_since = self._now_ms()
        svc.health_fail_count = 0
        svc.process = None
        self._add_log(svc, f"Adopted existing process (PID {pid})", "ok")
        log.info("Adopted %s PID %d", cfg.name, pid)
        return pid

    def _mark_running(self, svc: ServiceState, child: subprocess.Popen) -> None:
        with self._lock:
            if svc.process is child and svc.status == "starting":
                svc.status = "running"

    def _stream_reader(self, svc: ServiceState, stream, log_type: str) -> None:
        try:
            for raw in iter(stream.readline, b""):
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if line.strip():
                    with self._lock:
                        self._add_log(svc, line, log_type)
        except (ValueError, OSError):
            pass

    def _watch_exit(self, svc: ServiceState, child: subprocess.Popen) -> None:
        code = child.wait()
        with self._lock:
            was_running = svc.status in ("running", "starting")
            svc.status = "stopped"
            svc.process = None
            svc.pid = None
            self._add_log(svc, f"Exited: code={code}", "warn" if code == 0 else "error")
            log.info("%s exited (code=%s)", svc.config.name, code)

            if was_running and not self._shutting_down:
                svc.restart_count += 1
                key = svc.config.key
        if was_running and not self._shutting_down:
            threading.Timer(
                RESTART_DELAY_SEC, self.start,
                args=(key, f"auto-restart (exit code {code})"),
            ).start()

    def stop(self, key: str) -> None:
        with self._lock:
            svc = self.services[key]
            self._stop_locked(svc)

    def _stop_locked(self, svc: ServiceState) -> None:
        if not svc.process and svc.pid:
            self._add_log(svc, "Stopping (adopted)...", "warn")
            log.info("Stopping %s (adopted PID %s)", svc.config.name, svc.pid)
            svc.status = "stopped"
            kill_process_tree(svc.pid)
            svc.pid = None
            return

        if not svc.process:
            svc.status = "stopped"
            return

        self._add_log(svc, "Stopping...", "warn")
        log.info("Stopping %s", svc.config.name)
        svc.status = "stopped"

        if svc.pid:
            kill_process_tree(svc.pid)
        svc.process = None
        svc.pid = None

    def restart(self, key: str, reason: str = "manual restart") -> None:
        with self._lock:
            svc = self.services[key]
            self._stop_locked(svc)
            svc.restart_count += 1
        threading.Timer(
            RESTART_DELAY_SEC, self.start, args=(key, reason),
        ).start()

    # -- bulk operations --------------------------------------------------

    def start_all(self, reason: str = "manual (all)") -> None:
        for key in self.services:
            self.start(key, reason)

    def stop_all(self) -> None:
        for key in self.services:
            self.stop(key)

    def restart_all(self, reason: str = "manual restart (all)") -> None:
        for key in self.services:
            self.restart(key, reason)

    # -- health checks ----------------------------------------------------

    def begin_health_loop(self) -> None:
        self._schedule_health()

    def _schedule_health(self) -> None:
        if self._shutting_down:
            return
        self._health_timer = threading.Timer(HEALTH_INTERVAL_SEC, self._run_health)
        self._health_timer.daemon = True
        self._health_timer.start()

    def _run_health(self) -> None:
        for key, svc in self.services.items():
            try:
                self._check_health(key, svc)
            except Exception as exc:
                log.warning("Health check error for %s: %s", key, exc)
        self._schedule_health()

    def _check_health(self, key: str, svc: ServiceState) -> None:
        with self._lock:
            if svc.status != "running":
                return
            pid = svc.pid
            has_process = svc.process is not None
            health_url = svc.config.health_url

        # Adopted process — verify PID is alive
        if not has_process and pid:
            if not psutil.pid_exists(pid):
                with self._lock:
                    svc.status = "stopped"
                    svc.pid = None
                    self._add_log(svc, "Adopted process is no longer running", "error")
                    svc.restart_count += 1
                log.info("%s adopted process gone, will restart", svc.config.name)
                threading.Timer(
                    RESTART_DELAY_SEC, self.start, args=(key, "adopted process exited"),
                ).start()
                return

        if not health_url:
            with self._lock:
                self._add_log(svc, "Heartbeat: process alive", "health-ok")
            return

        start = time.time()
        try:
            ctx = self._ssl_ctx if health_url.startswith("https") else None
            resp = urlopen(health_url, timeout=5, context=ctx)
            code = resp.getcode()
            resp.close()
            ms = int((time.time() - start) * 1000)
            with self._lock:
                svc.health_fail_count = 0
                self._add_log(svc, f"Heartbeat: OK (HTTP {code}, {ms}ms)", "health-ok")
        except HTTPError as exc:
            ms = int((time.time() - start) * 1000)
            if 200 <= exc.code < 500:
                with self._lock:
                    svc.health_fail_count = 0
                    self._add_log(svc, f"Heartbeat: OK (HTTP {exc.code}, {ms}ms)", "health-ok")
            else:
                self._handle_health_fail(key, svc, f"HTTP {exc.code} ({ms}ms)")
        except Exception as exc:
            ms = int((time.time() - start) * 1000)
            self._handle_health_fail(key, svc, f"{exc} ({ms}ms)")

    def _handle_health_fail(self, key: str, svc: ServiceState, reason: str) -> None:
        with self._lock:
            svc.health_fail_count += 1
            count = svc.health_fail_count
            if count >= MAX_HEALTH_FAILS:
                self._add_log(
                    svc,
                    f"Heartbeat: DOWN - {reason} ({count}/{MAX_HEALTH_FAILS}) - restarting",
                    "health-fail",
                )
                log.warning("%s failed %d health checks, restarting", svc.config.name, MAX_HEALTH_FAILS)
                svc.restart_count += 1
                self._stop_locked(svc)
            else:
                self._add_log(
                    svc,
                    f"Heartbeat: FAIL - {reason} ({count}/{MAX_HEALTH_FAILS})",
                    "health-warn",
                )
        if count >= MAX_HEALTH_FAILS:
            threading.Timer(
                RESTART_DELAY_SEC, self.start,
                args=(key, f"health check failed: {reason}"),
            ).start()

    # -- status snapshot (for the API) ------------------------------------

    def snapshot(self) -> dict:
        with self._lock:
            out: dict = {"now": self._now_ms(), "services": {}}
            for key, svc in self.services.items():
                out["services"][key] = {
                    "name": svc.config.name,
                    "port": svc.config.port,
                    "status": svc.status,
                    "pid": svc.pid,
                    "upSince": svc.up_since,
                    "restartCount": svc.restart_count,
                    "lastError": svc.last_error,
                    "lastRestartReason": svc.last_restart_reason,
                    "lastRestartTime": svc.last_restart_time,
                    "healthFailCount": svc.health_fail_count,
                    "logs": [
                        {"timestamp": e.timestamp, "text": e.text, "type": e.type}
                        for e in svc.logs[-50:]
                    ],
                }
            return out

    # -- shutdown ---------------------------------------------------------

    def shutdown(self) -> None:
        if self._shutting_down:
            return
        self._shutting_down = True
        log.info("Shutting down all services...")
        if self._health_timer:
            self._health_timer.cancel()
        self.stop_all()


# ---------------------------------------------------------------------------
#  Dashboard HTML (identical UI to the original JS version)
# ---------------------------------------------------------------------------

DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Rally Watchdog</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e0e0e0; min-height: 100vh; }
    .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 20px; }

    .global-controls { display: flex; gap: 10px; margin-bottom: 24px; }
    .btn { padding: 8px 18px; border: 1px solid #333; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; background: #1a1a2e; color: #ccc; transition: all 0.15s; }
    .btn:hover { border-color: #666; background: #222; }
    .btn:active { transform: scale(0.97); }
    .btn-green { background: #052e05; color: #22c55e; border-color: #166534; }
    .btn-green:hover { background: #0a3d0a; }
    .btn-red { background: #1f0a0a; color: #ef4444; border-color: #7f1d1d; }
    .btn-red:hover { background: #2d0f0f; }
    .btn-yellow { background: #1a1400; color: #f59e0b; border-color: #78350f; }
    .btn-yellow:hover { background: #261e00; }

    .service-card { background: #111118; border: 2px solid #222; border-radius: 14px; padding: 20px; margin-bottom: 16px; transition: border-color 0.3s; }
    .service-card.card-running { border-color: #16a34a33; }
    .service-card.card-error { border-color: #dc262633; }
    .service-card.card-stopped { border-color: #333; }

    .service-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .status-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 6px rgba(0,0,0,0.5); }
    .status-dot.running { background: #22c55e; box-shadow: 0 0 8px #22c55e55; animation: pulse 2s infinite; }
    .status-dot.starting { background: #f59e0b; box-shadow: 0 0 8px #f59e0b55; animation: pulse 1s infinite; }
    .status-dot.stopped { background: #ef4444; box-shadow: 0 0 8px #ef444455; }
    .status-dot.error { background: #ef4444; box-shadow: 0 0 8px #ef444455; animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    .service-name { font-size: 18px; font-weight: 700; flex: 1; }
    .service-port { font-size: 13px; color: #888; font-family: monospace; }
    .status-badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-badge.running { background: #052e16; color: #4ade80; }
    .status-badge.starting { background: #1c1917; color: #fbbf24; }
    .status-badge.stopped { background: #1c1917; color: #888; }
    .status-badge.error { background: #2d0f0f; color: #f87171; }

    .service-meta { display: flex; gap: 20px; font-size: 13px; color: #999; margin-bottom: 12px; flex-wrap: wrap; }
    .service-meta span { display: flex; gap: 4px; align-items: center; }
    .service-meta .label { color: #666; }
    .service-meta .val { color: #ccc; }
    .service-controls { display: flex; gap: 8px; margin-bottom: 14px; }

    .log-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .log-title { font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
    .log-filter { display: flex; gap: 4px; }
    .log-filter button { padding: 2px 8px; font-size: 10px; border-radius: 4px; border: 1px solid #222; background: #0a0a0f; color: #666; cursor: pointer; font-weight: 600; }
    .log-filter button.active { border-color: #555; color: #ccc; background: #1a1a2e; }
    .log-filter button:hover { border-color: #444; color: #aaa; }

    .log-viewer { background: #06060a; border: 1px solid #1a1a2e; border-radius: 8px; padding: 8px 10px; max-height: 220px; overflow-y: auto; font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 11.5px; line-height: 1.6; }
    .log-viewer::-webkit-scrollbar { width: 5px; }
    .log-viewer::-webkit-scrollbar-track { background: transparent; }
    .log-viewer::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    .log-viewer::-webkit-scrollbar-thumb:hover { background: #555; }
    .log-line { white-space: pre-wrap; word-break: break-all; padding: 1px 0; border-bottom: 1px solid #0e0e14; }
    .log-line:last-child { border-bottom: none; }
    .log-line .ts { color: #444; margin-right: 6px; }

    .log-line.log-health-ok .msg { color: #22c55e; }
    .log-line.log-health-warn .msg { color: #f59e0b; }
    .log-line.log-health-fail .msg { color: #ef4444; font-weight: 600; }
    .log-line.log-ok .msg { color: #22c55e; }
    .log-line.log-warn .msg { color: #f59e0b; }
    .log-line.log-error .msg { color: #ef4444; }
    .log-line.log-info .msg { color: #94a3b8; }

    .log-empty { color: #333; text-align: center; padding: 24px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Rally Watchdog</h1>
    <p class="subtitle">Service manager dashboard</p>
    <div class="global-controls">
      <button class="btn btn-green" onclick="doAll('start')">Start All</button>
      <button class="btn btn-red" onclick="doAll('stop')">Stop All</button>
      <button class="btn btn-yellow" onclick="doAll('restart')">Restart All</button>
    </div>
    <div id="services"></div>
  </div>
  <script>
    function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function formatUptime(ms){if(!ms||ms<=0)return'-';var s=Math.floor(ms/1000),m=Math.floor(s/60);s%=60;var h=Math.floor(m/60);m%=60;var d=Math.floor(h/24);h%=24;if(d>0)return d+'d '+h+'h '+m+'m';if(h>0)return h+'h '+m+'m '+s+'s';if(m>0)return m+'m '+s+'s';return s+'s';}
    function formatTime(ts){return ts?new Date(ts).toLocaleTimeString():'-';}
    var logFilters={};
    function setFilter(k,f){logFilters[k]=f;refresh();}
    async function doAction(k,a){try{await fetch('/api/service/'+k+'/'+a,{method:'POST'});setTimeout(refresh,500);}catch(e){console.error(e);}}
    async function doAll(a){try{await fetch('/api/all/'+a,{method:'POST'});setTimeout(refresh,500);}catch(e){console.error(e);}}
    function renderServices(data){
      var now=data.now,c=document.getElementById('services'),html='';
      for(var key in data.services){
        var svc=data.services[key];
        var uptime=svc.status==='running'&&svc.upSince?now-svc.upSince:0;
        var cc=svc.status==='running'?'card-running':svc.status==='error'?'card-error':'card-stopped';
        html+='<div class="service-card '+cc+'">';
        html+='<div class="service-header"><div class="status-dot '+svc.status+'"></div><div class="service-name">'+escapeHtml(svc.name)+'</div><span class="status-badge '+svc.status+'">'+svc.status+'</span><div class="service-port">'+(svc.port?':'+svc.port:'')+'</div></div>';
        html+='<div class="service-meta"><span><span class="label">PID</span> <span class="val">'+(svc.pid||'-')+'</span></span><span><span class="label">Uptime</span> <span class="val">'+formatUptime(uptime)+'</span></span><span><span class="label">Restarts</span> <span class="val">'+svc.restartCount+'</span></span>';
        if(svc.lastRestartReason)html+='<span><span class="label">Last restart</span> <span class="val">'+escapeHtml(svc.lastRestartReason)+' @ '+formatTime(svc.lastRestartTime)+'</span></span>';
        if(svc.lastError)html+='<span style="color:#ef4444"><span class="label">Error</span> <span class="val" style="color:#f87171">'+escapeHtml(svc.lastError)+'</span></span>';
        html+='</div>';
        html+='<div class="service-controls"><button class="btn btn-green" onclick="doAction(\''+key+'\',\'start\')">Start</button><button class="btn btn-red" onclick="doAction(\''+key+'\',\'stop\')">Stop</button><button class="btn btn-yellow" onclick="doAction(\''+key+'\',\'restart\')">Restart</button></div>';
        var filter=logFilters[key]||'all';
        html+='<div class="log-header"><span class="log-title">Logs</span><div class="log-filter"><button class="'+(filter==='all'?'active':'')+'" onclick="setFilter(\''+key+'\',\'all\')">All</button><button class="'+(filter==='heartbeat'?'active':'')+'" onclick="setFilter(\''+key+'\',\'heartbeat\')">Heartbeats</button><button class="'+(filter==='events'?'active':'')+'" onclick="setFilter(\''+key+'\',\'events\')">Events</button></div></div>';
        html+='<div class="log-viewer" id="log-'+key+'">';
        var logs=svc.logs||[];
        if(!logs.length){html+='<div class="log-empty">Waiting for logs...</div>';}else{
          var filtered=logs;
          if(filter==='heartbeat')filtered=logs.filter(function(l){return l.type&&l.type.indexOf('health')===0;});
          else if(filter==='events')filtered=logs.filter(function(l){return!l.type||l.type.indexOf('health')!==0;});
          var start=Math.max(0,filtered.length-60);
          for(var i=start;i<filtered.length;i++){var lg=filtered[i];html+='<div class="log-line log-'+(lg.type||'info')+'"><span class="ts">'+escapeHtml(lg.timestamp)+'</span><span class="msg">'+escapeHtml(lg.text)+'</span></div>';}
          if(!filtered.length)html+='<div class="log-empty">No matching logs</div>';
        }
        html+='</div></div>';
      }
      c.innerHTML=html;
      for(var k2 in data.services){var el=document.getElementById('log-'+k2);if(el)el.scrollTop=el.scrollHeight;}
    }
    async function refresh(){try{var r=await fetch('/api/status');renderServices(await r.json());}catch(e){console.error(e);}}
    refresh();setInterval(refresh,3000);
  </script>
</body>
</html>""".encode("utf-8")


# ---------------------------------------------------------------------------
#  HTTP server
# ---------------------------------------------------------------------------

_manager: Optional[ServiceManager] = None


class _Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def _json_response(self, code: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # -- GET --------------------------------------------------------------

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(DASHBOARD_HTML)))
            self.end_headers()
            self.wfile.write(DASHBOARD_HTML)
            return

        if self.path == "/api/status":
            self._json_response(200, _manager.snapshot())
            return

        self.send_error(404)

    # -- POST -------------------------------------------------------------

    def do_POST(self) -> None:
        m = re.match(r"^/api/service/(\w+)/(start|stop|restart)$", self.path)
        if m:
            key, action = m.group(1), m.group(2)
            if key not in _manager.services:
                self._json_response(404, {"error": "Unknown service"})
                return
            {"start": lambda: _manager.start(key, "manual"),
             "stop":  lambda: _manager.stop(key),
             "restart": lambda: _manager.restart(key, "manual restart"),
             }[action]()
            self._json_response(200, {"ok": True})
            return

        m = re.match(r"^/api/all/(start|stop|restart)$", self.path)
        if m:
            {"start":   lambda: _manager.start_all("manual (all)"),
             "stop":    _manager.stop_all,
             "restart": lambda: _manager.restart_all("manual restart (all)"),
             }[m.group(1)]()
            self._json_response(200, {"ok": True})
            return

        self.send_error(404)


# ---------------------------------------------------------------------------
#  Bootstrap
# ---------------------------------------------------------------------------

def _is_already_running() -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    try:
        sock.connect(("127.0.0.1", WATCHDOG_PORT))
        sock.close()
        return True
    except (ConnectionRefusedError, socket.timeout, OSError):
        sock.close()
        return False


def _open_browser() -> None:
    url = f"http://localhost:{WATCHDOG_PORT}"
    try:
        os.startfile(url)  # type: ignore[attr-defined]
    except AttributeError:
        webbrowser.open(url)
    except Exception:
        webbrowser.open(url)


def main() -> None:
    global _manager

    logging.basicConfig(
        level=logging.INFO,
        format="[Watchdog] %(message)s",
        stream=sys.stdout,
    )

    if _is_already_running():
        print()
        print("  =============================================")
        print(f"  WATCHDOG ALREADY RUNNING on port {WATCHDOG_PORT}")
        print("  =============================================")
        print()
        print(f"  Open http://localhost:{WATCHDOG_PORT} in your browser.")
        print()
        _open_browser()
        sys.exit(0)

    # -- Build service configs -------------------------------------------

    configs = [
        ServiceConfig(
            key="bridge",
            name="Claude Bridge",
            command="node",
            args=[str(BRIDGE_DIR / "claude-bridge.js")],
            cwd=str(BRIDGE_DIR),
            port=9876,
            health_url="http://127.0.0.1:9876/",
        ),
        ServiceConfig(
            key="nextjs",
            name="Rally Live (Next.js)",
            command="npm.cmd",
            args=["run", "dev"],
            cwd=str(RALLY_LIVE_DIR),
            port=4500,
            health_url="http://127.0.0.1:4500/",
        ),
        ServiceConfig(
            key="cloudflare",
            name="Cloudflare Tunnel",
            command=r"C:\cloudflared\cloudflared.exe",
            args=["tunnel", "--config", CLOUDFLARED_CONFIG, "run"],
            cwd=str(BRIDGE_DIR),
            port=None,
            health_url="https://rallylive.ca/",
        ),
    ]

    _manager = ServiceManager(configs)

    # -- Signal handlers --------------------------------------------------

    def on_signal(signum, frame):
        _manager.shutdown()
        server.shutdown()

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, on_signal)

    # -- Start HTTP server ------------------------------------------------

    server = HTTPServer(("0.0.0.0", WATCHDOG_PORT), _Handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    print()
    print("  =============================================")
    print("  RALLY WATCHDOG")
    print("  =============================================")
    print()
    print(f"  Dashboard: http://localhost:{WATCHDOG_PORT}")
    print()
    print("  Services:")
    print("    - Claude Bridge     (port 9876)")
    print("    - Rally Live        (port 4500)")
    print("    - Cloudflare Tunnel (rallylive.ca)")
    print()
    print("  Starting all services...")
    print("  ---------------------------------------------")
    print()

    _manager.start_all("initial")
    _manager.begin_health_loop()
    _open_browser()

    # Block the main thread until shutdown
    try:
        while not _manager.shutting_down:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        _manager.shutdown()
        server.shutdown()


if __name__ == "__main__":
    main()
