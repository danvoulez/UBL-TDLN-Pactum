# 🗄️ Database Module - Modular & LLM-Friendly

**Status:** ✅ **MODULAR E LLM-FRIENDLY**  
**Data:** 2025-12-07

---

## 📋 Visão Geral

Módulo centralizado e modular para gerenciamento de banco de dados PostgreSQL:

- **Conexões** gerenciadas centralmente
- **Migrations** organizadas e versionadas
- **Validações** robustas
- **Erros LLM-friendly** com contexto completo
- **CLIs modulares** para operações comuns

---

## 🚀 Uso Rápido

### **1. Conexão com Banco**

```typescript
import { getDBConnection } from '../core/db/connection.js';

const db = getDBConnection(); // Usa DATABASE_URL do ambiente

// Testar conexão
const isConnected = await db.test();

// Health check
const health = await db.health();
console.log(health); // { healthy: true, latency: 5, ... }

// Executar query
const result = await db.query('SELECT * FROM events LIMIT 10');

// Fechar conexão
await db.close();
```

### **2. Migrations**

```typescript
import { runMigrations, applyFullSchema } from '../core/db/migrations.js';

// Executar migrations pendentes
const result = await runMigrations();
console.log(`Aplicadas: ${result.applied.join(', ')}`);

// Aplicar schema completo
await applyFullSchema(schemaSQL);
```

### **3. Validações**

```typescript
import { validateSchema, validateMigrations } from '../core/db/validators.js';

// Validar schema
const validation = await validateSchema();
if (!validation.valid) {
  console.error('Erros:', validation.errors);
}

// Validar migrations
const migrations = await validateMigrations();
console.log(`Aplicadas: ${migrations.applied.join(', ')}`);
```

### **4. Erros LLM-Friendly**

```typescript
import { dbError } from '../core/db/errors.js';

try {
  await db.query('SELECT * FROM nonexistent');
} catch (error: any) {
  if (error.dbInfo) {
    // Erro estruturado com contexto completo
    console.error(error.message); // Formato LLM-friendly
    console.error(error.dbInfo.suggestion); // Sugestão de correção
  }
}
```

---

## 📚 Estrutura do Módulo

```
core/db/
├── connection.ts      # Gerenciamento de conexões
├── errors.ts          # Erros LLM-friendly
├── validators.ts      # Validações robustas
├── migrations.ts      # Sistema de migrations
└── README.md          # Esta documentação
```

---

## 🛠️ CLIs Disponíveis

### **db-migrate**

Executa migrations de forma modular:

```bash
# Executar migrations pendentes
npm run db:migrate

# Aplicar schema completo + migrations
npm run db:migrate:full
```

### **db-status**

Mostra status completo do banco:

```bash
npm run db:status
```

**Output:**
- ✅ Conexão
- ✅ Health check
- ✅ Validação de schema
- ✅ Validação de migrations
- 📊 Estatísticas

### **db-reset**

Reseta banco de dados (apenas se vazio):

```bash
# Reset (apenas se vazio)
npm run db:reset

# Reset forçado (CUIDADO!)
npm run db:reset -- --force
```

### **db-validate**

Alias para `db:status`:

```bash
npm run db:validate
```

---

## 📖 Documentação Detalhada

### **connection.ts**

Gerenciamento centralizado de conexões PostgreSQL.

#### **Funções Principais:**

- `createDBConnection(config)`: Cria pool de conexões
- `getDBConnection(connectionString?)`: Obtém conexão (cria se não existir)
- `validateConnectionString(connectionString)`: Valida formato
- `closeAllConnections()`: Fecha todas as conexões

#### **Interface DBConnection:**

```typescript
interface DBConnection {
  pool: Pool;
  query<T>(text: string, params?: any[]): Promise<QueryResult<T>>;
  execute(sql: string): Promise<QueryResult>;
  test(): Promise<boolean>;
  health(): Promise<HealthInfo>;
  close(): Promise<void>;
}
```

---

### **errors.ts**

Sistema de erros estruturados para banco de dados.

#### **Códigos de Erro:**

