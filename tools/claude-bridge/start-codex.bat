@echo off
title CODEX_WRAPPER
cd /d "%~dp0..\.."
echo ============================================
echo  Codex Wrapper - Output Capture Enabled
echo ============================================
echo.
echo  Responses saved to: codex-responses.json
echo  Raw output log:     codex-raw-output.log
echo.
echo  Run codex normally - all output is captured
echo  and viewable in the admin panel.
echo ============================================
echo.
node "%~dp0codex-wrapper.js" %*
pause
