/**
 * ANOMALY DETECTION
 * 
 * SPRINT D.2: Statistical anomaly detection for economic security
 * 
 * Purpose:
 * - Detect unusual patterns in transactions and behavior
 * - Trigger circuit breakers on systemic anomalies
 * - Prevent fraud and manipulation
 * 
 * Methods:
 * - 3σ rule for statistical outliers
 * - Moving averages for trend detection
 * - Velocity checks for rate limiting
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface AnomalyConfig {
  /** Standard deviations for outlier detection */
  readonly sigmaThreshold: number;
  
  /** Window size for moving average (in samples) */
  readonly windowSize: number;
  
  /** Minimum samples before detection is active */
  readonly minSamples: number;
  
  /** Velocity limit (transactions per minute) */
  readonly velocityLimit: number;
  
  /** Cooldown after anomaly (ms) */
  readonly cooldownMs: number;
}

export interface DataPoint {
  readonly value: number;
  readonly timestamp: Timestamp;
  readonly entityId?: EntityId;
  readonly metadata?: Record<string, unknown>;
}

export interface AnomalyResult {
  readonly isAnomaly: boolean;
  readonly type: AnomalyType | null;
  readonly severity: AnomalySeverity;
  readonly value: number;
  readonly expectedRange: { min: number; max: number };
  readonly deviation: number; // In standard deviations
  readonly confidence: number; // 0-1
  readonly timestamp: Timestamp;
}

export type AnomalyType = 
  | 'statistical_outlier'  // Value outside 3σ
  | 'velocity_breach'      // Too many transactions
  | 'trend_reversal'       // Sudden direction change
  | 'pattern_break'        // Unusual sequence
  | 'magnitude_spike';     // Sudden large value

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyStats {
  readonly mean: number;
  readonly stdDev: number;
  readonly min: number;
  readonly max: number;
  readonly count: number;
  readonly lastUpdated: Timestamp;
}

// =============================================================================
// ANOMALY DETECTOR
// =============================================================================

export class AnomalyDetector {
  private samples: DataPoint[] = [];
  private stats: AnomalyStats | null = null;
  private lastAnomalyAt: Timestamp | null = null;
  private velocityWindow: Timestamp[] = [];
  
  constructor(private readonly config: AnomalyConfig) {}
  
  /**
   * Add a data point and check for anomalies
   */
  detect(point: DataPoint): AnomalyResult {
    // Add to samples
    this.samples.push(point);
    
    // Trim to window size
    if (this.samples.length > this.config.windowSize * 2) {
      this.samples = this.samples.slice(-this.config.windowSize);
    }
    
    // Update velocity window
    this.velocityWindow.push(point.timestamp);
    const oneMinuteAgo = point.timestamp - 60000;
    this.velocityWindow = this.velocityWindow.filter(t => t > oneMinuteAgo);
    
    // Check cooldown
    if (this.lastAnomalyAt && point.timestamp - this.lastAnomalyAt < this.config.cooldownMs) {
      return this.noAnomaly(point);
    }
    
    // Not enough samples yet
    if (this.samples.length < this.config.minSamples) {
      return this.noAnomaly(point);
    }
    
    // Update statistics
    this.updateStats();
    
    // Run detection checks
    const velocityResult = this.checkVelocity(point);
    if (velocityResult.isAnomaly) {
      this.lastAnomalyAt = point.timestamp;
      return velocityResult;
    }
    
    const outlierResult = this.checkStatisticalOutlier(point);
    if (outlierResult.isAnomaly) {
      this.lastAnomalyAt = point.timestamp;
      return outlierResult;
    }
    
    const spikeResult = this.checkMagnitudeSpike(point);
    if (spikeResult.isAnomaly) {
      this.lastAnomalyAt = point.timestamp;
      return spikeResult;
    }
    
    return this.noAnomaly(point);
  }
  
  /**
   * Check if value is a statistical outlier (3σ rule)
   */
  private checkStatisticalOutlier(point: DataPoint): AnomalyResult {
    if (!this.stats || this.stats.stdDev === 0) {
      return this.noAnomaly(point);
    }
    
    const deviation = Math.abs(point.value - this.stats.mean) / this.stats.stdDev;
    const isAnomaly = deviation > this.config.sigmaThreshold;
    
    return {
      isAnomaly,
      type: isAnomaly ? 'statistical_outlier' : null,
      severity: this.getSeverity(deviation),
      value: point.value,
      expectedRange: {
        min: this.stats.mean - this.config.sigmaThreshold * this.stats.stdDev,
        max: this.stats.mean + this.config.sigmaThreshold * this.stats.stdDev,
      },
      deviation,
      confidence: Math.min(1, this.samples.length / (this.config.minSamples * 2)),
      timestamp: point.timestamp,
    };
  }
  
  /**
   * Check velocity (transactions per minute)
   */
  private checkVelocity(point: DataPoint): AnomalyResult {
    const velocity = this.velocityWindow.length;
    const isAnomaly = velocity > this.config.velocityLimit;
    
    return {
      isAnomaly,
      type: isAnomaly ? 'velocity_breach' : null,
      severity: isAnomaly ? (velocity > this.config.velocityLimit * 2 ? 'critical' : 'high') : 'low',
      value: velocity,
      expectedRange: { min: 0, max: this.config.velocityLimit },
      deviation: velocity / this.config.velocityLimit,
      confidence: 1,
      timestamp: point.timestamp,
    };
  }
  
