# UBL - Roadmap de Ações Pós-Simulação

> **Documento gerado em:** Dezembro 2024  
> **Baseado em:** 8 cenários de simulação, ~100,000 scripts simulados, 24 anos de tempo virtual

---

## Sumário Executivo

A simulação revelou que o sistema UBL é **resiliente a crises moderadas** mas **vulnerável a pressões prolongadas**. Este documento detalha as ações necessárias para transformar os insights da simulação em melhorias concretas no sistema.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DIAGNÓSTICO GERAL                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ✅ PONTOS FORTES                    ⚠️  VULNERABILIDADES               │
│  ─────────────────                   ────────────────────               │
│  • Sobrevive crises moderadas        • Colapsa sob pressão extrema      │
│  • Baixa desigualdade em booms       • Stress mata em prosperidade      │
│  • Agentes conseguem pivotar         • Sem circuit breakers             │
│  • Ciclos econômicos funcionam       • Guardians sem accountability     │
│                                                                         │
│  NOTA: 7/10 - Fundação sólida, precisa de estabilizadores               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Parte I: Correções Urgentes

### 1.1 Fix: Stress em Eventos Positivos

**Problema:** Scripts morrem de stress mesmo durante GOLDEN_AGE (61% mortalidade).

**Causa:** O modelo de stress não diferencia contexto. Trabalho intenso = stress, independente de ser "trabalho de sucesso" ou "trabalho de desespero".

**Solução:**

```typescript
// Em realistic-behaviors.ts, método updatePsychology

private updatePsychology(psych: AgentPsychology, ctx: DecisionContext): void {
  const { script, market, peers } = ctx;
  
  // NOVO: Contexto afeta como stress é processado
  const isPositiveContext = market.sentiment > 0.3 && market.cyclePhase === 'Expansion';
  
  // Stress from financial pressure
  const financialStress = Number(script.state.loanOutstanding) / 
    Math.max(1, Number(script.state.walletBalance) + 100);
  
  // NOVO: Em contexto positivo, stress acumula mais devagar
  const stressAccumulationRate = isPositiveContext ? 0.05 : 0.1;
  psych.stress = psych.stress * 0.95 + financialStress * stressAccumulationRate;
  
  // NOVO: Eventos positivos reduzem stress ativamente
  if (isPositiveContext && psych.stress > 0.3) {
    psych.stress -= 0.02; // Recuperação ativa em bons tempos
  }
  
  // NOVO: Sucesso financeiro reduz stress
  if (Number(script.state.walletBalance) > 500 && script.state.loanOutstanding === 0n) {
    psych.stress *= 0.98; // "Almofada financeira" reduz ansiedade
  }
  
  // ... resto do método
}
```

**Arquivos afetados:**
- `core/simulation/realistic-behaviors.ts`

**Prioridade:** 🔴 CRÍTICA  
**Esforço:** 2 horas  
**Impacto:** Alto - corrige resultados pessimistas demais

---

### 1.2 Fix: Pivots Não Funcionando

**Problema:** Em cenários novos (BLACK_MONDAY, GOLDEN_AGE), `totalPivots = 0`.

**Causa:** Condições de pivot muito restritivas ou não sendo avaliadas.

**Solução:**

```typescript
// Em realistic-behaviors.ts, método shouldPivot

private shouldPivot(script: SimulatedScript, psych: AgentPsychology, market: MarketState): boolean {
  // RELAXAR: Adaptabilidade mínima de 0.4 → 0.3
  if (script.traits.adaptability < 0.3) return false;
  
  // NOVO: Pivot por oportunidade (não só por desespero)
  if (market.cyclePhase === 'Expansion' && market.demand > 1.5) {
    // Em boom, scripts adaptáveis buscam melhores oportunidades
    if (psych.fomo > 0.5 && Math.random() < script.traits.adaptability * 0.03) {
      return true;
    }
  }
  
  // Pivot se current skill é obsolete (low earnings + high skill)
  const currentSkill = this.getSkillLevel(script.id, script.specialization);
  if (currentSkill > 0.6 && psych.consecutiveFailures > 10) {
    return Math.random() < script.traits.adaptability * 0.05;
  }
  
  // FOMO-driven pivot
  if (psych.fomo > 0.7 && psych.mood < 0) {
    return Math.random() < 0.02;
  }
  
  // NOVO: Pivot por burnout (mudar de área para recuperar)
  if (psych.burnout > 0.7 && script.traits.adaptability > 0.5) {
    return Math.random() < 0.03;
  }
  
  return false;
}
```

