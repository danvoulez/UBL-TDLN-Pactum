/**
 * BENCHMARK FRAMEWORK
 * 
 * SPRINT F.1: System performance and health metrics
 * 
 * Purpose:
 * - Measure system health across multiple dimensions
 * - Track progress over time
 * - Compare against baselines
 * - Generate reports for stakeholders
 * 
 * Dimensions:
 * - Survival: Can agents survive and thrive?
 * - Equality: Is wealth distributed fairly?
 * - Resilience: Can system recover from shocks?
 * - Efficiency: Are resources used well?
 * - Innovation: Is the system evolving?
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface BenchmarkConfig {
  /** Baseline values for comparison */
  readonly baselines: BenchmarkBaselines;
  
  /** Weights for composite score */
  readonly weights: BenchmarkWeights;
  
  /** Thresholds for health status */
  readonly thresholds: BenchmarkThresholds;
  
  /** Version for tracking changes */
  readonly version: string;
}

export interface BenchmarkBaselines {
  readonly survivalRate: number;      // Expected survival rate
  readonly giniCoefficient: number;   // Expected inequality
  readonly recoveryTime: number;      // Expected recovery time (days)
  readonly utilizationRate: number;   // Expected resource utilization
  readonly innovationRate: number;    // Expected innovation rate
}

export interface BenchmarkWeights {
  readonly survival: number;
  readonly equality: number;
  readonly resilience: number;
  readonly efficiency: number;
  readonly innovation: number;
}

export interface BenchmarkThresholds {
  readonly healthy: number;    // Score above this is healthy
  readonly warning: number;    // Score above this is warning
  readonly critical: number;   // Score above this is critical
}

export interface BenchmarkScore {
  readonly timestamp: Timestamp;
  readonly version: string;
  
  /** Individual dimension scores (0-100) */
  readonly dimensions: {
    readonly survival: DimensionScore;
    readonly equality: DimensionScore;
    readonly resilience: DimensionScore;
    readonly efficiency: DimensionScore;
    readonly innovation: DimensionScore;
  };
  
  /** Composite score (0-100) */
  readonly composite: number;
  
  /** Health status */
  readonly status: HealthStatus;
  
  /** Comparison to baseline */
  readonly vsBaseline: number; // Percentage difference
  
  /** Comparison to previous */
  readonly vsPrevious?: number;
}

export interface DimensionScore {
  readonly value: number;        // 0-100
  readonly raw: number;          // Raw metric value
  readonly baseline: number;     // Baseline value
  readonly trend: Trend;         // Direction
  readonly components: readonly ComponentScore[];
}

export interface ComponentScore {
  readonly name: string;
  readonly value: number;
  readonly weight: number;
}

export type Trend = 'Improving' | 'Stable' | 'Declining';
export type HealthStatus = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';

export interface BenchmarkInput {
  // Survival metrics
  readonly totalAgents: number;
  readonly activeAgents: number;
  readonly newAgents: number;
  readonly exitedAgents: number;
  readonly averageLifespan: number;
  
  // Equality metrics
  readonly giniCoefficient: number;
  readonly medianWealth: bigint;
  readonly meanWealth: bigint;
  readonly wealthTop10Percent: number;
  readonly wealthBottom10Percent: number;
  
  // Resilience metrics
  readonly recentShocks: number;
  readonly recoveryTime: number;
  readonly systemUptime: number;
  readonly failedTransactions: number;
  readonly totalTransactions: number;
  
  // Efficiency metrics
  readonly resourceUtilization: number;
  readonly averageLatency: number;
  readonly throughput: number;
  readonly wastedResources: number;
  
  // Innovation metrics
  readonly newFeatures: number;
  readonly adaptations: number;
  readonly experimentSuccess: number;
  readonly diversityIndex: number;
}

// =============================================================================
// BENCHMARK ENGINE
// =============================================================================

export class BenchmarkEngine {
  private history: BenchmarkScore[] = [];
  
  constructor(private readonly config: BenchmarkConfig) {}
  
