#!/bin/bash
# ============================================================================
# OLLAMA CONFIGURATION FOR UBL
# ============================================================================
# 
# Model Selection Rules:
# 1. qwen2:0.5b   - Fast responses, simple queries (default for chat)
# 2. llama3.1:8b  - Complex reasoning, code generation
# 3. mistral:7b   - Balanced performance
# 4. gemma2:9b    - Best quality, slower
#
# Environment Variables:
# - OLLAMA_MODEL: Primary model to use
# - OLLAMA_FALLBACK_MODEL: Fallback if primary fails
# - OLLAMA_KEEP_ALIVE: How long to keep model in memory
# - OLLAMA_ORIGINS: CORS origins allowed
# ============================================================================

# Default configuration
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2:0.5b}"
export OLLAMA_FALLBACK_MODEL="${OLLAMA_FALLBACK_MODEL:-llama3.1:8b}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-24h}"
export OLLAMA_ORIGINS="${OLLAMA_ORIGINS:-*}"
export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:11434}"

# Model tiers for different use cases
declare -A MODEL_TIERS=(
    ["fast"]="qwen2:0.5b"
    ["balanced"]="mistral:7b-instruct"
    ["quality"]="llama3.1:8b"
    ["best"]="gemma2:9b"
)

# Function to select model based on task complexity
select_model() {
    local tier="${1:-fast}"
    echo "${MODEL_TIERS[$tier]:-qwen2:0.5b}"
}

# Function to warm up a model (load into memory)
warmup_model() {
    local model="${1:-$OLLAMA_MODEL}"
    echo "Warming up model: $model"
    curl -s http://localhost:11434/api/chat -d "{
        \"model\": \"$model\",
        \"messages\": [{\"role\": \"user\", \"content\": \"hello\"}],
        \"stream\": false
    }" > /dev/null
    echo "Model $model is ready"
}

# Function to check Ollama health
check_ollama() {
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "Ollama is running"
        return 0
    else
        echo "Ollama is not running"
        return 1
    fi
}

# Function to list available models
list_models() {
    curl -s http://localhost:11434/api/tags | jq -r '.models[].name'
}

echo "Ollama config loaded. Primary model: $OLLAMA_MODEL"
