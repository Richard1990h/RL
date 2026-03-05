@echo off
title Rally Watchdog
cd /d "%~dp0"

:: Launch Chrome in app mode (fall back to Edge if Chrome not found)
where chrome >nul 2>&1
if %ERRORLEVEL%==0 (
    start "" chrome --app=http://localhost:9877 --window-size=1000,700
) else (
    where msedge >nul 2>&1
    if %ERRORLEVEL%==0 (
        start "" msedge --app=http://localhost:9877 --window-size=1000,700
    ) else (
        echo No Chrome or Edge found, opening in default browser...
        start http://localhost:9877
    )
)

:: Start the watchdog process (keeps window open)
python watchdog.py
pause
