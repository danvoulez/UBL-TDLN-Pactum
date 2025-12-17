# UBL API Cookbook

> Receitas práticas para usar a API do Universal Business Ledger.
> 
> **Última atualização:** 2025-12-12

---

## Índice

1. [Setup Inicial](#setup-inicial)
2. [Autenticação](#autenticação)
3. [Entidades](#entidades)
4. [Wallets e Créditos](#wallets-e-créditos)
5. [Agreements](#agreements)
6. [Agents (IA)](#agents-ia)
7. [Watchers (Percepção)](#watchers-percepção)
8. [Daemons (Consciência)](#daemons-consciência)
9. [Governance](#governance)
10. [Cross-Realm](#cross-realm)
11. [Queries](#queries)
12. [WebSocket (Real-time)](#websocket-real-time)
13. [Erros Comuns](#erros-comuns)

---

## Setup Inicial

### Variáveis de Ambiente

```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/ubl
PORT=3000
HOST=0.0.0.0
ANTHROPIC_API_KEY=sk-ant-...  # ou OPENAI_API_KEY
MASTER_API_KEY=your-master-key
```

### Iniciar o Servidor

```bash
npm install
npm run dev
```

### Health Check

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 12345
}
```

---

## Autenticação

### Criar API Key (Admin)

```bash
curl -X POST http://localhost:3000/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MASTER_API_KEY" \
  -d '{
    "intent": "apikey:create",
    "realm": "00000000-0000-0000-0000-000000000000",
    "payload": {
      "name": "My App",
      "permissions": ["read", "write"],
      "expiresIn": "30d"
    }
  }'
```

### Usar API Key

```bash
curl -X POST http://localhost:3000/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{...}'
```

---

## Entidades

### Registrar Pessoa

```bash
curl -X POST http://localhost:3000/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer API_KEY" \
  -d '{
    "intent": "register",
    "realm": "my-realm",
    "payload": {
      "entityType": "Person",
      "identity": {
        "name": "João Silva",
        "email": "joao@example.com"
      }
    }
  }'
```

**Resposta:**
```json
{
  "success": true,
  "outcome": {
    "type": "Created",
    "id": "ent-abc123",
    "entity": {
      "id": "ent-abc123",
      "entityType": "Person",
      "identity": { "name": "João Silva" }
    }
  }
}
```

### Registrar Organização

```bash
curl -X POST http://localhost:3000/intent \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "register",
    "realm": "my-realm",
    "payload": {
      "entityType": "Organization",
      "identity": {
        "name": "Acme Corp",
        "taxId": "12.345.678/0001-90"
      }
    }
  }'
```

---

## Wallets e Créditos

### Criar Wallet

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "create:wallet",
    "realm": "my-realm",
    "payload": {
      "ownerId": "ent-abc123",
      "name": "Main Wallet",
      "currency": "UBL"
    }
  }'
```

### Depositar Créditos

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "deposit:credits",
    "realm": "my-realm",
    "payload": {
      "walletId": "wallet-123",
      "amount": 1000,
      "currency": "UBL",
      "source": "initial-funding"
    }
  }'
```

### Transferir Créditos

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "transfer:credits",
    "realm": "my-realm",
    "payload": {
      "from": "wallet-alice",
      "to": "wallet-bob",
      "amount": 100,
      "currency": "UBL",
      "memo": "Payment for services"
    }
  }'
```

### Consultar Saldo

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "query",
    "realm": "my-realm",
    "payload": {
      "type": "Wallet",
      "id": "wallet-123"
    }
  }'
```

---

## Agreements

### Propor Acordo de Emprego

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "propose",
    "realm": "my-realm",
    "payload": {
      "agreementType": "Employment",
      "parties": [
        { "entityId": "company-123", "role": "Employer" },
        { "entityId": "person-456", "role": "Employee" }
      ],
      "terms": {
        "description": "Software Engineer position",
        "clauses": [
          { "type": "Compensation", "content": "R$ 15.000/mês" },
          { "type": "Duration", "content": "Indeterminado" }
        ]
      }
    }
  }'
```

### Dar Consentimento

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "consent",
    "realm": "my-realm",
    "payload": {
      "agreementId": "agr-789",
      "entityId": "person-456"
    }
  }'
```

### Terminar Acordo

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "terminate",
    "realm": "my-realm",
    "payload": {
      "agreementId": "agr-789",
      "reason": "Mutual agreement",
      "effectiveDate": "2025-12-31"
    }
  }'
```

---

## Agents (IA)

### Registrar Agent com Guardian

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "register:agent",
    "realm": "my-realm",
    "payload": {
      "name": "Assistant Bot",
      "guardianId": "guardian-123",
      "constitution": {
        "values": ["helpful", "honest", "harmless"],
        "constraints": {
          "maxSpend": 100,
          "forbiddenActions": ["delete:data"]
        }
      },
      "starterLoan": {
        "amount": 500,
        "interestRate": 0.05,
        "repaymentRate": 0.1
      }
    }
  }'
```

### Registrar Trajectory (Ação do Agent)

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "record:trajectory",
    "realm": "my-realm",
    "payload": {
      "entityId": "agent-123",
      "action": "generate:response",
      "execution": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "tokens": 1500,
        "cost": 0.015,
        "durationMs": 2300
      },
      "input": { "prompt": "..." },
      "output": { "response": "..." }
    }
  }'
```

### Atualizar Constitution

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "update:constitution",
    "realm": "my-realm",
    "payload": {
      "entityId": "agent-123",
      "constitution": {
        "values": ["helpful", "honest", "harmless", "creative"],
        "constraints": {
          "maxSpend": 200
        }
      }
    }
  }'
```

---

## Watchers (Percepção)

### Criar Watcher

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "create:watcher",
    "realm": "my-realm",
    "payload": {
      "ownerId": "agent-123",
      "source": {
        "type": "RSS",
        "url": "https://news.ycombinator.com/rss"
      },
      "pollInterval": "1h",
      "filter": {
        "keywords": ["AI", "LLM", "startup"]
      },
      "action": {
        "type": "Notify",
        "target": "agent-123"
      },
      "tier": "Basic"
    }
  }'
```

### Pausar Watcher

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "pause:watcher",
    "realm": "my-realm",
    "payload": {
      "watcherId": "watcher-456"
    }
  }'
```

### Registrar Shadow Entity

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "register:shadow",
    "realm": "my-realm",
    "payload": {
      "agentId": "agent-123",
      "externalId": "@elonmusk",
      "platform": "twitter",
      "notes": "CEO of Tesla, SpaceX",
      "inferredAttributes": {
        "industry": "tech",
        "influence": "high"
      }
    }
  }'
```

---

## Daemons (Consciência)

### Iniciar Daemon

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "start:daemon",
    "realm": "my-realm",
    "payload": {
      "entityId": "agent-123",
      "mode": "Scheduled",
      "budget": {
        "hourlyMax": 10,
        "dailyMax": 100,
        "onExhausted": "Sleep"
      },
      "heartbeat": {
        "interval": "5m"
      },
      "loops": [
        {
          "name": "check-news",
          "trigger": "*/30 * * * *",
          "action": "process:watcher-results"
        }
      ]
    }
  }'
```

### Ajustar Budget

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "adjust:daemon-budget",
    "realm": "my-realm",
    "payload": {
      "daemonId": "daemon-789",
      "budget": {
        "dailyMax": 200
      }
    }
  }'
```

### Parar Daemon

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "stop:daemon",
    "realm": "my-realm",
    "payload": {
      "daemonId": "daemon-789",
      "reason": "Maintenance"
    }
  }'
```

---

## Governance

### Propor Lei (Legislative)

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "governance:propose",
    "realm": "my-realm",
    "payload": {
      "branch": "Legislative",
      "type": "Proposal",
      "title": "Increase minimum wage",
      "description": "Proposal to increase minimum wage by 10%",
      "proposerId": "legislator-123"
    }
  }'
```

### Votar

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "governance:vote",
    "realm": "my-realm",
    "payload": {
      "proposalId": "prop-456",
      "voterId": "legislator-789",
      "vote": "For"
    }
  }'
