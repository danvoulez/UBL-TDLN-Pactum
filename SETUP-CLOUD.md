# ☁️ Setup Cloud - Deploy no Railway

**Objetivo:** Deploy do Universal Business Ledger em produção usando Railway.

**Produção atual:** https://api.ubl.agency

---

## 🎯 Arquitetura Railway

```
Railway Project: ubl-railway
├── PostgreSQL (Template oficial)
│   ├── Host: postgres.railway.internal
│   ├── Port: 5432
│   └── Database: railway
│
└── UBL-App (Node.js)
    ├── Internal: ubl-app.railway.internal:3000
    └── Public: api.ubl.agency
```

**Vantagens:**
- ✅ Deploy via CLI (sem poluir GitHub)
- ✅ PostgreSQL gerenciado com volume persistente
- ✅ SSL automático
- ✅ Rede interna entre serviços
- ✅ Domínio customizado

---

## 🚀 Deploy Rápido

### **Pré-requisitos**

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Ou via Homebrew
brew install railway
```

### **1. Autenticar no Railway**

```bash
# Login interativo
railway login

# Ou com API token
export RAILWAY_API_TOKEN=seu-token-aqui
```

### **2. Criar Projeto**

```bash
cd /path/to/UBL

# Criar novo projeto
railway init --name ubl-railway

# Adicionar PostgreSQL
railway add --database postgres
```

### **3. Configurar Variáveis de Ambiente**

```bash
# Selecionar serviço PostgreSQL e ver variáveis
railway service Postgres
railway variables

# Copiar DATABASE_URL gerado pelo Railway
# Formato: postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway
```

### **4. Criar Serviço da Aplicação**

Via Railway Dashboard ou API:

```bash
# Via API GraphQL
curl --request POST \
  --url https://backboard.railway.com/graphql/v2 \
  --header 'Authorization: Bearer $RAILWAY_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "mutation { serviceCreate(input: { projectId: \"PROJECT_ID\", name: \"UBL-App\" }) { id name } }"
  }'
```

### **5. Configurar Variáveis do App**

```bash
# Via API GraphQL
curl --request POST \
  --url https://backboard.railway.com/graphql/v2 \
  --header 'Authorization: Bearer $RAILWAY_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "mutation { variableUpsert(input: { projectId: \"PROJECT_ID\", environmentId: \"ENV_ID\", serviceId: \"SERVICE_ID\", name: \"DATABASE_URL\", value: \"postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway\" }) }"
  }'
```

Variáveis necessárias:
- `DATABASE_URL` - Connection string do PostgreSQL
- `NODE_ENV` - `production`
- `PORT` - `3000`

**Variáveis LLM (escolha uma):**
- `OLLAMA_BASE_URL` - URL do Ollama (ex: `https://seu-tunnel.ngrok.io`)
- `OLLAMA_API_KEY` - API key opcional para Ollama remoto
- `OLLAMA_MODEL` - Modelo (default: `llama3.1:8b`)
- `ANTHROPIC_API_KEY` - API key do Anthropic Claude
- `OPENAI_API_KEY` - API key do OpenAI GPT

**Prioridade de seleção:** Ollama > Anthropic > OpenAI > Mock

### **6. Executar Migração do Schema**

```bash
# Conectar ao PostgreSQL via URL pública
PGPASSWORD=PASSWORD psql -h HOST.proxy.rlwy.net -p PORT -U postgres -d railway -f core/store/postgres-schema.sql
```

**Importante:** Após executar o schema, ajustar constraint para aceitar todos os tipos:

```sql
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_aggregate_type_check;
ALTER TABLE events ADD CONSTRAINT events_aggregate_type_check 
  CHECK (aggregate_type = ANY (ARRAY['Party', 'Asset', 'Agreement', 'Role', 'Workflow', 'Flow', 'System', 'Realm', 'Container', 'Workspace', 'Entity']));

-- Alterar coluna id de UUID para TEXT (UBL usa formato evt-xxx)
ALTER TABLE events ALTER COLUMN id TYPE TEXT;
```

### **7. Deploy**

```bash
# Selecionar serviço UBL-App
railway service UBL-App

# Deploy
railway up --detach
```

### **8. Gerar Domínio Público**

```bash
# Via API GraphQL
curl --request POST \
  --url https://backboard.railway.com/graphql/v2 \
  --header 'Authorization: Bearer $RAILWAY_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "mutation { serviceDomainCreate(input: { serviceId: \"SERVICE_ID\", environmentId: \"ENV_ID\" }) { domain } }"
  }'
```

