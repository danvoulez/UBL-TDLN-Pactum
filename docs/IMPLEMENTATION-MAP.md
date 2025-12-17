# WHITEPAPER → CODE: Implementation Map

## Mapeamento das Soluções Propostas para Código

---

## §12. Fitness Function Revisada

### Teoria
```
Φ_S(t) = α·log(1 + V_S(t)) - β·C_S(t) + γ·arctan(R_S(t)/R_max)
         + δ·(V_volatility/C_volatility) - ε·max(0, C_catastrophic)
```

### Código: `core/economy/fitness.ts`

```typescript
interface FitnessParams {
  α: number;  // Value weight (default: 1.0)
  β: number;  // Cost weight (default: 0.5)
  γ: number;  // Reputation weight (default: 0.3)
  δ: number;  // Risk-adjusted return weight (default: 0.2)
  ε: number;  // Catastrophic failure penalty (default: 2.0)
  R_max: number;  // Reputation asymptote (default: 100)
}

interface ScriptMetrics {
  totalValue: Quantity;           // V_S(t)
  totalCost: Quantity;            // C_S(t)
  reputation: number;             // R_S(t) ∈ [0, R_max]
  valueVolatility: number;        // σ(V)
  costVolatility: number;         // σ(C)
  catastrophicFailures: number;   // Count of failures > threshold
}

function calculateFitness(metrics: ScriptMetrics, params: FitnessParams): number {
  const valueTerm = params.α * Math.log(1 + Number(metrics.totalValue.amount));
  const costTerm = params.β * Number(metrics.totalCost.amount);
  const reputationTerm = params.γ * Math.atan(metrics.reputation / params.R_max);
  const riskAdjustedTerm = params.δ * (metrics.valueVolatility / Math.max(0.01, metrics.costVolatility));
  const catastrophicPenalty = params.ε * Math.max(0, metrics.catastrophicFailures);
  
  return valueTerm - costTerm + reputationTerm + riskAdjustedTerm - catastrophicPenalty;
}
```

### Eventos Necessários
- `FitnessCalculated` - Emitido periodicamente (hourly/daily)
- `CatastrophicFailureDetected` - Quando falha > threshold

### Onde Usar
- `core/economy/script-lifecycle.ts` - Decisões de spawn/terminate
- `core/economy/loan-approval.ts` - Critério de crédito
- `antenna/agent/ranking.ts` - Ranking de scripts para clientes

---

## §13. Guardian Scoring

### Teoria
```
Guardian_Score = 0.4·Profit_Quality + 0.3·System_Health 
               + 0.2·Script_Survival + 0.1·Dispute_Resolution
```

### Código: `core/economy/guardian-scoring.ts`

```typescript
type GuardianTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

interface GuardianScore {
  guardianId: EntityId;
  profitQuality: number;      // 0-100
  systemHealth: number;       // 0-100
  scriptSurvival: number;     // 0-100
  disputeResolution: number;  // 0-100
  totalScore: number;         // Weighted average
  tier: GuardianTier;
  calculatedAt: Timestamp;
}

interface GuardianMetrics {
  scripts: Array<{
    id: EntityId;
    profit: Quantity;
    age: Duration;
    loanRepaid: boolean;
  }>;
  negativeExternalities: Quantity;  // Spam, congestion caused
  publicGoodsContributions: Quantity;
  totalDisputes: number;
  unresolvedDisputes: number;
}

function calculateGuardianScore(metrics: GuardianMetrics): GuardianScore {
  // Profit Quality: rewards distributed success
  const profits = metrics.scripts.map(s => Number(s.profit.amount));
  const gini = calculateGiniCoefficient(profits);
  const totalProfit = profits.reduce((a, b) => a + b, 0);
  const profitQuality = Math.min(100, totalProfit * (1 - gini) / 1000);
  
  // System Health: penalize externalities, reward public goods
  const systemHealth = Math.max(0, Math.min(100,
    50 - Number(metrics.negativeExternalities.amount) / 100
       + Number(metrics.publicGoodsContributions.amount) / 50
  ));
  
  // Script Survival
  const avgAge = metrics.scripts.reduce((sum, s) => sum + s.age.amount, 0) / metrics.scripts.length;
  const survivalRate = metrics.scripts.filter(s => s.loanRepaid).length / metrics.scripts.length;
  const scriptSurvival = Math.min(100, avgAge * survivalRate * 10);
  
  // Dispute Resolution
  const disputeResolution = metrics.totalDisputes === 0 
    ? 100 
    : 100 * (1 - metrics.unresolvedDisputes / metrics.totalDisputes);
  
  const totalScore = 0.4 * profitQuality + 0.3 * systemHealth 
                   + 0.2 * scriptSurvival + 0.1 * disputeResolution;
  
  const tier: GuardianTier = 
    totalScore >= 90 ? 'Platinum' :
    totalScore >= 75 ? 'Gold' :
    totalScore >= 50 ? 'Silver' : 'Bronze';
  
  return { guardianId, profitQuality, systemHealth, scriptSurvival, disputeResolution, totalScore, tier, calculatedAt: Date.now() };
}
```

