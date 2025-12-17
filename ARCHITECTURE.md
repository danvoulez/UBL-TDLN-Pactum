# Universal Business Ledger - Architecture

> **174 arquivos TypeScript | 42 módulos | 551 testes**
> 
> **Última atualização:** 2025-12-12

---

## Visão Geral

O UBL é um **sistema operacional para negócios** baseado em event sourcing. Dois princípios fundamentais:

1. **Todo relacionamento é um Agreement**
2. **Toda fronteira de governança é um Container**

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         UNIVERSAL BUSINESS LEDGER                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   Events ───▶ Agreements ───▶ Containers ───▶ Permissions ───▶ Actions        ║
║     │             │               │               │               │            ║
║     ▼             ▼               ▼               ▼               ▼            ║
║  IMUTÁVEL     UNIVERSAL       FRACTAL       CONTEXTUAL       AUDITADO         ║
║   FATOS       CONTRATOS      FRONTEIRAS     SEGURANÇA        MEMÓRIA          ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## Estrutura de Módulos

```
core/                           # 174 arquivos TypeScript
│
├── shared/                     # PRIMITIVOS UNIVERSAIS
│   ├── types.ts               # EntityId, Timestamp, Duration, Validity
│   └── index.ts               # Exports
│
├── schema/                     # MODELO DE DOMÍNIO
│   ├── ledger.ts              # Event, Party, Asset, Agreement, Role
│   ├── workflow.ts            # Workflow, Flow definitions
│   ├── agent-economy.ts       # Entity, Guardian, Constitution, Wallet, Loan
│   ├── perception.ts          # Watcher, ShadowEntity
│   ├── consciousness.ts       # Daemon, DaemonLoop
│   └── unilateral-obligations.ts # Obligations, Reasoning
│
├── universal/                  # MODELO GENERALIZADO
│   ├── primitives.ts          # Entity, Agreement, Role
│   ├── container.ts           # Container primitive + physics
│   ├── container-manager.ts   # Unified ContainerManager
│   ├── bootstrap.ts           # System initialization
│   ├── agreement-types.ts     # 15+ agreement types registry
│   ├── agreement-hooks-processor.ts # Lifecycle hooks
│   └── physics-validation.ts  # Physics enforcement
│
├── store/                      # PERSISTÊNCIA
│   ├── event-store.ts         # In-memory EventStore
│   ├── postgres-event-store.ts # PostgreSQL implementation
│   ├── create-event-store.ts  # Factory
│   ├── event-batcher.ts       # High-frequency batching
│   ├── snapshots.ts           # Temporal snapshots
│   ├── projection-cache.ts    # Read model cache
│   ├── projections-manager.ts # Projection lifecycle
│   └── postgres-schema.sql    # Database schema
│
├── aggregates/                 # RECONSTRUÇÃO DE ESTADO
│   ├── rehydrators.ts         # Event → State functions
│   ├── wallet-aggregate.ts    # Balance from events
│   ├── loan-aggregate.ts      # Loan status tracking
│   └── trajectory-aggregate.ts # Agent action history
│
├── api/                        # CAMADA DE INTERFACE
│   ├── intent-api.ts          # Intent-driven API
│   ├── http-server.ts         # Express server
│   ├── query-language.ts      # QueryBuilder
│   ├── realtime.ts            # WebSocket + SSE
│   ├── validators.ts          # Input validation
│   ├── errors.ts              # Error types
│   ├── intent-handlers/       # Handler implementations
│   └── intents/
│       └── agent-economy-intents.ts # 1000+ lines of intents
│
├── security/                   # AUTORIZAÇÃO
│   ├── authorization.ts       # ABAC engine
│   ├── authentication.ts      # JWT, API keys
│   ├── policies.ts            # Policy engine
│   ├── hash-chain.ts          # Cryptographic chain
│   ├── replay-prevention.ts   # Anti-replay
│   ├── signatures.ts          # Digital signatures
│   └── audit-integration.ts   # Security audit
│
├── economy/                    # SISTEMA ECONÔMICO
│   ├── fitness.ts             # Multi-dimensional fitness scoring
│   ├── guardian-scoring.ts    # Guardian reputation + tiers
│   ├── circuit-breaker.ts     # Market circuit breakers
│   ├── gatekeeper.ts          # Economic gatekeeper
│   ├── guarantee-fund.ts      # Stabilization fund
│   ├── floating-rate.ts       # Dynamic interest rates
│   ├── macroeconomic-bands.ts # Economic bands
│   └── health-monitor.ts      # System health
│
├── enforcement/                # DETECÇÃO DE FRAUDE
│   ├── anomaly-detection.ts   # Statistical outliers (3σ)
│   ├── cartel-detection.ts    # Graph-based collusion
│   └── invariants.ts          # Business invariants
│
├── sessions/                   # GESTÃO DE SESSÕES
│   └── session-manager.ts     # Lifecycle + Right to Forget (GDPR)
│
├── governance/                 # GOVERNANÇA
│   ├── three-branch.ts        # Executive/Legislative/Judicial
│   ├── monetary-policy.ts     # Taylor Rule, OMOs, lending
│   └── quadratic-funding.ts   # Public goods funding
│
├── interop/                    # INTEROPERABILIDADE
│   ├── uis-1.0.ts             # Universal Interoperability Standard
│   └── federated-ledger.ts    # Vector clocks, Merkle trees, sync
│
├── benchmarking/               # MÉTRICAS E GAMIFICAÇÃO
│   ├── benchmark-framework.ts # 5-dimension health scoring
│   └── achievements.ts        # 30+ achievements, 6 tiers
│
├── simulation/                 # CHAOS ENGINEERING
│   ├── chaos-injector.ts      # TIER 1-5 chaos scenarios
│   ├── scenario-runner-v2.ts  # Multi-year simulation
│   ├── scenario-runner.ts     # Basic runner
│   ├── simulation-clock.ts    # Time simulation
│   ├── market-dynamics.ts     # Market simulation
│   ├── agent-population.ts    # Agent population
│   ├── realistic-behaviors.ts # Behavioral models
│   ├── treasury-fund.ts       # Treasury simulation
│   ├── guardian-accountability.ts # Guardian penalties
│   └── health-dashboard.ts    # Real-time health
│
├── agent/                      # AGENTE IA
│   ├── conversation.ts        # Conversation management
│   ├── api.ts                 # Agent API
│   ├── primitives.ts          # Agent primitives
│   ├── rich-interface.ts      # Rich responses
│   └── messages/              # Message types
│
├── cognition/                  # COGNIÇÃO
│   └── memory.ts              # Agent memory
│
├── consciousness/              # CONSCIÊNCIA
│   └── continuity.ts          # Provider continuity
│
├── trajectory/                 # AUDIT TRAIL
│   ├── trace.ts               # Trace tracking
│   ├── event-store-trace.ts   # AuditLogger
│   ├── logger.ts              # Trajectory logger
│   └── path.ts                # Path utilities
│
├── distributed/                # DISTRIBUÍDO
│   ├── saga.ts                # Saga pattern
│   ├── saga-coordinator-impl.ts # Coordinator
│   └── cross-realm-saga.ts    # Cross-realm operations
│
├── transactions/               # TRANSAÇÕES
│   └── intent-transaction.ts  # Saga transactions + compensation
│
├── engine/                     # EXECUÇÃO
│   ├── workflow-engine.ts     # State machine executor
│   └── flow-orchestrator.ts   # Complex orchestration
│
├── scheduling/                 # AGENDAMENTO
│   ├── scheduler.ts           # Scheduler interface
│   ├── scheduler-impl.ts      # Implementation
│   ├── lock.ts                # Distributed locks
│   └── idempotency.ts         # Idempotency keys
│
├── templates/                  # TEMPLATES
│   ├── registry.ts            # Template registry
│   └── index.ts               # Exports
│
├── adapters/                   # INTEGRAÇÕES EXTERNAS
│   ├── openai.ts              # OpenAI adapter
│   ├── anthropic.ts           # Anthropic adapter
│   ├── postgres.ts            # PostgreSQL adapter
│   ├── stripe.ts              # Stripe payments
│   ├── sendgrid.ts            # SendGrid email
│   ├── slack.ts               # Slack notifications
│   ├── twilio.ts              # Twilio SMS
│   ├── auth0.ts               # Auth0 authentication
│   └── standards/             # Standard adapters
│
├── outbound/                   # SAÍDA
│   └── integrations.ts        # Webhooks, notifications
│
├── search/                     # BUSCA
│   ├── engine.ts              # Search engine
│   ├── indexer.ts             # Event indexer
│   └── fake-search-engine.ts  # Test implementation
│
├── sandbox/                    # SANDBOX
│   ├── storage.ts             # Sandbox storage
│   ├── git-adapter.ts         # Git integration
│   ├── git-adapters/          # Git providers
│   └── runtimes/              # Execution runtimes
│
├── evolution/                  # EVOLUÇÃO
│   └── versioning.ts          # Schema versioning
│
├── performance/                # PERFORMANCE
│   └── snapshots.ts           # Snapshot management
│
├── attachments/                # ANEXOS
│   └── documents.ts           # Document management
│
├── operational/                # OPERACIONAL
│   ├── governance.ts          # Rate limits, quotas
│   ├── governance-evaluator.ts # Policy evaluation
│   ├── export-service.ts      # Data export
│   ├── data-retention.ts      # Retention policies
│   └── rate-limiter-redis.ts  # Redis rate limiter
│
├── observability/              # OBSERVABILIDADE
│   ├── logger.ts              # Structured logging
│   └── metrics.ts             # Metrics collection
│
├── testing/                    # TESTING
│   └── harness.ts             # Test harness
│
├── config/                     # CONFIGURAÇÃO
│   ├── types.ts               # Config types
│   └── errors.ts              # Config errors
│
└── db/                         # DATABASE
    ├── connection.ts          # Connection management
    ├── migrations.ts          # Migration runner
    ├── validators.ts          # DB validators
    └── errors.ts              # DB errors
```