  /**
   * Calculate benchmark score from input metrics
   */
  calculate(input: BenchmarkInput): BenchmarkScore {
    const survival = this.calculateSurvival(input);
    const equality = this.calculateEquality(input);
    const resilience = this.calculateResilience(input);
    const efficiency = this.calculateEfficiency(input);
    const innovation = this.calculateInnovation(input);
    
    const composite = this.calculateComposite({
      survival,
      equality,
      resilience,
      efficiency,
      innovation,
    });
    
    const status = this.determineStatus(composite);
    const vsBaseline = this.compareToBaseline(composite);
    const vsPrevious = this.compareToPrevious(composite);
    
    const score: BenchmarkScore = {
      timestamp: Date.now(),
      version: this.config.version,
      dimensions: {
        survival,
        equality,
        resilience,
        efficiency,
        innovation,
      },
      composite,
      status,
      vsBaseline,
      vsPrevious,
    };
    
    this.history.push(score);
    return score;
  }
  
  /**
   * Calculate survival dimension
   */
  private calculateSurvival(input: BenchmarkInput): DimensionScore {
    const survivalRate = input.activeAgents / Math.max(input.totalAgents, 1);
    const growthRate = (input.newAgents - input.exitedAgents) / Math.max(input.totalAgents, 1);
    const lifespanScore = Math.min(100, input.averageLifespan / 365 * 100);
    
    const components: ComponentScore[] = [
      { name: 'Survival Rate', value: survivalRate * 100, weight: 0.5 },
      { name: 'Growth Rate', value: Math.max(0, 50 + growthRate * 100), weight: 0.3 },
      { name: 'Lifespan', value: lifespanScore, weight: 0.2 },
    ];
    
    const value = components.reduce((sum, c) => sum + c.value * c.weight, 0);
    
    return {
      value: Math.min(100, Math.max(0, value)),
      raw: survivalRate,
      baseline: this.config.baselines.survivalRate,
      trend: this.calculateTrend('survival', value),
      components,
    };
  }
  
  /**
   * Calculate equality dimension
   */
  private calculateEquality(input: BenchmarkInput): DimensionScore {
    // Lower Gini = more equal = higher score
    const giniScore = (1 - input.giniCoefficient) * 100;
    
    // Ratio of bottom 10% to top 10%
    const ratioScore = Math.min(100, (input.wealthBottom10Percent / Math.max(input.wealthTop10Percent, 0.01)) * 200);
    
    // Median to mean ratio (closer to 1 = more equal)
    const medianMeanRatio = Number(input.medianWealth) / Math.max(Number(input.meanWealth), 1);
    const medianScore = Math.min(100, medianMeanRatio * 100);
    
    const components: ComponentScore[] = [
      { name: 'Gini Score', value: giniScore, weight: 0.5 },
      { name: 'Distribution Ratio', value: ratioScore, weight: 0.3 },
      { name: 'Median/Mean', value: medianScore, weight: 0.2 },
    ];
    
    const value = components.reduce((sum, c) => sum + c.value * c.weight, 0);
    
    return {
      value: Math.min(100, Math.max(0, value)),
      raw: input.giniCoefficient,
      baseline: this.config.baselines.giniCoefficient,
      trend: this.calculateTrend('equality', value),
      components,
    };
  }
  
  /**
   * Calculate resilience dimension
   */
  private calculateResilience(input: BenchmarkInput): DimensionScore {
    // Recovery time score (faster = better)
    const recoveryScore = Math.max(0, 100 - (input.recoveryTime / this.config.baselines.recoveryTime) * 50);
    
    // Uptime score
    const uptimeScore = input.systemUptime * 100;
    
    // Transaction success rate
    const successRate = (input.totalTransactions - input.failedTransactions) / Math.max(input.totalTransactions, 1);
    const successScore = successRate * 100;
    
    // Shock absorption (fewer shocks handled = less tested, but also less stress)
    const shockScore = input.recentShocks > 0 ? Math.min(100, 50 + (1 / input.recentShocks) * 50) : 100;
    
    const components: ComponentScore[] = [
      { name: 'Recovery Time', value: recoveryScore, weight: 0.3 },
      { name: 'Uptime', value: uptimeScore, weight: 0.3 },
      { name: 'Success Rate', value: successScore, weight: 0.25 },
      { name: 'Shock Handling', value: shockScore, weight: 0.15 },
    ];
    
    const value = components.reduce((sum, c) => sum + c.value * c.weight, 0);
    
    return {
      value: Math.min(100, Math.max(0, value)),
      raw: input.recoveryTime,
      baseline: this.config.baselines.recoveryTime,
      trend: this.calculateTrend('resilience', value),
      components,
    };
  }
  