**Arquivos afetados:**
- `core/simulation/realistic-behaviors.ts`

**Prioridade:** 🟠 ALTA  
**Esforço:** 1 hora  
**Impacto:** Médio - permite adaptação em cenários diversos

---

### 1.3 Fix: Ciclos Econômicos Muito Longos

**Problema:** Em 5 anos de simulação, apenas 1 ciclo completo.

**Causa:** `expansionDuration: 365` ainda é longo demais para simulações de 3-5 anos.

**Solução:**

```typescript
// Em market-dynamics.ts

const DEFAULT_CYCLE_CONFIG: CycleConfig = {
  expansionDuration: 270,     // 9 meses (era 1 ano)
  contractionDuration: 60,    // 2 meses (era 3 meses)
  volatility: 0.5,            // Mais imprevisível (era 0.4)
};

// NOVO: Presets para diferentes cenários
export const CYCLE_PRESETS = {
  REALISTIC: {
    expansionDuration: 270,
    contractionDuration: 60,
    volatility: 0.5,
  },
  VOLATILE: {
    expansionDuration: 120,
    contractionDuration: 30,
    volatility: 0.7,
  },
  STABLE: {
    expansionDuration: 365,
    contractionDuration: 90,
    volatility: 0.3,
  },
};
```

**Arquivos afetados:**
- `core/simulation/market-dynamics.ts`

**Prioridade:** 🟠 ALTA  
**Esforço:** 30 minutos  
**Impacto:** Médio - simulações mais realistas

---

## Parte II: Mecanismos de Estabilização

### 2.1 Circuit Breakers

**Problema:** Sistema não tem mecanismos automáticos para parar cascatas de falhas.

**Solução:** Implementar circuit breakers que pausam certas operações quando stress sistêmico ultrapassa limites.

