#!/bin/bash
# Script para configurar ambiente de desenvolvimento local

set -e

echo "🚀 Configurando ambiente de desenvolvimento local..."

# Verificar se Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker não está rodando. Por favor, inicie o Docker Desktop."
    exit 1
fi

# Verificar se docker-compose está instalado
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose não está instalado."
    exit 1
fi

# Criar .env se não existir
if [ ! -f .env ]; then
    echo "📝 Criando .env a partir de .env.example..."
    cp .env.example .env
    echo "✅ .env criado. Por favor, ajuste os valores se necessário."
else
    echo "✅ .env já existe."
fi

# Iniciar serviços Docker
echo "🐳 Iniciando PostgreSQL e Redis..."
docker-compose -f docker-compose.dev.yml up -d

# Aguardar PostgreSQL estar pronto
echo "⏳ Aguardando PostgreSQL estar pronto..."
sleep 5

# Verificar se PostgreSQL está respondendo
until docker exec ubl-dev-postgres pg_isready -U ubl > /dev/null 2>&1; do
    echo "⏳ Aguardando PostgreSQL..."
    sleep 2
done

echo "✅ PostgreSQL está pronto!"

# Rodar migrations
echo "📦 Rodando migrations..."
npm run migrate || echo "⚠️  Migrations podem falhar se já foram executadas. Isso é normal."

echo ""
echo "✅ Ambiente de desenvolvimento configurado!"
echo ""
echo "📊 Serviços disponíveis:"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "🔧 Comandos úteis:"
echo "  - Parar serviços: docker-compose -f docker-compose.dev.yml down"
echo "  - Ver logs: docker-compose -f docker-compose.dev.yml logs -f"
echo "  - Resetar banco: docker-compose -f docker-compose.dev.yml down -v"
echo ""
echo "🚀 Próximo passo: npm run dev"



