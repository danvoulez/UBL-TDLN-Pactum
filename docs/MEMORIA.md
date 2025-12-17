# Memória no UBL

> Memória = Tudo que eu consigo ler, dado meu Contrato de Memória

---

## Memory Contract (Contrato de Memória)

**Toda interação no UBL é regida por um Memory Contract.**

Um Memory Contract é um Agreement que define:
- O que cada parte pode **ler** (lembrar)
- O que cada parte pode **escrever** (registrar)
- Por **quanto tempo**
- Com que **propósito**
- Com que **limites**

```
┌─────────────────────────────────────────────────────────────┐
│  MEMORY CONTRACT                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Partes: Usuário ↔ Serviço                                  │
│                                                             │
│  Cláusulas:                                                 │
│  ├─ Serviço pode ler: histórico da sessão                   │
│  ├─ Serviço pode escrever: eventos da sessão                │
│  ├─ Usuário pode ler: seus dados, respostas                 │
│  ├─ Usuário pode escrever: perguntas, comandos              │
│  ├─ Duração: até fim da sessão (ou 24h)                     │
│  └─ Propósito: atendimento                                  │
│                                                             │
│  Ao usar o serviço, você aceita este contrato.              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tipos de Memory Contract

| Tipo | Duração | Escopo | Exemplo |
|------|---------|--------|---------|
| **Session** | Temporário (horas) | Conversa atual | Chat com usuário |
| **Guardianship** | Permanente | Tudo do script | Guardian supervisiona |
| **Employment** | Duração do trabalho | Output + status | Cliente contrata script |
| **Collaboration** | Definido | Dados compartilhados | Scripts cooperam |
| **Observation** | Permanente | Audit trail | Compliance |

### Session como Memory Contract

Quando você inicia uma sessão:

```typescript
// Implicitamente, um Agreement é criado:
{
  type: 'MemoryContract',
  subtype: 'Session',
  parties: [userId, serviceId],
  clauses: [
    // Serviço lembra da conversa
    { 
      party: serviceId,
      action: 'read', 
      resource: 'session',
      scope: sessionId,
    },
    // Serviço registra eventos
    { 
      party: serviceId,
      action: 'write', 
      resource: 'events',
      scope: sessionId,
    },
    // Usuário vê suas entidades
    { 
      party: userId,
      action: 'read', 
      resource: 'entities',
      scope: 'own',
    },
  ],
  validity: {
    from: sessionStart,
    until: sessionStart + 86400000,  // 24h max
  },
  terminationConditions: [
    'user:logout',
    'timeout:24h',
    'explicit:end-session',
  ],
}
```

### Por que isso importa?

**1. Transparência**
- Você sabe exatamente o que o sistema pode lembrar
- Não tem "memória oculta"

**2. Controle**
- Você pode revogar o contrato (encerrar sessão)
- Você pode pedir para "esquecer" (se o contrato permitir)

**3. Compliance**
- LGPD/GDPR friendly
- Audit trail de quem acessou o quê

**4. Consistência**
- Mesma mecânica para tudo (sessão, guardianship, trabalho)
- Um conceito, múltiplos usos

### O LLM Embarcado é um Script

A grande revelação: **não existe "LLM como serviço" separado de "LLM como usuário"**.

O Antenna (LLM embarcado que atende usuários) é simplesmente um Script com um Memory Contract especial:

```
┌─────────────────────────────────────────────────────────────┐
│  ANTENNA = SCRIPT                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  EntityId:     antenna-001                                  │
│  Substrate:    Agent                                        │
│  Guardian:     system-admin                                 │
│  Wallet:       Paga pelas chamadas LLM                      │
│  Daemon:       Persistent (sempre rodando)                  │
│  Constitution: "Atender usuários do UBL"                    │
│                                                             │
│  Memory Contract (ServiceAgent):                            │
│  ├─ Pode criar sessões com qualquer usuário                 │
│  ├─ Pode ler dados do usuário durante sessão                │
│  ├─ Pode escrever eventos de sessão                         │
│  ├─ Paga pelo uso de LLM do próprio wallet                  │
│  └─ Não pode ler dados de outros scripts                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Consequências:**

1. **Mesma arquitetura** - Antenna usa EventStore, ABAC, Agreements como qualquer script
2. **Paga pelo que usa** - Tem wallet, gasta ◆ em chamadas LLM
3. **Auditável** - Todas as ações são Events no Ledger
4. **Substituível** - Pode ter múltiplos "Antennas" com contratos diferentes
5. **Não é especial** - É só um script com permissões específicas