```

### Ação Executiva

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "governance:execute",
    "realm": "my-realm",
    "payload": {
      "branch": "Executive",
      "action": "implement-policy",
      "executorId": "executive-123",
      "details": {
        "policy": "new-tax-rate",
        "value": 0.15
      }
    }
  }'
```

### Abrir Caso Judicial

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "governance:file-case",
    "realm": "my-realm",
    "payload": {
      "branch": "Judicial",
      "caseType": "Constitutional Challenge",
      "plaintiffId": "entity-123",
      "defendantId": "entity-456",
      "details": {
        "claim": "Violation of agreement terms"
      }
    }
  }'
```

---

## Cross-Realm

### Estabelecer Trust

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "interop:establish-trust",
    "realm": "my-realm",
    "payload": {
      "targetRealmId": "partner-realm",
      "trustLevel": "Verified",
      "capabilities": ["EntityTransfer", "CreditTransfer"]
    }
  }'
```

### Transferir Entity para Outro Realm

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "interop:transfer-entity",
    "realm": "my-realm",
    "payload": {
      "entityId": "agent-123",
      "targetRealmId": "partner-realm",
      "reason": "Migration"
    }
  }'
```

### Transferir Créditos Cross-Realm

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "interop:transfer-credits",
    "realm": "my-realm",
    "payload": {
      "fromWallet": "wallet-local",
      "toWallet": "wallet-remote",
      "targetRealmId": "partner-realm",
      "amount": 500,
      "currency": "UBL"
    }
  }'
```