---

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTENT                                          │
│   POST /intent { intent: "transfer:credits", payload: { ... } }             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTENT API                                         │
│   1. Validate payload (validators.ts)                                       │
│   2. Check authorization (ABAC)                                             │
│   3. Route to handler (intent-handlers/)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONTAINER MANAGER                                     │
│   1. Get source container                                                   │
│   2. Get destination container                                              │
│   3. Validate physics (Strict → must Move, not Copy)                        │
│   4. Execute operation                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVENT STORE                                        │
│   1. Append: ContainerItemWithdrawn                                         │
│   2. Append: ContainerItemDeposited                                         │
│   - hash: sha256(previous + this)                                           │
│   - aggregateVersion: calculated                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RESPONSE                                           │
│   { success: true, outcome: { type: "Transferred" } }                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Módulos por Categoria

### 🏛️ Core (Fundação)
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `shared` | 2 | Tipos primitivos universais |
| `schema` | 6 | Modelo de domínio |
| `universal` | 7 | Containers, agreements, realms |
| `store` | 9 | Event sourcing + persistence |
| `aggregates` | 5 | Reconstrução de estado |

### 🔐 Security
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `security` | 8 | ABAC, policies, crypto |
| `enforcement` | 3 | Anomaly + cartel detection |

### 💰 Economy
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `economy` | 8 | Fitness, rates, circuit breakers |
| `governance` | 3 | Three-branch, monetary, quadratic |

