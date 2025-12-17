#!/bin/bash
# ============================================================================
# UPDATE RAILWAY WITH NEW NGROK URL
# ============================================================================
# Run this after ngrok restarts to update Railway with the new URL
# ============================================================================

set -e

# Railway configuration
RAILWAY_TOKEN="${RAILWAY_API_TOKEN:-a60a16d2-8551-4c7c-b406-1c04fafa9f6c}"
PROJECT_ID="79723734-ebbf-4517-8bd8-8e88cdf7ed7f"
ENVIRONMENT_ID="7b456379-abfb-48c6-be95-2bb1b816a36a"
SERVICE_ID="a4795a46-600b-4eab-b4fd-10dd05829d48"

echo "=== Getting ngrok URL ==="

# Wait for ngrok to be ready
for i in {1..10}; do
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url' 2>/dev/null)
    if [ -n "$NGROK_URL" ] && [ "$NGROK_URL" != "null" ]; then
        break
    fi
    echo "Waiting for ngrok... ($i/10)"
    sleep 2
done

if [ -z "$NGROK_URL" ] || [ "$NGROK_URL" == "null" ]; then
    echo "❌ Could not get ngrok URL. Is ngrok running?"
    exit 1
fi

echo "ngrok URL: $NGROK_URL"

echo ""
echo "=== Updating Railway ==="

# Update OLLAMA_BASE_URL on Railway
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENVIRONMENT_ID\\\", serviceId: \\\"$SERVICE_ID\\\", name: \\\"OLLAMA_BASE_URL\\\", value: \\\"$NGROK_URL\\\" }) }\"
  }" | jq .

echo ""
echo "✅ Railway updated with new ngrok URL: $NGROK_URL"
echo ""
echo "Note: You may need to redeploy for changes to take effect:"
echo "  cd /Users/voulezvous/Downloads/UBL && railway up --detach"
