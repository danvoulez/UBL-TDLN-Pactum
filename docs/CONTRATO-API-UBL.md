# Contrato API UBL - Universal Business Ledger

**Data:** 2025-12-07  
**Status:** ✅ **CONTRATO OFICIAL**  
**Objetivo:** Definir contratos completos de todos os endpoints da API

---

## 📋 Endpoints

### 1. GET /health

**Propósito:** Health check da API e componentes.

**Request:**
```
GET /health
```

**Response (Contrato Mínimo):**
```typescript
{
  status: "ok",              // obrigatório: "ok" | "degraded" | "unhealthy"
  service: "antenna",        // opcional
  timestamp: number,         // opcional: Unix timestamp em ms
  eventStore?: {             // opcional
    type: string,           // "PostgreSQL" | "InMemory"
    isPersisting: boolean,  // true se persistindo dados
    health?: any
  }
}
```

**Invariantes:**
- ✅ `status` sempre presente
- ✅ Se `status = "ok"`, API está funcional
- ✅ Resposta sempre é JSON válido

**Exemplo:**
```json
{
  "status": "ok",
  "service": "antenna",
  "timestamp": 1701532800000,
  "eventStore": {
    "type": "PostgreSQL",
    "isPersisting": true,
    "health": { "healthy": true }
  }
}
```

---

### 2. POST /intent

**Propósito:** Executar qualquer intent de domínio.

**Request:**
```typescript
POST /intent
Content-Type: application/json

{
  intent: string;           // obrigatório: "createRealm" | "register" | "propose" | ...
  payload: object;          // obrigatório (pode ser {})
  realm?: EntityId;         // opcional: resolvido via API key se não fornecido
  actor?: ActorReference;   // opcional: { type: "System" | "Entity" | ..., ... }
}
```

**Response (Sucesso):**
```typescript
{
  success: true;            // obrigatório
  intent: string;          // obrigatório: mesmo intent da request
  outcome: {               // obrigatório
    type: "Created" | "Updated" | "Transitioned" | "Transferred" | "Queried" | "Nothing";
    id?: EntityId;         // obrigatório para intents de criação
    entity?: any;          // opcional: dados da entidade criada/atualizada
    changes?: string[];    // opcional: campos alterados
  };
  events: Event[];         // obrigatório: array (>= 0)
  affordances: Affordance[]; // obrigatório: array (>= 0)
  errors?: [];             // opcional: array vazio ou ausente
  meta: {                  // obrigatório
    processedAt: number;   // timestamp em ms
    processingTime: number; // tempo de processamento em ms
  };
}
```

**Response (Erro):**
```typescript
{
  success: false;           // obrigatório
  intent: string;          // obrigatório: mesmo intent da request
  outcome: {               // obrigatório
    type: "Nothing";
    reason: string;        // descrição do erro
  };
  events: [];              // obrigatório: array vazio
  affordances: [];         // obrigatório: array vazio
  errors: [                // obrigatório: array com pelo menos 1 item
    {
      code: string;        // "INVALID_PAYLOAD" | "UNKNOWN_INTENT" | "REALM_REQUIRED" | ...
      message: string;     // mensagem clara do problema
      field?: string;      // opcional: "payload.name"
    }
  ];
  meta: {
    processedAt: number;
    processingTime: number;
  };
}
```

**Invariantes:**
- ✅ `success` sempre presente (true/false)
- ✅ Se `success=true`: `errors` vazio ou ausente, `outcome.id` obrigatório para criação
- ✅ Se `success=false`: `errors` array com pelo menos 1 item
- ✅ `events` sempre é array (>= 0)
- ✅ Para intents de criação: `outcome.id` obrigatório

**Exemplo (createRealm):**
```json
{
  "success": true,
  "intent": "createRealm",
  "outcome": {
    "type": "Created",
    "id": "realm-abc123",
    "entity": {
      "id": "realm-abc123",
      "name": "My Company",
      "apiKey": "ubl_sk_...",
      "entityId": "ent-xyz789"
    }
  },
  "events": [
    {
      "type": "RealmCreated",
      "aggregateId": "realm-abc123",
      "aggregateType": "Realm",
      "aggregateVersion": 1,
      "payload": { ... }
    }
  ],
  "affordances": [
    { "intent": "register", "description": "Create an entity", ... }
  ],
  "meta": {
    "processedAt": 1701532800000,
    "processingTime": 45
  }
}
```

