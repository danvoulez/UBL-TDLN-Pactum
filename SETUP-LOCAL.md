# 🏠 Setup Local - Simular Arquitetura AWS

**Objetivo:** Configurar ambiente local que simula a arquitetura AWS oficial para desenvolvimento.

**Baseado em:** `ARQUITETURA-AWS-OFICIAL.md`

---

## 🎯 Arquitetura Local (Simula AWS)

```
Local Machine
├── PostgreSQL (Homebrew) - Simula RDS
│   └── Database: ubl_dev
│
├── UBL Backend (Node.js)
│   └── Port: 3000
│
└── VISION Frontend (Next.js)
    └── Port: 3001 (ou 3000 se backend não estiver rodando)
```

**Diferenças do AWS:**
- ❌ Sem S3 (pode usar filesystem local ou mock)
- ❌ Sem Secrets Manager (usa .env)
- ❌ Sem Route 53 (usa localhost)
- ✅ PostgreSQL local (mesma versão que AWS)
- ✅ Mesma estrutura de código

---

## 🚀 Setup Rápido

### **1. Instalar PostgreSQL (Homebrew)**

```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Criar banco
createdb ubl_dev
```

### **2. Configurar Variáveis de Ambiente**

```bash
cd Universal-Business-Ledger-Dezembro

# Copiar template
cp .env.example .env

# Editar .env
DATABASE_URL=postgresql://$(whoami)@localhost:5432/ubl_dev
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# S3 (opcional - pode deixar vazio para dev local)
# AWS_S3_BUCKET=
# AWS_REGION=us-east-1
```

### **3. Rodar Migrations**

```bash
npm install
npm run migrate
```

### **4. Iniciar Backend**

```bash
npm run dev
```

Backend estará em `http://localhost:3000`

---

## 🔧 Script Automatizado

Use o script de setup:

```bash
./scripts/setup-local-postgres.sh
```

Este script:
- ✅ Verifica/instala PostgreSQL
- ✅ Cria banco `ubl_dev`
- ✅ Cria `.env` se não existir
- ✅ Configura `DATABASE_URL`
- ✅ Roda migrations

---

## 📊 Comparação: Local vs AWS

| Componente | AWS Produção | Local Dev |
|------------|--------------|-----------|
| **PostgreSQL** | RDS db.t3.small | Homebrew PostgreSQL 15 |
| **Backend** | EC2 t3.small | Node.js local |
| **Storage** | S3 Bucket | Filesystem local |
| **Secrets** | Secrets Manager | .env file |
| **DNS** | Route 53 | localhost |
| **Custo** | ~$53/mês | $0 |

---

## 🎯 Fluxo de Desenvolvimento

### **1. Desenvolvimento Local**
```bash
# Terminal 1: Backend
cd Universal-Business-Ledger-Dezembro
npm run dev

# Terminal 2: Frontend
cd VISION
pnpm dev
```

### **2. Testar Localmente**
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:3001`
- Database: `psql ubl_dev`

### **3. Deploy para AWS**
```bash
cd terraform/production
terraform plan
terraform apply
```

---

## 🔄 Resetar Ambiente Local

Se precisar resetar o banco:

```bash
dropdb ubl_dev
createdb ubl_dev
npm run migrate
```

---

## 📝 Variáveis de Ambiente por Ambiente

### **Local (.env)**
```bash
DATABASE_URL=postgresql://$(whoami)@localhost:5432/ubl_dev
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
# AWS_S3_BUCKET= (opcional, pode deixar vazio)
```

### **Produção AWS (EC2)**
```bash
DATABASE_URL=postgresql://ubl_admin:PASSWORD@ubl-core-production.xxxxx.rds.amazonaws.com:5432/ubl_core
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
AWS_S3_BUCKET=ubl-core-workspace-files-prod-ACCOUNT_ID
AWS_REGION=us-east-1
```

---

## ✅ Checklist de Setup Local

- [ ] PostgreSQL instalado e rodando
- [ ] Banco `ubl_dev` criado
- [ ] `.env` configurado
- [ ] Dependências instaladas (`npm install`)
- [ ] Migrations rodadas (`npm run migrate`)
- [ ] Backend iniciado (`npm run dev`)
- [ ] Health check funcionando (`curl http://localhost:3000/health`)

---

**Última atualização:** 2025-12-12



