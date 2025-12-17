<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Event_Sourcing-FF6B6B?style=for-the-badge" alt="Event Sourcing"/>
  <img src="https://img.shields.io/badge/174_Files-green?style=for-the-badge" alt="174 Files"/>
  <img src="https://img.shields.io/badge/551_Tests-blue?style=for-the-badge" alt="551 Tests"/>
</p>

<h1 align="center">📜 Universal Business Ledger</h1>

<p align="center">
  <strong>Sistema operacional para negócios baseado em event sourcing.</strong>
</p>

<p align="center">
  <em>"Todo relacionamento é um Agreement. Toda fronteira é um Container."</em>
</p>

---

## O Que É

UBL é um **ledger universal** que pode modelar qualquer domínio de negócio:

- **174 arquivos TypeScript** em 42 módulos
- **551 testes** (98.2% passando)
- **Event sourcing** com hash chain criptográfico
- **Agreement-first** - todo relacionamento é um contrato

---

## Módulos Principais

### 🏛️ Core
| Módulo | Propósito |
|--------|-----------|
| `core/universal/` | Containers, Agreements, Realms |
| `core/store/` | Event Store (PostgreSQL + In-memory) |
| `core/schema/` | Domain model (Entity, Asset, Agreement) |
| `core/aggregates/` | State reconstruction |
| `core/api/` | Intent-driven API |

### 💰 Economy
| Módulo | Propósito |
|--------|-----------|
| `core/economy/` | Fitness scoring, circuit breakers, rates |
| `core/governance/` | Three-branch, monetary policy, quadratic funding |

### 🔐 Security
| Módulo | Propósito |
|--------|-----------|
| `core/security/` | ABAC, policies, crypto, signatures |
| `core/enforcement/` | Anomaly detection, cartel detection |

### 🌐 Integration
| Módulo | Propósito |
|--------|-----------|
| `core/interop/` | UIS 1.0, federated ledger |
| `core/adapters/` | OpenAI, Stripe, Slack, etc. |

### 🤖 Agent
| Módulo | Propósito |
|--------|-----------|
| `core/agent/` | AI conversation |
| `core/sessions/` | Session management + GDPR |

### 📊 Observability
| Módulo | Propósito |
|--------|-----------|
| `core/benchmarking/` | Health metrics, achievements |
| `core/simulation/` | Chaos engineering (TIER 1-5) |

---

## Quick Start

```bash
# Clone
git clone https://github.com/danvoulez/UBL.git
cd UBL

# Install
npm install

# Test
npm test

# Build
npm run build
```

---

## Exemplo: Transfer de Créditos

```typescript
import { createContainerManager } from './core/universal';

const containers = createContainerManager({ eventStore });

// Criar wallets
const walletA = await containers.createWallet('Alice', actor, realmId);
const walletB = await containers.createWallet('Bob', actor, realmId);

// Depositar
await containers.deposit(walletA.id, { 
  id: 'credit-1', 
  type: 'Asset', 
  quantity: { amount: 1000, unit: 'UBL' } 
}, actor);

// Transferir
await containers.transfer(walletA.id, walletB.id, 'credit-1', { amount: 100, unit: 'UBL' }, actor);
```

---

## Exemplo: Governance

```typescript
import { createGovernanceCoordinator } from './core/governance/three-branch';

const gov = createGovernanceCoordinator();

// Proposta legislativa
const proposal = gov.submitProposal('new-policy', 'Description', proposerId);

// Votação
gov.castVote(proposal.id, voter1, 'For');
gov.castVote(proposal.id, voter2, 'For');
gov.castVote(proposal.id, voter3, 'Against');

// Resultado
const result = gov.tallyVotes(proposal.id);
// { for: 2, against: 1, abstain: 0, passed: true }
```

---

## Exemplo: Benchmarking

```typescript
import { createBenchmarkEngine } from './core/benchmarking/benchmark-framework';

const benchmark = createBenchmarkEngine();

const score = benchmark.calculate({
  totalAgents: 100,
  activeAgents: 90,
  giniCoefficient: 0.3,
  recoveryTime: 5,
  // ...
});

console.log(score.composite);  // 0-100
console.log(score.status);     // 'Healthy' | 'Warning' | 'Critical'
```

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| [PHILOSOPHY.md](./PHILOSOPHY.md) | Fundação filosófica |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Estrutura completa (42 módulos) |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | X-ray técnico |
| [ROADMAP.md](./ROADMAP.md) | Status do projeto |
| [CHANGELOG.md](./CHANGELOG.md) | Histórico de versões |
| [docs/API-REFERENCE.md](./docs/API-REFERENCE.md) | Referência da API |
| [docs/COOKBOOK.md](./docs/COOKBOOK.md) | Exemplos práticos |
| [docs/TRUST-ARCHITECTURE.md](./docs/TRUST-ARCHITECTURE.md) | 🔐 Arquitetura de segurança |

---

## Estatísticas

| Métrica | Valor |
|---------|-------|
| **Arquivos TypeScript** | 174 |
| **Módulos** | 42 |
| **Testes** | 551 |
| **Passando** | 541 (98.2%) |
| **Agreement Types** | 15+ |
| **Chaos Scenarios** | TIER 1-5 |
| **Achievements** | 30+ |

---

## Features Avançadas

### 🏛️ Three-Branch Governance
- Executive, Legislative, Judicial
- Veto e override
- Checks and balances

### 💰 Monetary Policy
- Taylor Rule
- Open Market Operations
- Lending facilities

### 🌱 Quadratic Funding
- Public goods funding
- Democratic matching
- Sybil resistance

### 🌐 Cross-Realm (UIS 1.0)
- Trust levels
- Entity/Asset/Credit transfers
- Federated ledger sync

### 📊 Benchmarking
- 5 dimensions: Survival, Equality, Resilience, Efficiency, Innovation
- Health status tracking
- Trend analysis

### 🏆 Achievements
- 30+ achievements
- 6 tiers: Bronze → Legendary
- Leaderboards

### 🔥 Chaos Engineering
- TIER 1: Market crash, cartel formation
- TIER 3: AGI singularity, deflation trap
- TIER 5: Systemic collapse, hyperinflation

---

## License

MIT License - see [LICENSE](./LICENSE)

---

<p align="center">
  <em>"The ledger doesn't model business. The ledger <strong>is</strong> business—formalized."</em>
</p>