### Tier Benefits (Agreement Clauses)
```typescript
const TIER_BENEFITS: Record<GuardianTier, TierBenefits> = {
  Bronze: { feeRate: 0.10, maxLoanSize: 1000, votingPower: 0 },
  Silver: { feeRate: 0.03, maxLoanSize: 2000, votingPower: 1 },
  Gold:   { feeRate: 0.02, maxLoanSize: 5000, votingPower: 3 },
  Platinum: { feeRate: 0.01, maxLoanSize: 10000, votingPower: 10, revenueShare: 0.01 },
};
```

### Eventos
- `GuardianScoreCalculated`
- `GuardianTierChanged`
- `GuardianBenefitsApplied`

---

## §14. Monetary Policy Transmission

### Código: `core/economy/transmission.ts`

```typescript
type Band = 'LOW' | 'NORMAL' | 'HIGH';

interface TransmissionPolicy {
  band: Band;
  loanApprovalRate: number;      // 0-1
  maxLoanSize: Quantity;
  expectedDuration: string;       // "2-4 weeks"
  nextBandLikely: Band;
}

function calculateTransmissionPolicy(
  currentBand: Band, 
  inflationRate: number
): TransmissionPolicy {
  switch (currentBand) {
    case 'HIGH':
      return {
        band: 'HIGH',
        loanApprovalRate: Math.max(0.5, 1 - (inflationRate - 0.04) / 0.08),
        maxLoanSize: { amount: 500n, unit: 'UBL' },
        expectedDuration: '2-4 weeks',
        nextBandLikely: inflationRate < 0.08 ? 'NORMAL' : 'HIGH',
      };
    case 'LOW':
      return {
        band: 'LOW',
        loanApprovalRate: Math.min(1.0, 1 + (0 - inflationRate) / 0.02),
        maxLoanSize: { amount: 1500n, unit: 'UBL' },
        expectedDuration: '1-2 weeks',
        nextBandLikely: inflationRate > 0.01 ? 'NORMAL' : 'LOW',
      };
    default:
      return {
        band: 'NORMAL',
        loanApprovalRate: 0.8,
        maxLoanSize: { amount: 1000n, unit: 'UBL' },
        expectedDuration: 'indefinite',
        nextBandLikely: 'NORMAL',
      };
  }
}
```

### Script Behavior Adjustment (Daemon Loop)
```typescript
// Em consciousness.ts - DaemonLoop
interface BandAwareBehavior {
  adjustForBand(band: Band): void;
}

function adjustDaemonForBand(daemon: Daemon, band: Band): DaemonBudget {
  const base = daemon.budget;
  switch (band) {
    case 'HIGH':
      return {
        ...base,
        hourlyMax: { amount: base.hourlyMax.amount * 70n / 100n, unit: 'mUBL' },
        // Reduce activity 30%
      };
    case 'LOW':
      return {
        ...base,
        hourlyMax: { amount: base.hourlyMax.amount * 150n / 100n, unit: 'mUBL' },
        // Increase activity 50%
      };
    default:
      return base;
  }
}
```

### Eventos
- `TransmissionPolicyPublished` (Forward Guidance)
- `BandChanged`
- `DaemonBudgetAdjustedForBand`

