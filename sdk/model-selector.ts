/**
 * INTELLIGENT MODEL SELECTOR
 * 
 * Selects the best Ollama model based on:
 * - Task complexity (simple query vs complex reasoning)
 * - Latency requirements (fast response vs quality)
 * - Current load (fallback to smaller models if busy)
 * 
 * "Use the smallest model that can do the job well."
 */

export interface ModelProfile {
  name: string;
  sizeGB: number;
  speed: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  quality: 'basic' | 'good' | 'high' | 'excellent';
  bestFor: string[];
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  'qwen2:0.5b': {
    name: 'qwen2:0.5b',
    sizeGB: 0.5,
    speed: 'ultra-fast',
    quality: 'basic',
    bestFor: ['classification', 'simple-qa', 'intent-detection', 'yes-no'],
  },
  'phi3:mini': {
    name: 'phi3:mini',
    sizeGB: 2,
    speed: 'fast',
    quality: 'good',
    bestFor: ['summarization', 'extraction', 'short-generation'],
  },
  'mistral:instruct': {
    name: 'mistral:instruct',
    sizeGB: 3,
    speed: 'medium',
    quality: 'good',
    bestFor: ['conversation', 'instruction-following', 'general'],
  },
  'mistral:7b-instruct': {
    name: 'mistral:7b-instruct',
    sizeGB: 4,
    speed: 'medium',
    quality: 'high',
    bestFor: ['reasoning', 'code', 'complex-instructions'],
  },
  'llama3.1:8b': {
    name: 'llama3.1:8b',
    sizeGB: 4,
    speed: 'medium',
    quality: 'high',
    bestFor: ['conversation', 'reasoning', 'general'],
  },
  'gemma2:9b': {
    name: 'gemma2:9b',
    sizeGB: 5,
    speed: 'slow',
    quality: 'excellent',
    bestFor: ['complex-reasoning', 'long-generation', 'analysis'],
  },
};

export type TaskType = 
  | 'intent-detection'    // Classify user intent
  | 'simple-qa'           // Quick factual answer
  | 'conversation'        // General chat
  | 'reasoning'           // Complex thinking
  | 'code'                // Code generation
  | 'summarization'       // Summarize text
  | 'extraction'          // Extract structured data
  | 'long-generation'     // Long form content
  ;

export type LatencyPreference = 'fastest' | 'balanced' | 'quality';

export interface ModelSelectionRequest {
  taskType: TaskType;
  latencyPreference?: LatencyPreference;
  inputLength?: number;  // Approximate input tokens
  availableModels?: string[];  // Models currently loaded
}

export interface ModelSelectionResult {
  model: string;
  reason: string;
  fallbackModels: string[];
}

/**
 * Select the best model for a given task.
 */
export function selectModel(request: ModelSelectionRequest): ModelSelectionResult {
  const { 
    taskType, 
    latencyPreference = 'balanced',
    inputLength = 100,
    availableModels = Object.keys(MODEL_PROFILES),
  } = request;

  // Filter to available models only
  const available = availableModels.filter(m => MODEL_PROFILES[m]);
  
  if (available.length === 0) {
    return {
      model: 'llama3.1:8b',  // Default fallback
      reason: 'No models available, using default',
      fallbackModels: [],
    };
  }

  // Score each model for this task
  const scored = available.map(modelName => {
    const profile = MODEL_PROFILES[modelName];
    let score = 0;
    
    // Task match bonus
    if (profile.bestFor.includes(taskType)) {
      score += 30;
    }
    if (profile.bestFor.includes('general')) {
      score += 10;  // General-purpose bonus
    }
    
    // Latency preference
    if (latencyPreference === 'fastest') {
      if (profile.speed === 'ultra-fast') score += 40;
      else if (profile.speed === 'fast') score += 30;
      else if (profile.speed === 'medium') score += 10;
      else score -= 10;
    } else if (latencyPreference === 'quality') {
      if (profile.quality === 'excellent') score += 40;
      else if (profile.quality === 'high') score += 30;
      else if (profile.quality === 'good') score += 15;
      else score -= 10;
    } else {  // balanced
      if (profile.speed === 'fast' && profile.quality === 'good') score += 30;
      else if (profile.speed === 'medium' && profile.quality === 'high') score += 35;
      else if (profile.speed === 'ultra-fast') score += 15;
      else if (profile.quality === 'excellent') score += 20;
    }
    
    // Input length consideration
    if (inputLength > 2000 && profile.quality === 'basic') {
      score -= 20;  // Small models struggle with long context
    }
    
    return { modelName, profile, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0];
  const fallbacks = scored.slice(1, 3).map(s => s.modelName);

  return {
    model: best.modelName,
    reason: `Best for ${taskType} with ${latencyPreference} latency (score: ${best.score})`,
    fallbackModels: fallbacks,
  };
}

/**
 * Detect task type from user message.
 */
export function detectTaskType(message: string): TaskType {
  const lower = message.toLowerCase();
  
  // Intent detection patterns
  if (lower.length < 50 && (
    lower.includes('quero') ||
    lower.includes('criar') ||
    lower.includes('fazer') ||
    lower.includes('registrar')
  )) {
    return 'intent-detection';
  }
  
  // Simple Q&A patterns
  if (lower.startsWith('o que é') || 
      lower.startsWith('what is') ||
      lower.startsWith('quem é') ||
      lower.includes('?') && lower.length < 100) {
    return 'simple-qa';
  }
  
  // Code patterns
  if (lower.includes('código') || 
      lower.includes('code') ||
      lower.includes('function') ||
      lower.includes('implementar')) {
    return 'code';
  }
  
  // Summarization
  if (lower.includes('resumir') || 
      lower.includes('summarize') ||
      lower.includes('resumo')) {
    return 'summarization';
  }
  
  // Extraction
  if (lower.includes('extrair') || 
      lower.includes('extract') ||
      lower.includes('listar')) {
    return 'extraction';
  }
  
  // Long generation
  if (lower.includes('escrever') || 
      lower.includes('write') ||
      lower.includes('gerar documento')) {
    return 'long-generation';
  }
  
  // Complex reasoning
  if (lower.includes('por que') || 
      lower.includes('why') ||
      lower.includes('explicar') ||
      lower.includes('analisar') ||
      lower.length > 300) {
    return 'reasoning';
  }
  
  // Default to conversation
  return 'conversation';
}

/**
 * Get available models from Ollama.
 */
export async function getAvailableModels(baseUrl: string = 'http://localhost:11434'): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch {
    return [];
  }
}

/**
 * Smart model selection based on message content.
 */
export async function smartSelectModel(
  message: string,
  latencyPreference: LatencyPreference = 'balanced',
  baseUrl: string = 'http://localhost:11434'
): Promise<ModelSelectionResult> {
  const taskType = detectTaskType(message);
  const availableModels = await getAvailableModels(baseUrl);
  
  return selectModel({
    taskType,
    latencyPreference,
    inputLength: message.length,
    availableModels,
  });
}