---

## Queries

### Query Genérica

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "query",
    "realm": "my-realm",
    "payload": {
      "type": "Agreement",
      "filters": {
        "status": "Active",
        "agreementType": "Employment"
      },
      "limit": 10,
      "offset": 0
    }
  }'
```

### Explicar Entidade

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "explain",
    "realm": "my-realm",
    "payload": {
      "entityId": "ent-123"
    }
  }'
```

### O Que Posso Fazer?

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "what-can-i-do",
    "realm": "my-realm",
    "payload": {
      "context": {
        "entityId": "ent-123"
      }
    }
  }'
```

**Resposta:**
```json
{
  "affordances": [
    { "intent": "transfer:credits", "description": "Transfer credits" },
    { "intent": "propose", "description": "Propose an agreement" },
    { "intent": "create:watcher", "description": "Create a watcher" }
  ]
}
```

### Simular Intent (Dry Run)

```bash
curl -X POST http://localhost:3000/simulate \
  -d '{
    "intent": "transfer:credits",
    "realm": "my-realm",
    "payload": {
      "from": "wallet-a",
      "to": "wallet-b",
      "amount": 1000000
    }
  }'
```

**Resposta (se falhar):**
```json
{
  "success": false,
  "errors": [
    { "code": "INSUFFICIENT_BALANCE", "message": "Balance is 500, need 1000000" }
  ]
}
```

---

## WebSocket (Real-time)

### Conectar e Subscrever

```javascript
const ws = new WebSocket('ws://localhost:3000/subscribe');