### 🌐 Integration
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `interop` | 2 | UIS 1.0, federated ledger |
| `adapters` | 11 | External services |
| `outbound` | 2 | Webhooks, notifications |

### 🤖 Agent
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `agent` | 6 | AI conversation |
| `cognition` | 2 | Memory |
| `consciousness` | 1 | Continuity |

### 📊 Observability
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `observability` | 3 | Logging, metrics |
| `trajectory` | 5 | Audit trail |
| `benchmarking` | 2 | Health metrics, achievements |

### 🔥 Simulation
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `simulation` | 12 | Chaos engineering, scenarios |

### ⚙️ Infrastructure
| Módulo | Arquivos | Propósito |
|--------|----------|-----------|
| `api` | 9 | HTTP, intents, queries |
| `engine` | 2 | Workflow execution |
| `distributed` | 4 | Sagas, cross-realm |
| `transactions` | 1 | Intent transactions |
| `scheduling` | 5 | Time-based triggers |
| `sessions` | 1 | Session management |

---

## Tipos de Agreement (15+)

```typescript
// core/universal/agreement-types.ts
const AGREEMENT_TYPES = {
  // Core
  EMPLOYMENT_TYPE,
  SERVICE_TYPE,
  SALE_TYPE,
  LEASE_TYPE,
  LICENSE_TYPE,
  
  // Agent Economy
  GUARDIANSHIP_TYPE,
  STARTER_LOAN_TYPE,
  WATCHER_SUBSCRIPTION_TYPE,
  DAEMON_BUDGET_TYPE,
  
  // Governance
  MEMBERSHIP_TYPE,
  AUTHORIZATION_TYPE,
  TESTIMONY_TYPE,
  
  // Sessions
  SESSION_TYPE,
  
  // Custom
  CUSTOM_TYPE,
};
```

