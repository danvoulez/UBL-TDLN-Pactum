# 🧪 Estratégia de Testes - Universal Business Ledger

**Data:** 2025-12-07  
**Status:** 📋 **PROPOSTA**  
**Objetivo:** Definir estratégia completa de testes unitários e de integração para UBL

---

## 🎯 Visão Geral

O UBL é um sistema complexo baseado em Event Sourcing com múltiplas camadas. A estratégia de testes deve cobrir:

1. **Testes Unitários** - Funções puras, utilitários, validações
2. **Testes de Integração** - Fluxos completos, interações entre módulos
3. **Testes de Event Sourcing** - Time-travel, fixtures, propriedades
4. **Testes de API** - Endpoints HTTP, WebSocket
5. **Testes de Performance** - Latência, throughput
6. **Testes Filosóficos** ⭐ - Validação dos 5 princípios fundamentais do UBL

> **IMPORTANTE:** Os testes não são apenas sobre funcionalidade—são sobre validar que o sistema mantém sua **integridade filosófica**. Ver [`FILOSOFIA-E-TESTES.md`](./FILOSOFIA-E-TESTES.md) para detalhes.

---

## 📊 Análise da Codebase

### **Módulos Identificados:**

#### **Core (Lógica de Negócio):**
- `core/shared/` - Primitivos (IDs, timestamps, tipos)
- `core/schema/` - Modelos de domínio (Event, Agreement, Asset, Role)
- `core/universal/` - Primitivos universais (Entity, Agreement, Realm)
- `core/enforcement/` - Invariantes, hash chain, validações temporais
- `core/aggregates/` - Re-hidratação de estado
- `core/engine/` - Workflow engine, flow orchestrator
- `core/security/` - Autenticação, autorização, políticas

#### **Store (Persistência):**
- `core/store/event-store.ts` - Interface do event store
- `core/store/postgres-event-store.ts` - Implementação PostgreSQL
- `core/store/create-event-store.ts` - Factory
- `core/store/projections-manager.ts` - Gerenciamento de projeções

#### **API (Interface):**
- `core/api/intent-api.ts` - Intent-driven API
- `core/api/intent-handlers/` - Handlers de intents
- `core/api/query-language.ts` - Query builder
- `core/api/realtime.ts` - WebSocket, SSE
- `antenna/server.ts` - Servidor HTTP

#### **Adapters (Integrações):**
- `core/adapters/` - S3, Stripe, Auth0, LLMs, etc.
- `sdk/` - SDKs para serviços externos

#### **Utilitários:**
- `core/testing/harness.ts` - Utilitários de teste (time-travel, fixtures)

---

## 🧪 Testes Unitários

### **1. Core/Shared (Primitivos)**

**Arquivo:** `core/shared/types.test.ts`

**O que testar:**
- ✅ Geração de IDs (formato correto, unicidade)
- ✅ Validação de EntityId
- ✅ Conversão de timestamps
- ✅ Validação de Duration
- ✅ Validação de Validity (effectiveFrom/Until)
- ✅ Scope validation
- ✅ ActorReference validation

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { Ids, asEntityId, isValidAt } from '../shared/types';

describe('IDs', () => {
  it('should generate valid entity IDs', () => {
    const id = Ids.entity();
    assert(id.startsWith('ent-') || /^[0-9a-f-]{36}$/.test(id));
  });
  
  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => Ids.entity()));
    assert.equal(ids.size, 1000);
  });
});

