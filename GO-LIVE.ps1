<#
  Rally Live — one-command GO LIVE for rallylive.ca

  What it does (in order), stopping with a clear message if anything is wrong:
    1. Verifies .env has a real DATABASE_URL + strong JWT_SECRET
    2. Installs deps + generates Prisma client + pushes the DB schema
    3. Builds the production app (the watchdog runs `next start`, which needs a build)
    4. PREFLIGHTS the Cloudflare tunnel — the usual cause of a 530:
         - cloudflared.exe present
         - rally-config.yml exists and is NOT the TUNNEL_ID_HERE placeholder
         - the tunnel credentials .json exists
    5. Launches the Rally Watchdog (which starts the app + tunnel + bridge)
    6. Waits and reports: app on :4500, tunnel connected, and the live URL

  Run from the repo root in PowerShell:
      powershell -ExecutionPolicy Bypass -File .\GO-LIVE.ps1

  This script only AUTOMATES the existing setup. It cannot create your tunnel
  for you — that one-time step needs your Cloudflare login (see step 4 output).
#>

$ErrorActionPreference = "Stop"
$RepoRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

function Ok($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Info($m) { Write-Host "  [..]   $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  [STOP] $m" -ForegroundColor Red; Write-Host ""; exit 1 }

Write-Host ""
Write-Host "====================================================" -ForegroundColor White
Write-Host "  Rally Live - GO LIVE  (target: https://rallylive.ca)" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor White
Write-Host ""

# --- 1. Environment -------------------------------------------------------
Info "Checking .env ..."
if (-not (Test-Path ".env")) {
  Die ".env not found. Run:  copy .env.example .env  then fill in DATABASE_URL and JWT_SECRET."
}
$envText = Get-Content ".env" -Raw
function EnvVal($name) {
  $m = [regex]::Match($envText, "(?m)^\s*$name\s*=\s*`"?([^`"\r\n]*)`"?")
  if ($m.Success) { return $m.Groups[1].Value.Trim() } else { return "" }
}
$dbUrl = EnvVal "DATABASE_URL"
$jwt   = EnvVal "JWT_SECRET"
if ([string]::IsNullOrWhiteSpace($dbUrl) -or $dbUrl -notmatch "^mysql://") {
  Die "DATABASE_URL is missing or not a mysql:// URL in .env (you need a running MySQL)."
}
if ($jwt.Length -lt 32 -or $jwt -match "change-in-production") {
  Die "JWT_SECRET is missing/weak. Generate one:`n         node -e `"console.log(require('crypto').randomBytes(48).toString('hex'))`"`n       then paste it into .env as JWT_SECRET."
}
Ok ".env looks good (DATABASE_URL set, JWT_SECRET strong)"

# --- 2. Dependencies + database ------------------------------------------
if (-not (Test-Path "node_modules")) {
  Info "Installing dependencies (npm install) ..."
  npm install
  if ($LASTEXITCODE -ne 0) { Die "npm install failed." }
}
Ok "Dependencies present"

Info "Generating Prisma client + pushing schema (npm run db:generate / db:push) ..."
npm run db:generate
if ($LASTEXITCODE -ne 0) { Die "prisma generate failed." }
npm run db:push
if ($LASTEXITCODE -ne 0) { Die "prisma db push failed - is MySQL running and DATABASE_URL correct?" }
Ok "Database schema in sync"

# --- 3. Production build --------------------------------------------------
Info "Building production app (npm run build) - the watchdog runs `next start`, which needs this ..."
npm run build
if ($LASTEXITCODE -ne 0) { Die "next build failed - fix the build error above before going live." }
Ok "Production build complete"

# --- 4. Cloudflare tunnel preflight (the usual 530 cause) ----------------
Write-Host ""
Info "Preflighting the Cloudflare tunnel (this is what a 530 means is broken) ..."
$cfExe = "C:\cloudflared\cloudflared.exe"
if (-not (Test-Path $cfExe)) {
  Die "cloudflared.exe not found at $cfExe. Install it from https://github.com/cloudflare/cloudflared/releases and put it there."
}
Ok "cloudflared.exe found"

$cfConfig = Join-Path $env:USERPROFILE ".cloudflared\rally-config.yml"
if (-not (Test-Path $cfConfig)) {
  Die "Tunnel config missing: $cfConfig`n       Run the one-time setup: tools\cloudflare\setup-tunnel.bat`n       (cloudflared tunnel login -> create tunnel 'rally' -> route DNS), then copy`n       tools\cloudflare\cloudflared-config.yml to $cfConfig and paste your real tunnel UUID."
}
$cfText = Get-Content $cfConfig -Raw
if ($cfText -match "TUNNEL_ID_HERE") {
  Die "Your tunnel config still has the TUNNEL_ID_HERE placeholder -> this is your 530.`n       Run tools\cloudflare\setup-tunnel.bat once, then replace TUNNEL_ID_HERE in`n       $cfConfig with the real tunnel UUID, and set credentials-file to the matching .json."
}
$idMatch = [regex]::Match($cfText, "(?m)^\s*tunnel:\s*([0-9a-fA-F-]{36})")
if (-not $idMatch.Success) {
  Die "Could not read a tunnel UUID from $cfConfig (the 'tunnel:' line). Fix the config and re-run."
}
$tunnelId = $idMatch.Groups[1].Value
Ok "Tunnel config valid (UUID $tunnelId)"
$credPath = Join-Path $env:USERPROFILE ".cloudflared\$tunnelId.json"
if (-not (Test-Path $credPath)) {
  Die "Tunnel credentials file missing: $credPath`n       cloudflared can't connect without it -> 530. Re-run setup-tunnel.bat / tunnel login."
}
Ok "Tunnel credentials present"

# --- 5. Launch the manager (starts app + tunnel + bridge) ----------------
Write-Host ""
Info "Launching the Rally Watchdog (service manager) ..."
$watchdog = Join-Path $RepoRoot "tools\claude-bridge\watchdog.py"
Start-Process -FilePath "python" -ArgumentList "`"$watchdog`"" -WorkingDirectory (Split-Path $watchdog)
Ok "Watchdog launched - dashboard: http://localhost:9877"

# --- 6. Verify it actually came up ---------------------------------------
function WaitFor($label, $url, $secs) {
  Info "Waiting for $label ..."
  for ($i = 0; $i -lt $secs; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { Ok "$label is up"; return $true }
    } catch { Start-Sleep -Seconds 1 }
  }
  Warn "$label did not come up within $secs s - check the dashboard at http://localhost:9877"
  return $false
}

$appUp    = WaitFor "the app (localhost:4500)" "http://127.0.0.1:4500/" 60
$tunnelUp = WaitFor "the tunnel (cloudflared metrics)" "http://127.0.0.1:20241/metrics" 40

Write-Host ""
Write-Host "====================================================" -ForegroundColor White
if ($appUp -and $tunnelUp) {
  Write-Host "  LIVE.  Open: https://rallylive.ca" -ForegroundColor Green
  Write-Host "  Manage/monitor at: http://localhost:9877" -ForegroundColor Green
  Write-Host "  (Keep this machine + the watchdog running to stay live.)" -ForegroundColor Green
} else {
  Write-Host "  NOT fully live yet. Open the dashboard to see which row is red:" -ForegroundColor Yellow
  Write-Host "    http://localhost:9877" -ForegroundColor Yellow
  if (-not $tunnelUp) { Write-Host "    Tunnel down -> run:  cloudflared tunnel info rally   (0 conns = 530)" -ForegroundColor Yellow }
  if (-not $appUp)    { Write-Host "    App down -> check the 'Rally Live' row's logs in the dashboard" -ForegroundColor Yellow }
}
Write-Host "====================================================" -ForegroundColor White
Write-Host ""