  /**
   * Calculate efficiency dimension
   */
  private calculateEfficiency(input: BenchmarkInput): DimensionScore {
    // Utilization score
    const utilizationScore = (input.resourceUtilization / this.config.baselines.utilizationRate) * 100;
    
    // Latency score (lower = better)
    const latencyScore = Math.max(0, 100 - input.averageLatency / 10);
    
    // Throughput score
    const throughputScore = Math.min(100, input.throughput / 100 * 100);
    
    // Waste score (lower = better)
    const wasteScore = Math.max(0, 100 - input.wastedResources * 100);
    
    const components: ComponentScore[] = [
      { name: 'Utilization', value: Math.min(100, utilizationScore), weight: 0.3 },
      { name: 'Latency', value: latencyScore, weight: 0.25 },
      { name: 'Throughput', value: throughputScore, weight: 0.25 },
      { name: 'Waste', value: wasteScore, weight: 0.2 },
    ];
    
    const value = components.reduce((sum, c) => sum + c.value * c.weight, 0);
    
    return {
      value: Math.min(100, Math.max(0, value)),
      raw: input.resourceUtilization,
      baseline: this.config.baselines.utilizationRate,
      trend: this.calculateTrend('efficiency', value),
      components,
    };
  }
  
  /**
   * Calculate innovation dimension
   */
  private calculateInnovation(input: BenchmarkInput): DimensionScore {
    // New features score
    const featureScore = Math.min(100, input.newFeatures * 10);
    
    // Adaptation score
    const adaptationScore = Math.min(100, input.adaptations * 20);
    
    // Experiment success rate
    const experimentScore = input.experimentSuccess * 100;
    
    // Diversity score
    const diversityScore = input.diversityIndex * 100;
    
    const components: ComponentScore[] = [
      { name: 'New Features', value: featureScore, weight: 0.25 },
      { name: 'Adaptations', value: adaptationScore, weight: 0.25 },
      { name: 'Experiments', value: experimentScore, weight: 0.25 },
      { name: 'Diversity', value: diversityScore, weight: 0.25 },
    ];
    
    const value = components.reduce((sum, c) => sum + c.value * c.weight, 0);
    
    return {
      value: Math.min(100, Math.max(0, value)),
      raw: input.diversityIndex,
      baseline: this.config.baselines.innovationRate,
      trend: this.calculateTrend('innovation', value),
      components,
    };
  }
  
  /**
   * Calculate composite score
   */
  private calculateComposite(dimensions: Record<string, DimensionScore>): number {
    const weights = this.config.weights;
    
    return (
      dimensions.survival.value * weights.survival +
      dimensions.equality.value * weights.equality +
      dimensions.resilience.value * weights.resilience +
      dimensions.efficiency.value * weights.efficiency +
      dimensions.innovation.value * weights.innovation
    );
  }
  
  /**
   * Determine health status
   */
  private determineStatus(composite: number): HealthStatus {
    if (composite >= this.config.thresholds.healthy) return 'Healthy';
    if (composite >= this.config.thresholds.warning) return 'Warning';
    if (composite >= this.config.thresholds.critical) return 'Critical';
    return 'Unknown';
  }
  
  /**
   * Compare to baseline
   */
  private compareToBaseline(composite: number): number {
    const baselineComposite = 70; // Assumed baseline composite
    return ((composite - baselineComposite) / baselineComposite) * 100;
  }
  
  /**
   * Compare to previous score
   */
  private compareToPrevious(composite: number): number | undefined {
    if (this.history.length === 0) return undefined;
    const previous = this.history[this.history.length - 1].composite;
    return ((composite - previous) / previous) * 100;
  }
  
