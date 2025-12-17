# Código Pedagógico & Co-manutenção Humano-IA - UBL

**Fase 10: CO-MANUTENÇÃO HUMANO–IA & CÓDIGO PEDAGÓGICO**

Este documento explica a filosofia de código pedagógico do UBL: como o repositório é estruturado para ser mantido por **humanos + IAs** em pé de igualdade.

---

## Filosofia Central

> **O UBL é feito para ser mantido por humanos + IAs.**

Isso significa:

- **Redundância intencional** é parte do contrato, não lixo para limpeza
- **Exemplos repetidos** em contextos diferentes são valiosos
- **Comentários explicando o óbvio** ajudam IAs a navegar o contexto
- **Testes são documentação executável**, não apenas verificação

### Por quê?

1. **Onboarding acelerado**: Devs novatos e IAs precisam de âncoras semânticas
2. **Contexto reduzido**: IAs trabalham com janelas limitadas de código
3. **Previsibilidade**: Redundância intencional torna o sistema mais previsível
4. **Estabilidade**: Exemplos e comentários protegem contra refactors destrutivos

---

## Módulos que Servem como Exemplos

### Core Primitives (`core/universal/primitives.ts`)

**Por que é pedagógico:**
- Define tipos canônicos com comentários explicando **por que** são assim
- Exemplos de uso em comentários
- Redundância intencional: tipos re-exportados em múltiplos lugares para facilitar descoberta

**Marcado com:** `FASE 10 - CÓDIGO PEDAGÓGICO`

### Agent Primitives (`core/agent/primitives.ts`)

**Por que é pedagógico:**
- Interface canônica com exemplos de uso
- Helpers "óbvios" que servem como âncoras semânticas
- Comentários explicando o contrato, não apenas o tipo

**Marcado com:** `FASE 10 - CÓDIGO PEDAGÓGICO`

### Operator Messages (`core/agent/messages/operatorMessages.ts`)

**Por que é pedagógico:**
- Cada helper é um exemplo completo de mensagem operacional
- Runbooks são templates reutilizáveis
- Comentários explicam o contexto de uso

**Marcado com:** `FASE 10 - CÓDIGO PEDAGÓGICO`

---

## Testes como Documentação Executável

### Testes de Integração

Estes testes funcionam como **roteiros de uso**:

- `tests/integration/api-chat.test.ts` - Como usar a API de chat
- `tests/integration/realm-contract-invariants.test.ts` - Como Realms funcionam
- `tests/integration/realm-manager-eventstore.test.ts` - Como reconstruir Realms
- `tests/integration/search/indexing-eventual-consistency.test.ts` - Como busca funciona
- `tests/integration/compliance/export-gdpr.test.ts` - Como export funciona

**Marcados com:** `FASE 10 - TESTE COMO DOCUMENTAÇÃO`

### Testes Unitários

Estes testes funcionam como **exemplos de uso de APIs internas**:

- `tests/unit/agent/conversation.test.ts` - Como usar o agente
- `tests/unit/agent/operator-ux.test.ts` - Como mensagens operacionais funcionam
- `tests/unit/governance/rate-limiting.test.ts` - Como governança funciona

**Marcados com:** `FASE 10 - TESTE COMO DOCUMENTAÇÃO`

---

## Redundâncias Intencionais

### Re-exports Múltiplos

**Exemplo:** `PRIMORDIAL_REALM_ID` é definido em `core/universal/primitives.ts` e re-exportado em:
- `core/shared/types.ts`
- `core/index.ts`

**Por que é intencional:**
- Facilita descoberta: IAs e devs podem importar de qualquer lugar comum
- Reduz necessidade de navegar a árvore de imports
- Serve como âncora semântica: "onde quer que eu procure, encontro"

**Marcado com:** `FASE 10 - REDUNDÂNCIA INTENCIONAL`

### Comentários Repetidos

**Exemplo:** Comentários explicando "por que" aparecem em:
- Código fonte
- Documentação
- Testes

**Por que é intencional:**
- IAs podem ler código OU docs OU testes e entender
- Reduz dependência de contexto externo
- Facilita navegação para quem não conhece a estrutura

**Marcado com:** `FASE 10 - REDUNDÂNCIA INTENCIONAL`

### Helpers "Óbvios"

**Exemplo:** `buildRealmCreatedEvent()` poderia ser inline, mas existe como função.

**Por que é intencional:**
- Serve como âncora semântica: "aqui é onde eventos Realm são criados"
- Facilita descoberta: IAs podem buscar por nome
- Torna intenção explícita: não é apenas código, é um conceito nomeado

**Marcado com:** `FASE 10 - REDUNDÂNCIA INTENCIONAL`

---

## Diretrizes para Refactors Assistidos por IA

### ❌ NÃO FAZER

1. **Nunca remover comentários marcados com "FASE 10"** sem substituição equivalente
2. **Nunca apagar testes que funcionam como exemplos de uso**, a menos que:
   - Estejam claramente inválidos, E
   - Seja criado um novo exemplo que cubra o mesmo caminho de uso
3. **Nunca compactar helpers "óbvios"** sem garantir que a intenção permanece clara
4. **Nunca remover re-exports** sem garantir que imports alternativos existem

### ✅ FAZER

1. **Prefira duplicar um exemplo simples** em outro contexto, em vez de forçar todos os usos a dependerem de um único exemplo "perfeito"
2. **Adicione comentários explicando "por que"**, não apenas "o quê"
3. **Preserve nomes descritivos**, mesmo que "verbosos"
4. **Mantenha testes legíveis**, mesmo que possam ser mais "DRY"

### Filosofia