```typescript
// NOVO ARQUIVO: core/simulation/circuit-breakers.ts

export interface CircuitBreakerConfig {
  /** Survival rate threshold to trigger */
  survivalThreshold: number;  // Default: 0.5 (50%)
  
  /** Stress threshold to trigger */
  stressThreshold: number;    // Default: 0.8 (80%)
  
  /** Max defaults per day as % of population */
  maxDailyDefaultRate: number; // Default: 0.05 (5%)
  
  /** Cooldown period after trigger (days) */
  cooldownDays: number;       // Default: 7
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private isTriggered: boolean = false;
  private triggeredAt: number = 0;
  private dailyDefaults: number = 0;
  
  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      survivalThreshold: config.survivalThreshold ?? 0.5,
      stressThreshold: config.stressThreshold ?? 0.8,
      maxDailyDefaultRate: config.maxDailyDefaultRate ?? 0.05,
      cooldownDays: config.cooldownDays ?? 7,
    };
  }
  
  /**
   * Check if circuit breaker should trigger
   */
  evaluate(metrics: {
    survivalRate: number;
    avgStress: number;
    dailyDefaults: number;
    totalScripts: number;
    currentDay: number;
  }): CircuitBreakerAction {
    // Check cooldown
    if (this.isTriggered) {
      if (metrics.currentDay - this.triggeredAt < this.config.cooldownDays) {
        return { action: 'ACTIVE', reason: 'Cooldown period' };
      }
      this.isTriggered = false;
    }
    
    // Check survival rate
    if (metrics.survivalRate < this.config.survivalThreshold) {
      this.trigger(metrics.currentDay);
      return { 
        action: 'TRIGGER', 
        reason: `Survival rate ${(metrics.survivalRate * 100).toFixed(1)}% below threshold`,
        measures: ['PAUSE_DEFAULTS', 'EMERGENCY_LIQUIDITY', 'MOOD_INTERVENTION'],
      };
    }
    
    // Check stress
    if (metrics.avgStress > this.config.stressThreshold) {
      this.trigger(metrics.currentDay);
      return {
        action: 'TRIGGER',
        reason: `Average stress ${(metrics.avgStress * 100).toFixed(1)}% above threshold`,
        measures: ['REDUCE_WORK_INTENSITY', 'MANDATORY_REST'],
      };
    }
    
    // Check daily default rate
    const defaultRate = metrics.dailyDefaults / metrics.totalScripts;
    if (defaultRate > this.config.maxDailyDefaultRate) {
      this.trigger(metrics.currentDay);
      return {
        action: 'TRIGGER',
        reason: `Daily default rate ${(defaultRate * 100).toFixed(1)}% exceeds limit`,
        measures: ['PAUSE_DEFAULTS', 'DEBT_RESTRUCTURING'],
      };
    }
    
    return { action: 'NONE' };
  }
  
  private trigger(day: number): void {
    this.isTriggered = true;
    this.triggeredAt = day;
    console.log(`🛑 CIRCUIT BREAKER TRIGGERED at day ${day}`);
  }
}

export interface CircuitBreakerAction {
  action: 'NONE' | 'TRIGGER' | 'ACTIVE';
  reason?: string;
  measures?: string[];
}
```

**Integração no scenario-runner-v2.ts:**

```typescript
// No método processTick
const cbAction = this.circuitBreaker.evaluate({
  survivalRate: stats.activeScripts / this.initialScriptCount,
  avgStress: this.getAverageStress(),
  dailyDefaults: this.periodDefaults,
  totalScripts: stats.totalScripts,
  currentDay: tick.simulatedDay,
});

if (cbAction.action === 'TRIGGER') {
  console.log(`🛑 Circuit breaker: ${cbAction.reason}`);
  // Apply measures
  for (const measure of cbAction.measures ?? []) {
    this.applyEmergencyMeasure(measure);
  }
}
```

**Arquivos afetados:**
- `core/simulation/circuit-breakers.ts` (novo)
- `core/simulation/scenario-runner-v2.ts`
- `core/simulation/index.ts`

**Prioridade:** 🔴 CRÍTICA  
**Esforço:** 4 horas  
**Impacto:** Alto - previne colapsos em cascata

---

### 2.2 Treasury Stabilization Fund

**Problema:** Não existe mecanismo de bailout para scripts em dificuldade.

**Solução:** Fundo de estabilização que injeta liquidez automaticamente.

