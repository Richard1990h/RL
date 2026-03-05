@echo off
REM Rally - Cloudflare Tunnel Setup
REM Run this ONCE to create the tunnel, then use start-tunnel.bat to run it

echo ====================================
echo  Rally - Cloudflare Tunnel Setup
echo  Domain: rallylive.ca
echo ====================================
echo.

cd /d C:\cloudflared

echo Step 1: Login to Cloudflare (if not already)
cloudflared.exe tunnel login
echo.

echo Step 2: Creating tunnel "rally"...
cloudflared.exe tunnel create rally
echo.
echo IMPORTANT: Copy the tunnel ID from above and update:
echo   C:\Users\Richard\.cloudflared\rally-config.yml
echo Replace TUNNEL_ID_HERE with your actual tunnel ID.
echo.

echo Step 3: After updating the config, add DNS routes:
echo   cloudflared.exe tunnel route dns rally rallylive.ca
echo   cloudflared.exe tunnel route dns rally www.rallylive.ca
echo.
echo Step 4: Then run start-tunnel.bat to start the tunnel.
echo.
pause
