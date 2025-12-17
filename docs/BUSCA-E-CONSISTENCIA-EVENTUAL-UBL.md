# Busca & Consistência Eventual - UBL

**Fase 9: BUSCA & CONSISTÊNCIA EVENTUAL DO LEDGER**

Este documento descreve como a busca textual e estruturada funciona no UBL, com foco na consistência eventual e na operabilidade.

---

## Visão Geral

O UBL implementa busca sobre o ledger usando um índice externo (ex.: Elasticsearch, PostgreSQL FTS) com **consistência eventual**:

1. **Event Store**: Fonte única de verdade, imutável
2. **Índice de Busca**: Projeção derivada, eventualmente consistente
3. **Indexer**: Processa eventos do event store e atualiza o índice
4. **Lag**: Diferença entre último evento no event store e último evento indexado

### Por que Consistência Eventual?

- **Performance**: Indexação assíncrona não bloqueia escrita no ledger
- **Escalabilidade**: Indexer pode rodar em workers separados
- **Resiliência**: Falhas no indexer não afetam escrita no ledger
- **Flexibilidade**: Permite diferentes backends de busca (Elasticsearch, etc.)

---

## Arquitetura

```
┌─────────────┐
│ Event Store │ (Fonte única de verdade)
└──────┬──────┘
       │
       │ Eventos
       ▼
┌─────────────┐
│   Indexer   │ (Processa eventos, cluster-safe)
└──────┬──────┘
       │
       │ Indexa documentos
       ▼
┌─────────────┐
│   Search    │ (Elasticsearch, PostgreSQL FTS, etc.)
│   Engine    │
└─────────────┘
```

### Fluxo de Dados

1. **Escrita**: Evento é appendado ao event store
2. **Indexação**: Indexer lê eventos novos (assíncrono)
3. **Transformação**: Evento é transformado em `SearchableDocument`
4. **Indexação**: Documento é indexado no search engine
5. **Busca**: Usuário busca no índice (não no event store diretamente)

---

## Contrato Canônico do SearchEngine

### Interface

```typescript
export interface SearchEngine {
  search(query: SearchQuery): Promise<SearchResults>;
  index(document: SearchableDocument): Promise<void>;
  getIndexConsistency?(params: { realmId?: EntityId }): Promise<IndexConsistency>;
  // ... outros métodos
}
```

### SearchResults com Consistência

```typescript
export interface SearchResults {
  hits: SearchHit[];
  total: number;
  consistency?: IndexConsistency; // FASE 9: Marcador de consistência
}

export interface IndexConsistency {
  realmId?: EntityId;
  lastIndexedEventId: string | null;
  lastEventStoreEventId: string | null;
  indexLagEvents: number; // Diferença entre os dois
  lastIndexedAt?: Timestamp;
}
```

---

## Pipeline de Indexação

### Indexer Assíncrono

O indexer (`core/search/indexer.ts`) processa eventos do event store:

```typescript
const indexer = createSearchIndexer({
  pool, // PostgreSQL para cursor
  eventStore,
  searchEngine,
});

// Rodar um tick de indexação (cluster-safe)
const result = await indexer.runIndexingTick(cursor);
```

### Características

- **Idempotente**: Reprocessar eventos não duplica documentos
- **Cluster-Safe**: Lock distribuído (PostgreSQL advisory lock)
- **Observável**: Logs estruturados em todas as etapas
- **Incremental**: Processa apenas eventos novos (via cursor)

### Cursor de Indexação

O cursor rastreia o progresso:

```typescript
interface IndexingCursor {
  lastEventId?: EntityId; // Último evento processado
  realmId?: EntityId;     // Realm sendo indexado
  lastProcessedAt?: Timestamp;
}
```

Persistido em `search_indexing_cursors` (PostgreSQL).

---

## Consistência Eventual como Feature Explícita

### Modelo de Lag

O lag é calculado como:

```
indexLagEvents = count(events between lastIndexedEventId and lastEventStoreEventId)
```

### Consultar Consistência

```typescript
// Via indexer
const consistency = await indexer.getIndexConsistency(realmId);

// Via search engine (se implementado)
const consistency = await searchEngine.getIndexConsistency({ realmId });
```

### Interpretação

- **`lag = 0`**: Índice em dia, busca reflete todos os eventos
- **`lag > 0`**: Índice atrasado, alguns eventos ainda não indexados
- **`lag crescente`**: Indexer pode estar com problemas

---

## Operação

### Rodar Indexer

```bash
# Via worker/scheduler (recomendado)
# O indexer roda periodicamente (ex.: a cada minuto)

# Manualmente (para testes)
node -e "
  const { createSearchIndexer } = require('./dist/core/search/indexer');
  const indexer = createSearchIndexer({ ... });
  await indexer.runIndexingTick();
"
```

### Monitorar Indexação

```bash
# Logs de indexação
grep "search.indexing" /var/log/ubl-api.log | tail -20

# Verificar cursor
psql -c "SELECT * FROM search_indexing_cursors;"

# Verificar lag
# (via API ou CLI, se implementado)
```

### Reindexação

