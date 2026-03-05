@echo off
REM Creates a desktop shortcut for the Codex Wrapper
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut(\"$env:USERPROFILE\Desktop\Codex Wrapper.lnk\"); $Shortcut.TargetPath = '%~dp0start-codex.bat'; $Shortcut.WorkingDirectory = '%~dp0..\..'; $Shortcut.Description = 'Run Codex with output capture for admin panel'; $Shortcut.Save()"
echo Shortcut created on Desktop!
pause