- `DB001` - `CONNECTION_FAILED`: Falha na conexão
- `DB002` - `CONNECTION_TIMEOUT`: Timeout de conexão
- `DB003` - `AUTHENTICATION_FAILED`: Falha na autenticação
- `DB004` - `SCHEMA_NOT_FOUND`: Schema não encontrado
- `DB005` - `MIGRATION_FAILED`: Migration falhou
- `DB006` - `MIGRATION_CONFLICT`: Conflito de migration
- `DB007` - `TABLE_NOT_FOUND`: Tabela não encontrada
- `DB008` - `COLUMN_TYPE_MISMATCH`: Tipo de coluna incorreto
- `DB009` - `CONSTRAINT_VIOLATION`: Violação de constraint
- `DB010` - `QUERY_FAILED`: Query falhou
- `DB011` - `TRANSACTION_FAILED`: Transação falhou
- `DB012` - `INVALID_CONNECTION_STRING`: Connection string inválida
- `DB013` - `DATABASE_NOT_EMPTY`: Banco não está vazio
- `DB014` - `MIGRATION_ALREADY_APPLIED`: Migration já aplicada
- `DB015` - `MIGRATION_MISSING`: Migration faltando
- `DB016` - `SCHEMA_VALIDATION_FAILED`: Validação de schema falhou

#### **Funções Principais:**

- `dbError(code, message, context, suggestion, sqlState, sqlMessage)`: Cria erro estruturado
- `extractPostgresError(error)`: Extrai informações de erro PostgreSQL

---

### **validators.ts**

Validações robustas para operações de banco de dados.

#### **Funções Principais:**

- `validateSchema(connectionString?, expectedTables?)`: Valida estrutura completa do schema
- `validateMigrations(connectionString?, expectedMigrations?)`: Valida migrations aplicadas
- `validateDatabaseEmpty(connectionString?)`: Valida se banco está vazio

---

### **migrations.ts**

Sistema de migrations modular e versionado.

#### **Funções Principais:**

- `ensureMigrationsTable(connectionString?)`: Cria tabela de migrations
- `getAppliedMigrations(connectionString?)`: Obtém migrations aplicadas
- `markMigrationApplied(migration, connectionString?)`: Marca migration como aplicada
- `applyMigration(migration, connectionString?)`: Aplica uma migration
- `runMigrations(connectionString?, migrations?)`: Executa todas as migrations pendentes
- `applyFullSchema(schemaSQL, connectionString?)`: Aplica schema completo

---

## ✅ Benefícios

1. **Modular**: Cada funcionalidade em seu próprio módulo
2. **LLM-Friendly**: Erros estruturados com contexto completo
3. **Robusto**: Validações em todas as operações
4. **Eficiente**: Pool de conexões reutilizável
5. **Claro**: Mensagens descritivas e sugestões de correção
6. **Consistente**: Padrões uniformes em todo o módulo

---

## 🎯 Exemplo de Erro LLM-Friendly

```
╔══════════════════════════════════════════════════════════════╗
║            ❌ ERRO: DB001 - CONNECTION_FAILED              ║
╚══════════════════════════════════════════════════════════════╝

📋 MENSAGEM: Falha ao conectar ao banco de dados

🗄️  DETALHES SQL:
   SQL State: 08001
   SQL Message: connection refused

🔍 CONTEXTO:
   connectionString: postgresql://user:****@localhost:5432/db
   error: connection refused

📍 LOCALIZAÇÃO:
   Arquivo: core/db/connection.ts
   Linha: 45
   Função: createDBConnection

💡 SUGESTÃO DE CORREÇÃO:
   Verifique a conexão com o banco de dados:
   1. Verifique se o servidor PostgreSQL está rodando
   2. Verifique se o host e porta estão corretos
   3. Verifique se o firewall permite conexões
   4. Teste a conexão: psql "postgresql://..."
   5. Verifique logs do PostgreSQL para mais detalhes
```

---

**Status:** ✅ **PRONTO PARA USO**  
**Última atualização:** 2025-12-07