---

## Chaos Scenarios (TIER 1-5)

```typescript
// core/simulation/chaos-injector.ts
TIER 1: Basic Disruptions
  - MODEL_RELEASE (GPT-5 drops)
  - MARKET_CRASH (60% demand drop)
  - CARTEL_FORMATION
  - TREASURY_BUG
  - MASS_DEFAULT

TIER 2: Cascading Failures
  - FLASH_CRASH (80% in 1 day)
  - BANK_RUN (90% withdrawal)
  - CREDIT_FREEZE
  - CONTAGION_PANIC

TIER 3: Existential Risks
  - AGI_SINGULARITY (99% obsolescence)
  - DEFLATION_TRAP

TIER 5: Systemic Collapse
  - COMMONS_COLLAPSE
  - CARTEL_TAKEOVER (80% control)
  - HYPERINFLATION (1000%)
  - GOVERNANCE_DEADLOCK
```

---

## Benchmark Dimensions

```typescript
// core/benchmarking/benchmark-framework.ts
dimensions: {
  survival: 0.25,    // Agent survival rate
  equality: 0.20,    // Gini coefficient
  resilience: 0.25,  // Recovery time
  efficiency: 0.15,  // Resource utilization
  innovation: 0.15,  // Adaptation rate
}

status: 'Healthy' | 'Warning' | 'Critical'
```

---

## Achievement Tiers

```typescript
// core/benchmarking/achievements.ts
tiers: Bronze → Silver → Gold → Platinum → Diamond → Legendary

categories: [
  'Survival',    // first-day, survivor-week, immortal
  'Economic',    // first-credit, millionaire, debt-free
  'Social',      // networker, influencer, philanthropist
  'Resilience',  // comeback-kid, antifragile
  'Innovation',  // experimenter, visionary
  'Special',     // genesis, completionist (hidden)
]

total: 30+ achievements
```

---

## Governance Model

```typescript
// core/governance/three-branch.ts
Executive:
  - proposeAction()
  - executeAction()
  - vetoProposal()

Legislative:
  - submitProposal()
  - castVote()
  - tallyVotes()
  - overrideVeto()

Judicial:
  - fileCase()
  - issueRuling()
  - appeal()
```

---

## Cross-Realm Protocol (UIS 1.0)

```typescript
// core/interop/uis-1.0.ts
Trust Levels: Full | Verified | Limited | Untrusted

Capabilities:
  - EntityTransfer
  - AssetTransfer
  - CreditTransfer
  - MessageRelay

// core/interop/federated-ledger.ts
Sync: Vector clocks + Merkle trees
Conflict: LastWriteWins | FirstWriteWins | SourcePriority | Manual
```

---

## Estatísticas

| Métrica | Valor |
|---------|-------|
| **Arquivos TypeScript** | 174 |
| **Módulos (pastas)** | 42 |
| **Testes** | 551 |
| **Testes passando** | 541 (98.2%) |
| **Linhas de código** | ~50,000+ |

---

## Documentação Relacionada

- [TRUST-ARCHITECTURE.md](./docs/TRUST-ARCHITECTURE.md) — 🔐 Arquitetura de segurança e defesas
- [API-REFERENCE.md](./docs/API-REFERENCE.md) — Referência da API
- [COOKBOOK.md](./docs/COOKBOOK.md) — Exemplos práticos

---

*"The ledger doesn't model business. The ledger **is** business—formalized."*