---

## 🌐 Configurar Domínio Customizado

### **1. Adicionar domínio no Railway**

```bash
curl --request POST \
  --url https://backboard.railway.com/graphql/v2 \
  --header 'Authorization: Bearer $RAILWAY_API_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "mutation { customDomainCreate(input: { projectId: \"PROJECT_ID\", serviceId: \"SERVICE_ID\", environmentId: \"ENV_ID\", domain: \"api.seudominio.com\" }) { id domain } }"
  }'
```

### **2. Configurar DNS**

Para subdomínio (recomendado):
| Tipo | Nome | Valor |
|------|------|-------|
| CNAME | api | ubl-app-production.up.railway.app |

Para domínio apex (raiz):
| Tipo | Nome | Valor |
|------|------|-------|
| ALIAS | @ | ubl-app-production.up.railway.app |

**Se usar Vercel DNS:**
```bash
# Subdomínio
vercel dns add seudominio.com api CNAME ubl-app-production.up.railway.app --scope seu-team

# Apex (raiz)
vercel dns add seudominio.com @ ALIAS ubl-app-production.up.railway.app --scope seu-team
```

---

## 📊 Comparação: Local vs Railway

| Componente | Local Dev | Railway Produção |
|------------|-----------|------------------|
| **PostgreSQL** | Homebrew local | Template oficial Railway |
| **Backend** | Node.js local | Container gerenciado |
| **Storage** | Filesystem | Volume persistente |
| **Secrets** | .env file | Railway Variables |
| **DNS** | localhost | Domínio customizado |
| **SSL** | Não | Automático |
| **Custo** | $0 | ~$5-20/mês |

---

## 🔧 Comandos Úteis

### **Logs**
```bash
railway service UBL-App
railway logs
```

### **Redeploy**
```bash
railway redeploy --yes
```

### **Variáveis**
```bash
railway variables
```

### **Status**
```bash
railway status
```

### **Conectar ao PostgreSQL**
```bash
railway service Postgres
railway run psql
```

---

## 🧪 Testar Deploy

### **Health Check**
```bash
curl https://api.ubl.agency/health
# {"status":"ok","service":"antenna","eventStore":{"type":"PostgreSQL","healthy":true}}
```

### **Affordances**
```bash
curl https://api.ubl.agency/affordances
```

### **Intent**
```bash
curl -X POST https://api.ubl.agency/intent \
  -H "Content-Type: application/json" \
  -d '{"intent": "what-can-i-do"}'
```

### **WebSocket**
```javascript
const ws = new WebSocket('wss://api.ubl.agency/subscribe');

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    subscription: { id: 'test', filter: { eventTypes: ['*'] } }
  }));
};

ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## 🔄 Atualizar Deploy

```bash
cd /path/to/UBL

# Fazer alterações no código
# ...

# Rebuild e deploy
railway service UBL-App
railway up --detach

# Verificar logs
railway logs
```

---

## 🚨 Troubleshooting

### **Erro: Connection timeout PostgreSQL**
- Verificar se DATABASE_URL usa host interno (`postgres.railway.internal`)
- Verificar se PostgreSQL está rodando no Railway

### **Erro: relation does not exist**
- Executar migração do schema: `psql -f core/store/postgres-schema.sql`

### **Erro: invalid input syntax for type uuid**
- Alterar coluna `id` da tabela `events` para TEXT

### **Erro: aggregate_type_check violation**
- Adicionar tipos faltantes na constraint (Container, Workspace, Entity)

---

## ✅ Checklist de Deploy

- [ ] Railway CLI instalado e autenticado
- [ ] Projeto criado no Railway
- [ ] PostgreSQL provisionado
- [ ] Serviço UBL-App criado
- [ ] Variáveis de ambiente configuradas (DATABASE_URL, NODE_ENV, PORT)
- [ ] Schema PostgreSQL executado
- [ ] Constraints ajustadas
- [ ] Deploy executado
- [ ] Domínio público gerado
- [ ] Health check funcionando
- [ ] WebSocket funcionando

---

## 📝 Configuração Atual (Produção)

| Item | Valor |
|------|-------|
| **Projeto** | ubl-railway |
| **API URL** | https://api.ubl.agency |
| **WebSocket** | wss://api.ubl.agency/subscribe |
| **PostgreSQL** | postgres.railway.internal:5432/railway |
| **Landing Page** | ubl.agency (livre para Vercel) |

---

**Última atualização:** 2025-12-16