describe('Validity', () => {
  it('should validate effective periods', () => {
    const now = Date.now();
    const validity = {
      effectiveFrom: now - 1000,
      effectiveUntil: now + 1000
    };
    assert(isValidAt(validity, now));
    assert(!isValidAt(validity, now - 2000));
    assert(!isValidAt(validity, now + 2000));
  });
});
```

---

### **2. Core/Enforcement (Invariantes)**

**Arquivo:** `core/enforcement/invariants.test.ts`

**O que testar:**
- ✅ Hash chain integrity
- ✅ Validação de hash chain quebrado
- ✅ Validação temporal (eventos não podem ser no futuro)
- ✅ Validação de versão de aggregate (optimistic locking)
- ✅ Invariantes de negócio
- ✅ Validação de comandos

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { createHashChain } from './invariants';

describe('Hash Chain', () => {
  it('should compute correct hash', () => {
    const chain = createHashChain();
    const event = { id: 'e1', type: 'Test', payload: {} };
    const hash = chain.computeHash(event);
    assert(hash.startsWith('sha256:'));
  });
  
  it('should detect broken chain', () => {
    const chain = createHashChain();
    const result = chain.verify([event1, event2WithWrongHash]);
    assert.equal(result.isValid, false);
  });
});
```

---

### **3. Core/Aggregates (Re-hidratação)**

**Arquivo:** `core/aggregates/rehydrators.test.ts`

**O que testar:**
- ✅ Re-hidratação de Party de eventos
- ✅ Re-hidratação de Asset de eventos
- ✅ Re-hidratação de Agreement de eventos
- ✅ Re-hidratação de Role de eventos
- ✅ Re-hidratação de Workflow de eventos
- ✅ Estado correto após múltiplos eventos
- ✅ Versão de aggregate correta

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { partyRehydrator } from './rehydrators';
import { createInMemoryEventStore } from '../store/event-store';

describe('Party Rehydrator', () => {
  it('should rehydrate party from events', async () => {
    const eventStore = createInMemoryEventStore();
    
    // Append events
    await eventStore.append({
      type: 'EntityCreated',
      aggregateType: 'Party',
      aggregateId: 'party-1',
      aggregateVersion: 1,
      payload: { entityType: 'Person', name: 'John' },
      actor: { type: 'System', systemId: 'test' },
      previousHash: 'genesis',
      hash: 'sha256:...'
    });
    
    const party = await partyRehydrator(eventStore, 'party-1');
    assert.equal(party.name, 'John');
    assert.equal(party.version, 1);
  });
});
```

---

### **4. Core/Engine (Workflow)**

**Arquivo:** `core/engine/workflow-engine.test.ts`

**O que testar:**
- ✅ Transições de estado válidas
- ✅ Transições de estado inválidas (bloqueadas)
- ✅ Guards (condições de transição)
- ✅ Actions (ações executadas na transição)
- ✅ Workflow completo (Draft → Proposed → Active)
- ✅ Workflow com múltiplos caminhos
- ✅ Workflow com rollback

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { createWorkflowEngine, AGREEMENT_WORKFLOW } from './workflow-engine';

describe('Workflow Engine', () => {
  it('should transition agreement from Draft to Proposed', async () => {
    const engine = createWorkflowEngine(eventStore, services);
    engine.registerDefinition(AGREEMENT_WORKFLOW);
    
    const result = await engine.transition('agreement-1', 'propose', {
      actor: { type: 'Entity', entityId: 'entity-1' }
    });
    
    assert.equal(result.success, true);
    assert.equal(result.newState, 'Proposed');
  });
  
  it('should block invalid transitions', async () => {
    const result = await engine.transition('agreement-1', 'activate', {
      actor: { type: 'Entity', entityId: 'entity-1' }
    });
    
    assert.equal(result.success, false);
    assert(result.error.includes('Invalid transition'));
  });
});
```

---

### **5. Core/Security (Autorização)**

**Arquivo:** `core/security/authorization.test.ts`

**O que testar:**
- ✅ Autorização baseada em roles
- ✅ Autorização baseada em policies
- ✅ Verificação de permissões
- ✅ Contexto de autorização (realm, scope)
- ✅ Denegação de acesso
- ✅ Auditoria de decisões

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { createAuthorizationEngine } from './authorization';