> **Prefira o caminho que permite que mais gente (e mais IAs) consiga entender, operar e evoluir o UBL com segurança.**

---

## Documentação como Mapa Mental

### Documentos Principais

Estes documentos funcionam como **mapas mentais** do sistema:

- `docs/REALM-CONTRACT.md` - Contrato de Realms (filosofia + código)
- `docs/CONTRATO-API-UBL.md` - Contrato da API (exemplos + tipos)
- `docs/OBSERVABILITY-UBL.md` - Onde encontrar logs e métricas
- `docs/GOVERNANCA-COMPUTAVEL-UBL.md` - Como governança funciona
- `docs/BUSCA-E-CONSISTENCIA-EVENTUAL-UBL.md` - Como busca funciona

**Características:**
- Conectam conceito → arquivo → comando
- Incluem exemplos práticos
- Explicam "por que", não apenas "o quê"

---

## Onboarding: "Se você é novo no UBL"

### Passo 1: Entender a Filosofia

Leia `docs/REALM-CONTRACT.md` para entender:
- O que são Realms
- Como Agreements estabelecem Realms
- Por que isolamento é importante

### Passo 2: Rodar o Pipeline

```bash
cd "/Users/voulezvous/new aws/ORGANIZAR"
./cicd/pipeline-oficial.sh
```

Isso valida:
- Ambiente configurado
- Testes passando
- Build funcionando

### Passo 3: Testar a API

```bash
# Health check
curl -s http://localhost:3000/health | jq

# Chat com o agente
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": { "text": "Olá, me mostra do que você é capaz." },
    "startSession": {
      "realmId": "test-realm",
      "actor": { "type": "System", "systemId": "test" }
    }
  }' | jq
```

### Passo 4: Ler Documentação Operacional

- `docs/OBSERVABILITY-UBL.md` - Como ler logs
- `docs/GOVERNANCA-COMPUTAVEL-UBL.md` - Como governança funciona

### Passo 5: Entender Busca e Consistência Eventual

- `docs/BUSCA-E-CONSISTENCIA-EVENTUAL-UBL.md` - Como busca funciona

### Scripts Tutoriais

Estes scripts no `cicd/` são bons tutores:

- `validate.sh` - Valida ambiente e configuração
- `testar-api-endpoints.sh` - Mostra como testar a API
- `verificar-status-aws.sh` - Mostra como verificar infraestrutura

---

## Como o Agente Ajuda

O agente pode explicar:

- **Filosofia do código**: "Por que este código é assim?"
- **Onboarding**: "Como começar a trabalhar no UBL?"
- **Navegação**: "Onde encontrar X?"
- **Exemplos**: "Como fazer Y?"

### Mensagens do Agente

- `buildCodePedagogicoExplanationMessage()` - Explica filosofia
- `buildOnboardingForNewMaintainerMessage()` - Orienta novos mantenedores

---

## Proteção Contra Refactors Destrutivos

### Comentários de Fase

Comentários marcados com `FASE 10` indicam:

- **Código pedagógico**: Serve como exemplo vivo
- **Redundância intencional**: Não remover sem substituição
- **Teste como documentação**: Preservar clareza dos cenários

### Exemplos de Proteção

```typescript
// FASE 10 - CÓDIGO PEDAGÓGICO
// Este bloco funciona como exemplo vivo para humanos + IAs.
// Não remover "redundâncias" aqui sem substituir por algo igualmente didático.

export function buildRealmCreatedEvent(...) {
  // Este helper existe como âncora semântica.
  // IAs podem buscar por "buildRealmCreatedEvent" e encontrar este ponto central.
  // Não "otimizar" removendo sem garantir um equivalente igualmente didático.
}
```

```typescript
// FASE 10 - TESTE COMO DOCUMENTAÇÃO
// Este arquivo também funciona como "guia de uso" para humanos + IAs.
// Ao alterar, preserve a clareza dos cenários e dados de exemplo.

describe('Chat API - Integration Tests', () => {
  // Cenários bem nomeados servem como índice
  it('should create session and return ChatResponse with turn=1', async () => {
    // Dados de exemplo legíveis, mesmo que "verbosos"
    const request = {
      message: { text: 'Olá' },
      startSession: { realmId: 'realm-1', actor: { type: 'System' } }
    };
  });
});
```

---

## Exemplos Completos de Fluxo

### Fluxo Completo: Intent → Events → Projeções → Busca

**Documentado em:**
- `docs/CONTRATO-API-UBL.md` - Como usar `/intent`
- `tests/integration/api-chat.test.ts` - Exemplo executável
- `docs/BUSCA-E-CONSISTENCIA-EVENTUAL-UBL.md` - Como buscar

**Exemplo mínimo:**

```typescript
// 1. Criar Realm via intent
const response = await fetch('/intent', {
  method: 'POST',
  body: JSON.stringify({
    intent: 'createRealm',
    payload: { name: 'My Realm' }
  })
});

// 2. Evento é appendado ao event store
// 3. Indexer processa evento (assíncrono)
// 4. Busca retorna resultado (eventualmente consistente)
```

---

## Links Relacionados

- [Realm Contract](./REALM-CONTRACT.md) - Contrato de Realms
- [API Contract](./CONTRATO-API-UBL.md) - Contrato da API
- [Observabilidade](./OBSERVABILITY-UBL.md) - Logs e métricas
- [Governança](./GOVERNANCA-COMPUTAVEL-UBL.md) - Rate limiting e quotas
- [Busca](./BUSCA-E-CONSISTENCIA-EVENTUAL-UBL.md) - Busca e consistência eventual

---

**Última atualização**: Fase 10 - Código Pedagógico & Co-manutenção Humano-IA

