/**
 * Rally Watchdog - Service manager with web dashboard
 *
 * Manages three services:
 *   1. Claude Bridge (node claude-bridge.js) - port 9876
 *   2. Rally Live Next.js (npm run dev) - port 4500
 *   3. Cloudflare Tunnel (cloudflared tunnel run) - no port
 *
 * Dashboard on port 9877 with auto-restart, health checks, and log capture.
 *
 * USAGE: node watchdog.js
 */

const fs = require("fs");
const { spawn, execSync } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");

const WATCHDOG_PORT = 9877;
const HEALTH_INTERVAL = 10000; // 10s
const MAX_HEALTH_FAILS = 3;
const MAX_LOG_LINES = 200;
const RALLY_LIVE_DIR = path.resolve(__dirname, "..");
const BRIDGE_DIR = __dirname;
const CLOUDFLARED_CONFIG = path.join(
  process.env.USERPROFILE || "C:\\Users\\Richard",
  ".cloudflared",
  "rally-config.yml"
);

process.title = "RALLY_WATCHDOG";
try { process.stdout.write("\x1b]0;RALLY_WATCHDOG\x07"); } catch {}

// ─── Service definitions ──────────────────────────────────────────

const services = {
  bridge: {
    name: "Claude Bridge",
    command: process.execPath,
    args: [path.join(BRIDGE_DIR, "claude-bridge.js")],
    cwd: BRIDGE_DIR,
    port: 9876,
    healthUrl: "http://127.0.0.1:9876/",
    process: null,
    status: "stopped",
    pid: null,
    upSince: null,
    restartCount: 0,
    lastError: null,
    lastRestartReason: null,
    lastRestartTime: null,
    healthFailCount: 0,
    logs: [],
  },
  nextjs: {
    name: "Rally Live (Next.js)",
    command: "npm.cmd",
    args: ["run", "dev"],
    cwd: RALLY_LIVE_DIR,
    port: 4500,
    healthUrl: "http://127.0.0.1:4500/",
    process: null,
    status: "stopped",
    pid: null,
    upSince: null,
    restartCount: 0,
    lastError: null,
    lastRestartReason: null,
    lastRestartTime: null,
    healthFailCount: 0,
    logs: [],
  },
  cloudflare: {
    name: "Cloudflare Tunnel",
    command: "C:\\cloudflared\\cloudflared.exe",
    args: ["tunnel", "--config", CLOUDFLARED_CONFIG, "run"],
    cwd: BRIDGE_DIR,
    port: null,
    healthUrl: "https://rallylive.ca/",
    process: null,
    status: "stopped",
    pid: null,
    upSince: null,
    restartCount: 0,
    lastError: null,
    lastRestartReason: null,
    lastRestartTime: null,
    healthFailCount: 0,
    logs: [],
  },
};

// ─── Utility: kill process on a port (Windows) ───────────────────

function killProcessOnPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    const pids = new Set();
    for (const line of out.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0" && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, stdio: "ignore" });
        console.log(`  Killed stale process PID ${pid} on port ${port}`);
      } catch {}
    }
  } catch {}
}

function findPidOnPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    for (const line of out.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0" && /^\d+$/.test(pid)) return pid;
    }
  } catch {}
  return null;
}

function killStaleCloudflared() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq cloudflared.exe" /FO CSV /NH', {
      encoding: "utf-8",
      timeout: 5000,
    });
    for (const line of out.split("\n")) {
      if (!line.includes("cloudflared.exe")) continue;
      const match = line.match(/"cloudflared\.exe","(\d+)"/);
      if (!match) continue;
      const pid = match[1];
      // Check if this process is running rally-config.yml
      try {
        const cmdline = execSync(
          `wmic process where "ProcessId=${pid}" get CommandLine /FORMAT:LIST`,
          { encoding: "utf-8", timeout: 5000 }
        );
        if (cmdline.includes("rally-config.yml")) {
          execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, stdio: "ignore" });
          console.log(`  Killed stale cloudflared PID ${pid} (rally tunnel)`);
        }
      } catch {}
    }
  } catch {}
}