```typescript
// NOVO ARQUIVO: core/simulation/treasury-fund.ts

export interface TreasuryFundConfig {
  /** Initial fund balance */
  initialBalance: bigint;
  
  /** Replenishment rate per day */
  dailyReplenishment: bigint;
  
  /** Max bailout per script */
  maxBailoutPerScript: bigint;
  
  /** Eligibility: min reputation to receive bailout */
  minReputationForBailout: number;
  
  /** Trigger: survival rate below this triggers intervention */
  interventionThreshold: number;
}

export class TreasuryStabilizationFund {
  private balance: bigint;
  private config: TreasuryFundConfig;
  private bailoutHistory: BailoutRecord[] = [];
  
  constructor(config: Partial<TreasuryFundConfig> = {}) {
    this.config = {
      initialBalance: config.initialBalance ?? 1000000n,
      dailyReplenishment: config.dailyReplenishment ?? 1000n,
      maxBailoutPerScript: config.maxBailoutPerScript ?? 500n,
      minReputationForBailout: config.minReputationForBailout ?? 20,
      interventionThreshold: config.interventionThreshold ?? 0.6,
    };
    this.balance = this.config.initialBalance;
  }
  
  /**
   * Process daily operations
   */
  processTick(day: number): void {
    // Replenish fund
    this.balance += this.config.dailyReplenishment;
  }
  
  /**
   * Evaluate if intervention is needed
   */
  shouldIntervene(survivalRate: number): boolean {
    return survivalRate < this.config.interventionThreshold && this.balance > 0n;
  }
  
  /**
   * Execute bailout for eligible scripts
   */
  executeBailout(
    scripts: SimulatedScript[],
    day: number
  ): BailoutResult {
    const eligible = scripts.filter(s => 
      s.state.isActive &&
      s.state.reputation >= this.config.minReputationForBailout &&
      Number(s.state.walletBalance) < 50 &&
      s.state.loanOutstanding > 0n
    );
    
    let totalDistributed = 0n;
    const recipients: string[] = [];
    
    for (const script of eligible) {
      if (this.balance < this.config.maxBailoutPerScript) break;
      
      const bailout = this.config.maxBailoutPerScript;
      script.state.walletBalance += bailout;
      this.balance -= bailout;
      totalDistributed += bailout;
      recipients.push(script.id);
      
      this.bailoutHistory.push({
        day,
        scriptId: script.id,
        amount: bailout,
        reason: 'liquidity_crisis',
      });
    }
    
    if (recipients.length > 0) {
      console.log(`💰 TREASURY BAILOUT: ${recipients.length} scripts received ${totalDistributed} total`);
    }
    
    return {
      scriptsHelped: recipients.length,
      totalDistributed,
      remainingBalance: this.balance,
    };
  }
  
  getBalance(): bigint {
    return this.balance;
  }
  
  getHistory(): BailoutRecord[] {
    return [...this.bailoutHistory];
  }
}

interface BailoutRecord {
  day: number;
  scriptId: string;
  amount: bigint;
  reason: string;
}

interface BailoutResult {
  scriptsHelped: number;
  totalDistributed: bigint;
  remainingBalance: bigint;
}
```

**Arquivos afetados:**
- `core/simulation/treasury-fund.ts` (novo)
- `core/simulation/scenario-runner-v2.ts`
- `core/simulation/index.ts`

**Prioridade:** 🟠 ALTA  
**Esforço:** 3 horas  
**Impacto:** Alto - mecanismo de última instância

---

### 2.3 Guardian Accountability

**Problema:** Guardians não sofrem consequências quando seus scripts falham.

**Solução:** Sistema de penalidades e recompensas para guardians.

```typescript
// Adicionar em agent-population.ts

export interface GuardianAccountability {
  /** Reputation penalty when script defaults */
  defaultPenalty: number;  // Default: -5
  
  /** Reputation penalty when script exits */
  exitPenalty: number;     // Default: -2
  
  /** Reputation bonus when script survives crisis */
  survivalBonus: number;   // Default: +3
  
  /** Tier demotion threshold */
  demotionThreshold: number; // Default: 30 reputation
  
  /** License revocation threshold */
  revocationThreshold: number; // Default: 10 reputation
}

// No método processAgentBehaviors do scenario-runner-v2.ts
if (outcome.defaulted) {
  const guardian = this.population.getGuardian(script.guardianId);
  if (guardian) {
    guardian.state.reputation = Math.max(0, guardian.state.reputation - 5);
    
    // Check for demotion
    if (guardian.state.reputation < 30) {
      guardian.tier = this.demoteGuardian(guardian);
    }
    
    // Check for revocation
    if (guardian.state.reputation < 10) {
      this.revokeGuardianLicense(guardian);
    }
  }
}
```

**Arquivos afetados:**
- `core/simulation/agent-population.ts`
- `core/simulation/scenario-runner-v2.ts`

**Prioridade:** 🟡 MÉDIA  
**Esforço:** 2 horas  
**Impacto:** Médio - incentiva guardians responsáveis