describe('Authorization', () => {
  it('should allow action based on role', async () => {
    const engine = createAuthorizationEngine(roleStore, policyEngine);
    
    const decision = await engine.authorize({
      actor: { type: 'Entity', entityId: 'entity-1' },
      action: { type: 'create', resource: 'Agreement' },
      resource: { type: 'Realm', id: 'realm-1' }
    });
    
    assert.equal(decision.allowed, true);
    assert(decision.reason.includes('Role'));
  });
  
  it('should deny action without permission', async () => {
    const decision = await engine.authorize({
      actor: { type: 'Entity', entityId: 'entity-2' },
      action: { type: 'delete', resource: 'Agreement' },
      resource: { type: 'Realm', id: 'realm-1' }
    });
    
    assert.equal(decision.allowed, false);
  });
});
```

---

### **6. Core/API/Intent (Intent Handlers)**

**Arquivo:** `core/api/intent-api.test.ts`

**O que testar:**
- ✅ Registro de intent handler
- ✅ Execução de intent handler
- ✅ Validação de payload
- ✅ Geração de affordances
- ✅ Tratamento de erros
- ✅ Idempotência

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { createIntentHandler } from './intent-api';

describe('Intent Handler', () => {
  it('should handle register entity intent', async () => {
    const handler = createIntentHandler(eventStore, services);
    
    const result = await handler.handle({
      intent: 'register',
      realm: 'realm-1',
      actor: { type: 'System', systemId: 'test' },
      payload: {
        entityType: 'Person',
        identity: { name: 'John' }
      }
    });
    
    assert.equal(result.success, true);
    assert.equal(result.outcome.type, 'Created');
    assert(result.affordances.length > 0);
  });
  
  it('should validate required fields', async () => {
    const result = await handler.handle({
      intent: 'register',
      realm: 'realm-1',
      actor: { type: 'System', systemId: 'test' },
      payload: {} // Missing entityType
    });
    
    assert.equal(result.success, false);
    assert(result.errors.some(e => e.field === 'entityType'));
  });
});
```

---

### **7. Core/Store (Event Store)**

**Arquivo:** `core/store/event-store.test.ts`

**O que testar:**
- ✅ Append de eventos
- ✅ Leitura de eventos por aggregate
- ✅ Leitura de eventos por tipo
- ✅ Leitura de eventos por timestamp
- ✅ Validação de hash chain
- ✅ Validação de versão de aggregate
- ✅ Subscription a novos eventos

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { createInMemoryEventStore } from './event-store';

describe('Event Store', () => {
  it('should append and read events', async () => {
    const store = createInMemoryEventStore();
    
    await store.append({
      type: 'EntityCreated',
      aggregateType: 'Party',
      aggregateId: 'party-1',
      aggregateVersion: 1,
      payload: {},
      actor: { type: 'System', systemId: 'test' },
      previousHash: 'genesis',
      hash: 'sha256:...'
    });
    
    const events = await store.read({
      aggregateType: 'Party',
      aggregateId: 'party-1'
    });
    
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'EntityCreated');
  });
  
  it('should enforce optimistic locking', async () => {
    await store.append({ ...event1, aggregateVersion: 1 });
    
    // Try to append with wrong version
    await assert.rejects(
      store.append({ ...event2, aggregateVersion: 1 }), // Should be 2
      /Optimistic concurrency violation/
    );
  });
});
```

---

## 🔗 Testes de Integração

### **1. Fluxo Completo: Criar Realm**

**Arquivo:** `tests/integration/realm-creation.test.ts`

**O que testar:**
- ✅ Criar realm via intent
- ✅ Realm criado no event store
- ✅ Entidades sistema criadas
- ✅ License agreement criado
- ✅ API key gerada
- ✅ Realm isolado de outros realms

**Exemplo:**
```typescript
import { describe, it, before, after } from 'node:test';
import { createUniversalLedger } from '../../core';
import { createPostgresEventStore } from '../../core/store/postgres-event-store';

