#!/bin/bash
# ============================================================================
# WARMUP OLLAMA MODELS
# ============================================================================
# Keeps the primary model loaded in memory for fast responses
# Run this periodically via cron or after system restart
# ============================================================================

OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2:0.5b}"

echo "=== Warming up Ollama ==="
echo "Model: $OLLAMA_MODEL"

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "❌ Ollama is not running"
    exit 1
fi

# Send a simple request to load the model into memory
echo "Loading model into memory..."
RESPONSE=$(curl -s http://localhost:11434/api/chat -d "{
    \"model\": \"$OLLAMA_MODEL\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Say 'ready' in one word.\"}],
    \"stream\": false,
    \"options\": {
        \"num_predict\": 5
    }
}" | jq -r '.message.content' 2>/dev/null)

if [ -n "$RESPONSE" ]; then
    echo "✅ Model $OLLAMA_MODEL is warm and ready"
    echo "Response: $RESPONSE"
else
    echo "⚠️  Model may not have loaded correctly"
fi

# Show memory usage
echo ""
echo "=== Model Status ==="
curl -s http://localhost:11434/api/ps 2>/dev/null | jq . || echo "No models currently loaded"