---

## Parte III: Novos Cenários de Teste

### 3.1 TIER 3: Existential Threats

Após implementar os mecanismos de estabilização, testar com cenários mais extremos:

```typescript
// Adicionar em scenario-runner-v2.ts

/** AGI arrives - 95% obsolescence */
AGI_SINGULARITY: {
  name: 'AGI Singularity',
  description: 'AGI makes 95% of scripts obsolete overnight',
  duration: { years: 5 },
  clockPreset: 'FIVE_YEARS_FIVE_MINUTES',
  populationPreset: 'LARGE',
  chaosEvents: [
    { preset: 'MODEL_RELEASE', triggerAtDay: 730 }, // GPT-5
    { preset: 'MODEL_RELEASE', triggerAtDay: 731 }, // GPT-6 next day
    { preset: 'MASS_DEFAULT', triggerAtDay: 760 },
  ],
  randomChaosRate: 0.02,
  metricsInterval: 30,
  realisticBehaviors: true,
  marketDynamics: true,
  socialContagion: true,
},

/** Deflationary death spiral */
DEFLATION_TRAP: {
  name: 'Deflation Trap',
  description: 'Persistent demand shock with debt deflation',
  duration: { years: 3 },
  clockPreset: 'MONTHLY',
  populationPreset: 'LARGE',
  chaosEvents: [
    { preset: 'MARKET_CRASH', triggerAtDay: 90 },
    { preset: 'CREDIT_FREEZE', triggerAtDay: 180 },
    { preset: 'MARKET_CRASH', triggerAtDay: 270 }, // Second crash
    { preset: 'CONTAGION_PANIC', triggerAtDay: 365 },
  ],
  randomChaosRate: 0.01,
  metricsInterval: 7,
  realisticBehaviors: true,
  marketDynamics: true,
  socialContagion: true,
},
```

**Prioridade:** 🟡 MÉDIA  
**Esforço:** 2 horas  
**Impacto:** Testa limites do sistema

---

### 3.2 TIER 5: Game Theory

Cenários que testam falhas de design, não só resiliência:

```typescript
/** Tragedy of the Commons */
COMMONS_COLLAPSE: {
  name: 'Tragedy of Commons',
  description: 'Test if cooperation emerges or system collapses',
  duration: { years: 5 },
  // Requer implementação de shared resource mechanics
},

/** Cartel Domination */
CARTEL_TAKEOVER: {
  name: 'Cartel Takeover',
  description: '5 guardians control 60% of market',
  duration: { years: 3 },
  chaosEvents: [
    { preset: 'CARTEL_FORMATION', triggerAtDay: 180 },
    // Requer implementação de detecção de cartel
  ],
},
```

**Prioridade:** 🟢 BAIXA (requer nova arquitetura)  
**Esforço:** 8+ horas  
**Impacto:** Alto - testa falhas fundamentais

---

## Parte IV: Métricas e Monitoramento

### 4.1 Dashboard de Saúde do Sistema

