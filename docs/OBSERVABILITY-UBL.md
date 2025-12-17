# Observabilidade do Diamante - UBL

**Fase 4: Observabilidade do Diamante**

Este documento descreve o sistema de observabilidade do Universal Business Ledger, incluindo onde encontrar logs, como interpretá-los e como investigar incidentes.

---

## 1. Visão Geral

O sistema de observabilidade do UBL foi projetado para ser **simples, consistente e útil**. Não reinventamos um sistema gigante - focamos em **clareza + consistência**.

### Componentes Principais

1. **`pipeline`** - Scripts de CI/CD (`cicd/pipeline-oficial.sh`, `cicd/scripts/validate.sh`, etc.)
2. **`deploy`** - Scripts de deploy (`cicd/deploy-oficial.sh`)
3. **`test-api`** - Testes de endpoints (`cicd/testar-api-endpoints.sh`)
4. **`antenna`** - API HTTP (handlers `/chat`, `/intent`, `/affordances`, etc.)
5. **`core`** - Núcleo do sistema (agente, realm-manager, etc.)

---

## 2. Mapa de Logs

### 2.1. Logs de Pipeline e Deploy (Shell Scripts)

#### Arquivos Típicos

- **`/tmp/pipeline-oficial-*.log`** - Log completo do pipeline oficial
- **`/tmp/deploy-aws-*.log`** - Log completo do deploy AWS
- **`/tmp/testar-api-endpoints-*.log`** - Log dos testes de endpoints
- **`/tmp/verificar-status-aws-*.log`** - Log da verificação de status AWS

#### Formato

```
[LEVEL] YYYY-MM-DDTHH:MM:SS+00:00 :: COMPONENT :: mensagem
```

**Exemplos:**

```
[INFO] 2025-12-07T13:49:20+00:00 :: pipeline :: Iniciando stage VALIDATE
[WARN] 2025-12-07T13:49:21+00:00 :: deploy :: Terraform não encontrado (não crítico)
[ERROR] 2025-12-07T13:50:05+00:00 :: test-api :: Testes de endpoints da API falharam
```

#### Quando Olhar

- **`pipeline-oficial-*.log`**: Quando o pipeline completo falha ou você precisa entender o fluxo completo
- **`deploy-aws-*.log`**: Quando o deploy falha ou você precisa rastrear o que foi feito no EC2
- **`testar-api-endpoints-*.log`**: Quando os testes de API falham ou você precisa validar contratos

---

### 2.2. Logs da Aplicação (TypeScript/Node.js)

#### Onde Ficam

- **Produção (EC2)**: `sudo journalctl -u ubl-api -n 100 -f`
- **Desenvolvimento**: stdout/stderr do processo Node.js

#### Formato

**JSON por linha** (uma linha = um evento de log):

```json
{"level":"info","message":"chat.request.received","timestamp":"2025-12-07T13:49:20.123Z","component":"api.chat","traceId":"trace-abc123","sessionId":"sess-xyz789","realmId":"realm-000","actorType":"User","messageLength":42}
```

#### Campos Comuns

- **`level`**: `"debug" | "info" | "warn" | "error"`
- **`message`**: Identificador do evento (ex.: `"chat.request.received"`, `"intent.response.success"`)
- **`timestamp`**: ISO 8601 timestamp
- **`component`**: Componente que gerou o log (ex.: `"api.chat"`, `"api.intent"`, `"core.agent"`)
- **`traceId`**: ID de rastreamento da requisição (correlaciona logs de uma mesma operação)
- **`sessionId`**: ID da sessão de conversa (quando aplicável)
- **`realmId`**: ID do realm (quando aplicável)
- **`endpoint`**: Endpoint HTTP (ex.: `"/chat"`, `"/intent"`)
- **`intent`**: Nome do intent (quando aplicável)
- **`errorCode`**: Código de erro (quando aplicável)
- **`errorMessage`**: Mensagem de erro (quando aplicável)

#### Quando Olhar

- **Produção**: Quando a API retorna erro 500 ou comportamento inesperado
- **Desenvolvimento**: Para entender o fluxo de requisições e respostas

---

## 3. Guia de Incidentes Rápidos

### 3.1. API 500 em `/chat`

**Sintoma**: Cliente recebe HTTP 500 ao chamar `/chat`

**Onde Olhar**:

