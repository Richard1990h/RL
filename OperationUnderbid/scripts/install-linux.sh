#!/bin/bash
# Operation Underbid — Linux systemd auto-start setup
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="operation-underbid"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PM2=$(which pm2)
NODE=$(which node)
USER=$(whoami)

echo "Installing Operation Underbid systemd service..."

# Start PM2 and save state
cd "$PROJECT_DIR"
$PM2 start pm2.config.js
$PM2 save

# Generate PM2 startup command
STARTUP_CMD=$($PM2 startup systemd -u $USER --hp $HOME | grep "sudo env")

# Run it
eval "$STARTUP_CMD"

echo "✓ Systemd service registered"
echo "✓ PM2 will start on boot"
echo ""
echo "Manage with:"
echo "  pm2 status"
echo "  pm2 logs underbid-orchestrator"
echo "  pm2 stop underbid-orchestrator"
echo "  pm2 restart underbid-orchestrator"
