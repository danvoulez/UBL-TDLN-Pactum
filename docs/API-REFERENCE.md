# API Reference

> Complete reference for all UBL modules and their public APIs.
> 
> **Last Updated:** 2025-12-12

---

## Table of Contents

1. [HTTP API (Antenna)](#http-api-antenna)
2. [Intent System](#intent-system)
3. [Core Modules](#core-modules)
4. [Economy](#economy)
5. [Enforcement](#enforcement)
6. [Sessions](#sessions)
7. [Governance](#governance)
8. [Interoperability](#interoperability)
9. [Benchmarking](#benchmarking)
10. [Simulation](#simulation)

---

## HTTP API (Antenna)

The Antenna is the HTTP gateway for UBL. **One endpoint to rule them all.**

### Starting the Server

```typescript
import { createAntenna } from './antenna';

const antenna = createAntenna({
  port: 3000,
  host: '0.0.0.0',
  corsOrigins: ['http://localhost:5173'],
  masterApiKey: 'your-api-key',
});

await antenna.start();
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/intent` | Process any intent (canonical) |
| `POST` | `/` | Process any intent (alias) |
| `GET` | `/health` | Health check |
| `GET` | `/affordances` | What can I do? |
| `POST` | `/chat` | Conversational AI wrapper |
| `POST` | `/simulate` | Dry-run an intent |
| `GET` | `/schema/:intent` | Get schema for an intent |
| `WS` | `/subscribe` | Real-time events |

### Intent Request

```bash
curl -X POST http://localhost:3000/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "intent": "transfer:credits",
    "realm": "your-realm-id",
    "payload": {
      "from": "wallet-a",
      "to": "wallet-b",
      "amount": 100,
      "currency": "UBL"
    }
  }'
```

### Intent Response

```json
{
  "success": true,
  "outcome": {
    "type": "Transferred",
    "asset": "credit-123",
    "to": "wallet-b"
  },
  "events": [
    { "id": "evt-1", "type": "ContainerItemWithdrawn" },
    { "id": "evt-2", "type": "ContainerItemDeposited" }
  ],
  "affordances": [
    { "intent": "query:balance", "description": "Check balance" },
    { "intent": "transfer:credits", "description": "Transfer more" }
  ],
  "meta": {
    "processedAt": 1702389600000,
    "processingTime": 45
  }
}
```

### Chat API (Conversational)

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": { "text": "Transfer 100 credits to Bob" },
    "startSession": {
      "realmId": "your-realm",
      "actor": { "type": "Entity", "entityId": "user-123" }
    }
  }'
```

### WebSocket Subscriptions

```typescript
const ws = new WebSocket('ws://localhost:3000/subscribe');

ws.send(JSON.stringify({
  type: 'subscribe',
  realm: 'your-realm',
  filters: {
    eventTypes: ['TransactionExecuted', 'AgreementProposed'],
    entityIds: ['entity-123'],
  }
}));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

---

## Intent System

### Available Intents (12 modules, 100+ intents)

| Module | File | Key Intents |
|--------|------|-------------|
| **Entity** | `entity-intents.ts` | `register`, `update`, `deactivate` |
| **Agreement** | `agreement-intents.ts` | `propose`, `consent`, `fulfill`, `terminate` |
| **Asset** | `asset-intents.ts` | `register-asset`, `transfer`, `transition` |
| **Query** | `query-intents.ts` | `query`, `explain`, `simulate`, `what-can-i-do` |
| **Dispute** | `dispute-intents.ts` | `dispute:open`, `dispute:resolve` |
| **Auth** | `auth-intents.ts` | `delegate:auth` |
| **Workspace** | `workspace-intents.ts` | `file:create`, `file:move`, `file:delete` |
| **Admin** | `admin-intents.ts` | `realm:create`, `user:create`, `apikey:create` |
| **Agent Economy** | `agent-economy-intents.ts` | `register:agent`, `transfer:credits`, `record:trajectory` |
| **Perception** | `perception-intents.ts` | `create:watcher`, `register:shadow`, `promote:shadow` |
| **Consciousness** | `consciousness-intents.ts` | `start:daemon`, `stop:daemon`, `adjust:daemon-budget` |
| **Obligation** | `obligation-intents.ts` | `declare:obligation`, `fulfill:obligation` |

### Intent Definition

```typescript
interface Intent<T = unknown> {
  intent: string;           // What do you want to do?
  realm: EntityId;          // In which realm?
  actor: ActorReference;    // Who is making this intent?
  payload: T;               // Intent-specific data
  timestamp?: Timestamp;    // When (for offline-first)
  idempotencyKey?: string;  // Safe retries
}
```

### Creating Custom Intents

```typescript
import { defineIntent } from './core/api/intent-api';

const MY_CUSTOM_INTENT = defineIntent({
  name: 'my:custom-action',
  description: 'Does something custom',
  payloadSchema: {
    type: 'object',
    properties: {
      targetId: { type: 'string' },
      value: { type: 'number' },
    },
    required: ['targetId', 'value'],
  },
  handler: async (intent, context) => {
    // Your logic here
    return {
      success: true,
      outcome: { type: 'Created', entity: result, id: result.id },
      events: [],
      affordances: [],
    };
  },
});
```

---

## Core Modules

### Event Store

```typescript
import { createEventStore } from './core/store';

const store = createEventStore();

// Append event
await store.append(event);

// Query events
const events = await store.getByAggregate(aggregateId);
const events = await store.getByType('EntityCreated');
```

### Container Manager

```typescript
import { createContainerManager } from './core/universal';

const containers = createContainerManager({ eventStore });

// Create containers
const wallet = await containers.createWallet(name, actor, realmId);
const workspace = await containers.createWorkspace(name, actor, realmId);
const realm = await containers.createRealm(name, actor, parentRealmId);

// Operations
await containers.deposit(containerId, item, actor);
await containers.withdraw(containerId, itemId, quantity, actor);
await containers.transfer(sourceId, targetId, itemId, quantity, actor);
```

---

## Economy

### Fitness Function

```typescript
import { createFitnessCalculator, type FitnessInput } from './core/economy/fitness';

const calculator = createFitnessCalculator({
  weights: {
    financial: 0.25,
    reputation: 0.25,
    activity: 0.20,
    network: 0.15,
    longevity: 0.15,
  },
});

const input: FitnessInput = {
  balance: 1000n,
  totalEarned: 5000n,
  totalSpent: 4000n,
  reputationScore: 85,
  transactionCount: 100,
  activeConnections: 10,
  daysActive: 365,
  // ...
};

const score = calculator.calculate(input);
// score.composite: 0-100
// score.dimensions: { financial, reputation, activity, network, longevity }
```

### Guardian Scoring

```typescript
import { createGuardianScorer } from './core/economy/guardian-scoring';

const scorer = createGuardianScorer();

// Calculate guardian score
const score = scorer.calculate({
  scriptsManaged: 50,
  successRate: 0.95,
  averageResponseTime: 100,
  disputesWon: 8,
  disputesLost: 2,
  // ...
});

// Get ranking
const ranking = scorer.getRanking(10); // Top 10
```

---

## Enforcement

### Anomaly Detection

```typescript
import { createAnomalyDetector } from './core/enforcement/anomaly-detection';

const detector = createAnomalyDetector({
  zScoreThreshold: 3.0,
  velocityWindow: 3600000, // 1 hour
  velocityThreshold: 100,
});

// Check transaction
const result = detector.check({
  entityId,
  amount: 10000n,
  timestamp: Date.now(),
  type: 'Transfer',
});

if (result.isAnomaly) {
  console.log(result.reasons); // ['Statistical outlier', 'Velocity breach']
}
```

### Cartel Detection

```typescript
import { createCartelDetector } from './core/enforcement/cartel-detection';

const detector = createCartelDetector({
  minCycleLength: 3,
  maxCycleLength: 10,
  correlationThreshold: 0.8,
});

// Analyze transactions
const result = detector.analyze(transactions);

if (result.cartelsDetected > 0) {
  console.log(result.cycles);      // Circular trading patterns
  console.log(result.washTrades);  // Self-dealing
  console.log(result.coordinated); // Coordinated behavior
}
```

---

## Sessions

### Session Manager

```typescript
import { createSessionManager } from './core/sessions/session-manager';

const sessions = createSessionManager({
  maxSessionDuration: 24 * 60 * 60 * 1000, // 24 hours
  retentionPolicy: 'Standard',
});

// Create session
const session = sessions.create(entityId, metadata);

// Add message
sessions.addMessage(session.id, {
  role: 'user',
  content: 'Hello',
  timestamp: Date.now(),
});

// Right to Forget (GDPR)
sessions.forget(session.id);

// Terminate
sessions.terminate(session.id, 'UserRequested');
```

---

## Governance

### Three-Branch Governance

```typescript
import { createGovernanceCoordinator } from './core/governance/three-branch';

const gov = createGovernanceCoordinator();

// EXECUTIVE
const action = gov.proposeAction('policy-change', payload, executorId);
gov.executeAction(action.id, executorId);

// LEGISLATIVE
const proposal = gov.submitProposal('new-law', description, proposerId);
gov.castVote(proposal.id, voterId, 'For');
gov.castVote(proposal.id, voterId2, 'Against');
const result = gov.tallyVotes(proposal.id);

// JUDICIAL
const case_ = gov.fileCase('challenge', details, plaintiffId);
gov.issueRuling(case_.id, 'Unconstitutional', reasoning, judgeId);
gov.appeal(case_.id, grounds, appellantId);

// Cross-branch
gov.vetoProposal(proposal.id, reason, executiveId);
gov.overrideVeto(proposal.id); // Requires supermajority
```

### Monetary Policy

```typescript
import { createMonetaryPolicyEngine } from './core/governance/monetary-policy';

const centralBank = createMonetaryPolicyEngine({
  targetInflation: 0.02,      // 2%
  naturalRate: 0.025,         // 2.5%
  inflationWeight: 1.5,       // Taylor Rule coefficient
  outputWeight: 0.5,
  floorRate: 0,
  ceilingRate: 0.20,
});

// Taylor Rule calculation
const rate = centralBank.calculateTaylorRate({
  inflation: 0.03,
  outputGap: 0.01,
  unemployment: 0.04,
  moneySupply: 1000000n,
  creditGrowth: 0.05,
  assetPrices: 100,
  exchangeRate: 1,
  timestamp: Date.now(),
});

// Policy decision
const decision = centralBank.makeDecision(indicators);
// decision.type: 'RateChange' | 'QuantitativeEasing' | 'Hold'

// Open Market Operations
centralBank.executeOMO('Buy', 'Bond', 1000000n, 98.5);
centralBank.executeOMO('Sell', 'MBS', 500000n, 101.2);

// Emergency lending
const facility = centralBank.provideLending(borrowerId, amount, collateral, days);
centralBank.repayFacility(facility.id);
```

### Quadratic Funding

```typescript
import { createQuadraticFundingEngine } from './core/governance/quadratic-funding';

const qf = createQuadraticFundingEngine({
  matchingPool: 100000n,
  minContribution: 1n,
  maxContribution: 10000n,
  projectMatchingCap: 0.25, // 25% max per project
});

// Create round
const round = qf.createRound('Q1 2024', 'First quarter public goods');

// Submit project
const project = qf.submitProject(round.id, 'Open Source Tool', 'Description', ownerId);

// Contribute (quadratic formula: (Σ√cᵢ)²)
qf.contribute(project.id, donor1, 100n);
qf.contribute(project.id, donor2, 100n);
qf.contribute(project.id, donor3, 100n);
// 3 donors × √100 = 30, squared = 900 matched (vs 300 direct)

// Calculate results
const results = qf.calculateFunding(round.id);
// results[0].directContributions: 300n
// results[0].matchedAmount: ~900n (proportional to pool)
// results[0].totalFunding: ~1200n
```

---

## Interoperability

### UIS Gateway (Universal Interoperability Standard)

```typescript
import { createUISGateway } from './core/interop/uis-1.0';

const gateway = createUISGateway({
  realmId: myRealmId,
  publicKey: 'my-public-key',
  messageTTL: 3600000, // 1 hour
});

// Trust management
gateway.establishTrust({
  realmId: partnerRealmId,
  name: 'Partner Realm',
  publicKey: 'partner-key',
  endpoint: 'https://partner.example.com',
  trustLevel: 'Verified', // 'Full' | 'Verified' | 'Limited' | 'Untrusted'
  capabilities: ['EntityTransfer', 'AssetTransfer', 'CreditTransfer'],
});

gateway.updateTrustLevel(partnerRealmId, 'Full');
gateway.revokeTrust(partnerRealmId);

// Transfers
const transfer = gateway.initiateEntityTransfer(
  targetRealm,
  entityId,
  'Agent',
  entityData,
  'Migration reason'
);

const creditTransfer = gateway.initiateCreditTransfer(
  targetRealm,
  1000n,
  'UBL',
  fromWallet,
  toWallet,
  'Payment memo'
);

// Message handling
const response = await gateway.processMessage(incomingMessage);
```

### Federated Ledger

```typescript
import { createFederatedLedger } from './core/interop/federated-ledger';

const ledger = createFederatedLedger({
  realmId: myRealmId,
  syncIntervalMs: 60000,
  maxBatchSize: 1000,
  conflictStrategy: 'LastWriteWins', // 'FirstWriteWins' | 'SourcePriority' | 'Manual'
});

// Local operations
const fedEvent = ledger.appendLocal(event);
const events = ledger.getEventsSince(vectorClock);

// Sync operations
const request = ledger.createSyncRequest(remoteRealmId);
const response = remoteLedger.processSyncRequest(request);
const { applied, conflicts } = ledger.applySyncResponse(response, remoteRealmId);

// Conflict resolution
const unresolvedConflicts = ledger.getUnresolvedConflicts();
ledger.resolveConflict(conflictId, 'Local'); // or 'Remote'

// State queries
const clock = ledger.getVectorClock();
const state = ledger.getRealmState(realmId);
const stats = ledger.getStats();
```

---

## Benchmarking

### Benchmark Framework

```typescript
import { createBenchmarkEngine } from './core/benchmarking/benchmark-framework';

const benchmark = createBenchmarkEngine({
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
});

// Calculate score
const score = benchmark.calculate({
  // Survival
  totalAgents: 100,
  activeAgents: 90,
  newAgents: 10,
  exitedAgents: 5,
  averageLifespan: 365,
  
  // Equality
  giniCoefficient: 0.3,
  medianWealth: 1000n,
  meanWealth: 1200n,
  wealthTop10Percent: 0.3,
  wealthBottom10Percent: 0.05,
  
  // Resilience
  recentShocks: 1,
  recoveryTime: 5,
  systemUptime: 0.99,
  failedTransactions: 10,
  totalTransactions: 1000,
  
  // Efficiency
  resourceUtilization: 0.75,
  averageLatency: 50,
  throughput: 100,
  wastedResources: 0.05,
  
  // Innovation
  newFeatures: 5,
  adaptations: 3,
  experimentSuccess: 0.7,
  diversityIndex: 0.8,
});

// Results
console.log(score.composite);           // 0-100
console.log(score.status);              // 'Healthy' | 'Warning' | 'Critical'
console.log(score.dimensions.survival); // { value, raw, baseline, trend, components }
console.log(score.vsBaseline);          // % difference from baseline
console.log(score.vsPrevious);          // % difference from previous

// History & Reports
const history = benchmark.getHistory(30);
const report = benchmark.generateReport();
```

### Achievements

```typescript
import { createAchievementEngine, ACHIEVEMENTS } from './core/benchmarking/achievements';

const achievements = createAchievementEngine();

// Check progress (returns newly unlocked)
const unlocked = achievements.checkProgress(entityId, {
  days_active: 30,
  total_earned: 1000,
  balance: 500,
  connections: 10,
  entities_mentored: 3,
  // ...
});

// Query achievements
const all = achievements.getAllAchievements();           // Visible only
const allIncludingHidden = achievements.getAllAchievements(true);
const achievement = achievements.getAchievement('first-day');

// Entity progress
const entityUnlocked = achievements.getUnlockedAchievements(entityId);
const progress = achievements.getProgress(entityId);
const points = achievements.getTotalPoints(entityId);
const completion = achievements.getCompletionPercentage(entityId);

// Leaderboard
const leaderboard = achievements.getLeaderboard(10);
// [{ entityId, points, achievements }, ...]

// Built-in achievements include:
// Survival: first-day, survivor-week, survivor-month, survivor-year, immortal
// Economic: first-credit, hundred-club, thousand-club, millionaire, debt-free
// Social: first-connection, networker, influencer, mentor, philanthropist
// Resilience: comeback-kid, crisis-survivor, antifragile, pivot-master
// Innovation: experimenter, early-adopter, innovator, visionary
// Special: genesis, perfect-score, completionist (hidden)
```

---

## Simulation

### Chaos Injector

```typescript
import { CHAOS_SCENARIOS, ChaosInjector } from './core/simulation/chaos-injector';

// Available scenarios by tier:

// TIER 1: Basic disruptions
CHAOS_SCENARIOS.MODEL_RELEASE      // GPT-5 drops, 80% obsolescence
CHAOS_SCENARIOS.MARKET_CRASH       // 60% demand drop
CHAOS_SCENARIOS.CARTEL_FORMATION   // 3 guardians form cartel
CHAOS_SCENARIOS.TREASURY_BUG       // 10000x mint bug
CHAOS_SCENARIOS.MASS_DEFAULT       // 30% simultaneous defaults

// TIER 2: Cascading failures
CHAOS_SCENARIOS.FLASH_CRASH        // 80% demand drop in 1 day
CHAOS_SCENARIOS.BANK_RUN           // 90% withdrawal rate
CHAOS_SCENARIOS.CREDIT_FREEZE      // No new loans
CHAOS_SCENARIOS.CONTAGION_PANIC    // Mood collapse

// TIER 3: Existential risks
CHAOS_SCENARIOS.AGI_SINGULARITY    // 99% obsolescence
CHAOS_SCENARIOS.DEFLATION_TRAP     // Deflationary spiral

// TIER 5: Systemic collapse
CHAOS_SCENARIOS.COMMONS_COLLAPSE   // Tragedy of the commons
CHAOS_SCENARIOS.CARTEL_TAKEOVER    // 80% market control
CHAOS_SCENARIOS.HYPERINFLATION     // 1000% inflation
CHAOS_SCENARIOS.GOVERNANCE_DEADLOCK// Complete gridlock

// Positive scenarios
CHAOS_SCENARIOS.DEMAND_BOOM        // 3x demand
CHAOS_SCENARIOS.GOLDEN_AGE         // Sustained prosperity
CHAOS_SCENARIOS.TALENT_INFLUX      // High quality new scripts
CHAOS_SCENARIOS.TREASURY_WINDFALL  // Unexpected surplus
```

### Scenario Runner

```typescript
import { ENHANCED_SCENARIOS, ScenarioRunner } from './core/simulation/scenario-runner-v2';

// Pre-built scenarios
ENHANCED_SCENARIOS.REALISTIC_BASELINE     // 1 year normal
ENHANCED_SCENARIOS.REALISTIC_DISRUPTION   // 5 years with GPT-5
ENHANCED_SCENARIOS.DEATH_SPIRAL           // Cascading failures
ENHANCED_SCENARIOS.REALISTIC_APOCALYPSE   // 5 years of chaos
ENHANCED_SCENARIOS.BLACK_MONDAY           // Flash crash cascade
ENHANCED_SCENARIOS.GOLDEN_AGE             // 3 years prosperity
ENHANCED_SCENARIOS.BOOM_BUST              // Prosperity then crash

// TIER 3 scenarios
ENHANCED_SCENARIOS.SINGULARITY_EVENT      // AGI emergence
ENHANCED_SCENARIOS.DEFLATION_SPIRAL       // Deflationary trap

// TIER 5 scenarios
ENHANCED_SCENARIOS.TOTAL_COLLAPSE         // All systems fail
ENHANCED_SCENARIOS.HOSTILE_TAKEOVER       // Cartel dominance
```

---

## Type Reference

### Common Types

```typescript
// Identifiers
type EntityId = string & { readonly __brand: unique symbol };
type Timestamp = number; // Unix epoch ms

// Actors
type ActorReference = 
  | { type: 'Entity'; entityId: EntityId }
  | { type: 'System'; systemId: string };

// Health Status
type HealthStatus = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';

// Trust Levels
type TrustLevel = 'Full' | 'Verified' | 'Limited' | 'Untrusted';

// Achievement Tiers
type AchievementTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Legendary';

// Conflict Resolution
type ConflictStrategy = 'LastWriteWins' | 'FirstWriteWins' | 'SourcePriority' | 'Manual';
```

---

## Error Handling

All modules throw descriptive errors:

```typescript
try {
  gateway.initiateCreditTransfer(untrustedRealm, 1000n, 'UBL', from, to);
} catch (error) {
  // Error: Credit transfer requires Full trust
}

try {
  qf.contribute(projectId, donorId, 50000n);
} catch (error) {
  // Error: Contribution above maximum (10000)
}
```

---

*For more details, see the source code and inline documentation in each module.*