1. **Logs da aplicação** (EC2):
   ```bash
   sudo journalctl -u ubl-api -n 100 | grep "chat.response.error"
   ```

2. **Buscar por**:
   - `"message": "chat.response.error"`
   - `"endpoint": "/chat"`
   - `"errorCode"` e `"errorMessage"`

**Exemplo de Log**:

```json
{"level":"error","message":"chat.response.error","timestamp":"2025-12-07T13:49:20.123Z","component":"api.chat","traceId":"trace-abc123","sessionId":"sess-xyz789","realmId":"realm-000","endpoint":"/chat","errorCode":"LLM_ERROR","errorMessage":"Failed to connect to LLM provider"}
```

**Ações**:
- Verificar se LLM está configurado corretamente
- Verificar conectividade com provedor de LLM
- Verificar logs do LLM adapter

---

### 3.2. API 500 em `/intent`

**Sintoma**: Cliente recebe HTTP 500 ao chamar `/intent`

**Onde Olhar**:

1. **Logs da aplicação**:
   ```bash
   sudo journalctl -u ubl-api -n 100 | grep "intent.response.error"
   ```

2. **Buscar por**:
   - `"message": "intent.response.error"`
   - `"intent"`: nome do intent que falhou
   - `"errorCode"` e `"errorMessage"`

**Exemplo de Log**:

```json
{"level":"error","message":"intent.response.error","timestamp":"2025-12-07T13:49:20.123Z","component":"api.intent","traceId":"trace-abc123","intent":"createRealm","realmId":"realm-000","endpoint":"/intent","errorCode":"VALIDATION_ERROR","errorMessage":"Realm name is required"}
```

**Ações**:
- Verificar payload do intent
- Verificar se o intent handler está configurado corretamente
- Verificar logs do core (realm-manager, etc.)

---

### 3.3. Deploy Falhou na Stage DEPLOY

**Sintoma**: Pipeline para na stage DEPLOY com erro

**Onde Olhar**:

1. **Log do pipeline**:
   ```bash
   tail -100 /tmp/pipeline-oficial-*.log
   ```

2. **Log do deploy**:
   ```bash
   tail -100 /tmp/deploy-aws-*.log
   ```

3. **Buscar por**:
   - `"Testes de endpoints da API falharam"`
   - `"Status AWS crítico"`
   - `"ERROR"` ou `"ERROR:"`

**Exemplo de Log**:

```
[ERROR] 2025-12-07T13:50:05+00:00 :: deploy :: Testes de endpoints da API falharam - abortando deploy
```

**Ações**:
- Verificar se a API está rodando no EC2
- Verificar logs da aplicação no EC2
- Verificar conectividade com banco de dados
- Verificar se os testes de endpoints estão corretos

---

### 3.4. Testes de API Falharam

**Sintoma**: `testar-api-endpoints.sh` retorna exit code 1

**Onde Olhar**:

1. **Log dos testes**:
   ```bash
   tail -100 /tmp/testar-api-endpoints-*.log
   ```

2. **Buscar por**:
   - `"❌"` ou `"ERROR"`
   - Nome do endpoint que falhou
   - Status code HTTP inesperado

**Exemplo de Log**:

```
[ERROR] 2025-12-07T13:50:05+00:00 :: test-api :: /health retornou status 500 (esperado: 200)
```

**Ações**:
- Verificar se a API está rodando
- Verificar logs da aplicação
- Verificar se o contrato da API mudou

---

### 3.5. Sessão de Chat Perdida

**Sintoma**: Cliente não consegue continuar uma sessão de chat

**Onde Olhar**:

1. **Logs da aplicação**:
   ```bash
   sudo journalctl -u ubl-api -n 100 | grep "sessionId"
   ```

2. **Buscar por**:
   - `"sessionId"`: ID da sessão perdida
   - `"chat.request.received"` ou `"chat.response.error"`

**Exemplo de Log**:

```json
{"level":"warn","message":"chat.request.invalid","timestamp":"2025-12-07T13:49:20.123Z","component":"api.chat","traceId":"trace-abc123","endpoint":"/chat","reason":"missing sessionId and startSession"}
```

**Ações**:
- Verificar se o cliente está enviando `sessionId` corretamente
- Verificar se a sessão expirou (timeout padrão: 30 minutos)
- Verificar logs do agente para ver se a sessão foi criada

---

## 4. Formato dos Logs

### 4.1. Logs Shell (Pipeline/Deploy)