// ─── Service management ─────────────────────────────────────────

// type: "info" | "ok" | "warn" | "error" | "health-ok" | "health-warn" | "health-fail"
function addLog(svcKey, text, type) {
  const svc = services[svcKey];
  const timestamp = new Date().toLocaleTimeString();
  svc.logs.push({ timestamp, text, type: type || "info" });
  if (svc.logs.length > MAX_LOG_LINES) {
    svc.logs = svc.logs.slice(-MAX_LOG_LINES);
  }
}

// Check if an existing rally cloudflared tunnel is running, return its PID or null
function findExistingRallyTunnel() {
  try {
    const out = execSync(
      'powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'cloudflared.exe\'\\" | Select-Object ProcessId, CommandLine | Format-List"',
      { encoding: "utf-8", timeout: 8000 }
    );
    const blocks = out.split("ProcessId");
    for (const block of blocks) {
      if (block.includes("rally-config.yml")) {
        const pidMatch = block.match(/:\s*(\d+)/);
        if (pidMatch) return pidMatch[1];
      }
    }
  } catch {}
  return null;
}

function startService(svcKey, reason) {
  const svc = services[svcKey];
  if (svc.status === "running" || svc.status === "starting") return;

  // On initial start: adopt already-running services instead of killing them
  if (reason === "initial") {
    if (svcKey === "cloudflare") {
      const existingPid = findExistingRallyTunnel();
      if (existingPid) {
        svc.status = "running";
        svc.pid = parseInt(existingPid);
        svc.upSince = Date.now();
        svc.healthFailCount = 0;
        svc.process = null;
        addLog(svcKey, `Adopted existing tunnel (PID ${existingPid})`, "ok");
        console.log(`[Watchdog] Adopted existing cloudflare tunnel PID ${existingPid}`);
        return;
      }
    } else if (svc.port) {
      const existingPid = findPidOnPort(svc.port);
      if (existingPid) {
        svc.status = "running";
        svc.pid = parseInt(existingPid);
        svc.upSince = Date.now();
        svc.healthFailCount = 0;
        svc.process = null;
        addLog(svcKey, `Adopted existing process (PID ${existingPid}) on port ${svc.port}`, "ok");
        console.log(`[Watchdog] Adopted existing ${svc.name} PID ${existingPid} on port ${svc.port}`);
        return;
      }
    }
  }

  // Kill stale processes on the port before starting
  if (svc.port) killProcessOnPort(svc.port);
  if (svcKey === "cloudflare") killStaleCloudflared();

  svc.status = "starting";
  svc.healthFailCount = 0;
  addLog(svcKey, `Starting: ${reason || "manual"}`);
  console.log(`[Watchdog] Starting ${svc.name} - ${reason || "manual"}`);

  let child;
  try {
    // Quote command and args containing spaces for shell mode
    const quoteIfNeeded = (s) => s.includes(" ") ? `"${s}"` : s;
    const cmd = quoteIfNeeded(svc.command);
    const args = svc.args.map(quoteIfNeeded);
    child = spawn(cmd, args, {
      cwd: svc.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      windowsHide: true,
      env: { ...process.env },
    });
  } catch (err) {
    svc.status = "error";
    svc.lastError = err.message;
    addLog(svcKey, `Spawn failed: ${err.message}`, "error");
    console.log(`[Watchdog] ${svc.name} spawn failed: ${err.message}`);
    return;
  }

  svc.process = child;
  svc.pid = child.pid;
  svc.upSince = Date.now();
  if (reason && reason !== "initial") {
    svc.lastRestartReason = reason;
    svc.lastRestartTime = Date.now();
  }

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) addLog(svcKey, line);
  });
  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) addLog(svcKey, line, "error");
  });

  child.on("error", (err) => {
    svc.status = "error";
    svc.lastError = err.message;
    addLog(svcKey, `Process error: ${err.message}`, "error");
    console.log(`[Watchdog] ${svc.name} error: ${err.message}`);
  });

  child.on("exit", (code, signal) => {
    const wasRunning = svc.status === "running" || svc.status === "starting";
    svc.status = "stopped";
    svc.process = null;
    svc.pid = null;
    addLog(svcKey, `Exited: code=${code} signal=${signal}`, code === 0 ? "warn" : "error");
    console.log(`[Watchdog] ${svc.name} exited (code=${code}, signal=${signal})`);

    // Auto-restart if it was running (not manually stopped)
    if (wasRunning && !shuttingDown) {
      svc.restartCount++;
      setTimeout(() => {
        startService(svcKey, `auto-restart (exit code ${code})`);
      }, 2000);
    }
  });

  // Mark as running after a short delay (give it time to bind)
  setTimeout(() => {
    if (svc.process && svc.status === "starting") {
      svc.status = "running";
    }
  }, 3000);
}

