/**
 * SYSTEM HEALTH DASHBOARD
 * 
 * Real-time monitoring of economic system health.
 * Provides alerts, projections, and risk assessment.
 */

import type { SimulationTick } from './simulation-clock';
import type { MarketState } from './market-dynamics';
import type { TreasuryState } from './treasury-fund';

/** Extended script state with psychology (from RealisticBehaviorEngine) */
export interface ScriptWithPsychology {
  id: string;
  state: {
    walletBalance: bigint;
    reputation: number;
    loanOutstanding: bigint;
    isActive: boolean;
    mood: number;
    stress: number;
    burnout: number;
    confidence: number;
  };
}

// =============================================================================
// HEALTH STATUS
// =============================================================================

export type SystemStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'COLLAPSED';
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';
export type Trend = 'improving' | 'stable' | 'declining' | 'crashing';

export interface HealthAlert {
  readonly id: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly category: 'survival' | 'stress' | 'inequality' | 'liquidity' | 'market';
  readonly message: string;
  readonly timestamp: number;
  readonly value?: number;
  readonly threshold?: number;
}

// =============================================================================
// HEALTH STATE
// =============================================================================

export interface SystemHealth {
  readonly status: SystemStatus;
  readonly riskLevel: RiskLevel;
  
  // Core metrics
  readonly survivalRate: number;
  readonly avgStress: number;
  readonly avgMood: number;
  readonly giniCoefficient: number;
  
  // Trends
  readonly survivalTrend: Trend;
  readonly stressTrend: Trend;
  readonly moodTrend: Trend;
  
  // Projections
  readonly projectedSurvival30Days: number;
  readonly projectedSurvival90Days: number;
  readonly daysUntilCritical: number | null;
  
  // Alerts
  readonly alerts: HealthAlert[];
  readonly activeAlertCount: number;
  
  // Treasury
  readonly treasuryHealth: 'Healthy' | 'Low' | 'Critical' | 'Depleted';
  readonly treasuryBalance: bigint;
  
  // Market
  readonly marketPhase: string;
  readonly marketSentiment: number;
  
  // Timestamp
  readonly lastUpdated: number;
  readonly simulatedDay: number;
}

// =============================================================================
// HEALTH THRESHOLDS
// =============================================================================

export interface HealthThresholds {
  // Survival
  survivalWarning: number;      // 0.7 = warn at 70%
  survivalCritical: number;     // 0.5 = critical at 50%
  survivalCollapsed: number;    // 0.2 = collapsed at 20%
  
  // Stress
  stressWarning: number;        // 0.6 = warn at 60%
  stressCritical: number;       // 0.8 = critical at 80%
  
  // Inequality
  giniWarning: number;          // 0.4 = warn at 0.4
  giniCritical: number;         // 0.6 = critical at 0.6
  
  // Mood
  moodWarning: number;          // 0.0 = warn at neutral
  moodCritical: number;         // -0.3 = critical at negative
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
  survivalWarning: 0.7,
  survivalCritical: 0.5,
  survivalCollapsed: 0.2,
  stressWarning: 0.6,
  stressCritical: 0.8,
  giniWarning: 0.4,
  giniCritical: 0.6,
  moodWarning: 0.0,
  moodCritical: -0.3,
};

// =============================================================================
// HEALTH DASHBOARD
// =============================================================================

export class HealthDashboard {
  private thresholds: HealthThresholds;
  private history: HealthSnapshot[] = [];
  private alerts: HealthAlert[] = [];
  private alertIdCounter = 0;
  
  constructor(thresholds: Partial<HealthThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }
  
  // ---------------------------------------------------------------------------
  // MAIN ASSESSMENT
  // ---------------------------------------------------------------------------
  