describe('Realm Creation Integration', () => {
  let ledger;
  let eventStore;
  
  before(async () => {
    eventStore = createPostgresEventStore(process.env.TEST_DATABASE_URL);
    ledger = createUniversalLedger({ eventStore });
  });
  
  after(async () => {
    await eventStore.shutdown();
  });
  
  it('should create realm with all dependencies', async () => {
    const result = await ledger.intentHandler.handle({
      intent: 'createRealm',
      realm: PRIMORDIAL_REALM_ID,
      actor: { type: 'System', systemId: 'genesis' },
      payload: { name: 'Test Realm' }
    });
    
    assert.equal(result.success, true);
    const realmId = result.outcome.id;
    
    // Verify realm exists
    const realm = await ledger.realmManager.getRealm(realmId);
    assert(realm);
    assert.equal(realm.name, 'Test Realm');
    
    // Verify system entities created
    const events = await eventStore.read({
      aggregateType: 'Party',
      filters: { realmId }
    });
    assert(events.length >= 2); // System + Licensee
    
    // Verify license agreement
    const agreements = await ledger.aggregates.getAgreements({ realmId });
    assert(agreements.some(a => a.agreementType === 'tenant-license'));
  });
});
```

---

### **2. Fluxo Completo: Criar Agreement**

**Arquivo:** `tests/integration/agreement-flow.test.ts`

**O que testar:**
- ✅ Criar entities (parties)
- ✅ Propor agreement
- ✅ Dar consentimento
- ✅ Agreement ativado
- ✅ Roles estabelecidos
- ✅ Workflow executado
- ✅ Eventos gerados corretamente

**Exemplo:**
```typescript
describe('Agreement Flow Integration', () => {
  it('should complete full agreement lifecycle', async () => {
    // 1. Create entities
    const employer = await createEntity('Organization', 'Acme Corp');
    const employee = await createEntity('Person', 'John Doe');
    
    // 2. Propose agreement
    const proposeResult = await intentHandler.handle({
      intent: 'propose',
      realm: realmId,
      actor: { type: 'Entity', entityId: employer.id },
      payload: {
        agreementType: 'Employment',
        parties: [
          { entityId: employer.id, role: 'Employer' },
          { entityId: employee.id, role: 'Employee' }
        ],
        terms: { salary: 100000 }
      }
    });
    
    assert.equal(proposeResult.success, true);
    const agreementId = proposeResult.outcome.id;
    
    // 3. Verify agreement is Proposed
    const agreement = await aggregates.getAgreement(agreementId);
    assert.equal(agreement.status, 'Proposed');
    
    // 4. Give consent
    const consentResult = await intentHandler.handle({
      intent: 'consent',
      realm: realmId,
      actor: { type: 'Entity', entityId: employee.id },
      payload: { agreementId }
    });
    
    assert.equal(consentResult.success, true);
    
    // 5. Verify agreement is Active
    const updatedAgreement = await aggregates.getAgreement(agreementId);
    assert.equal(updatedAgreement.status, 'Active');
    
    // 6. Verify role established
    const roles = await aggregates.getRoles({ holderId: employee.id });
    assert(roles.some(r => r.roleType === 'Employee'));
  });
});
```

---

### **3. Testes de API HTTP**

**Arquivo:** `tests/integration/api.test.ts`

**O que testar:**
- ✅ POST /intent - Criar realm
- ✅ POST /intent - Criar entity
- ✅ POST /intent - Criar agreement
- ✅ POST /intent - Query
- ✅ GET /health
- ✅ POST /chat (se LLM configurado)
- ✅ WebSocket /subscribe
- ✅ CORS headers
- ✅ Error handling
- ✅ Authentication/Authorization

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { createAntenna } from '../../antenna/server';

describe('HTTP API Integration', () => {
  let server;
  let apiUrl;
  
  before(async () => {
    server = createAntenna({ port: 0 }); // Random port
    await server.start();
    apiUrl = `http://localhost:${server.port}`;
  });
  
  after(async () => {
    await server.stop();
  });
  
  it('should handle POST /intent to create realm', async () => {
    const response = await fetch(`${apiUrl}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'createRealm',
        realm: PRIMORDIAL_REALM_ID,
        actor: { type: 'System', systemId: 'genesis' },
        payload: { name: 'Test Realm' }
      })
    });
    
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert(result.outcome.id);
  });
  
  it('should return 400 for invalid intent', async () => {
    const response = await fetch(`${apiUrl}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'invalidIntent',
        payload: {}
      })
    });
    
    assert.equal(response.status, 400);
  });
});
```

---

### **4. Testes de Event Sourcing (Time-Travel)**

**Arquivo:** `tests/integration/time-travel.test.ts`

**O que testar:**
- ✅ Replay até ponto específico
- ✅ Estado em qualquer ponto no tempo
- ✅ Comparação de estados
- ✅ Fork de event stream
- ✅ Fixtures

**Exemplo:**
```typescript
import { describe, it } from 'node:test';
import { createTimeTravelHarness } from '../../core/testing/harness';