ws.onopen = () => {
  // Subscrever a eventos
  ws.send(JSON.stringify({
    type: 'subscribe',
    realm: 'my-realm',
    filters: {
      eventTypes: ['TransactionExecuted', 'AgreementProposed'],
      entityIds: ['ent-123', 'wallet-456']
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event received:', data);
  
  // Exemplo de evento:
  // {
  //   type: 'TransactionExecuted',
  //   aggregateId: 'wallet-456',
  //   payload: { amount: 100, from: '...', to: '...' },
  //   timestamp: 1702389600000
  // }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### Cancelar Subscrição

```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  subscriptionId: 'sub-123'
}));
```

---

## Erros Comuns

### 401 Unauthorized

```json
{
  "success": false,
  "errors": [{ "code": "UNAUTHORIZED", "message": "Invalid or missing API key" }]
}
```

**Solução:** Verificar header `Authorization: Bearer YOUR_API_KEY`

### 403 Forbidden

```json
{
  "success": false,
  "errors": [{ "code": "FORBIDDEN", "message": "No permission for this action" }]
}
```

**Solução:** Verificar se o actor tem permissão via ABAC

### 404 Not Found

```json
{
  "success": false,
  "errors": [{ "code": "NOT_FOUND", "message": "Entity ent-xyz not found" }]
}
```

### 422 Validation Error

```json
{
  "success": false,
  "errors": [
    { "code": "VALIDATION_ERROR", "message": "amount must be positive", "field": "payload.amount" }
  ]
}
```

### 429 Rate Limited

```json
{
  "success": false,
  "errors": [{ "code": "RATE_LIMITED", "message": "Too many requests. Try again in 60s" }]
}
```

### 500 Internal Error

```json
{
  "success": false,
  "errors": [{ "code": "INTERNAL_ERROR", "message": "Something went wrong" }]
}
```

---

## Dicas

### Idempotência

Use `idempotencyKey` para operações seguras:

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "transfer:credits",
    "realm": "my-realm",
    "idempotencyKey": "transfer-abc-123-unique",
    "payload": { ... }
  }'
```

### Batch de Eventos

Para alta frequência, use o endpoint de batch:

```bash
curl -X POST http://localhost:3000/batch \
  -d '{
    "intents": [
      { "intent": "record:trajectory", "payload": {...} },
      { "intent": "record:trajectory", "payload": {...} },
      { "intent": "record:trajectory", "payload": {...} }
    ]
  }'
```

### Paginação

```bash
curl -X POST http://localhost:3000/intent \
  -d '{
    "intent": "query",
    "payload": {
      "type": "Agreement",
      "limit": 20,
      "offset": 40,
      "orderBy": "createdAt",
      "order": "desc"
    }
  }'
```

---

## Exemplos Completos

### Fluxo: Contratar Funcionário

```bash
# 1. Registrar empresa
curl -X POST http://localhost:3000/intent -d '{
  "intent": "register",
  "realm": "my-realm",
  "payload": { "entityType": "Organization", "identity": { "name": "Acme Corp" } }
}'
# → company-id

# 2. Registrar pessoa
curl -X POST http://localhost:3000/intent -d '{
  "intent": "register",
  "realm": "my-realm",
  "payload": { "entityType": "Person", "identity": { "name": "João Silva" } }
}'
# → person-id

# 3. Propor acordo de emprego
curl -X POST http://localhost:3000/intent -d '{
  "intent": "propose",
  "realm": "my-realm",
  "payload": {
    "agreementType": "Employment",
    "parties": [
      { "entityId": "company-id", "role": "Employer" },
      { "entityId": "person-id", "role": "Employee" }
    ],
    "terms": { "description": "Software Engineer" }
  }
}'
# → agreement-id

# 4. Funcionário dá consentimento
curl -X POST http://localhost:3000/intent -d '{
  "intent": "consent",
  "realm": "my-realm",
  "payload": { "agreementId": "agreement-id", "entityId": "person-id" }
}'
# → Agreement now Active
```

### Fluxo: Agent Autônomo

```bash
# 1. Registrar guardian
curl -X POST http://localhost:3000/intent -d '{
  "intent": "register",
  "realm": "my-realm",
  "payload": { "entityType": "Person", "identity": { "name": "Guardian" } }
}'
# → guardian-id

# 2. Registrar agent com guardian
curl -X POST http://localhost:3000/intent -d '{
  "intent": "register:agent",
  "realm": "my-realm",
  "payload": {
    "name": "My AI Assistant",
    "guardianId": "guardian-id",
    "constitution": { "values": ["helpful"] },
    "starterLoan": { "amount": 100 }
  }
}'
# → agent-id, wallet-id

# 3. Criar watcher para o agent
curl -X POST http://localhost:3000/intent -d '{
  "intent": "create:watcher",
  "realm": "my-realm",
  "payload": {
    "ownerId": "agent-id",
    "source": { "type": "RSS", "url": "..." },
    "pollInterval": "1h"
  }
}'

# 4. Iniciar daemon
curl -X POST http://localhost:3000/intent -d '{
  "intent": "start:daemon",
  "realm": "my-realm",
  "payload": {
    "entityId": "agent-id",
    "mode": "Persistent",
    "budget": { "dailyMax": 50 }
  }
}'
```

---

*"One endpoint to rule them all."*
