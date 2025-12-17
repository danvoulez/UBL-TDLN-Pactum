# Arquitetura UBL - Contrato de Fronteiras

**Data:** 2025-12-07  
**Status:** ✅ **CONTRATO OFICIAL**  
**Objetivo:** Definir fronteiras de arquitetura e regras de import

---

## 🏗️ Camadas

O UBL é organizado em 4 camadas principais:

```
Universal-Business-Ledger-Dezembro/
├── core/          # Lógica de negócio e domínio
├── antenna/       # Interface HTTP (servidor)
├── workers/       # Processamento em background
└── cli/           # Ferramentas de linha de comando
```

---

## 🔒 Regras de Import

### 1. core/ NUNCA importa de camadas superiores

**Regra:** `core/` **NUNCA** pode importar de:
- ❌ `antenna/`
- ❌ `workers/`
- ❌ `cli/`

**Razão:** `core/` contém a lógica de negócio pura e deve ser independente de interfaces.

**Validação:**
```bash
# Script: cicd/verificar-fronteiras-ubl.sh
# Verifica imports proibidos em core/
grep -r "from.*['\"]\.\.\/antenna" core/  # Deve retornar vazio (exceto testes)
grep -r "from.*['\"]\.\.\/workers" core/  # Deve retornar vazio (exceto testes)
grep -r "from.*['\"]\.\.\/cli" core/      # Deve retornar vazio (exceto testes)
```

**Exceções:**
- Arquivos de teste (`.test.ts`, `.test.js`) podem importar de qualquer lugar
- Helpers de teste podem importar de qualquer lugar

### 2. Camadas superiores importam apenas de core/

**Regra:** `antenna/`, `workers/`, `cli/` importam apenas de:
- ✅ `core/index.ts` (exportações públicas)
- ✅ Módulos públicos explícitos do core

**Exemplo correto:**
```typescript
// antenna/server.ts
import { createUniversalLedger, handleIntent } from '../core/index';
```

**Exemplo incorreto:**
```typescript
// ❌ NÃO FAZER
import { SomeInternalClass } from '../core/some-internal-module';
```

---

## 🗄️ Event Store Único

### Regra: Apenas um lugar cria o Event Store

**Regra:** Apenas `core/index.ts` deve criar o `eventStore` via `createEventStore()`, exceto em helpers de teste.

**Razão:** Garantir que há uma única instância do Event Store compartilhada.

**Validação:**
```bash
# Script: cicd/verificar-fronteiras-ubl.sh
# Verifica criações de eventStore fora de locais permitidos
find . -name "*.ts" | grep -v node_modules | grep -v ".test." | \
  xargs grep -l "createEventStore(" | \
  grep -v "core/index.ts" | \
  grep -v "core/store/create-event-store.ts" | \
  grep -v "/tests/"
# Deve retornar vazio
```

**Locais permitidos:**
- ✅ `core/index.ts` - Criação principal
- ✅ `core/store/create-event-store.ts` - Factory
- ✅ `tests/**/*.test.ts` - Testes
- ✅ `tests/helpers/**` - Helpers de teste

**Locais proibidos:**
- ❌ `antenna/server.ts`
- ❌ `workers/**/*.ts`
- ❌ `cli/**/*.ts`

**Solução:** Injeção de dependência

```typescript
// ✅ CORRETO: Receber eventStore via injeção
export function createAntenna(config: {
  eventStore: EventStore; // Injetado
  ...
}) { ... }

// ❌ INCORRETO: Criar eventStore dentro
export function createAntenna(config: { ... }) {
  const eventStore = createEventStore(); // ❌ NÃO FAZER
  ...
}
```

---

## 🧠 Domínio Só no core/

### Regra: Lógica de domínio complexa não pode estar em antenna/

**Regra:** `antenna/server.ts` não deve conter regras de domínio complexas.

**Exemplos de lógica de domínio:**
- ❌ `if (realm.isolation === 'Full' && ...)`
- ❌ `if (realm.config.crossRealmAllowed && ...)`
- ❌ Validações de negócio complexas
- ❌ Cálculos de permissões baseados em agreements

**Onde deve estar:**
- ✅ `core/universal/*` - Lógica de realm, entity, agreement
- ✅ `core/api/intent-api.ts` - Processamento de intents
- ✅ `core/security/authorization.ts` - Autorização e permissões

**Solução: Façades fortes em core/index.ts**

```typescript
// core/index.ts
export function createUniversalLedger() {
  // Cria eventStore, aggregates, workflows, etc.
  return {
    handleIntent,
    queryAffordances,
    startSession,
    chat,
    ...
  };
}

// antenna/server.ts
// ✅ CORRETO: Usar façades
const ledger = createUniversalLedger();
const result = await ledger.handleIntent(intent);

// ❌ INCORRETO: Lógica de domínio direta
if (realm.config.isolation === 'Full') { ... }
```

---

## 📦 Tipos Centralizados

### Regra: Tipos de Realm, Agreement e correlatos em um único módulo

**Localização:** `core/universal/primitives.ts`

**Tipos centralizados:**
- ✅ `Realm`
- ✅ `RealmConfig`
- ✅ `Entity`
- ✅ `Agreement`
- ✅ `Asset`
- ✅ `Role`

**Reexportação:** Via `core/index.ts`

```typescript
// core/index.ts
export type {
  Realm,
  RealmConfig,
  Entity,
  Agreement,
  Asset,
  Role,
} from './universal/primitives';
```

**Regra:** Remover/ajustar definições duplicadas em outros lugares.

---

## ✅ Verificação Automática

### Script: `cicd/verificar-fronteiras-ubl.sh`

Este script verifica automaticamente:

1. ✅ `core/` não importa de `antenna/`, `workers/`, `cli/`
2. ✅ Event Store criado apenas em locais permitidos
3. ✅ Domínio só no `core/` (sem lógica complexa em `antenna/`)

**Uso:**
```bash
./cicd/verificar-fronteiras-ubl.sh
```

**Integração no Pipeline:**
- Pode ser executado no stage VALIDATE
- Deve falhar se encontrar violações

---

## 📚 Referências

- **Filosofia:** `PHILOSOPHY.md` - Princípios fundamentais
- **Arquitetura:** `ARCHITECTURE.md` - Arquitetura completa
- **Primitivos:** `core/universal/primitives.ts` - Tipos TypeScript

---

**Status:** ✅ **CONTRATO ESTABELECIDO**  
**Última atualização:** 2025-12-07