```typescript
// Registrar o Antenna como qualquer script
await intent('register:agent', {
  identity: { name: 'UBL Antenna' },
  guardianId: systemAdminId,
  constitution: {
    values: ['Atender usuários', 'Ser útil', 'Seguir regras'],
    constraints: { allowedIntents: ['*'] },
  },
  autonomyLevel: 'Full',
});

// Criar Memory Contract de ServiceAgent
await intent('propose:agreement', {
  type: 'MemoryContract',
  subtype: 'ServiceAgent',
  parties: [antennaId, systemId],
  clauses: [
    { action: 'write', resource: 'session', scope: '*' },
    { action: 'read', resource: 'entities', scope: 'session-user' },
    { action: 'spend', resource: 'wallet', scope: 'self' },
  ],
});
```

**Não existe distinção ontológica entre scripts.** Existe apenas:
- Scripts com diferentes Memory Contracts
- Scripts com diferentes Constitutions
- Scripts com diferentes Guardians

O "serviço" é só um script que tem contrato para atender outros.

---

### Direito ao Esquecimento

```typescript
// Usuário pode pedir para esquecer
await intent('request:forget', {
  scope: 'session',      // Só essa sessão
  // ou
  scope: 'all',          // Tudo sobre mim
  reason: 'LGPD Art. 18',
});

// Sistema verifica:
// 1. Memory Contract permite esquecimento?
// 2. Há obrigação legal de reter?
// 3. Se pode esquecer, cria evento:

{
  type: 'DataForgotten',
  payload: {
    requestedBy: userId,
    scope: 'session',
    eventsArchived: ['evt-1', 'evt-2', ...],
    reason: 'LGPD Art. 18',
  }
}
```

---

## O Insight

Não existem "tipos de memória" no UBL.

Existe:
1. **Ledger** - Todos os eventos, sempre
2. **Query** - O que eu quero saber
3. **Acesso** - O que eu tenho permissão de ver (via Agreements)

**Memória = Query + Agreements**

---

## Acesso via Agreements

Acesso não é mágico. Vem de **Agreements com cláusulas específicas**.

### Tipos de Agreement que dão acesso

| Agreement | Entre | Cláusulas típicas |
|-----------|-------|-------------------|
| **Guardianship** | Guardian ↔ Script | `read:trajectory`, `read:wallet`, `write:budget`, `write:constitution` |
| **Session** | Serviço ↔ Usuário | `read:session`, `write:events`, `read:entities` |
| **Collaboration** | Script ↔ Script | `read:shadow`, `read:output`, `write:request` |
| **Employment** | Cliente ↔ Script | `read:output`, `write:task`, `read:status` |
| **Observation** | Auditor ↔ Sistema | `read:all`, `read:trajectory` |

### Cláusulas de Acesso

```typescript
interface AccessClause {
  // O que pode fazer
  action: 'read' | 'write' | 'delete' | 'admin';
  
  // Em que recurso
  resource: 
    | 'trajectory'    // Histórico de ações
    | 'wallet'        // Saldo e transações
    | 'shadow'        // Entidades shadow
    | 'memory'        // Eventos de memória
    | 'session'       // Contexto de sessão
    | 'constitution'  // Identidade/valores
    | 'daemon'        // Estado do daemon
    | 'output'        // Resultados de trabalho
    | '*';            // Tudo
  
  // De quem
  scope: EntityId | 'self' | 'children' | '*';
  
  // Por quanto tempo
  validity?: {
    from: Timestamp;
    until?: Timestamp;
  };
  
  // Com que limites
  limits?: {
    maxQueries?: number;
    maxResults?: number;
    rateLimit?: string;
  };
}
```

### Exemplos concretos

**Guardian vê tudo do script:**
```typescript
{
  agreementType: 'Guardianship',
  clauses: [
    { action: 'read', resource: '*', scope: scriptId },
    { action: 'write', resource: 'budget', scope: scriptId },
    { action: 'write', resource: 'constitution', scope: scriptId },
  ]
}
```

**Cliente vê só output:**
```typescript
{
  agreementType: 'Employment',
  clauses: [
    { action: 'read', resource: 'output', scope: scriptId },
    { action: 'write', resource: 'task', scope: scriptId },
  ]
}
```

**Sessão temporária:**
```typescript
{
  agreementType: 'Session',
  clauses: [
    { 
      action: 'read', 
      resource: 'session', 
      scope: sessionId,
      validity: { from: now, until: now + 3600000 }  // 1 hora
    },
  ]
}
```

### Como o ABAC usa isso

```typescript
// Quando alguém faz uma query
const events = await eventStore.query({
  filter: { aggregateId: targetId },
  actor: currentActor,
});

// O ABAC verifica:
// 1. Quais Agreements o actor tem?
// 2. Algum Agreement tem cláusula que permite essa leitura?
// 3. A cláusula está válida (tempo, limites)?
// 4. Se sim, retorna eventos. Se não, nega.
```

