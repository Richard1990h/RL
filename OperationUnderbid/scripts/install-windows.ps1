# Operation Underbid — Windows Startup Setup
# Run as Administrator: powershell -ExecutionPolicy Bypass -File install-windows.ps1

$ProjectPath = "C:\OperationUnderbid"
$NodePath = (Get-Command node).Source | Split-Path

Write-Host "Setting up Windows auto-start for Operation Underbid..." -ForegroundColor Cyan

# 1. Register PM2 to auto-start on login via Task Scheduler
$action = New-ScheduledTaskAction `
  -Execute "$NodePath\node.exe" `
  -Argument "$env:APPDATA\npm\node_modules\pm2\bin\pm2 resurrect" `
  -WorkingDirectory $ProjectPath

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit 0 `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName "OperationUnderbid-PM2" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest `
  -Force

Write-Host "✓ Scheduled task registered" -ForegroundColor Green

# 2. Save PM2 state so resurrect has something to load
Set-Location $ProjectPath
& pm2 start pm2.config.js
& pm2 save
Write-Host "✓ PM2 state saved" -ForegroundColor Green

Write-Host "`nSetup complete. Underbid will start automatically on next login." -ForegroundColor Green