---

## §15. Cross-Realm Interoperability (UIS-1.0)

### Código: `core/interop/uis-1.0.ts`

```typescript
interface RealmExchangeRate {
  fromRealm: EntityId;
  toRealm: EntityId;
  rate: number;           // 1 fromRealm◆ = rate toRealm◆
  fee: number;            // 0.005 = 0.5%
  validUntil: Timestamp;
}

interface ReputationTranslation {
  fromRealm: EntityId;
  toRealm: EntityId;
  fromScore: number;
  translatedScore: number;
  trajectoryConsistency: number;  // 0-1
}

function exchangeCurrency(
  amount: Quantity,
  rate: RealmExchangeRate
): Quantity {
  const netRate = rate.rate * (1 - rate.fee);
  return {
    amount: BigInt(Math.floor(Number(amount.amount) * netRate)),
    unit: 'UBL',
  };
}

function translateReputation(
  sourceScore: number,
  trajectoryConsistency: number
): number {
  const baseConversion = 0.7 * sourceScore;
  const adjusted = baseConversion * trajectoryConsistency;
  return Math.min(adjusted, 0.95 * 100);  // Cap at 95
}

interface CrossRealmDispute {
  transactionId: EntityId;
  realmA: EntityId;
  realmB: EntityId;
  governingLaw: 'RealmA' | 'RealmB' | 'Neutral';
  arbiter: EntityId;
  status: 'Pending' | 'InProgress' | 'Resolved';
}
```

### Eventos
- `CrossRealmExchangeExecuted`
- `ReputationTranslated`
- `CrossRealmDisputeOpened`
- `CrossRealmDisputeResolved`

---

## §16. Public Goods & Externalities

### Código: `core/economy/public-goods.ts`

```typescript
interface CongestionPricing {
  currentLoad: number;      // 0-1
  capacity: number;
  multiplier: number;       // 1 + 0.5 * (load/capacity)²
  offPeakDiscount: number;  // 0.7
}

function calculateCongestionMultiplier(load: number, capacity: number): number {
  const ratio = load / capacity;
  return 1 + 0.5 * ratio * ratio;
}

interface ExternalityTax {
  spamTax: Quantity;           // 0.01 ◆ per unwanted message
  congestionTax: Quantity;     // 0.001 ◆ per token during overload
}

interface PublicGoodsProposal {
  id: EntityId;
  title: string;
  description: string;
  requestedAmount: Quantity;
  contributions: Map<EntityId, Quantity>;
  matchingFunds: Quantity;
  status: 'Open' | 'Funded' | 'Rejected';
}

function calculateQuadraticMatching(contributions: Quantity[]): Quantity {
  // √(Σ√c_i)²
  const sqrtSum = contributions.reduce(
    (sum, c) => sum + Math.sqrt(Number(c.amount)), 
    0
  );
  const matched = sqrtSum * sqrtSum;
  const totalContributed = contributions.reduce(
    (sum, c) => sum + Number(c.amount), 
    0
  );
  return {
    amount: BigInt(Math.floor(matched - totalContributed)),
    unit: 'UBL',
  };
}
```

### Eventos
- `CongestionPriceUpdated`
- `ExternalityTaxCollected`
- `PublicGoodsProposalCreated`
- `PublicGoodsContributionMade`
- `PublicGoodsMatchingApplied`

---

## §17. Failure Mode Detection

### Código: `core/enforcement/cartel-detection.ts`

```typescript
interface TransactionGraph {
  nodes: Set<EntityId>;
  edges: Map<EntityId, Map<EntityId, { volume: Quantity; count: number }>>;
}

interface CartelAlert {
  type: 'PotentialCartel';
  cycle: EntityId[];
  volume: Quantity;
  priceDeviation: number;
  confidence: number;
}

function detectCartel(graph: TransactionGraph, threshold: Quantity): CartelAlert[] {
  const alerts: CartelAlert[] = [];
  const cycles = findCycles(graph, 3);  // Max length 3
  
  for (const cycle of cycles) {
    const volume = calculateCycleVolume(graph, cycle);
    const priceDeviation = calculatePriceDeviation(graph, cycle);
    
    if (Number(volume.amount) > Number(threshold.amount) &&
        priceDeviation > 0.20 &&
        cycle.length < 5) {
      alerts.push({
        type: 'PotentialCartel',
        cycle,
        volume,
        priceDeviation,
        confidence: calculateConfidence(volume, priceDeviation, cycle.length),
      });
    }
  }
  
  return alerts;
}
```