```typescript
// NOVO ARQUIVO: core/simulation/health-dashboard.ts

export interface SystemHealth {
  // Status geral
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'COLLAPSED';
  
  // Métricas core
  survivalRate: number;
  avgStress: number;
  avgMood: number;
  giniCoefficient: number;
  
  // Tendências (últimos 30 dias)
  survivalTrend: 'improving' | 'stable' | 'declining';
  stressTrend: 'improving' | 'stable' | 'worsening';
  
  // Alertas ativos
  alerts: HealthAlert[];
  
  // Intervenções ativas
  activeInterventions: string[];
  
  // Previsão
  projectedSurvival30Days: number;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export interface HealthAlert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
}

export function calculateSystemHealth(metrics: EnhancedMetrics[]): SystemHealth {
  const latest = metrics[metrics.length - 1];
  const previous = metrics.slice(-30);
  
  // Calculate trends
  const survivalTrend = calculateTrend(previous.map(m => m.scriptSurvivalRate));
  const stressTrend = calculateTrend(previous.map(m => m.averageStress));
  
  // Generate alerts
  const alerts: HealthAlert[] = [];
  
  if (latest.scriptSurvivalRate < 0.5) {
    alerts.push({
      severity: 'critical',
      message: 'Survival rate below 50%',
      metric: 'survivalRate',
      value: latest.scriptSurvivalRate,
      threshold: 0.5,
      timestamp: latest.timestamp,
    });
  }
  
  if (latest.averageStress > 0.8) {
    alerts.push({
      severity: 'warning',
      message: 'Average stress above 80%',
      metric: 'avgStress',
      value: latest.averageStress,
      threshold: 0.8,
      timestamp: latest.timestamp,
    });
  }
  
  if (latest.giniCoefficient > 0.4) {
    alerts.push({
      severity: 'warning',
      message: 'High inequality detected',
      metric: 'giniCoefficient',
      value: latest.giniCoefficient,
      threshold: 0.4,
      timestamp: latest.timestamp,
    });
  }
  
  // Determine status
  let status: SystemHealth['status'] = 'HEALTHY';
  if (latest.scriptSurvivalRate === 0) status = 'COLLAPSED';
  else if (alerts.some(a => a.severity === 'critical')) status = 'CRITICAL';
  else if (alerts.some(a => a.severity === 'warning')) status = 'WARNING';
  
  return {
    status,
    survivalRate: latest.scriptSurvivalRate,
    avgStress: latest.averageStress,
    avgMood: latest.averageMood,
    giniCoefficient: latest.giniCoefficient,
    survivalTrend,
    stressTrend: stressTrend === 'declining' ? 'improving' : 
                 stressTrend === 'improving' ? 'worsening' : 'stable',
    alerts,
    activeInterventions: [],
    projectedSurvival30Days: projectSurvival(previous),
    riskLevel: calculateRiskLevel(latest, survivalTrend),
  };
}

function calculateTrend(values: number[]): 'improving' | 'stable' | 'declining' {
  if (values.length < 2) return 'stable';
  const first = values.slice(0, Math.floor(values.length / 2));
  const second = values.slice(Math.floor(values.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
  const diff = avgSecond - avgFirst;
  if (diff > 0.05) return 'improving';
  if (diff < -0.05) return 'declining';
  return 'stable';
}

function projectSurvival(metrics: EnhancedMetrics[]): number {
  // Simple linear projection
  if (metrics.length < 2) return metrics[0]?.scriptSurvivalRate ?? 1;
  const rates = metrics.map(m => m.scriptSurvivalRate);
  const slope = (rates[rates.length - 1] - rates[0]) / rates.length;
  return Math.max(0, Math.min(1, rates[rates.length - 1] + slope * 30));
}

function calculateRiskLevel(
  metrics: EnhancedMetrics, 
  trend: string
): 'low' | 'medium' | 'high' | 'extreme' {
  if (metrics.scriptSurvivalRate < 0.3 || trend === 'declining') return 'extreme';
  if (metrics.scriptSurvivalRate < 0.5 || metrics.averageStress > 0.8) return 'high';
  if (metrics.scriptSurvivalRate < 0.7 || metrics.averageStress > 0.6) return 'medium';
  return 'low';
}
```

**Arquivos afetados:**
- `core/simulation/health-dashboard.ts` (novo)
- `core/simulation/index.ts`

**Prioridade:** 🟡 MÉDIA  
**Esforço:** 3 horas  
**Impacto:** Médio - visibilidade operacional

---

## Parte V: Integração com Sistema Real

### 5.1 Mapeamento Simulação → Código Real

| Componente Simulação | Componente Real | Status |
|---------------------|-----------------|--------|
| `SimulatedScript` | `Entity` + `Agreement` | 🟡 Parcial |
| `SimulatedGuardian` | `Entity` com role Guardian | 🟡 Parcial |
| `MarketDynamics` | Não existe | 🔴 Falta |
| `CircuitBreaker` | Não existe | 🔴 Falta |
| `TreasuryFund` | `Container` com physics Wallet | 🟡 Parcial |