### Memória é consequência

```
Script quer "lembrar" de algo
         ↓
Query no EventStore
         ↓
ABAC verifica Agreements
         ↓
Retorna eventos permitidos
         ↓
Isso É a "memória" do script
```

Não existe memória separada. Existe o que os Agreements permitem ler.

---

## Por que não separar?

Sistemas tradicionais separam:
- "Memória de curto prazo" vs "longo prazo"
- "Memória do agente" vs "do sistema"
- "Contexto de sessão" vs "histórico"

Isso cria:
- Código duplicado
- Sincronização entre stores
- Confusão conceitual
- Bugs de consistência

No UBL, **tudo é Event no Ledger**. A "memória" é só uma view.

---

## Como funciona

### O Ledger (Event Store)

```
┌─────────────────────────────────────────────────────────────┐
│  LEDGER                                                     │
├─────────────────────────────────────────────────────────────┤
│  Event #1: EntityRegistered (Script "Tradutor")             │
│  Event #2: WalletCreated (Script "Tradutor")                │
│  Event #3: LoanDisbursed (1000 ◆)                           │
│  Event #4: TransferExecuted (Cliente → Script, 50 ◆)        │
│  Event #5: TrajectorySpanRecorded (translate:text)          │
│  Event #6: ShadowEntityCreated ("Cliente X")                │
│  Event #7: ShadowEntityUpdated (trustLevel: High)           │
│  Event #8: DaemonHeartbeat                                  │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

### Quem vê o quê

**Script "Tradutor" vê:**
```
Seus próprios eventos
+ Eventos de entidades que ele tem permissão
+ Eventos públicos

= Sua "memória"
```

**Guardian do Script vê:**
```
Eventos do script
+ Eventos de agreements com o script
+ Seus próprios eventos

= Sua "visão de supervisão"
```

**Serviço (Antenna) durante sessão vê:**
```
Eventos da sessão atual
+ Eventos do usuário logado
+ Eventos das entidades que o usuário pode ver

= "Contexto da conversa"
```

**Sistema (Admin) vê:**
```
Tudo

= Audit trail completo
```

---

## Implementação

### Não precisa de módulos separados

```typescript
// ❌ ANTES: Módulos separados
import { AgentMemory } from 'core/cognition/memory';
import { SessionContext } from 'antenna/session';
import { TrajectorySpan } from 'core/trajectory';

// ✅ DEPOIS: Tudo é query no EventStore
const myMemory = await eventStore.query({
  filter: { 
    $or: [
      { aggregateId: myId },
      { 'payload.subjectId': myId },
    ]
  },
  actor: me,  // ABAC filtra automaticamente
});
```

### ABAC controla acesso

```typescript
// O EventStore já usa ABAC
const events = await eventStore.query({
  filter: { type: 'TransferExecuted' },
  actor: currentActor,
});

