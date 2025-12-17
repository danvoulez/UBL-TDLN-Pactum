#!/bin/bash
# ============================================================================
# INSTALL UBL DAEMONS
# ============================================================================
# This script installs LaunchAgents to keep Ollama and ngrok running
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo "=== Installing UBL Daemons ==="

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCH_AGENTS_DIR"

# Find ollama path
OLLAMA_PATH=$(which ollama 2>/dev/null || echo "/usr/local/bin/ollama")
if [ ! -f "$OLLAMA_PATH" ]; then
    OLLAMA_PATH="/opt/homebrew/bin/ollama"
fi

# Find ngrok path
NGROK_PATH=$(which ngrok 2>/dev/null || echo "/opt/homebrew/bin/ngrok")

echo "Ollama path: $OLLAMA_PATH"
echo "ngrok path: $NGROK_PATH"

# Update plist files with correct paths
sed "s|/usr/local/bin/ollama|$OLLAMA_PATH|g" "$SCRIPT_DIR/com.ubl.ollama.plist" > "$LAUNCH_AGENTS_DIR/com.ubl.ollama.plist"
sed "s|/opt/homebrew/bin/ngrok|$NGROK_PATH|g" "$SCRIPT_DIR/com.ubl.ngrok.plist" > "$LAUNCH_AGENTS_DIR/com.ubl.ngrok.plist"

echo ""
echo "=== Loading Ollama daemon ==="
launchctl unload "$LAUNCH_AGENTS_DIR/com.ubl.ollama.plist" 2>/dev/null || true
launchctl load "$LAUNCH_AGENTS_DIR/com.ubl.ollama.plist"
echo "✅ Ollama daemon installed"

echo ""
echo "=== Loading ngrok daemon ==="
launchctl unload "$LAUNCH_AGENTS_DIR/com.ubl.ngrok.plist" 2>/dev/null || true
launchctl load "$LAUNCH_AGENTS_DIR/com.ubl.ngrok.plist"
echo "✅ ngrok daemon installed"

echo ""
echo "=== Status ==="
sleep 2

# Check Ollama
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is running"
else
    echo "⏳ Ollama is starting..."
fi

# Check ngrok
if pgrep -x ngrok > /dev/null; then
    echo "✅ ngrok is running"
    echo ""
    echo "=== ngrok URL ==="
    sleep 3
    curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url' || echo "Waiting for ngrok to initialize..."
else
    echo "⏳ ngrok is starting..."
fi

echo ""
echo "=== Logs ==="
echo "Ollama logs: /tmp/ollama.log"
echo "ngrok logs: /tmp/ngrok.log"
echo ""
echo "=== Commands ==="
echo "Stop Ollama:  launchctl unload ~/Library/LaunchAgents/com.ubl.ollama.plist"
echo "Stop ngrok:   launchctl unload ~/Library/LaunchAgents/com.ubl.ngrok.plist"
echo "Start Ollama: launchctl load ~/Library/LaunchAgents/com.ubl.ollama.plist"
echo "Start ngrok:  launchctl load ~/Library/LaunchAgents/com.ubl.ngrok.plist"