  /**
   * Check for sudden magnitude spikes
   */
  private checkMagnitudeSpike(point: DataPoint): AnomalyResult {
    if (this.samples.length < 2 || !this.stats) {
      return this.noAnomaly(point);
    }
    
    const prevValue = this.samples[this.samples.length - 2].value;
    const change = Math.abs(point.value - prevValue);
    const relativeChange = prevValue !== 0 ? change / Math.abs(prevValue) : change;
    
    // Spike if change is > 5x the standard deviation or > 500% relative change
    const isSpike = change > this.stats.stdDev * 5 || relativeChange > 5;
    
    return {
      isAnomaly: isSpike,
      type: isSpike ? 'magnitude_spike' : null,
      severity: isSpike ? (relativeChange > 10 ? 'critical' : 'high') : 'low',
      value: point.value,
      expectedRange: {
        min: prevValue - this.stats.stdDev * 2,
        max: prevValue + this.stats.stdDev * 2,
      },
      deviation: relativeChange,
      confidence: Math.min(1, this.samples.length / this.config.minSamples),
      timestamp: point.timestamp,
    };
  }
  
  /**
   * Update running statistics
   */
  private updateStats(): void {
    const values = this.samples.map(s => s.value);
    const n = values.length;
    
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    this.stats = {
      mean,
      stdDev,
      min: Math.min(...values),
      max: Math.max(...values),
      count: n,
      lastUpdated: Date.now(),
    };
  }
  
  /**
   * Get severity based on deviation
   */
  private getSeverity(deviation: number): AnomalySeverity {
    if (deviation > 5) return 'critical';
    if (deviation > 4) return 'high';
    if (deviation > 3) return 'medium';
    return 'low';
  }
  
  /**
   * Return a non-anomaly result
   */
  private noAnomaly(point: DataPoint): AnomalyResult {
    return {
      isAnomaly: false,
      type: null,
      severity: 'low',
      value: point.value,
      expectedRange: this.stats 
        ? {
            min: this.stats.mean - this.config.sigmaThreshold * this.stats.stdDev,
            max: this.stats.mean + this.config.sigmaThreshold * this.stats.stdDev,
          }
        : { min: 0, max: 0 },
      deviation: 0,
      confidence: this.stats ? Math.min(1, this.samples.length / this.config.minSamples) : 0,
      timestamp: point.timestamp,
    };
  }
  
  /**
   * Get current statistics
   */
  getStats(): AnomalyStats | null {
    return this.stats;
  }
  
  /**
   * Reset the detector
   */
  reset(): void {
    this.samples = [];
    this.stats = null;
    this.lastAnomalyAt = null;
    this.velocityWindow = [];
  }
}

// =============================================================================
// CIRCUIT BREAKER INTEGRATION
// =============================================================================

export interface CircuitBreakerConfig {
  readonly anomalyThreshold: number; // Anomalies before trip
  readonly windowMs: number; // Time window for counting
  readonly cooldownMs: number; // Time before reset
}

export class AnomalyCircuitBreaker {
  private anomalies: AnomalyResult[] = [];
  private trippedAt: Timestamp | null = null;
  
  constructor(private readonly config: CircuitBreakerConfig) {}
  
  /**
   * Record an anomaly and check if circuit should trip
   */
  record(anomaly: AnomalyResult): boolean {
    if (!anomaly.isAnomaly) return false;
    
    // Add anomaly
    this.anomalies.push(anomaly);
    
    // Clean old anomalies
    const cutoff = Date.now() - this.config.windowMs;
    this.anomalies = this.anomalies.filter(a => a.timestamp > cutoff);
    
    // Check if should trip
    if (this.anomalies.length >= this.config.anomalyThreshold) {
      this.trippedAt = Date.now();
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if circuit is tripped
   */
  isTripped(): boolean {
    if (!this.trippedAt) return false;
    
    // Auto-reset after cooldown
    if (Date.now() - this.trippedAt > this.config.cooldownMs) {
      this.reset();
      return false;
    }
    
    return true;
  }
  
  /**
   * Manually reset the circuit
   */
  reset(): void {
    this.trippedAt = null;
    this.anomalies = [];
  }
  
  /**
   * Get time until auto-reset
   */
  getTimeUntilReset(): number {
    if (!this.trippedAt) return 0;
    return Math.max(0, this.config.cooldownMs - (Date.now() - this.trippedAt));
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createAnomalyDetector(config?: Partial<AnomalyConfig>): AnomalyDetector {
  const defaultConfig: AnomalyConfig = {
    sigmaThreshold: 3,
    windowSize: 100,
    minSamples: 10,
    velocityLimit: 60, // 60 per minute
    cooldownMs: 5000,
  };
  
  return new AnomalyDetector({ ...defaultConfig, ...config });
}

export function createAnomalyCircuitBreaker(config?: Partial<CircuitBreakerConfig>): AnomalyCircuitBreaker {
  const defaultConfig: CircuitBreakerConfig = {
    anomalyThreshold: 5,
    windowMs: 60000, // 1 minute
    cooldownMs: 300000, // 5 minutes
  };
  
  return new AnomalyCircuitBreaker({ ...defaultConfig, ...config });
}
