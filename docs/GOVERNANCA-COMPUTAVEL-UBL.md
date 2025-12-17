# Governança Computável & Compliance Operacional - UBL

**Fase 8: GOVERNANÇA COMPUTÁVEL & COMPLIANCE OPERACIONAL**

Este documento descreve como a governança operacional (rate limiting, quotas, políticas) e compliance (export, GDPR, retenção de dados) funcionam no UBL.

---

## Visão Geral

O UBL implementa governança computável em múltiplas camadas:

1. **Rate Limiting**: Limita requisições por Realm/Entidade/Intent/API Key
2. **Quotas**: Limita uso de recursos (eventos, storage, etc.) por Realm
3. **Políticas**: Regras de negócio que podem negar operações
4. **Export & Compliance**: Exportação de dados para GDPR e outras regulamentações
5. **Data Retention**: Retenção e exclusão de dados conforme políticas

---

## Rate Limiting

### Como Funciona

O rate limiting é aplicado em múltiplas dimensões:

- **Por Realm**: Limita requisições de um Realm específico
- **Por Entidade**: Limita requisições de uma Entidade específica
- **Por Intent**: Limita execuções de um Intent específico (ex.: `runExpensiveReport`)
- **Por API Key**: Limita requisições de uma API Key específica
- **Global**: Limite global para todo o sistema

### Configuração

Rate limits são configurados via `RateLimit`:

```typescript
{
  id: 'limit-realm-requests',
  name: 'Realm Requests per Minute',
  scope: { type: 'Realm', realmId: 'realm-123' },
  limit: 100,
  window: { amount: 1, unit: 'minutes' },
  action: { type: 'Reject', message: 'Rate limit exceeded' },
  enabled: true,
}
```

### Implementação

- **Redis-based**: Usa Redis para contadores distribuídos (`core/operational/rate-limiter-redis.ts`)
- **In-memory**: Fallback para ambiente sem Redis

### Logs

Todas as decisões de rate limiting são logadas:

- `governance.decision.allowed` - Operação permitida
- `governance.decision.denied` (kind: `rate_limit`) - Rate limit excedido

Campos incluídos: `realmId`, `entityId`, `intent`, `limit`, `remaining`, `retryAfter`, `traceId`

### Resposta da API

Quando rate limit é excedido:

- **HTTP Status**: `429 Too Many Requests`
- **Headers**: `Retry-After: <segundos>`
- **Body**: Resposta do agente com mensagem operacional (via Fase 6)

---

## Quotas

### Como Funciona

Quotas limitam uso de recursos por Realm:

- **Events**: Total de eventos
- **EventsPerDay**: Eventos por dia
- **Entities**: Total de entidades
- **Agreements**: Total de agreements
- **Assets**: Total de assets
- **StorageBytes**: Armazenamento total
- **ApiRequestsPerDay**: Requisições API por dia

### Configuração

```typescript
{
  id: 'quota-events-per-realm',
  name: 'Events per Realm',
  resource: 'Events',
  limit: 1000000,
  scope: 'PerRealm',
  enforced: true,
  onExceeded: { type: 'Block', message: 'Quota exceeded' },
}
```

### Verificação

Quotas são verificadas antes de operações que consomem recursos:

```typescript
const decision = await governanceEvaluator.evaluate({
  realmId: 'realm-123',
  resourceType: 'Events',
});
```

### Logs

- `governance.decision.allowed` - Quota disponível
- `governance.decision.denied` (kind: `quota_exceeded`) - Quota excedida

---

## Políticas de Governança

### Avaliação de Governança

O `GovernanceEvaluator` combina rate limiting e quotas:

```typescript
const evaluator = createGovernanceEvaluator(rateLimiter, quotaManager);

const decision = await evaluator.evaluate({
  realmId: 'realm-123',
  intent: 'createRealm',
  resourceType: 'Events',
  traceId: 'trace-456',
});
```

### Decisão

A decisão pode ser:

- `{ allowed: true, ... }` - Operação permitida
- `{ allowed: false, kind: 'rate_limit' | 'quota_exceeded' | 'policy_denied', ... }` - Operação negada

### Integração com Agente

Quando uma operação é negada, o agente retorna uma mensagem operacional:

- **Rate Limit**: `buildRateLimitExceededMessage()` - Guidance com `retryAfter`
- **Quota**: `buildQuotaExceededMessage()` - Guidance com sugestões de otimização
- **Política**: `buildPolicyDeniedMessage()` - Guidance explicando a política

---

## Export & Compliance (GDPR)

### Fluxo de Export

1. **Request**: Criar pedido de export via `ExportService.request()`
2. **Processing**: Processamento assíncrono (worker/projeção)
3. **Ready**: Export pronto, link de download disponível
4. **Failed**: Falha no processamento, erro registrado

### Tipos de Export

- **EntityData**: Todos os dados de uma entidade (GDPR)
- **RealmData**: Todos os dados de um Realm
- **AgreementData**: Agreement com histórico
- **AuditLog**: Trilha de auditoria

### Formatos