**Exemplo (Erro):**
```json
{
  "success": false,
  "intent": "createRealm",
  "outcome": {
    "type": "Nothing",
    "reason": "Invalid payload"
  },
  "events": [],
  "affordances": [],
  "errors": [
    {
      "code": "INVALID_PAYLOAD",
      "message": "payload.name is required",
      "field": "payload.name"
    }
  ],
  "meta": {
    "processedAt": 1701532800000,
    "processingTime": 2
  }
}
```

---

### 3. GET /affordances

**Propósito:** Obter catálogo de ações disponíveis.

**Request:**
```
GET /affordances
GET /affordances?realm=<realmId>
```

**Response:**
```typescript
{
  realmId?: EntityId;      // opcional: realm consultado
  items: [                 // obrigatório: array (>= 0)
    {
      id: string;          // obrigatório: identificador único
      intent: string;       // obrigatório: intent correspondente
      label: string;        // obrigatório: label para UI
      category?: string;    // opcional: "realm" | "entity" | "agreement" | ...
      description?: string; // opcional
      requiresConfirmation?: boolean; // opcional
      defaultPayload?: object; // opcional
      schema?: object;      // opcional: JSON Schema
    }
  ]
}
```

**Invariantes:**
- ✅ `items` sempre é array (mesmo vazio)
- ✅ Cada item tem pelo menos: `id`, `intent`, `label`
- ✅ Resposta sempre é JSON válido

**Exemplo:**
```json
{
  "realmId": "realm-abc123",
  "items": [
    {
      "id": "createRealm",
      "intent": "createRealm",
      "label": "Create a new realm",
      "category": "realm",
      "description": "Cria um novo tenant",
      "requiresConfirmation": true
    },
    {
      "id": "register",
      "intent": "register",
      "label": "Register entity",
      "category": "entity",
      "description": "Cria uma nova entidade no realm"
    }
  ]
}
```

**Erro (Realm inválido):**
```json
{
  "error": "REALM_NOT_FOUND",
  "message": "Realm not found: realm-xyz",
  "realmId": "realm-xyz"
}
```

---

### 4. POST /session/start

**Propósito:** Iniciar uma sessão de conversação.

**Request:**
```typescript
POST /session/start
Content-Type: application/json

{
  realmId: EntityId;       // obrigatório
  actor: ActorReference;   // obrigatório: { type: "System" | "Entity" | ..., ... }
}
```

**Response:**
```typescript
{
  sessionId: EntityId;      // obrigatório
  realmId: EntityId;       // obrigatório
  actor: ActorReference;   // obrigatório
  createdAt: number;       // obrigatório: timestamp em ms
  // outros campos opcionais
}
```

**Invariantes:**
- ✅ `sessionId` sempre presente e não-vazio
- ✅ `realmId` corresponde ao fornecido
- ✅ `actor` corresponde ao fornecido

---

### 5. POST /chat

**Propósito:** Enviar mensagem para o agente conversacional.

**Request (Primeira chamada):**
```typescript
POST /chat
Content-Type: application/json

{
  message: {               // obrigatório
    text: string;          // obrigatório: mensagem do usuário
    type?: string;         // opcional: "text" | ...
    affordanceClick?: {    // opcional
      intent: string;
      prefilled: object;
    };
    context?: object;      // opcional
  };
  startSession: {         // obrigatório na primeira chamada
    realmId: EntityId;
    actor: ActorReference;
  };
}
```

**Request (Chamadas seguintes):**
```typescript
POST /chat
Content-Type: application/json

{
  sessionId: EntityId;     // obrigatório: da primeira chamada
  message: {               // obrigatório
    text: string;
    // ... outros campos opcionais
  };
}
```

