# ⚙️ Configuration Module - Modular & LLM-Friendly

**Status:** ✅ **MODULAR E LLM-FRIENDLY**  
**Data:** 2025-12-07

---

## 📋 Visão Geral

Módulo centralizado para gerenciamento de configuração:

- **Environment variables** validadas e type-safe
- **Erros LLM-friendly** com contexto completo
- **Cache** para performance
- **Validações** robustas

---

## 🚀 Uso Rápido

### **1. Carregar Configuração**

```typescript
import { getConfig, requireConfig } from '../core/config/index.js';

// Obter configuração completa
const config = getConfig();
console.log(config.server.port); // 3000

// Obter valor específico
const dbUrl = getConfigValue('database.url');

// Requer configuração (lança erro se ausente)
const port = requireConfig('server.port');
```

### **2. Usar em Código**

```typescript
import { getConfig } from '../core/config/index.js';

const config = getConfig();

// Server
const port = config.server.port;
const host = config.server.host;

// Database
if (config.database.url) {
  // Usar PostgreSQL
}

// AWS
if (config.aws.s3Bucket) {
  // Usar S3
  const region = config.aws.region;
}

// LLM
if (config.llm.anthropicApiKey) {
  // Usar Anthropic
}
```

### **3. Erros LLM-Friendly**

```typescript
import { getConfig } from '../core/config/index.js';

try {
  const config = getConfig();
} catch (error: any) {
  if (error.configInfo) {
    // Erro estruturado com contexto completo
    console.error(error.message); // Formato LLM-friendly
    console.error(error.configInfo.suggestion); // Sugestão de correção
  }
}
```

---

## 📚 Estrutura

```
core/config/
├── index.ts      # Carregamento e validação
├── types.ts      # Tipos TypeScript
├── errors.ts     # Erros LLM-friendly
└── README.md     # Esta documentação
```

---

## ✅ Benefícios

1. **Centralizado**: Toda configuração em um lugar
2. **Type-Safe**: Tipos TypeScript para todas as configs
3. **Validado**: Validações automáticas ao carregar
4. **LLM-Friendly**: Erros estruturados com contexto
5. **Performático**: Cache de configuração
6. **Consistente**: Padrão uniforme em todo o código

---

**Status:** ✅ **PRONTO PARA USO**  
**Última atualização:** 2025-12-07

