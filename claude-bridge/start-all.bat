@echo off
title Rally Services
cd /d "%~dp0"

echo Starting Rally services...
echo.

:: Start Bridge in a new window
start "Claude Bridge" cmd /c start-bridge.bat

:: Wait for bridge to initialize before starting watchdog
timeout /t 3 >nul

:: Start Watchdog in a new window
start "Rally Watchdog" cmd /c start-watchdog.bat

echo All services launched.
echo You can close this window.
timeout /t 3 >nul