### 5.2 Ações para Integração

1. **Criar `MarketOracle`** - serviço que fornece dados de mercado
2. **Implementar `CircuitBreakerService`** - monitora e intervém
3. **Criar `TreasuryContainer`** - container especial para fundo de estabilização
4. **Adicionar eventos de saúde** - `SystemHealthChecked`, `CircuitBreakerTriggered`

---

## Parte VI: Cronograma

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CRONOGRAMA DE IMPLEMENTAÇÃO                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SEMANA 1: Correções Urgentes                                           │
│  ├── [2h] Fix stress em eventos positivos                               │
│  ├── [1h] Fix pivots não funcionando                                    │
│  ├── [0.5h] Fix ciclos econômicos                                       │
│  └── [1h] Testes de regressão                                           │
│                                                                         │
│  SEMANA 2: Mecanismos de Estabilização                                  │
│  ├── [4h] Circuit breakers                                              │
│  ├── [3h] Treasury stabilization fund                                   │
│  ├── [2h] Guardian accountability                                       │
│  └── [2h] Integração e testes                                           │
│                                                                         │
│  SEMANA 3: Monitoramento e Novos Cenários                               │
│  ├── [3h] Health dashboard                                              │
│  ├── [2h] Cenários TIER 3                                               │
│  ├── [2h] Documentação                                                  │
│  └── [2h] Testes finais                                                 │
│                                                                         │
│  SEMANA 4+: Integração com Sistema Real                                 │
│  ├── MarketOracle service                                               │
│  ├── CircuitBreakerService                                              │
│  ├── TreasuryContainer                                                  │
│  └── Eventos de saúde                                                   │
│                                                                         │
│  TOTAL ESTIMADO: ~25 horas de desenvolvimento                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Parte VII: Critérios de Sucesso

### Após implementação, o sistema deve:

| Métrica | Antes | Meta |
|---------|-------|------|
| GOLDEN_AGE survival | 39% | > 80% |
| BLACK_MONDAY survival | 48% | > 60% |
| BOOM_BUST survival | 19% | > 40% |
| Pivots em cenários novos | 0 | > 100 |
| Ciclos em 5 anos | 1 | ≥ 3 |
| Circuit breaker triggers | N/A | Funcional |
| Treasury bailouts | N/A | Funcional |

---

## Apêndice A: Comandos de Teste

```bash
# Rodar cenário específico
npx tsx scripts/run-simulation-v2.ts GOLDEN_AGE

# Rodar todos os cenários
for scenario in REALISTIC_BASELINE DEATH_SPIRAL BLACK_MONDAY GOLDEN_AGE BOOM_BUST; do
  npx tsx scripts/run-simulation-v2.ts $scenario
done

# Rodar testes unitários
npm test

# Verificar tipos
npx tsc --noEmit
```

---

## Apêndice B: Arquivos Criados/Modificados

### Novos arquivos:
- `core/simulation/circuit-breakers.ts`
- `core/simulation/treasury-fund.ts`
- `core/simulation/health-dashboard.ts`

### Arquivos modificados:
- `core/simulation/realistic-behaviors.ts`
- `core/simulation/market-dynamics.ts`
- `core/simulation/agent-population.ts`
- `core/simulation/scenario-runner-v2.ts`
- `core/simulation/index.ts`

---

## Conclusão

A simulação revelou que o sistema UBL tem uma **fundação sólida** mas precisa de **mecanismos de estabilização** para sobreviver a crises extremas. As ações descritas neste documento, se implementadas, devem elevar a nota do sistema de **7/10 para 9/10**.

O próximo passo é executar o cronograma da Semana 1, validar as correções com novos testes, e iterar.

---

*Documento gerado automaticamente baseado em análise de simulação.*  
*Última atualização: Dezembro 2024*