```typescript
// Reindexar um tipo específico
await searchEngine.reindex('Entity');

// Reindexar tudo (cuidado em produção)
// Processar todos os eventos do event store novamente
```

---

## Integração com Agente

### Mensagens de Lag

Quando a busca não encontra resultados recentes, o agente explica:

- **`buildSearchLagMessage()`**: Explica lag e sugere próximos passos
- **`buildSearchIndexingIssueMessage()`**: Alerta sobre problemas no indexer
- **`buildSearchIndexerIncidentRunbook()`**: Runbook completo para incidentes

### Exemplo de Resposta do Agente

```
🔎 Busca com atraso em relação ao ledger

- Realm: `realm-123`
- Atraso estimado: 42 eventos ainda não indexados.

O que isso significa:
- A escrita no ledger está OK.
- A camada de busca ainda não refletiu todos os eventos.

Próximos passos:
1. Conferir o status do indexer
2. Aguardar alguns minutos e buscar novamente
3. Se o atraso continuar, investigar logs
```

---

## Runbooks Operacionais

### Indexer Parado

**Sintomas:**
- Lag crescente
- Logs mostram `search.indexing.tick.error`
- Busca não retorna resultados recentes

**Passos:**
1. Verificar logs: `grep "search.indexing" logs | tail -50`
2. Verificar processo: `ps aux | grep "search-indexer"`
3. Verificar lock: `SELECT * FROM pg_locks WHERE locktype = 'advisory';`
4. Reiniciar indexer se necessário

### Backend de Busca Down

**Sintomas:**
- Erros ao buscar
- Indexer falhando com erros de conexão

**Passos:**
1. Verificar status do backend (ex.: Elasticsearch health)
2. Verificar conectividade
3. Verificar recursos (disco, memória)
4. Reiniciar backend se necessário

### Lag Crescente

**Sintomas:**
- `indexLagEvents` aumenta continuamente
- Busca não encontra eventos recentes

**Passos:**
1. Verificar se indexer está rodando
2. Verificar se há erros no processamento
3. Verificar se há eventos muito grandes
4. Considerar aumentar frequência do indexer
5. Considerar particionamento por realm

---

## Diferenças: Ledger vs. Busca

### Consulta Direta ao Ledger

- **Consistência**: Forte (sempre atualizado)
- **Performance**: Pode ser lenta para buscas complexas
- **Uso**: Queries estruturadas, agregações, auditoria

### Busca no Índice

- **Consistência**: Eventual (pode ter lag)
- **Performance**: Rápida para buscas textuais
- **Uso**: Busca textual, faceted search, autocomplete

### Quando Usar Cada Um?

- **Ledger**: Quando precisa de dados 100% atualizados
- **Busca**: Quando precisa de busca textual/fuzzy/semântica

---

## Testes

### Testes de Indexação

```typescript
// Indexação incremental
const result = await indexer.runIndexingTick();
assert.ok(result.processedCount >= 0);

// Idempotência
await searchEngine.index(doc);
await searchEngine.index(doc); // Não duplica
```

### Testes de Consistência

```typescript
// Lag zero
const consistency = await indexer.getIndexConsistency();
assert.strictEqual(consistency.indexLagEvents, 0);

// Lag positivo
// Criar eventos sem indexar
// Verificar lag > 0
```

### Testes de Busca

```typescript
// Busca retorna resultados
const results = await searchEngine.search({ query: 'test' });
assert.ok(results.hits.length > 0);

// Consistência incluída
assert.ok(results.consistency);
```

---

## Métricas e Observabilidade

### Logs Estruturados

- `search.indexing.tick.start` - Início do tick
- `search.indexing.tick.success` - Tick concluído
- `search.indexing.tick.error` - Erro no tick
- `search.indexing.event_error` - Erro ao processar evento

Campos: `realmId`, `fromEventId`, `toEventId`, `processedCount`, `indexedCount`, `errorCount`, `traceId`

### Métricas (se implementadas)

- Lag de indexação por realm
- Taxa de indexação (eventos/segundo)
- Taxa de erro de indexação
- Tamanho do índice

---

## Troubleshooting

### Busca não encontra resultados recentes

1. Verificar lag: `await indexer.getIndexConsistency(realmId)`
2. Se lag > 0, aguardar alguns minutos
3. Se lag crescente, verificar indexer

### Indexer não processa eventos

1. Verificar logs: `grep "search.indexing.tick.error" logs`
2. Verificar lock: Outra instância pode estar rodando
3. Verificar cursor: Pode estar travado

### Backend de busca retorna erro

1. Verificar saúde do backend (ex.: Elasticsearch cluster health)
2. Verificar conectividade
3. Verificar recursos (disco, memória)
4. Verificar logs do backend

---

## Links Relacionados

- [Observabilidade UBL](./OBSERVABILITY-UBL.md) - Logs e métricas
- [Realm Contract](./REALM-CONTRACT.md) - Isolamento de Realms
- [Governança Computável](./GOVERNANCA-COMPUTAVEL-UBL.md) - Rate limiting e quotas

---

**Última atualização**: Fase 9 - Busca & Consistência Eventual