  assess(
    tick: SimulationTick,
    scripts: ScriptWithPsychology[],
    market: MarketState,
    treasury?: TreasuryState
  ): SystemHealth {
    const day = tick.simulatedDay;
    
    // Calculate core metrics
    const activeScripts = scripts.filter(s => s.state.isActive);
    const totalScripts = scripts.length;
    const survivalRate = activeScripts.length / totalScripts;
    
    const avgStress = this.calculateAverage(activeScripts, s => s.state.stress);
    const avgMood = this.calculateAverage(activeScripts, s => s.state.mood);
    const giniCoefficient = this.calculateGini(activeScripts);
    
    // Record snapshot
    this.history.push({
      day,
      survivalRate,
      avgStress,
      avgMood,
      giniCoefficient,
    });
    
    // Keep only last 90 days
    if (this.history.length > 90) {
      this.history = this.history.slice(-90);
    }
    
    // Calculate trends
    const survivalTrend = this.calculateTrend('survivalRate');
    const stressTrend = this.calculateTrend('avgStress', true); // Inverted (lower is better)
    const moodTrend = this.calculateTrend('avgMood');
    
    // Generate alerts
    this.generateAlerts(day, survivalRate, avgStress, avgMood, giniCoefficient, market);
    
    // Calculate projections
    const projectedSurvival30Days = this.projectMetric('survivalRate', 30);
    const projectedSurvival90Days = this.projectMetric('survivalRate', 90);
    const daysUntilCritical = this.estimateDaysUntilThreshold(
      'survivalRate',
      this.thresholds.survivalCritical
    );
    
    // Determine status
    const status = this.determineStatus(survivalRate, avgStress, giniCoefficient);
    const riskLevel = this.determineRiskLevel(survivalRate, avgStress, survivalTrend);
    
    // Treasury health
    const treasuryHealth = treasury 
      ? this.assessTreasuryHealth(treasury)
      : 'Healthy';
    
    return {
      status,
      riskLevel,
      survivalRate,
      avgStress,
      avgMood,
      giniCoefficient,
      survivalTrend,
      stressTrend,
      moodTrend,
      projectedSurvival30Days,
      projectedSurvival90Days,
      daysUntilCritical,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      activeAlertCount: this.alerts.filter(a => a.severity === 'critical').length,
      treasuryHealth,
      treasuryBalance: treasury?.balance ?? 0n,
      marketPhase: market.cyclePhase,
      marketSentiment: market.sentiment,
      lastUpdated: Date.now(),
      simulatedDay: day,
    };
  }
  
  // ---------------------------------------------------------------------------
  // METRICS CALCULATION
  // ---------------------------------------------------------------------------
  
  private calculateAverage(
    scripts: ScriptWithPsychology[],
    getter: (s: ScriptWithPsychology) => number
  ): number {
    if (scripts.length === 0) return 0;
    const sum = scripts.reduce((acc, s) => acc + getter(s), 0);
    return sum / scripts.length;
  }
  