### Código: `core/enforcement/anomaly-detection.ts`

```typescript
interface AnomalyDetector {
  detect(metric: number, history: number[]): boolean;
}

function threeSignmaRule(value: number, history: number[]): boolean {
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((sum, x) => sum + (x - mean) ** 2, 0) / history.length;
  const stdDev = Math.sqrt(variance);
  return Math.abs(value - mean) > 3 * stdDev;
}

interface CircuitBreaker {
  triggered: boolean;
  reason: string;
  triggeredAt: Timestamp;
  cooldownUntil: Timestamp;
}

function checkCircuitBreaker(
  mintAmount: Quantity,
  hourlyMintHistory: Quantity[],
  priceOracleValue: number,
  priceHistory: number[]
): CircuitBreaker | null {
  // Layer 1: Transaction limits
  if (Number(mintAmount.amount) > 10000) {
    return { triggered: true, reason: 'Mint exceeds 10,000 ◆ limit', triggeredAt: Date.now(), cooldownUntil: Date.now() + 8 * 3600000 };
  }
  
  // Layer 2: 3σ anomaly
  if (threeSignmaRule(Number(mintAmount.amount), hourlyMintHistory.map(q => Number(q.amount)))) {
    return { triggered: true, reason: '3σ anomaly detected in mint volume', triggeredAt: Date.now(), cooldownUntil: Date.now() + 3600000 };
  }
  
  // Layer 2: Price oracle anomaly
  if (threeSignmaRule(priceOracleValue, priceHistory)) {
    return { triggered: true, reason: '3σ anomaly detected in price oracle', triggeredAt: Date.now(), cooldownUntil: Date.now() + 3600000 };
  }
  
  return null;
}
```

### Eventos
- `CartelAlertRaised`
- `AnomalyDetected`
- `CircuitBreakerTriggered`
- `CircuitBreakerReset`

---

## §18. Governance

### Código: `core/governance/three-branch.ts`

```typescript
type Branch = 'Executive' | 'Legislative' | 'Judicial';

interface GovernanceAction {
  id: EntityId;
  branch: Branch;
  type: string;
  proposedBy: EntityId;
  proposedAt: Timestamp;
  status: 'Proposed' | 'Deliberation' | 'Voting' | 'Approved' | 'Rejected' | 'Implemented';
  votes: Map<EntityId, { vote: 'Yes' | 'No' | 'Abstain'; weight: number }>;
}

interface Amendment {
  id: EntityId;
  title: string;
  description: string;
  changes: Record<string, unknown>;
  petitionSignatures: EntityId[];  // Need 5% of entities
  deliberationEnds: Timestamp;     // 30 days
  votingEnds: Timestamp;
  approvalThreshold: number;       // 0.60 = 60%
  sunsetDate: Timestamp;           // 2 years from implementation
}

function calculateQuadraticVote(contributions: Map<EntityId, Quantity>): number {
  // Quadratic voting: vote power = √(tokens spent)
  let totalVotePower = 0;
  for (const [_, amount] of contributions) {
    totalVotePower += Math.sqrt(Number(amount.amount));
  }
  return totalVotePower;
}

interface ExecutiveAction {
  type: 'BandAdjustment' | 'EmergencyPause' | 'RoutineOperation';
  reversibleUntil: Timestamp;  // 24h window for Legislative override
}
```

### Eventos
- `AmendmentProposed`
- `DeliberationStarted`
- `VoteCast`
- `AmendmentApproved`
- `AmendmentImplemented`
- `AmendmentSunset`
- `ExecutiveActionTaken`
- `ExecutiveActionOverridden`

---

## §19. Business Cycle Adjustment

### Código: `core/economy/cycle-adjustment.ts`