function stopService(svcKey) {
  const svc = services[svcKey];
  if (!svc.process) {
    svc.status = "stopped";
    return;
  }

  addLog(svcKey, "Stopping...", "warn");
  console.log(`[Watchdog] Stopping ${svc.name}`);

  // Set status before killing so the exit handler doesn't auto-restart
  const prevStatus = svc.status;
  svc.status = "stopped";

  try {
    // On Windows, use taskkill to kill the process tree
    if (svc.pid) {
      execSync(`taskkill /F /T /PID ${svc.pid}`, { timeout: 5000, stdio: "ignore" });
    }
  } catch {
    try { svc.process.kill("SIGTERM"); } catch {}
  }

  svc.process = null;
  svc.pid = null;
}

function restartService(svcKey, reason) {
  stopService(svcKey);
  const svc = services[svcKey];
  svc.restartCount++;
  setTimeout(() => {
    startService(svcKey, reason || "manual restart");
  }, 1500);
}

// ─── Health checks ──────────────────────────────────────────────

function checkHealth(svcKey) {
  const svc = services[svcKey];
  if (svc.status !== "running") return;

  // For adopted processes (no child handle), check if the PID is still alive
  if (!svc.process && svc.pid) {
    try {
      execSync(`powershell -Command "Get-Process -Id ${svc.pid} -ErrorAction Stop | Out-Null"`, {
        timeout: 3000,
        stdio: "ignore",
      });
    } catch {
      svc.status = "stopped";
      svc.pid = null;
      addLog(svcKey, "Adopted process is no longer running", "error");
      console.log(`[Watchdog] ${svc.name} adopted process gone, will restart`);
      svc.restartCount++;
      setTimeout(() => startService(svcKey, "adopted process exited"), 2000);
      return;
    }
  }

  if (!svc.healthUrl) {
    // No URL to check — process is alive, that's enough
    addLog(svcKey, "Heartbeat: process alive", "health-ok");
    return;
  }

  const startTime = Date.now();
  const mod = svc.healthUrl.startsWith("https") ? require("https") : http;
  const req = mod.get(svc.healthUrl, { timeout: 5000 }, (res) => {
    const ms = Date.now() - startTime;
    if (res.statusCode >= 200 && res.statusCode < 500) {
      svc.healthFailCount = 0;
      addLog(svcKey, `Heartbeat: OK (HTTP ${res.statusCode}, ${ms}ms)`, "health-ok");
      res.resume();
    } else {
      handleHealthFail(svcKey, `HTTP ${res.statusCode} (${ms}ms)`);
      res.resume();
    }
  });
  req.on("error", (err) => {
    const ms = Date.now() - startTime;
    handleHealthFail(svcKey, `${err.message} (${ms}ms)`);
  });
  req.on("timeout", () => {
    req.destroy();
    handleHealthFail(svcKey, "timeout (5000ms)");
  });
}