  /**
   * Calculate trend for a dimension
   */
  private calculateTrend(dimension: string, currentValue: number): Trend {
    const recentScores = this.history.slice(-5);
    if (recentScores.length < 2) return 'Stable';
    
    const previousValues = recentScores.map(s => {
      const dim = s.dimensions[dimension as keyof typeof s.dimensions];
      return dim?.value ?? 0;
    });
    
    const avg = previousValues.reduce((a, b) => a + b, 0) / previousValues.length;
    const diff = currentValue - avg;
    
    if (diff > 5) return 'Improving';
    if (diff < -5) return 'Declining';
    return 'Stable';
  }
  
  /**
   * Get history
   */
  getHistory(limit?: number): readonly BenchmarkScore[] {
    return limit ? this.history.slice(-limit) : this.history;
  }
  
  /**
   * Get latest score
   */
  getLatest(): BenchmarkScore | undefined {
    return this.history[this.history.length - 1];
  }
  
  /**
   * Generate report
   */
  generateReport(): BenchmarkReport {
    const latest = this.getLatest();
    const history = this.getHistory(30);
    
    return {
      generatedAt: Date.now(),
      version: this.config.version,
      current: latest,
      history: history.map(s => ({
        timestamp: s.timestamp,
        composite: s.composite,
        status: s.status,
      })),
      trends: {
        survival: this.calculateOverallTrend('survival'),
        equality: this.calculateOverallTrend('equality'),
        resilience: this.calculateOverallTrend('resilience'),
        efficiency: this.calculateOverallTrend('efficiency'),
        innovation: this.calculateOverallTrend('innovation'),
      },
      recommendations: this.generateRecommendations(latest),
    };
  }
  
  private calculateOverallTrend(dimension: string): Trend {
    const scores = this.history.slice(-10);
    if (scores.length < 3) return 'Stable';
    
    const values = scores.map(s => {
      const dim = s.dimensions[dimension as keyof typeof s.dimensions];
      return dim?.value ?? 0;
    });
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    if (diff > 3) return 'Improving';
    if (diff < -3) return 'Declining';
    return 'Stable';
  }
  
  private generateRecommendations(score?: BenchmarkScore): string[] {
    if (!score) return ['Insufficient data for recommendations'];
    
    const recommendations: string[] = [];
    
    if (score.dimensions.survival.value < 60) {
      recommendations.push('Focus on agent retention and onboarding');
    }
    if (score.dimensions.equality.value < 60) {
      recommendations.push('Implement wealth redistribution mechanisms');
    }
    if (score.dimensions.resilience.value < 60) {
      recommendations.push('Improve system redundancy and recovery procedures');
    }
    if (score.dimensions.efficiency.value < 60) {
      recommendations.push('Optimize resource allocation and reduce waste');
    }
    if (score.dimensions.innovation.value < 60) {
      recommendations.push('Encourage experimentation and diversity');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System performing well across all dimensions');
    }
    
    return recommendations;
  }
}

export interface BenchmarkReport {
  generatedAt: Timestamp;
  version: string;
  current?: BenchmarkScore;
  history: readonly { timestamp: Timestamp; composite: number; status: HealthStatus }[];
  trends: Record<string, Trend>;
  recommendations: string[];
}

// =============================================================================
// FACTORY
// =============================================================================

export function createBenchmarkEngine(config?: Partial<BenchmarkConfig>): BenchmarkEngine {
  const defaultConfig: BenchmarkConfig = {
    baselines: {
      survivalRate: 0.8,
      giniCoefficient: 0.4,
      recoveryTime: 7,
      utilizationRate: 0.7,
      innovationRate: 0.5,
    },
    weights: {
      survival: 0.25,
      equality: 0.20,
      resilience: 0.25,
      efficiency: 0.15,
      innovation: 0.15,
    },
    thresholds: {
      healthy: 70,
      warning: 50,
      critical: 30,
    },
    version: '1.0.0',
  };
  
  return new BenchmarkEngine({
    ...defaultConfig,
    ...config,
    baselines: { ...defaultConfig.baselines, ...config?.baselines },
    weights: { ...defaultConfig.weights, ...config?.weights },
    thresholds: { ...defaultConfig.thresholds, ...config?.thresholds },
  });
}
