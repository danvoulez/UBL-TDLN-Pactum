#!/bin/bash
# Script para configurar PostgreSQL local (sem Docker)

set -e

echo "🚀 Configurando PostgreSQL local para desenvolvimento..."

# Verificar sistema operacional
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "📦 Detectado macOS"
    
    # Verificar se Homebrew está instalado
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew não está instalado. Instale em: https://brew.sh"
        exit 1
    fi
    
    # Verificar se PostgreSQL está instalado
    if ! command -v psql &> /dev/null; then
        echo "📦 Instalando PostgreSQL via Homebrew..."
        brew install postgresql@15
        brew services start postgresql@15
        echo "✅ PostgreSQL instalado e iniciado"
    else
        echo "✅ PostgreSQL já está instalado"
        
        # Verificar se está rodando
        if ! brew services list | grep -q "postgresql@15.*started"; then
            echo "🔄 Iniciando PostgreSQL..."
            brew services start postgresql@15
        else
            echo "✅ PostgreSQL já está rodando"
        fi
    fi
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "📦 Detectado Linux"
    
    # Verificar se PostgreSQL está instalado
    if ! command -v psql &> /dev/null; then
        echo "📦 Instalando PostgreSQL..."
        
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y postgresql-15 postgresql-contrib-15
        elif command -v yum &> /dev/null; then
            sudo yum install -y postgresql15-server postgresql15
        else
            echo "❌ Gerenciador de pacotes não reconhecido. Instale PostgreSQL manualmente."
            exit 1
        fi
        
        # Iniciar serviço
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
        echo "✅ PostgreSQL instalado e iniciado"
    else
        echo "✅ PostgreSQL já está instalado"
        
        # Verificar se está rodando
        if ! systemctl is-active --quiet postgresql; then
            echo "🔄 Iniciando PostgreSQL..."
            sudo systemctl start postgresql
        else
            echo "✅ PostgreSQL já está rodando"
        fi
    fi
    
else
    echo "❌ Sistema operacional não suportado: $OSTYPE"
    echo "Por favor, instale PostgreSQL manualmente."
    exit 1
fi

# Aguardar PostgreSQL estar pronto
echo "⏳ Aguardando PostgreSQL estar pronto..."
sleep 3

# Criar banco de dados se não existir
DB_NAME="ubl_dev"
DB_USER=$(whoami)

if psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "✅ Banco de dados '$DB_NAME' já existe"
else
    echo "📦 Criando banco de dados '$DB_NAME'..."
    createdb "$DB_NAME" || {
        # Tentar com usuário postgres
        echo "⚠️  Tentando criar com usuário postgres..."
        sudo -u postgres createdb "$DB_NAME" 2>/dev/null || {
            echo "❌ Não foi possível criar o banco. Crie manualmente:"
            echo "   createdb $DB_NAME"
            exit 1
        }
    }
    echo "✅ Banco de dados '$DB_NAME' criado"
fi

# Criar .env se não existir
if [ ! -f .env ]; then
    echo "📝 Criando .env a partir de .env.example..."
    cp .env.example .env
    
    # Atualizar DATABASE_URL
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - usuário atual
        sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$(whoami)@localhost:5432/$DB_NAME|" .env
    else
        # Linux - pode precisar de usuário postgres
        sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres@localhost:5432/$DB_NAME|" .env
    fi
    
    echo "✅ .env criado com DATABASE_URL configurado"
else
    echo "✅ .env já existe"
fi

# Rodar migrations se existir
if [ -f "package.json" ] && grep -q "\"migrate\"" package.json; then
    echo "📦 Rodando migrations..."
    npm run migrate || echo "⚠️  Migrations podem falhar se já foram executadas. Isso é normal."
fi

echo ""
echo "✅ Ambiente local configurado!"
echo ""
echo "📊 Informações:"
echo "  - PostgreSQL: localhost:5432"
echo "  - Banco: $DB_NAME"
echo "  - Usuário: $DB_USER"
echo ""
echo "🔧 Comandos úteis:"
echo "  - Conectar: psql $DB_NAME"
echo "  - Resetar: dropdb $DB_NAME && createdb $DB_NAME"
echo "  - Parar PostgreSQL (macOS): brew services stop postgresql@15"
echo "  - Parar PostgreSQL (Linux): sudo systemctl stop postgresql"
echo ""
echo "🚀 Próximo passo: npm run dev"