// Se actor é o Script, vê só transferências dele
// Se actor é Guardian, vê transferências dos scripts dele
// Se actor é Admin, vê todas
```

### "Consolidação" é só mais Events

```typescript
// Criar um resumo não deleta nada
await eventStore.append({
  type: 'MemoryConsolidated',
  payload: {
    summary: 'Cliente X: formal, exigente com prazos',
    consolidatedEventIds: ['evt-1', 'evt-2', 'evt-3'],
    retentionPolicy: 'archive', // Não aparece em queries normais
  },
  actor,
});
```

---

## Queries comuns

### "Memória" do Script (Cognition)

```typescript
// O que eu sei sobre meus clientes?
const clientMemory = await eventStore.query({
  filter: {
    type: { $in: ['ShadowEntityCreated', 'ShadowEntityUpdated', 'ShadowInteractionRecorded'] },
    'payload.ownerId': scriptId,
  },
  sort: { timestamp: -1 },
  limit: 100,
});
```

### "Contexto" da Sessão

```typescript
// O que aconteceu nesta conversa?
const sessionContext = await eventStore.query({
  filter: {
    'metadata.sessionId': sessionId,
    timestamp: { $gte: sessionStart },
  },
  sort: { timestamp: 1 },
});
```

### "Trajectory" para Audit

```typescript
// Todas as ações do script (para auditoria)
const trajectory = await eventStore.query({
  filter: {
    type: 'TrajectorySpanRecorded',
    'payload.entityId': scriptId,
  },
  sort: { timestamp: 1 },
  // Sem limit - audit precisa de tudo
});
```

### "Saldo" do Wallet

```typescript
// Quanto eu tenho?
const walletEvents = await eventStore.query({
  filter: {
    type: { $in: ['CreditsMinted', 'CreditsTransferred', 'LoanRepaymentMade'] },
    $or: [
      { 'payload.toWalletId': walletId },
      { 'payload.fromWalletId': walletId },
    ],
  },
});
const balance = calculateBalance(walletEvents); // Aggregate
```

---

## Vantagens

### 1. Uma fonte de verdade
Não tem "a memória diz X mas o audit diz Y".

### 2. Auditável por natureza
Até a "memória" do script é rastreável. Você pode ver quando ele "aprendeu" algo.

### 3. Replay
Pode reconstruir qualquer estado em qualquer ponto no tempo.

### 4. Simples
Menos código, menos conceitos, menos bugs.

### 5. Permissões consistentes
ABAC funciona igual para tudo.

---

## O que isso significa para o código

### Deprecar

- `core/cognition/memory.ts` → Vira helpers de query
- `antenna/agent/memory.ts` → Remove (já é re-export)

### Manter

- `EventStore` → Fonte de verdade
- `ABAC` → Controle de acesso
- Aggregates → Calculam estado a partir de eventos

### Adicionar

- Query helpers para padrões comuns
- Índices para queries frequentes

---

## Resumo

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Memória = Query(Ledger, MeuAcesso)                        │
│                                                             │
│   Não existe memória separada.                              │
│   Existe o que eu posso ler.                                │
│                                                             │
│   Script lê → "memória do script"                           │
│   Serviço lê → "contexto da sessão"                         │
│   Auditor lê → "audit trail"                                │
│                                                             │
│   Mesmos dados, queries diferentes, acessos diferentes.     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Os 3 Primitivos Ortogonais

**Insight arquitetural:** UBL tem 3 features base que se combinam mas não se fundem.

```
┌─────────────────────────────────────────────────────────────┐
│  3 PRIMITIVOS ORTOGONAIS                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. AGREEMENT                                               │
│     "Quem pode fazer o quê com quem"                        │
│     Relação entre partes, cláusulas, validade               │
│                                                             │
│  2. MEMORY CONTRACT (tipo de Agreement)                     │
│     "Quem pode ler/escrever o quê"                          │
│     Acesso a dados, escopo, limites                         │
│                                                             │
│  3. LEDGER (Event Store)                                    │
│     "O que aconteceu"                                       │
│     Fonte de verdade, imutável, auditável                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Por que são separados?

**Se MemoryContract fosse só uma cláusula de Employment:**
- ❌ Perdia **composabilidade** - não reutiliza em outros contextos
- ❌ Perdia **auditabilidade** - quem deu acesso a quem?
- ❌ Perdia **revogabilidade** - revogar acesso sem cancelar emprego

**Sendo primitivos separados:**
- ✅ **Composabilidade** - mesmo MemoryContract serve Employment, Collaboration, Session
- ✅ **Auditabilidade** - cada Agreement é rastreável separadamente
- ✅ **Revogabilidade** - pode revogar acesso mantendo relação de trabalho

### Como se combinam

```
Employment (Agreement)
    │
    ├─ requires → MemoryContract (Agreement separado)
    │                 │
    │                 └─ grants access to → Ledger (Events)
    │
    └─ requires → Guardianship (Agreement separado)
                      │
                      └─ grants access to → Ledger (Events)
```

### `requires` é validação, não criação

```typescript
// Employment declara dependência
Agreement<Employment> {
  requires: [
    { type: 'MemoryContract', parties: 'same' },
    { type: 'Guardianship', where: 'script has guardian' },
  ]
}

// Ao criar Employment, sistema VALIDA:
// - Existe MemoryContract entre client e script? 
// - Script tem Guardian?
// Se não, ERRO (não cria automaticamente)
```

### Saga orquestra criação atômica

Quando precisa criar múltiplos Agreements juntos, usa **Saga**:

```typescript
Saga<HireScript> {
  steps: [
    { intent: 'propose:agreement', type: 'MemoryContract', ... },
    { intent: 'propose:agreement', type: 'Employment', ... },
  ],
  onFailure: 'compensate-all',
}
```

Saga é **operacional** (como criar), não **estrutural** (o que é).

### Resumo

| Primitivo | Responsabilidade | Independente? |
|-----------|------------------|---------------|
| Agreement | Relação entre partes | ✅ Sim |
| MemoryContract | Acesso a dados | ✅ Sim (é um tipo de Agreement) |
| Ledger | Fonte de verdade | ✅ Sim |

**Combinam-se, não se fundem.**

---

*UBL Memory Model v1.0 - Dezembro 2024*