- **JSON**: NDJSON (newline-delimited JSON)
- **CSV**: Dados tabulares
- **PDF**: Relatório formatado
- **ZIP**: Arquivo comprimido com múltiplos formatos

### Como Usar

```typescript
const exportRequest = await exportService.request({
  type: 'EntityData',
  scope: {
    entityId: 'entity-123',
    realmId: 'realm-456',
  },
  format: 'JSON',
  requestedBy: 'user-789',
});

// Verificar status
const status = await exportService.getStatus(exportRequest.id);

// Quando ready, downloadUrl estará disponível
if (status.state === 'Completed' && status.result) {
  const downloadUrl = status.result.downloadUrl;
}
```

### Logs

- `export.request.created` - Export solicitado
- `export.request.processing` - Processamento iniciado
- `export.request.ready` - Export concluído
- `export.request.failed` - Export falhou

Campos: `exportId`, `type`, `realmId`, `entityId`, `format`, `recordCount`, `sizeBytes`, `traceId`

### Mensagens do Agente

- **Requested**: `buildExportRequestedMessage()` - Informational
- **Ready**: `buildExportReadyMessage()` - Informational com link de download
- **Failed**: `buildExportFailedMessage()` - Incident com runbook

---

## Data Retention & Crypto-Shredding

### Estratégia

O UBL concilia imutabilidade do event store com requisitos de privacidade:

1. **Event Store Imutável**: Eventos nunca são deletados do event store
2. **Dados Sensíveis Criptografados**: Dados sensíveis são criptografados com chaves específicas
3. **Crypto-Shredding**: Deletar a chave de criptografia efetivamente "deleta" os dados
4. **Exclusão Lógica**: Projeções marcam dados como "deletados" sem modificar o event store

### Políticas de Retenção

```typescript
const policy: DataRetentionPolicy = {
  realmId: 'realm-123',
  entityType: 'User',
  retentionDays: 365,
  deletionStrategy: 'crypto_shred',
  legalBasis: 'GDPR Article 6(1)(f)',
  regulation: 'GDPR',
};
```

### Aplicação

```typescript
const retentionService = createDataRetentionService(pool, eventStore);

await retentionService.registerPolicy(policy);

const result = await retentionService.applyPolicy(
  'Entity',
  'entity-123',
  policy
);

// result.encrypted = true
// result.keyDeleted = true (crypto-shredding)
// result.projectionMasked = true
```

### Logs

- `retention.policy.registered` - Política registrada
- `retention.crypto_shred.applied` - Crypto-shredding aplicado
- `retention.logical_delete.applied` - Exclusão lógica aplicada

---

## Como Acionar

### Via API

```bash
# Verificar rate limit
curl -X POST "$API_URL/governance/check" \
  -H "Content-Type: application/json" \
  -d '{
    "realmId": "realm-123",
    "intent": "createRealm"
  }'

# Solicitar export
curl -X POST "$API_URL/exports" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EntityData",
    "scope": {
      "entityId": "entity-123"
    },
    "format": "JSON"
  }'
```

### Via CLI

```bash
# Verificar quotas
./cli/check-quotas --realm realm-123

# Solicitar export
./cli/request-export --entity entity-123 --format JSON
```

---

## Como Monitorar

### Logs

```bash
# Rate limiting
grep "governance.decision" /var/log/ubl-api.log | tail -20

# Exports
grep "export.request" /var/log/ubl-api.log | tail -20

# Retenção
grep "retention" /var/log/ubl-api.log | tail -20
```

### Métricas (se implementadas)

- Rate limit hits/misses por Realm
- Quota usage por Realm
- Export requests por status
- Retention policies aplicadas

### Mensagens do Agente

O agente pode ser consultado sobre governança:

- "Qual é o meu rate limit atual?"
- "Quanto de quota eu tenho disponível?"
- "Status do meu export request X"

---

## Links Relacionados

- [Observabilidade UBL](./OBSERVABILITY-UBL.md) - Logs e métricas
- [Realm Contract](./REALM-CONTRACT.md) - Isolamento de Realms
- [API Contract](./CONTRATO-API-UBL.md) - Contratos da API

---

## Troubleshooting

### Rate Limit Excedido

1. Verificar logs: `grep "governance.decision.denied" logs | grep rate_limit`
2. Aguardar `retryAfter` segundos
3. Verificar se há limites configurados muito baixos
4. Contatar administrador para aumentar limites

### Quota Excedida

1. Verificar uso atual: `./cli/check-quotas --realm realm-123`
2. Liberar recursos (arquivar dados antigos, remover entidades não utilizadas)
3. Solicitar aumento de quota

### Export Falhou

1. Verificar logs: `grep "export.request.failed" logs`
2. Verificar espaço em disco
3. Verificar acessibilidade do event store
4. Tentar novamente com escopo menor

### Retenção Não Aplicada

1. Verificar se política está registrada: `grep "retention.policy.registered" logs`
2. Verificar se dados são elegíveis para deleção
3. Verificar se há legal holds ativos

---

**Última atualização**: Fase 8 - Governança Computável & Compliance Operacional