  private calculateGini(scripts: ScriptWithPsychology[]): number {
    if (scripts.length === 0) return 0;
    
    const balances = scripts
      .map(s => Number(s.state.walletBalance))
      .sort((a, b) => a - b);
    
    const n = balances.length;
    const mean = balances.reduce((a, b) => a + b, 0) / n;
    
    if (mean === 0) return 0;
    
    let sumOfDifferences = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumOfDifferences += Math.abs(balances[i] - balances[j]);
      }
    }
    
    return sumOfDifferences / (2 * n * n * mean);
  }
  
  // ---------------------------------------------------------------------------
  // TREND ANALYSIS
  // ---------------------------------------------------------------------------
  
  private calculateTrend(metric: keyof HealthSnapshot, inverted = false): Trend {
    if (this.history.length < 7) return 'stable';
    
    const recent = this.history.slice(-7);
    const older = this.history.slice(-14, -7);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, h) => sum + (h[metric] as number), 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + (h[metric] as number), 0) / older.length;
    
    const change = recentAvg - olderAvg;
    const threshold = 0.05; // 5% change threshold
    
    if (inverted) {
      if (change < -threshold) return 'improving';
      if (change > threshold * 2) return 'crashing';
      if (change > threshold) return 'declining';
    } else {
      if (change > threshold) return 'improving';
      if (change < -threshold * 2) return 'crashing';
      if (change < -threshold) return 'declining';
    }
    
    return 'stable';
  }
  
  // ---------------------------------------------------------------------------
  // PROJECTIONS
  // ---------------------------------------------------------------------------
  
  private projectMetric(metric: keyof HealthSnapshot, days: number): number {
    if (this.history.length < 7) {
      return this.history.length > 0 
        ? this.history[this.history.length - 1][metric] as number
        : 1.0;
    }
    
    // Simple linear regression
    const recent = this.history.slice(-30);
    const n = recent.length;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const x = i;
      const y = recent[i][metric] as number;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const projected = intercept + slope * (n + days);
    
    // Clamp to valid range
    return Math.max(0, Math.min(1, projected));
  }
  
  private estimateDaysUntilThreshold(
    metric: keyof HealthSnapshot,
    threshold: number
  ): number | null {
    if (this.history.length < 7) return null;
    
    const current = this.history[this.history.length - 1][metric] as number;
    if (current <= threshold) return 0;
    
    // Calculate daily change rate
    const recent = this.history.slice(-7);
    const dailyChange = (recent[recent.length - 1][metric] as number - recent[0][metric] as number) / 7;
    
    if (dailyChange >= 0) return null; // Not declining
    
    const daysUntil = (threshold - current) / dailyChange;
    return Math.ceil(daysUntil);
  }
  
  // ---------------------------------------------------------------------------
  // ALERTS
  // ---------------------------------------------------------------------------
  
  private generateAlerts(
    day: number,
    survivalRate: number,
    avgStress: number,
    avgMood: number,
    gini: number,
    market: MarketState
  ): void {
    // Survival alerts
    if (survivalRate < this.thresholds.survivalCollapsed) {
      this.addAlert('critical', 'survival', 
        `SYSTEM COLLAPSE: Survival rate at ${(survivalRate * 100).toFixed(1)}%`,
        day, survivalRate, this.thresholds.survivalCollapsed);
    } else if (survivalRate < this.thresholds.survivalCritical) {
      this.addAlert('critical', 'survival',
        `Critical survival rate: ${(survivalRate * 100).toFixed(1)}%`,
        day, survivalRate, this.thresholds.survivalCritical);
    } else if (survivalRate < this.thresholds.survivalWarning) {
      this.addAlert('warning', 'survival',
        `Low survival rate: ${(survivalRate * 100).toFixed(1)}%`,
        day, survivalRate, this.thresholds.survivalWarning);
    }
    
    // Stress alerts
    if (avgStress > this.thresholds.stressCritical) {
      this.addAlert('critical', 'stress',
        `Critical stress levels: ${(avgStress * 100).toFixed(1)}%`,
        day, avgStress, this.thresholds.stressCritical);
    } else if (avgStress > this.thresholds.stressWarning) {
      this.addAlert('warning', 'stress',
        `Elevated stress: ${(avgStress * 100).toFixed(1)}%`,
        day, avgStress, this.thresholds.stressWarning);
    }
    
    // Inequality alerts
    if (gini > this.thresholds.giniCritical) {
      this.addAlert('critical', 'inequality',
        `Severe inequality: Gini ${gini.toFixed(3)}`,
        day, gini, this.thresholds.giniCritical);
    } else if (gini > this.thresholds.giniWarning) {
      this.addAlert('warning', 'inequality',
        `Rising inequality: Gini ${gini.toFixed(3)}`,
        day, gini, this.thresholds.giniWarning);
    }
    
    // Market alerts
    if (market.sentiment < -0.5) {
      this.addAlert('critical', 'market',
        `Market panic: Sentiment ${market.sentiment.toFixed(2)}`,
        day, market.sentiment, -0.5);
    }
  }
  
  private addAlert(
    severity: 'info' | 'warning' | 'critical',
    category: HealthAlert['category'],
    message: string,
    day: number,
    value?: number,
    threshold?: number
  ): void {
    this.alerts.push({
      id: `alert-${++this.alertIdCounter}`,
      severity,
      category,
      message,
      timestamp: day,
      value,
      threshold,
    });
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }
  
  // ---------------------------------------------------------------------------
  // STATUS DETERMINATION
  // ---------------------------------------------------------------------------
  
  private determineStatus(
    survivalRate: number,
    avgStress: number,
    gini: number
  ): SystemStatus {
    if (survivalRate < this.thresholds.survivalCollapsed) return 'COLLAPSED';
    
    if (survivalRate < this.thresholds.survivalCritical ||
        avgStress > this.thresholds.stressCritical ||
        gini > this.thresholds.giniCritical) {
      return 'CRITICAL';
    }
    
    if (survivalRate < this.thresholds.survivalWarning ||
        avgStress > this.thresholds.stressWarning ||
        gini > this.thresholds.giniWarning) {
      return 'WARNING';
    }
    
    return 'HEALTHY';
  }
  
  private determineRiskLevel(
    survivalRate: number,
    avgStress: number,
    trend: Trend
  ): RiskLevel {
    let riskScore = 0;
    
    // Survival contribution
    if (survivalRate < 0.3) riskScore += 4;
    else if (survivalRate < 0.5) riskScore += 3;
    else if (survivalRate < 0.7) riskScore += 2;
    else if (survivalRate < 0.85) riskScore += 1;
    
    // Stress contribution
    if (avgStress > 0.9) riskScore += 3;
    else if (avgStress > 0.7) riskScore += 2;
    else if (avgStress > 0.5) riskScore += 1;
    
    // Trend contribution
    if (trend === 'crashing') riskScore += 2;
    else if (trend === 'declining') riskScore += 1;
    
    if (riskScore >= 6) return 'extreme';
    if (riskScore >= 4) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }
  
  private assessTreasuryHealth(treasury: TreasuryState): 'Healthy' | 'Low' | 'Critical' | 'Depleted' {
    const balance = Number(treasury.balance);
    const initial = 20_000_000; // Default initial
    const ratio = balance / initial;
    
    if (ratio > 0.5) return 'Healthy';
    if (ratio > 0.2) return 'Low';
    if (ratio > 0) return 'Critical';
    return 'Depleted';
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getAlerts(): HealthAlert[] {
    return [...this.alerts];
  }
  
  getCriticalAlerts(): HealthAlert[] {
    return this.alerts.filter(a => a.severity === 'critical');
  }
  
  getHistory(): HealthSnapshot[] {
    return [...this.history];
  }
  
  clearAlerts(): void {
    this.alerts = [];
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface HealthSnapshot {
  day: number;
  survivalRate: number;
  avgStress: number;
  avgMood: number;
  giniCoefficient: number;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createHealthDashboard(thresholds?: Partial<HealthThresholds>): HealthDashboard {
  return new HealthDashboard(thresholds);
}