describe('Time-Travel Testing', () => {
  it('should replay to specific sequence', async () => {
    const harness = createTimeTravelHarness(eventStore);
    
    // Append events
    await appendEvents([e1, e2, e3, e4, e5]);
    
    // Replay to sequence 3
    await harness.replayTo(3n);
    
    const state = await harness.getStateAt('Agreement', 'agr-1', 3n);
    assert.equal(state.version, 3);
    assert.equal(state.status, 'Proposed'); // Status at sequence 3
  });
  
  it('should diff states at different points', async () => {
    const diff = await harness.diffStates('Agreement', 'agr-1', 2n, 5n);
    
    assert(diff.changes.length > 0);
    assert(diff.changes.some(c => c.path === 'status'));
  });
});
```

---

### **5. Testes de Performance**

**Arquivo:** `tests/integration/performance.test.ts`

**O que testar:**
- ✅ Latência de append de eventos
- ✅ Latência de queries
- ✅ Throughput (eventos/segundo)
- ✅ Latência de re-hidratação
- ✅ Latência de API

**Exemplo:**
```typescript
import { describe, it } from 'node:test';

describe('Performance Tests', () => {
  it('should append events with acceptable latency', async () => {
    const start = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await eventStore.append(createTestEvent(i));
    }
    
    const duration = Date.now() - start;
    const avgLatency = duration / 100;
    
    assert(avgLatency < 50, `Average latency ${avgLatency}ms exceeds 50ms`);
  });
  
  it('should handle concurrent appends', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      eventStore.append(createTestEvent(i))
    );
    
    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;
    
    assert(duration < 500, `Concurrent appends took ${duration}ms`);
  });
});
```

---

## 📁 Estrutura de Testes Proposta

```
Universal-Business-Ledger-Dezembro/
├── tests/
│   ├── unit/
│   │   ├── core/
│   │   │   ├── shared/
│   │   │   │   └── types.test.ts
│   │   │   ├── enforcement/
│   │   │   │   └── invariants.test.ts
│   │   │   ├── aggregates/
│   │   │   │   └── rehydrators.test.ts
│   │   │   ├── engine/
│   │   │   │   ├── workflow-engine.test.ts
│   │   │   │   └── flow-orchestrator.test.ts
│   │   │   ├── security/
│   │   │   │   ├── authorization.test.ts
│   │   │   │   ├── authentication.test.ts
│   │   │   │   └── policies.test.ts
│   │   │   ├── api/
│   │   │   │   ├── intent-api.test.ts
│   │   │   │   ├── query-language.test.ts
│   │   │   │   └── realtime.test.ts
│   │   │   └── store/
│   │   │       ├── event-store.test.ts
│   │   │       └── postgres-event-store.test.ts
│   │   └── antenna/
│   │       ├── server.test.ts
│   │       └── admin.test.ts
│   ├── integration/
│   │   ├── realm-creation.test.ts
│   │   ├── agreement-flow.test.ts
│   │   ├── asset-management.test.ts
│   │   ├── api.test.ts
│   │   ├── time-travel.test.ts
│   │   └── performance.test.ts
│   ├── fixtures/
│   │   ├── realm-with-entities.json
│   │   ├── employment-agreement.json
│   │   └── sale-agreement.json
│   ├── helpers/
│   │   ├── test-setup.ts
│   │   ├── test-teardown.ts
│   │   └── factories.ts
│   └── config/
│       └── test-config.ts
├── package.json (atualizado com scripts de teste)
└── tsconfig.test.json
```

---

## 🛠️ Configuração de Testes

### **package.json (atualizar):**

```json
{
  "scripts": {
    "test": "node --test",
    "test:unit": "node --test tests/unit/**/*.test.ts",
    "test:integration": "node --test tests/integration/**/*.test.ts",
    "test:watch": "node --test --watch",
    "test:coverage": "c8 node --test"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "c8": "^8.0.0",  // Coverage
    "tsx": "^4.0.0"  // Para rodar TypeScript diretamente
  }
}
```

### **tsconfig.test.json:**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "esModuleInterop": true
  },
  "include": ["tests/**/*", "core/**/*", "antenna/**/*"]
}
```

