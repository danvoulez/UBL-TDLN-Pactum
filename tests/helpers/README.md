# 🧪 Test Helpers - LLM-Friendly

**Status:** ✅ **MODULAR E LLM-FRIENDLY**  
**Data:** 2025-12-07

---

## 📋 Visão Geral

Helpers modulares e LLM-friendly para facilitar escrita e debugging de testes:

- **Erros estruturados** com contexto completo
- **Assertions descritivas** com mensagens claras
- **Fixtures reutilizáveis** para dados de teste
- **Setup melhorado** com validações robustas

---

## 🚀 Uso Rápido

### **1. Erros LLM-Friendly**

```typescript
import { llmError, TEST_ERROR_CODES } from '../helpers/llm-errors.js';

// Erro estruturado com contexto completo
throw llmError('EVENT_INTEGRITY', 
  'Evento falhou na validação',
  { event, errors: ['campo X ausente'] },
  'Verifique se todos os campos obrigatórios estão presentes'
);
```

### **2. Assertions Descritivas**

```typescript
import { 
  assertEventIntegrity,
  assertSequenceCorrect,
  assertHashChainValid 
} from '../helpers/assertions.js';

// Validar integridade de evento
assertEventIntegrity(event, { 
  operation: 'createRealm',
  realmId: 'rlm-123' 
});

// Validar sequência de eventos
await assertSequenceCorrect(events, {
  expectedStart: 1n,
  expectedCount: 5,
  operation: 'realmCreation'
});

// Validar hash chain
assertHashChainValid(events, { operation: 'test' });
```

### **3. Fixtures Reutilizáveis**

```typescript
import {
  createTestEvent,
  createPartyRegisteredEvent,
  createTestParty,
  createTestContext
} from '../helpers/fixtures.js';

// Criar evento de teste
const event = createTestEvent('PartyRegistered', {
  aggregateId: 'ent-123',
  realm: 'rlm-456'
});

// Criar party de teste
const party = createTestParty({
  partyId: 'ent-123',
  name: 'Test Person',
  realmId: 'rlm-456'
});

// Criar contexto completo
const ctx = createTestContext({
  realmId: 'rlm-123',
  actorId: 'ent-456'
});
```

---

## 📚 Documentação Detalhada

### **llm-errors.ts**

Sistema de erros estruturados para facilitar debugging por LLMs.

#### **Códigos de Erro:**

- `TE001` - `EVENT_INTEGRITY`: Falha na validação de integridade de evento
- `TE002` - `EVENT_SEQUENCE`: Falha na sequência de eventos
- `TE003` - `HASH_CHAIN`: Falha na hash chain
- `TE004` - `TIMESTAMP_INVALID`: Timestamp inválido
- `TE005` - `REALM_ISOLATION`: Falha no isolamento de realms
- `TE006` - `ACTOR_MISSING`: Actor ausente ou inválido
- `TE007` - `INTENT_RESULT`: Resultado de intent inválido
- `TE008` - `PERFORMANCE`: Operação excedeu tempo limite
- `TE009` - `SETUP_FAILED`: Falha ao configurar ambiente
- `TE010` - `CLEANUP_FAILED`: Falha ao limpar recursos
- `TE011` - `ASSERTION_FAILED`: Assertion falhou
- `TE012` - `TYPE_MISMATCH`: Tipo incorreto
- `TE013` - `VALUE_OUT_OF_RANGE`: Valor fora do range
- `TE014` - `MISSING_REQUIRED_FIELD`: Campo obrigatório ausente
- `TE015` - `INVALID_FORMAT`: Formato inválido

#### **Funções Principais:**

- `llmError(code, message, context, suggestion)`: Cria erro estruturado
- `assertLLM(condition, code, message, context)`: Assert com erro LLM-friendly
- `assertEqualLLM(actual, expected, field, context)`: Comparação com contexto
- `assertTypeLLM(value, expectedType, field, context)`: Validação de tipo
- `assertFormatLLM(value, format, field, context)`: Validação de formato

---

### **assertions.ts**

Assertions descritivas com contexto completo.

#### **Funções Principais:**

- `assertEventIntegrity(event, context)`: Valida integridade de evento
- `assertSequenceCorrect(events, context)`: Valida sequência de eventos
- `assertHashChainValid(events, context)`: Valida hash chain
- `assertReasonableTimestamp(timestamp, context)`: Valida timestamp
- `assertRealmIsolation(realm1Events, realm2Events, realm1Id, realm2Id, context)`: Valida isolamento
- `assertActorPresent(event, context)`: Valida presença de actor
- `assertIntentResult(result, context)`: Valida resultado de intent
- `assertPerformance(fn, maxMs, description, context)`: Valida performance
- `assertWithContext(condition, message, context)`: Assert genérico com contexto