**Padrão**:
```
[LEVEL] TIMESTAMP :: COMPONENT :: mensagem
```

**Componentes**:
- `pipeline` - Pipeline oficial
- `deploy` - Deploy AWS
- `test-api` - Testes de API
- `validate` - Validação de pré-requisitos

**Níveis**:
- `INFO` - Informação geral
- `WARN` - Aviso (não crítico)
- `ERROR` - Erro (crítico)

---

### 4.2. Logs TypeScript (Aplicação)

**Padrão**: JSON por linha (uma linha = um evento)

**Estrutura Base**:

```json
{
  "level": "info|warn|error|debug",
  "message": "identificador.do.evento",
  "timestamp": "2025-12-07T13:49:20.123Z",
  "component": "api.chat|api.intent|core.agent|core.realm",
  "traceId": "trace-abc123",
  "sessionId": "sess-xyz789",
  "realmId": "realm-000",
  "endpoint": "/chat",
  "intent": "createRealm",
  "turn": 1,
  "processingMs": 42,
  "affordancesCount": 3,
  "suggestionsCount": 2,
  "eventsCount": 1,
  "messageLength": 42,
  "actorType": "User",
  "errorCode": "LLM_ERROR",
  "errorMessage": "Failed to connect to LLM provider",
  "reason": "missing sessionId and startSession"
}
```

**Campos por Tipo de Evento**:

- **`chat.request.received`**: `traceId`, `sessionId`, `realmId`, `actorType`, `messageLength`, `endpoint`
- **`chat.response.success`**: `traceId`, `sessionId`, `realmId`, `turn`, `processingMs`, `affordancesCount`, `suggestionsCount`
- **`chat.response.error`**: `traceId`, `sessionId`, `realmId`, `endpoint`, `errorCode`, `errorMessage`
- **`intent.request.received`**: `traceId`, `intent`, `realmId`, `endpoint`
- **`intent.response.success`**: `traceId`, `intent`, `realmId`, `eventsCount`
- **`intent.response.error`**: `traceId`, `intent`, `realmId`, `endpoint`, `errorCode`, `errorMessage`

---

## 5. Correlação de Contexto

### 5.1. TraceId

O `traceId` é gerado ou extraído do header HTTP `x-trace-id` e correlaciona todos os logs de uma mesma requisição.

**Como Usar**:

```bash
# Buscar todos os logs de uma requisição específica
sudo journalctl -u ubl-api -n 1000 | grep "trace-abc123"
```

### 5.2. SessionId

O `sessionId` correlaciona todos os logs de uma mesma sessão de conversa.

**Como Usar**:

```bash
# Buscar todos os logs de uma sessão específica
sudo journalctl -u ubl-api -n 1000 | grep "sess-xyz789"
```

### 5.3. RealmId

O `realmId` correlaciona todos os logs de um mesmo realm.

**Como Usar**:

```bash
# Buscar todos os logs de um realm específico
sudo journalctl -u ubl-api -n 1000 | grep "realm-000"
```

---

## 6. Boas Práticas

### 6.1. Para Desenvolvedores

1. **Sempre use o logger canônico** (`core/observability/logger.ts`)
2. **Sempre inclua contexto relevante** (`traceId`, `sessionId`, `realmId`, etc.)
3. **Use mensagens descritivas** (ex.: `"chat.request.received"` em vez de `"received"`)
4. **Não logue informações sensíveis** (senhas, tokens, etc.)

### 6.2. Para Operadores

1. **Sempre comece pelo traceId** quando investigar um problema
2. **Use `jq` para filtrar logs JSON**:
   ```bash
   sudo journalctl -u ubl-api -n 1000 | jq 'select(.traceId == "trace-abc123")'
   ```
3. **Monitore logs de erro**:
   ```bash
   sudo journalctl -u ubl-api -n 1000 | jq 'select(.level == "error")'
   ```

---

## 7. Referências

- **Logger Canônico**: `core/observability/logger.ts`
- **Helpers de Log Shell**: `cicd/helpers/common.sh` (funções `log_info`, `log_warn`, `log_error`)
- **Contratos de API**: `docs/CONTRATO-API-UBL.md`
- **Arquitetura**: `docs/ARQUITETURA-UBL-CONTRATO.md`

---

**Última atualização**: 2025-12-07 (Fase 4 - Observabilidade do Diamante)