---

## 🧠 Testes Filosóficos ⭐

**Baseado em:** [`FILOSOFIA-E-TESTES.md`](./FILOSOFIA-E-TESTES.md)

Os testes filosóficos validam que o sistema mantém os **5 princípios fundamentais** do UBL:

### **1. Testes de Rastreabilidade (Radical Transparency)**

**Arquivo:** `tests/philosophical/traceability.test.ts`

**O que testar:**
- ✅ Todo evento tem `actor` identificável
- ✅ Todo relacionamento tem `agreement` que o estabeleceu
- ✅ Toda role tem `agreement` que a concedeu (`establishedBy`)
- ✅ Toda mudança tem `event` que a causou
- ✅ Nada é "mágico" - tudo tem origem rastreável

**Exemplo:**
```typescript
describe('Radical Transparency - Traceability', () => {
  it('should require actor for every event', async () => {
    await assert.rejects(
      eventStore.append({ ...event, actor: undefined }),
      /actor.*required/i
    );
  });
  
  it('should trace every role to its establishing agreement', async () => {
    const role = await getRole(roleId);
    assert(role.establishedBy, 'Role must have establishing agreement');
    const agreement = await getAgreement(role.establishedBy);
    assert(agreement, 'Establishing agreement must exist');
  });
  
  it('should trace every relationship to an agreement', async () => {
    const relationship = await getRelationship(entity1Id, entity2Id);
    assert(relationship.agreementId, 'Relationship must have agreement');
  });
});
```

---

### **2. Testes de Imutabilidade (Temporal Integrity)**

**Arquivo:** `tests/philosophical/immutability.test.ts`

**O que testar:**
- ✅ Eventos não podem ser modificados
- ✅ Eventos não podem ser deletados
- ✅ Hash chain não pode ser quebrada
- ✅ Sequência de eventos não pode ser alterada
- ✅ Estado em qualquer ponto no tempo pode ser reconstruído

**Exemplo:**
```typescript
describe('Temporal Integrity - Immutability', () => {
  it('should not allow event modification', async () => {
    const event = await eventStore.append(createEvent());
    await assert.rejects(
      eventStore.update(event.id, { ...event, payload: { modified: true } }),
      /immutable|cannot.*modify/i
    );
  });
  
  it('should not allow event deletion', async () => {
    const event = await eventStore.append(createEvent());
    await assert.rejects(
      eventStore.delete(event.id),
      /immutable|cannot.*delete/i
    );
  });
  
  it('should detect broken hash chain', async () => {
    const events = await createEventChain(5);
    events[2].hash = 'sha256:wronghash';
    const result = hashChain.verifyChain(events);
    assert(!result.isValid, 'Broken chain should be detected');
  });
  
  it('should reconstruct state at any point in time', async () => {
    await appendEvents([e1, e2, e3, e4, e5]);
    const stateAt3 = await replayTo(3n);
    const stateAt5 = await replayTo(5n);
    assert.notDeepEqual(stateAt3, stateAt5, 'States should differ');
  });
});
```

---

### **3. Testes de Relacionamentos (Relational Ontology)**

**Arquivo:** `tests/philosophical/relationships.test.ts`

**O que testar:**
- ✅ Propriedades vêm de relacionamentos, não são intrínsecas
- ✅ Roles vêm de Agreements, não são atributos
- ✅ Permissões vêm de Roles, não são diretas
- ✅ Nada existe isoladamente - tudo emerge de relacionamentos