function handleHealthFail(svcKey, reason) {
  const svc = services[svcKey];
  svc.healthFailCount++;

  if (svc.healthFailCount >= MAX_HEALTH_FAILS) {
    addLog(svcKey, `Heartbeat: DOWN - ${reason} (${svc.healthFailCount}/${MAX_HEALTH_FAILS}) - restarting`, "health-fail");
    console.log(`[Watchdog] ${svc.name} failed ${MAX_HEALTH_FAILS} health checks, restarting...`);
    svc.restartCount++;
    stopService(svcKey);
    setTimeout(() => {
      startService(svcKey, `health check failed: ${reason}`);
    }, 2000);
  } else {
    addLog(svcKey, `Heartbeat: FAIL - ${reason} (${svc.healthFailCount}/${MAX_HEALTH_FAILS})`, "health-warn");
  }
}

// ─── Dashboard HTML ─────────────────────────────────────────────

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Rally Watchdog</title>
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e0e0e0; min-height: 100vh; }

    /* App title bar - draggable in Chrome app mode */
    .app-titlebar {
      -webkit-app-region: drag;
      background: linear-gradient(135deg, #111118 0%, #151520 100%);
      border-bottom: 1px solid #222;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      user-select: none;
    }
    .app-titlebar img {
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }
    .app-titlebar-text {
      font-size: 15px;
      font-weight: 700;
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .app-titlebar .svc-summary {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      -webkit-app-region: no-drag;
    }
    .app-titlebar .svc-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 10px;
      background: #1a1a2e;
      border: 1px solid #333;
    }
    .app-titlebar .svc-pill .pill-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .app-titlebar .svc-pill .pill-dot.running { background: #22c55e; }
    .app-titlebar .svc-pill .pill-dot.stopped { background: #ef4444; }
    .app-titlebar .svc-pill .pill-dot.starting { background: #f59e0b; }
    .app-titlebar .svc-pill .pill-dot.error { background: #ef4444; }
    .app-titlebar .svc-pill .pill-label { color: #aaa; }

    .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 20px; }

    .global-controls { display: flex; gap: 10px; margin-bottom: 24px; -webkit-app-region: no-drag; }
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

    /* Log type colors */
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
  <div class="app-titlebar">
    <img src="/logo.png" alt="RL">
    <span class="app-titlebar-text">Rally Watchdog</span>
    <div class="svc-summary" id="svcSummary"></div>
  </div>
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
    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function formatUptime(ms) {
      if (!ms || ms <= 0) return '-';
      var s = Math.floor(ms / 1000);
      var m = Math.floor(s / 60); s %= 60;
      var h = Math.floor(m / 60); m %= 60;
      var d = Math.floor(h / 24); h %= 24;
      if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
      if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    }

    function formatTime(ts) {
      if (!ts) return '-';
      return new Date(ts).toLocaleTimeString();
    }

    // Track which log filter is active per service ('all' or 'heartbeat')
    var logFilters = {};

    function setFilter(key, filter) {
      logFilters[key] = filter;
      refresh();
    }

    async function doAction(key, action) {
      try {
        await fetch('/api/service/' + key + '/' + action, { method: 'POST' });
        setTimeout(refresh, 500);
      } catch(e) { console.error(e); }
    }

    async function doAll(action) {
      try {
        await fetch('/api/all/' + action, { method: 'POST' });
        setTimeout(refresh, 500);
      } catch(e) { console.error(e); }
    }

    function renderServices(data) {
      var now = data.now;
      var container = document.getElementById('services');
      var html = '';
      // Update title bar service summary pills
      var summaryEl = document.getElementById('svcSummary');
      var summaryHtml = '';
      for (var skey in data.services) {
        var ss = data.services[skey];
        var shortName = ss.name.split(' ')[0];
        if (shortName === 'Rally') shortName = 'Next.js';
        if (shortName === 'Cloudflare') shortName = 'Tunnel';
        if (shortName === 'Claude') shortName = 'Bridge';
        summaryHtml += '<div class="svc-pill"><div class="pill-dot ' + ss.status + '"></div><span class="pill-label">' + shortName + '</span></div>';
      }
      summaryEl.innerHTML = summaryHtml;
      for (var key in data.services) {
        var svc = data.services[key];
        var uptime = svc.status === 'running' && svc.upSince ? now - svc.upSince : 0;
        var cardClass = svc.status === 'running' ? 'card-running' : svc.status === 'error' ? 'card-error' : 'card-stopped';

        html += '<div class="service-card ' + cardClass + '">';

        // Header row
        html += '<div class="service-header">';
        html += '<div class="status-dot ' + svc.status + '"></div>';
        html += '<div class="service-name">' + escapeHtml(svc.name) + '</div>';
        html += '<span class="status-badge ' + svc.status + '">' + svc.status + '</span>';
        html += '<div class="service-port">' + (svc.port ? ':' + svc.port : '') + '</div>';
        html += '</div>';

        // Meta row
        html += '<div class="service-meta">';
        html += '<span><span class="label">PID</span> <span class="val">' + (svc.pid || '-') + '</span></span>';
        html += '<span><span class="label">Uptime</span> <span class="val">' + formatUptime(uptime) + '</span></span>';
        html += '<span><span class="label">Restarts</span> <span class="val">' + svc.restartCount + '</span></span>';
        if (svc.lastRestartReason) {
          html += '<span><span class="label">Last restart</span> <span class="val">' + escapeHtml(svc.lastRestartReason) + ' @ ' + formatTime(svc.lastRestartTime) + '</span></span>';
        }
        if (svc.lastError) {
          html += '<span style="color:#ef4444"><span class="label">Error</span> <span class="val" style="color:#f87171">' + escapeHtml(svc.lastError) + '</span></span>';
        }
        html += '</div>';

        // Controls
        html += '<div class="service-controls">';
        html += '<button class="btn btn-green" onclick="doAction(\\'' + key + '\\',\\'start\\')">Start</button>';
        html += '<button class="btn btn-red" onclick="doAction(\\'' + key + '\\',\\'stop\\')">Stop</button>';
        html += '<button class="btn btn-yellow" onclick="doAction(\\'' + key + '\\',\\'restart\\')">Restart</button>';
        html += '</div>';

        // Log filter bar
        var filter = logFilters[key] || 'all';
        html += '<div class="log-header">';
        html += '<span class="log-title">Logs</span>';
        html += '<div class="log-filter">';
        html += '<button class="' + (filter === 'all' ? 'active' : '') + '" onclick="setFilter(\\'' + key + '\\',\\'all\\')">All</button>';
        html += '<button class="' + (filter === 'heartbeat' ? 'active' : '') + '" onclick="setFilter(\\'' + key + '\\',\\'heartbeat\\')">Heartbeats</button>';
        html += '<button class="' + (filter === 'events' ? 'active' : '') + '" onclick="setFilter(\\'' + key + '\\',\\'events\\')">Events</button>';
        html += '</div>';
        html += '</div>';

        // Log viewer
        html += '<div class="log-viewer" id="log-' + key + '">';
        var logs = svc.logs || [];
        if (logs.length === 0) {
          html += '<div class="log-empty">Waiting for logs...</div>';
        } else {
          var filtered = logs;
          if (filter === 'heartbeat') {
            filtered = logs.filter(function(l) { return l.type && l.type.indexOf('health') === 0; });
          } else if (filter === 'events') {
            filtered = logs.filter(function(l) { return !l.type || l.type.indexOf('health') !== 0; });
          }
          var start = Math.max(0, filtered.length - 60);
          for (var i = start; i < filtered.length; i++) {
            var log = filtered[i];
            var typeClass = 'log-' + (log.type || 'info');
            html += '<div class="log-line ' + typeClass + '">';
            html += '<span class="ts">' + escapeHtml(log.timestamp) + '</span>';
            html += '<span class="msg">' + escapeHtml(log.text) + '</span>';
            html += '</div>';
          }
          if (filtered.length === 0) {
            html += '<div class="log-empty">No matching logs</div>';
          }
        }
        html += '</div>';

        html += '</div>'; // end card
      }
      container.innerHTML = html;

      // Auto-scroll log viewers to bottom
      for (var key2 in data.services) {
        var el = document.getElementById('log-' + key2);
        if (el) el.scrollTop = el.scrollHeight;
      }
    }

    async function refresh() {
      try {
        var res = await fetch('/api/status');
        var data = await res.json();
        renderServices(data);
      } catch(e) { console.error(e); }
    }

    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;
}

// ─── HTTP Server ────────────────────────────────────────────────

let shuttingDown = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${WATCHDOG_PORT}`);

  // Serve favicon and logo
  if (url.pathname === "/favicon.ico" || url.pathname === "/logo.png") {
    const filePath = url.pathname === "/logo.png"
      ? path.join(__dirname, "..", "public", "logo.png")
      : path.join(__dirname, "..", "src", "app", "favicon.ico");
    const contentType = url.pathname === "/logo.png" ? "image/png" : "image/x-icon";
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getDashboardHTML());
    return;
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    const data = { now: Date.now(), services: {} };
    for (const [key, svc] of Object.entries(services)) {
      data.services[key] = {
        name: svc.name,
        port: svc.port,
        status: svc.status,
        pid: svc.pid,
        upSince: svc.upSince,
        restartCount: svc.restartCount,
        lastError: svc.lastError,
        lastRestartReason: svc.lastRestartReason,
        lastRestartTime: svc.lastRestartTime,
        healthFailCount: svc.healthFailCount,
        logs: svc.logs.slice(-50),
      };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
    return;
  }

  // Service actions: /api/service/:key/:action
  const svcMatch = url.pathname.match(/^\/api\/service\/(\w+)\/(start|stop|restart)$/);
  if (svcMatch && req.method === "POST") {
    const [, key, action] = svcMatch;
    if (!services[key]) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown service" }));
      return;
    }
    if (action === "start") startService(key, "manual");
    else if (action === "stop") stopService(key);
    else if (action === "restart") restartService(key, "manual restart");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // All actions: /api/all/:action
  const allMatch = url.pathname.match(/^\/api\/all\/(start|stop|restart)$/);
  if (allMatch && req.method === "POST") {
    const action = allMatch[1];
    for (const key of Object.keys(services)) {
      if (action === "start") startService(key, "manual (all)");
      else if (action === "stop") stopService(key);
      else if (action === "restart") restartService(key, "manual restart (all)");
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// ─── Graceful shutdown ──────────────────────────────────────────

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[Watchdog] Shutting down all services...");
  for (const key of Object.keys(services)) {
    stopService(key);
  }
  server.close();
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

// ─── Single instance check + startup ────────────────────────────

const testConn = net.createConnection({ port: WATCHDOG_PORT, host: "127.0.0.1" });
testConn.setTimeout(1000);
testConn.once("connect", () => {
  testConn.destroy();
  console.log("");
  console.log("  =============================================");
  console.log("  WATCHDOG ALREADY RUNNING on port " + WATCHDOG_PORT);
  console.log("  =============================================");
  console.log("");
  console.log("  Open http://localhost:" + WATCHDOG_PORT + " in your browser.");
  console.log("");
  try {
    execSync(`start http://localhost:${WATCHDOG_PORT}`, { stdio: "ignore" });
  } catch {}
  process.exit(0);
});
testConn.once("error", () => {
  testConn.destroy();
  boot();
});
testConn.once("timeout", () => {
  testConn.destroy();
  boot();
});

function boot() {
  server.listen(WATCHDOG_PORT, () => {
    console.log("");
    console.log("  =============================================");
    console.log("  RALLY WATCHDOG");
    console.log("  =============================================");
    console.log("");
    console.log(`  Dashboard: http://localhost:${WATCHDOG_PORT}`);
    console.log("");
    console.log("  Services:");
    console.log("    - Claude Bridge     (port 9876)");
    console.log("    - Rally Live        (port 4500)");
    console.log("    - Cloudflare Tunnel (rallylive.ca)");
    console.log("");
    console.log("  Starting all services...");
    console.log("  ─────────────────────────────────────────────");
    console.log("");

    // Start all services
    for (const key of Object.keys(services)) {
      startService(key, "initial");
    }

    // Start health check loop
    setInterval(() => {
      for (const key of Object.keys(services)) {
        checkHealth(key);
      }
    }, HEALTH_INTERVAL);
  });
}