**Response (Contrato Completo):**
```typescript
{
  sessionId: EntityId;      // obrigatório: sempre presente
  response: {              // obrigatório: AgentResponse
    id: EntityId;          // obrigatório
    content: {             // obrigatório
      type: string;       // "markdown" | ...
      markdown: string;   // obrigatório: string não-vazia
    };
    affordances: [];       // obrigatório: array (>= 0)
    suggestions?: string[]; // opcional
    focus?: FocusChange;   // opcional
    subscription?: SubscriptionInfo; // opcional
    meta: {                // obrigatório
      timestamp: number | string; // obrigatório
      processingMs: number;       // obrigatório: >= 0
      turn: number;               // obrigatório: >= 1
      interpretation?: any;       // opcional
      cached?: boolean;           // opcional
    };
  };
}
```

**Invariantes:**
- ✅ `sessionId` nunca pode faltar
- ✅ `response.content.markdown` deve ser string não-vazia
- ✅ `response.affordances` deve ser array (pode ser vazio)
- ✅ `response.meta.turn` deve ser número >= 1

**Erro (Sem startSession nem sessionId):**
```json
{
  "error": "SESSION_REQUIRED",
  "message": "Either startSession or sessionId must be provided"
}
```

**Exemplo:**
```json
{
  "sessionId": "sess-abc123",
  "response": {
    "id": "resp-xyz789",
    "content": {
      "type": "markdown",
      "markdown": "# Hello!\n\nI can help you manage your business ledger."
    },
    "affordances": [
      {
        "intent": "createRealm",
        "description": "Create a new realm",
        "required": ["name"]
      }
    ],
    "suggestions": ["Create a realm", "List entities"],
    "meta": {
      "timestamp": 1701532800000,
      "processingMs": 234,
      "turn": 1
    }
  }
}
```

---

### 6. GET /session/:id

**Propósito:** Obter estado de uma sessão.

**Request:**
```
GET /session/<sessionId>
```

**Response:**
```typescript
{
  sessionId: EntityId;
  realmId: EntityId;
  actor: ActorReference;
  createdAt: number;
  lastActivityAt: number;
  messages?: Message[];    // opcional: histórico de mensagens
  // outros campos opcionais
}
```

**Erro (Sessão não encontrada):**
```json
{
  "error": "Session not found",
  "sessionId": "sess-xyz"
}
```

---

### 7. GET /suggestions

**Propósito:** Obter sugestões de autocomplete.

**Request:**
```
GET /suggestions
GET /suggestions?sessionId=<sessionId>
GET /suggestions?sessionId=<sessionId>&partialInput=<text>
```

**Response:**
```typescript
{
  suggestions: string[];   // obrigatório: array (>= 0)
  // outros campos opcionais
}
```

**Invariantes:**
- ✅ `suggestions` sempre é array (mesmo vazio)
- ✅ Resposta sempre é JSON válido

---

## 🔒 Invariantes Globais

### 1. Respostas Sempre JSON

Todos os endpoints retornam JSON válido, mesmo em caso de erro.

### 2. Códigos HTTP Consistentes

- `200` - Sucesso
- `400` - Bad Request (payload inválido)
- `401` - Unauthorized (autenticação necessária)
- `403` - Forbidden (sem permissão)
- `404` - Not Found (recurso não existe)
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

### 3. Erros Sempre Estruturados

Mesmo em caso de erro, a resposta segue formato consistente:

```typescript
{
  error: string;           // código do erro
  message: string;         // mensagem legível
  details?: object;        // opcional: detalhes adicionais
}
```

---

## 📚 Referências

- **Filosofia:** `PHILOSOPHY.md` - "Every relationship is an Agreement"
- **Arquitetura:** `ARCHITECTURE.md` - Estrutura do sistema
- **Realm:** `REALM-CONTRACT.md` - Contrato de Realm
- **Arquitetura:** `ARQUITETURA-UBL-CONTRATO.md` - Fronteiras de arquitetura

---

**Status:** ✅ **CONTRATO ESTABELECIDO**  
**Última atualização:** 2025-12-07