**Exemplo:**
```typescript
describe('Relational Ontology - Relationships', () => {
  it('should not allow roles without agreements', async () => {
    await assert.rejects(
      createRole({ entityId: 'ent-1', roleType: 'Employee' }), // Sem agreement
      /agreement.*required|must.*via.*agreement/i
    );
  });
  
  it('should derive permissions from agreements, not attributes', async () => {
    const entity = await getEntity('ent-1');
    // Entity não tem permissões diretamente
    assert(!entity.permissions, 'Entity should not have direct permissions');
    
    // Permissões vêm de roles, que vêm de agreements
    const roles = await getRoles({ holderId: 'ent-1' });
    const permissions = roles.flatMap(r => r.permissions);
    assert(permissions.length > 0, 'Permissions should come from roles');
  });
  
  it('should not allow properties without relationships', async () => {
    const entity = await createEntity({ name: 'John' });
    // Entity isolada não tem roles
    const roles = await getRoles({ holderId: entity.id });
    assert.equal(roles.length, 0, 'Isolated entity should have no roles');
  });
});
```

---

### **4. Testes de Agreements (Contractualism)**

**Arquivo:** `tests/philosophical/agreements.test.ts`

**O que testar:**
- ✅ Tudo é via Agreement - não há exceções
- ✅ Não pode haver relacionamentos sem Agreement
- ✅ Não pode haver mudanças sem Agreement
- ✅ Agreements são o único caminho para estabelecer relacionamentos

**Exemplo:**
```typescript
describe('Contractualism - Agreements', () => {
  it('should require agreement for all relationships', async () => {
    await assert.rejects(
      createRelationship({ entity1: 'ent-1', entity2: 'ent-2', type: 'partnership' }),
      /agreement.*required/i
    );
    
    // Deve funcionar via agreement
    const agreement = await createAgreement({
      type: 'Partnership',
      parties: [{ entityId: 'ent-1' }, { entityId: 'ent-2' }]
    });
    assert(agreement, 'Relationship should be created via agreement');
  });
  
  it('should require agreement for all changes', async () => {
    await assert.rejects(
      updateEntity('ent-1', { name: 'New Name' }), // Sem agreement
      /agreement.*required/i
    );
  });
  
  it('should not allow direct role assignment', async () => {
    await assert.rejects(
      assignRole('ent-1', 'Employee'), // Sem agreement
      /agreement.*required|must.*via.*agreement/i
    );
  });
});
```

---

### **5. Testes de Responsabilidade (Accountability)**

**Arquivo:** `tests/philosophical/accountability.test.ts`

**O que testar:**
- ✅ Toda ação tem um `actor` identificável
- ✅ Toda decisão tem um responsável
- ✅ Toda role tem origem rastreável (`grantedBy`, `establishedBy`)
- ✅ Rastreabilidade completa de todas as ações

**Exemplo:**
```typescript
describe('Accountability - Responsibility', () => {
  it('should require actor for every action', async () => {
    await assert.rejects(
      eventStore.append({ ...event, actor: undefined }),
      /actor.*required/i
    );
  });
  
  it('should trace every role to its establishment', async () => {
    const role = await getRole(roleId);
    assert(role.establishedBy, 'Role must have establishing agreement');
    assert(role.grantedBy, 'Role must have granting actor');
    assert(role.validFrom, 'Role must have validity period');
  });
  
  it('should attribute every change to an actor', async () => {
    const event = await eventStore.append(createEvent());
    assert(event.actor, 'Event must have actor');
    assert(event.actor.type, 'Actor must have type');
  });
});
```

---

### **6. Testes de Time-Travel (Arrow of Time)**

**Arquivo:** `tests/philosophical/time-travel.test.ts`

**O que testar:**
- ✅ Estado é derivado de eventos, não armazenado diretamente
- ✅ Qualquer ponto no tempo pode ser reconstruído
- ✅ Replay de eventos produz o mesmo estado
- ✅ Audit trail é completo e perfeito