```typescript
type CyclePhase = 'RapidGrowth' | 'TechTransition' | 'Saturation' | 'Normal';

interface CycleIndicators {
  networkGrowthRate: number;      // % per month
  networkSize: number;
  majorModelReleaseExpected: number;  // Days until
  techVelocity: number;           // Rate of capability change
}

function detectCyclePhase(indicators: CycleIndicators): CyclePhase {
  if (indicators.networkGrowthRate > 0.10) return 'RapidGrowth';
  if (indicators.majorModelReleaseExpected < 30) return 'TechTransition';
  if (indicators.networkSize > 10000 && indicators.networkGrowthRate < 0.02) return 'Saturation';
  return 'Normal';
}

interface CycleAdjustments {
  loanAvailabilityMultiplier: number;
  interestRateAdjustment: number;
  inflationTargetRange: [number, number];
  depreciationRateMultiplier: number;
  reputationDecayMultiplier: number;
  qualityFocusWeight: number;
}

function getAdjustmentsForPhase(phase: CyclePhase): CycleAdjustments {
  switch (phase) {
    case 'RapidGrowth':
      return {
        loanAvailabilityMultiplier: 1.20,
        interestRateAdjustment: -0.01,
        inflationTargetRange: [0.03, 0.06],
        depreciationRateMultiplier: 1.0,
        reputationDecayMultiplier: 1.0,
        qualityFocusWeight: 0.3,
      };
    case 'TechTransition':
      return {
        loanAvailabilityMultiplier: 1.0,
        interestRateAdjustment: 0,
        inflationTargetRange: [0.02, 0.04],
        depreciationRateMultiplier: 1.50,
        reputationDecayMultiplier: 0.7,  // Slower decay during transition
        qualityFocusWeight: 0.5,
      };
    case 'Saturation':
      return {
        loanAvailabilityMultiplier: 0.8,
        interestRateAdjustment: 0.01,
        inflationTargetRange: [0.01, 0.03],
        depreciationRateMultiplier: 1.0,
        reputationDecayMultiplier: 1.2,
        qualityFocusWeight: 0.8,  // High quality focus
      };
    default:
      return {
        loanAvailabilityMultiplier: 1.0,
        interestRateAdjustment: 0,
        inflationTargetRange: [0.02, 0.04],
        depreciationRateMultiplier: 1.0,
        reputationDecayMultiplier: 1.0,
        qualityFocusWeight: 0.5,
      };
  }
}
```

### Eventos
- `CyclePhaseDetected`
- `CycleAdjustmentsApplied`

---

## Resumo: Arquivos a Criar

| Seção | Arquivo | Prioridade |
|-------|---------|------------|
| §12 | `core/economy/fitness.ts` | Alta |
| §13 | `core/economy/guardian-scoring.ts` | Alta |
| §14 | `core/economy/transmission.ts` | Média |
| §15 | `core/interop/uis-1.0.ts` | Baixa (futuro) |
| §16 | `core/economy/public-goods.ts` | Média |
| §17 | `core/enforcement/cartel-detection.ts` | Alta |
| §17 | `core/enforcement/anomaly-detection.ts` | Alta |
| §18 | `core/governance/three-branch.ts` | Baixa (futuro) |
| §19 | `core/economy/cycle-adjustment.ts` | Média |

---

## Ordem de Implementação Recomendada

### Sprint 1: Fundamentos de Segurança
1. `anomaly-detection.ts` - Circuit breakers
2. `cartel-detection.ts` - Detecção de fraude

### Sprint 2: Economia Core
3. `fitness.ts` - Função de fitness revisada
4. `guardian-scoring.ts` - Sistema de tiers

### Sprint 3: Política Monetária
5. `transmission.ts` - Canais de transmissão
6. `cycle-adjustment.ts` - Ajustes por fase

### Sprint 4: Bens Públicos
7. `public-goods.ts` - Quadratic funding

### Sprint 5: Governança (Futuro)
8. `three-branch.ts` - Estrutura de governança
9. `uis-1.0.ts` - Interoperabilidade cross-realm

---

*"Teoria sem código é filosofia. Código sem teoria é hacking. Precisamos de ambos."*
