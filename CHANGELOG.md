# Changelog

All notable changes to the Universal Business Ledger project.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

#### Sprint D: Economy + Security + Sessions + Scenarios

**D.1 Economy Core**
- `core/economy/fitness.ts` - Multi-dimensional fitness scoring
  - 5 dimensions: Financial, Reputation, Activity, Network, Longevity
  - Configurable weights and normalization
  - Trend tracking and history
- `core/economy/guardian-scoring.ts` - Guardian reputation system
  - Performance metrics and ranking
  - Dispute resolution tracking
  - Tier-based classification

**D.2 Security Advanced**
- `core/enforcement/anomaly-detection.ts` - Statistical anomaly detection
  - Z-score based outlier detection
  - Velocity breach detection
  - Magnitude spike detection
  - Circuit breaker with cooldowns
- `core/enforcement/cartel-detection.ts` - Graph-based collusion detection
  - Circular trading (cycle) detection
  - Wash trading identification
  - Coordinated behavior analysis

**D.3 Session Materialization**
- `core/sessions/session-manager.ts` - Session lifecycle management
  - Session creation and termination
  - Message handling with retention policies
  - "Right to Forget" (GDPR compliance)
  - Session statistics and cleanup
- `core/universal/agreement-types.ts` - Added `SESSION_TYPE`

**D.4 Advanced Scenarios**
- `core/simulation/chaos-injector.ts` - Extended chaos scenarios
  - TIER 3: AGI_SINGULARITY, DEFLATION_TRAP
  - TIER 5: COMMONS_COLLAPSE, CARTEL_TAKEOVER, HYPERINFLATION, GOVERNANCE_DEADLOCK
- `core/simulation/scenario-runner-v2.ts` - Extended scenario configurations
  - SINGULARITY_EVENT, DEFLATION_SPIRAL
  - TOTAL_COLLAPSE, HOSTILE_TAKEOVER

#### Sprint E: Governance + Cross-Realm

**E.1 Three-Branch Governance**
- `core/governance/three-branch.ts` - Separation of powers
  - Executive branch: Actions, execution, vetoes
  - Legislative branch: Proposals, voting, laws
  - Judicial branch: Cases, rulings, appeals
  - Cross-branch checks and balances
- `core/governance/monetary-policy.ts` - Central bank operations
  - Taylor Rule rate calculation
  - Open Market Operations (OMOs)
  - Discount window lending
  - Policy decision tracking
- `core/governance/quadratic-funding.ts` - Public goods funding
  - Funding rounds management
  - Project submissions
  - Quadratic formula: (Σ√cᵢ)²
  - Sybil resistance via contributor grouping
  - Project matching caps

**E.2 Cross-Realm Interoperability**
- `core/interop/uis-1.0.ts` - Universal Interoperability Standard
  - Trust management (Full/Verified/Limited/Untrusted)
  - Message protocol with signatures and TTL
  - Entity, asset, and credit transfers
  - Handshake and capability negotiation
- `core/interop/federated-ledger.ts` - Multi-realm synchronization
  - Vector clocks for causality tracking
  - Merkle trees for efficient sync
  - Conflict detection and resolution
  - Multiple strategies: LastWriteWins, FirstWriteWins, SourcePriority, Manual

#### Sprint F: Benchmarking + Achievements

**F.1 Benchmark Framework**
- `core/benchmarking/benchmark-framework.ts` - System health metrics
  - 5 dimensions: Survival, Equality, Resilience, Efficiency, Innovation
  - Composite scoring with configurable weights
  - Health status determination (Healthy/Warning/Critical)
  - History tracking and trend analysis
  - Report generation with recommendations

**F.2 Achievement System**
- `core/benchmarking/achievements.ts` - Gamification system
  - 30+ built-in achievements
  - 6 categories: Survival, Economic, Social, Resilience, Innovation, Special
  - 6 tiers: Bronze → Silver → Gold → Platinum → Diamond → Legendary
  - Progress tracking and prerequisites
  - Points system and leaderboards
  - Custom achievement support

#### Sprint Final: Documentation

**Final.1 Documentation**
- Updated `ARCHITECTURE.md` with all new modules
- Updated `README.md` with advanced features
- Created `docs/API-REFERENCE.md` - Complete API reference

### Tests Added

- `tests/business/economy/fitness.test.ts`
- `tests/business/economy/guardian-scoring.test.ts`
- `tests/business/enforcement/anomaly-detection.test.ts`
- `tests/business/enforcement/cartel-detection.test.ts`
- `tests/business/sessions/session-manager.test.ts`
- `tests/business/governance/three-branch.test.ts`
- `tests/business/governance/monetary-policy.test.ts`
- `tests/business/governance/quadratic-funding.test.ts`
- `tests/business/interop/uis.test.ts`
- `tests/business/interop/federated-ledger.test.ts`
- `tests/business/benchmarking/benchmark-framework.test.ts`
- `tests/business/benchmarking/achievements.test.ts`

### Statistics

- **Total tasks completed:** 114
- **Tasks pending:** 63
- **Progress:** 64%
- **Tests passing:** 541

---

## [0.1.0] - Previous Release

### Foundation (Sprint A-C)

- Event sourcing with cryptographic hash chain
- Agreement-first domain model
- Container primitive with physics
- Multi-tenant realms
- Intent-driven API
- Agreement-Based Access Control (ABAC)
- Temporal queries
- PostgreSQL event store
- Workflow engine
- Saga orchestration

---

## Migration Guide

### From 0.1.0 to Current

No breaking changes. All new modules are additive.

To use new features:

```typescript
// Governance
import { createGovernanceCoordinator } from './core/governance/three-branch';
import { createMonetaryPolicyEngine } from './core/governance/monetary-policy';
import { createQuadraticFundingEngine } from './core/governance/quadratic-funding';

// Interop
import { createUISGateway } from './core/interop/uis-1.0';
import { createFederatedLedger } from './core/interop/federated-ledger';

// Benchmarking
import { createBenchmarkEngine } from './core/benchmarking/benchmark-framework';
import { createAchievementEngine } from './core/benchmarking/achievements';

// Economy
import { createFitnessCalculator } from './core/economy/fitness';
import { createGuardianScorer } from './core/economy/guardian-scoring';

// Enforcement
import { createAnomalyDetector } from './core/enforcement/anomaly-detection';
import { createCartelDetector } from './core/enforcement/cartel-detection';

// Sessions
import { createSessionManager } from './core/sessions/session-manager';
```

---

## Roadmap

### Upcoming

- **Final.2 TypeScript Cleanup** - Resolve all TypeScript errors
- **Final.3 Quality Gates** - 100% test coverage for new modules
- **Performance Optimization** - Profiling and optimization pass
- **Production Hardening** - Error handling, logging, monitoring

### Future Sprints

- Cross-realm federation in production
- Real-time sync via WebSocket
- Advanced conflict resolution UI
- Achievement notifications
- Benchmark dashboards