**Exemplo:**
```typescript
describe('Arrow of Time - Time-Travel', () => {
  it('should derive state from events, not store it', async () => {
    // Estado não deve existir antes de eventos
    let state = await getAggregateState('agg-1');
    assert(!state.exists, 'State should not exist before events');
    
    // Após eventos, estado deve ser derivado
    await appendEvent({ type: 'Created', aggregateId: 'agg-1' });
    state = await getAggregateState('agg-1');
    assert(state.exists, 'State should exist after events');
    
    // Estado deve ser reconstruível
    const replayedState = await replayTo(1n);
    assert.deepEqual(state, replayedState, 'State should match replayed state');
  });
  
  it('should reconstruct state at any point in time', async () => {
    await appendEvents([e1, e2, e3, e4, e5]);
    const stateAt3 = await replayTo(3n);
    const stateAt5 = await replayTo(5n);
    assert.notDeepEqual(stateAt3, stateAt5, 'States should differ');
  });
  
  it('should have complete audit trail', async () => {
    await appendEvents([e1, e2, e3]);
    const allEvents = await eventStore.read({ aggregateId: 'agg-1' });
    assert.equal(allEvents.length, 3, 'All events should be in audit trail');
  });
});
```

---

## 📊 Cobertura de Testes Alvo

### **Unitários:**
- ✅ **Core/Shared:** 90%+
- ✅ **Core/Enforcement:** 95%+
- ✅ **Core/Aggregates:** 85%+
- ✅ **Core/Engine:** 80%+
- ✅ **Core/Security:** 85%+
- ✅ **Core/API:** 80%+
- ✅ **Core/Store:** 90%+

### **Integração:**
- ✅ **Fluxos principais:** 100% (todas as jornadas)
- ✅ **API endpoints:** 90%+
- ✅ **Event sourcing:** 85%+
- ✅ **Performance:** Casos críticos

### **Filosóficos:** ⭐
- ✅ **Rastreabilidade:** 100% (todos os casos)
- ✅ **Imutabilidade:** 100% (todos os casos)
- ✅ **Relacionamentos:** 100% (todos os casos)
- ✅ **Agreements:** 100% (todos os casos)
- ✅ **Responsabilidade:** 100% (todos os casos)
- ✅ **Time-Travel:** 100% (todos os casos)

---

## 🎯 Prioridades

### **Fase 1 (Crítico):**
1. ✅ Core/Shared (primitivos)
2. ✅ Core/Enforcement (invariantes)
3. ✅ Core/Store (event store)
4. ✅ Core/Aggregates (re-hidratação)
5. ✅ **Testes Filosóficos - Imutabilidade** ⭐ (Temporal Integrity)
6. ✅ **Testes Filosóficos - Rastreabilidade** ⭐ (Radical Transparency)

### **Fase 2 (Importante):**
7. ✅ Core/Engine (workflow)
8. ✅ Core/Security (autorização)
9. ✅ Core/API (intent handlers)
10. ✅ Testes de integração (fluxos principais)
11. ✅ **Testes Filosóficos - Relacionamentos** ⭐ (Relational Ontology)
12. ✅ **Testes Filosóficos - Agreements** ⭐ (Contractualism)
13. ✅ **Testes Filosóficos - Responsabilidade** ⭐ (Accountability)

### **Fase 3 (Desejável):**
14. ✅ Testes de API HTTP
15. ✅ Testes de performance
16. ✅ **Testes Filosóficos - Time-Travel** ⭐ (Arrow of Time)
17. ✅ Cobertura completa

---

## 🚀 Como Executar

```bash
# Todos os testes
npm test

# Apenas unitários
npm run test:unit

# Apenas integração
npm run test:integration

# Com watch mode
npm run test:watch

# Com coverage
npm run test:coverage
```

---

## 📝 Próximos Passos

1. **Criar estrutura de diretórios** de testes
2. **Configurar** Node.js test runner
3. **Implementar** testes unitários críticos (Fase 1)
4. **Implementar** testes de integração básicos
5. **Integrar** com CI/CD pipeline
6. **Expandir** cobertura gradualmente

---

**Status:** 📋 **PROPOSTA - AGUARDANDO IMPLEMENTAÇÃO**  
**Última atualização:** 2025-12-07