---

### **fixtures.ts**

Dados de teste reutilizáveis e consistentes.

#### **Funções Principais:**

- `createTestEvent(type, overrides)`: Cria evento de teste
- `createPartyRegisteredEvent(overrides)`: Cria evento PartyRegistered
- `createAgreementCreatedEvent(overrides)`: Cria evento AgreementCreated
- `createAssetRegisteredEvent(overrides)`: Cria evento AssetRegistered
- `createRoleGrantedEvent(overrides)`: Cria evento RoleGranted
- `createEventSequence(count, baseEvent, incrementSequence)`: Cria sequência de eventos
- `createTestParty(overrides)`: Cria party de teste
- `createTestAgreement(overrides)`: Cria agreement de teste
- `createTestAsset(overrides)`: Cria asset de teste
- `createTestActor(overrides)`: Cria actor de teste
- `createTestContext(overrides)`: Cria contexto completo de teste

---

### **test-setup.ts**

Configuração de ambiente de testes.

#### **Funções Principais:**

- `createTestContext()`: Cria contexto com event store in-memory
- `createPostgresTestContext(connectionString)`: Cria contexto com PostgreSQL
- `createTestEntity(overrides)`: Cria entidade de teste
- `createTestAgreement(overrides)`: Cria agreement de teste
- `wait(ms)`: Aguarda tempo especificado

---

## 🎯 Exemplos de Uso

### **Exemplo 1: Teste com Validação Completa**

```typescript
import { test } from 'node:test';
import { assert } from 'node:assert';
import { createTestContext } from './helpers/test-setup.js';
import { assertEventIntegrity, assertSequenceCorrect } from './helpers/assertions.js';
import { createPartyRegisteredEvent } from './helpers/fixtures.js';

test('deve criar party com integridade válida', async () => {
  const ctx = await createTestContext();
  
  try {
    const event = createPartyRegisteredEvent({
      aggregateId: 'ent-123',
      realm: 'rlm-456'
    });
    
    // Validar integridade
    assertEventIntegrity(event, {
      operation: 'createParty',
      realmId: 'rlm-456'
    });
    
    // Append ao event store
    await ctx.eventStore.append(event);
    
    // Validar sequência
    const events = await ctx.eventStore.getByAggregate('ent-123');
    await assertSequenceCorrect(events, {
      expectedStart: 1n,
      expectedCount: 1,
      operation: 'createParty'
    });
    
  } finally {
    await ctx.cleanup();
  }
});
```

### **Exemplo 2: Teste com Erro LLM-Friendly**

```typescript
import { test } from 'node:test';
import { llmError } from './helpers/llm-errors.js';

test('deve rejeitar evento sem actor', async () => {
  const event = createTestEvent('PartyRegistered', {
    actor: null // ❌ Actor ausente
  });
  
  try {
    // Tentar validar (deve falhar)
    assertEventIntegrity(event);
    assert.fail('Deveria ter lançado erro');
  } catch (error: any) {
    // Erro LLM-friendly com contexto completo
    assert(error.llmInfo, 'Erro deve ter informações LLM');
    assert.equal(error.llmInfo.code, 'TE006'); // ACTOR_MISSING
  }
});
```

### **Exemplo 3: Teste com Fixtures**

```typescript
import { test } from 'node:test';
import { createTestContext } from './helpers/test-setup.js';
import { createTestContext as createCtx } from './helpers/fixtures.js';

test('deve criar realm completo', async () => {
  const ctx = await createTestContext();
  const testCtx = createCtx({ realmId: 'rlm-123' });
  
  try {
    // Usar fixtures para criar eventos
    const party1Event = createPartyRegisteredEvent({
      aggregateId: testCtx.party1.partyId,
      realm: testCtx.realmId
    });
    
    const party2Event = createPartyRegisteredEvent({
      aggregateId: testCtx.party2.partyId,
      realm: testCtx.realmId
    });
    
    // Append eventos
    await ctx.eventStore.append(party1Event);
    await ctx.eventStore.append(party2Event);
    
    // Validar
    const events = await ctx.eventStore.getAllEvents();
    assert.equal(events.length, 2);
    
  } finally {
    await ctx.cleanup();
  }
});
```

---

## ✅ Benefícios

1. **LLM-Friendly**: Erros estruturados facilitam debugging por LLMs
2. **Modular**: Helpers reutilizáveis e organizados
3. **Descritivo**: Mensagens claras e específicas
4. **Contexto Completo**: Informações detalhadas em cada erro
5. **Sugestões**: Correções sugeridas automaticamente
6. **Consistente**: Padrões uniformes em todos os testes

---

**Status:** ✅ **PRONTO PARA USO**  
**Última atualização:** 2025-12-07

