/**
 * FASE 10 - CÓDIGO PEDAGÓGICO
 * 
 * Este módulo funciona como exemplo vivo para humanos + IAs.
 * Cada helper é um exemplo completo de mensagem operacional.
 * Não remover "redundâncias" aqui sem substituir por algo igualmente didático.
 * 
 * OPERATOR MESSAGES - Operational UX Helpers
 * 
 * Fase 6: UX DE OPERADOR DO DIAMANTE
 * 
 * This module provides helpers for generating operator-friendly messages:
 * - Incident messages (API down, errors, etc.)
 * - Guidance messages (how to fix something)
 * - Diagnostic messages (technical analysis)
 * - Runbook templates
 * 
 * Philosophy: Messages that an operator can use at 3am, sleepy, to solve problems.
 * 
 * Cada função aqui serve como template reutilizável e exemplo de uso.
 * Runbooks são especialmente valiosos como documentação executável.
 */

import type { AgentResponse } from '../primitives';
import type { AgentMessageKind } from '../primitives';

// ============================================================================
// CONTENT HELPERS
// ============================================================================

export interface OperatorMessageContent {
  readonly markdown: string;
  readonly kind: AgentMessageKind;
  readonly suggestions: readonly string[];
}

// ============================================================================
// INCIDENT MESSAGES
// ============================================================================

export function buildApiDownMessage(context: {
  traceId?: string;
  endpoint: string;
  errorCode?: string;
  errorMessage?: string;
}): OperatorMessageContent {
  const { endpoint, traceId, errorCode, errorMessage } = context;
  
  const markdown = `⚠️ **Problema detectado na API**

- **Endpoint**: \`${endpoint}\`
- **Situação**: não está respondendo corretamente.
${traceId ? `- **Trace ID**: \`${traceId}\` (use para correlacionar logs)` : ''}
${errorCode ? `- **Código de erro**: \`${errorCode}\`` : ''}
${errorMessage ? `- **Mensagem**: ${errorMessage}` : ''}

**Sugestões de próximos passos:**

1. **Rodar o health-check completo:**
   \`\`\`bash
   ./cicd/verificar-status-aws.sh
   \`\`\`

2. **Ver logs recentes:**
   \`\`\`bash
   tail -n 200 /tmp/deploy-aws-*.log
   \`\`\`

3. **Testar endpoints específicos:**
   \`\`\`bash
   ./cicd/testar-api-endpoints.sh http://api.logline.world
   \`\`\`

4. **Ver logs da aplicação (se em EC2):**
   \`\`\`bash
   sudo journalctl -u ubl-api -n 100 | grep "${traceId || endpoint}"
   \`\`\`

Se quiser, posso te ajudar a interpretar a saída.`;

  return {
    markdown,
    kind: 'incident',
    suggestions: [
      'Rodar ./cicd/verificar-status-aws.sh',
      'Ver logs recentes do deploy',
      'Testar endpoints da API',
    ],
  };
}

export function buildAwsCredentialIssueMessage(context: {
  operation?: string;
}): OperatorMessageContent {
  const { operation = 'operação' } = context;
  
  const markdown = `🔐 **Problema com credenciais AWS**

A ${operation} falhou devido a problemas de autenticação AWS.

**Verificações:**

1. **Verificar se as credenciais estão configuradas:**
   \`\`\`bash
   aws sts get-caller-identity
   \`\`\`

2. **Verificar variáveis de ambiente:**
   \`\`\`bash
   cat .env | grep AWS
   \`\`\`

3. **Verificar se o perfil AWS está correto:**
   \`\`\`bash
   aws configure list
   \`\`\`

Se as credenciais estiverem corretas, pode ser um problema de permissões IAM.`;

  return {
    markdown,
    kind: 'incident',
    suggestions: [
      'Verificar credenciais AWS',
      'Rodar aws sts get-caller-identity',
      'Verificar variáveis de ambiente',
    ],
  };
}

export function buildDatabaseIssueMessage(context: {
  operation?: string;
  databaseUrl?: string;
}): OperatorMessageContent {
  const { operation = 'operação', databaseUrl } = context;
  
  const markdown = `🗄️ **Problema com banco de dados**

A ${operation} falhou ao acessar o banco de dados.

**Verificações:**

1. **Verificar conectividade:**
   \`\`\`bash
   psql "${databaseUrl || '$DATABASE_URL'}" -c "SELECT 1;"
   \`\`\`

2. **Verificar se o RDS está acessível:**
   \`\`\`bash
   ./cicd/verificar-status-aws.sh
   \`\`\`

3. **Ver logs de migração (se aplicável):**
   \`\`\`bash
   tail -n 100 /tmp/deploy-aws-*.log | grep -i database
   \`\`\`

4. **Verificar se o schema está atualizado:**
   \`\`\`bash
   cd Universal-Business-Ledger-Dezembro && npm run db:status
   \`\`\`

Se o problema persistir, pode ser necessário verificar as configurações de rede (security groups, VPC, etc.).`;

  return {
    markdown,
    kind: 'incident',
    suggestions: [
      'Verificar conectividade com banco',
      'Rodar ./cicd/verificar-status-aws.sh',
      'Ver logs de deploy',
    ],
  };
}

export function buildGenericErrorMessage(context: {
  error: unknown;
  operation?: string;
  traceId?: string;
}): OperatorMessageContent {
  const { error, operation = 'operação', traceId } = context;
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const markdown = `❌ **Erro durante ${operation}**

**Mensagem de erro:**
\`\`\`
${errorMessage}
\`\`\`
${traceId ? `\n**Trace ID**: \`${traceId}\` (use para correlacionar logs)` : ''}

**Próximos passos:**

1. **Verificar logs completos:**
   \`\`\`bash
   tail -n 500 /tmp/pipeline-oficial-*.log
   \`\`\`

2. **Rodar verificação de status:**
   \`\`\`bash
   ./cicd/verificar-status-aws.sh
   \`\`\`

3. **Se for erro de API, testar endpoints:**
   \`\`\`bash
   ./cicd/testar-api-endpoints.sh http://api.logline.world
   \`\`\`

Se o problema persistir, verifique a documentação de observabilidade em \`docs/OBSERVABILITY-UBL.md\`.`;

  return {
    markdown,
    kind: 'incident',
    suggestions: [
      'Ver logs completos',
      'Rodar verificação de status',
      'Testar endpoints da API',
    ],
  };
}

// ============================================================================
// GUIDANCE MESSAGES
// ============================================================================

export function buildSessionGuidanceMessage(context: {
  reason: string;
}): OperatorMessageContent {
  const { reason } = context;
  
  const markdown = `📋 **Como usar a sessão de chat**

${reason}

**Formato correto:**

Para iniciar uma nova sessão:
\`\`\`json
{
  "message": { "text": "Olá" },
  "startSession": {
    "realmId": "realm-id",
    "actor": { "type": "User", "userId": "user-id" }
  }
}
\`\`\`

Para continuar uma sessão existente:
\`\`\`json
{
  "message": { "text": "Continuar conversa" },
  "sessionId": "sess-xyz"
}
\`\`\`

**Requisitos:**
- Você precisa fornecer **ou** \`startSession\` **ou** \`sessionId\`
- Não é possível enviar uma mensagem sem uma sessão ativa`;

  return {
    markdown,
    kind: 'guidance',
    suggestions: [
      'Iniciar nova sessão com startSession',
      'Usar sessionId de sessão existente',
    ],
  };
}

// ============================================================================
// RUNBOOK TEMPLATES
// ============================================================================

export function buildApiIncidentRunbook(context: {
  traceId?: string;
  endpoint: string;
  errorCode?: string;
}): string {
  const { endpoint, traceId, errorCode } = context;
  
  return `# Runbook: API Incident - ${endpoint}

## O que aconteceu
O endpoint \`${endpoint}\` está retornando erro${errorCode ? ` (código: ${errorCode})` : ''}.
${traceId ? `\n**Trace ID**: \`${traceId}\`` : ''}

## Onde olhar

### 1. Logs da aplicação
\`\`\`bash
sudo journalctl -u ubl-api -n 100 | grep "${traceId || endpoint}"
\`\`\`

### 2. Logs do pipeline
\`\`\`bash
tail -n 200 /tmp/pipeline-oficial-*.log
\`\`\`

### 3. Logs de deploy
\`\`\`bash
tail -n 200 /tmp/deploy-aws-*.log
\`\`\`

## Comandos para diagnosticar

### Health check completo
\`\`\`bash
./cicd/verificar-status-aws.sh
\`\`\`

### Testar todos os endpoints
\`\`\`bash
./cicd/testar-api-endpoints.sh http://api.logline.world
\`\`\`

### Verificar status do serviço (EC2)
\`\`\`bash
sudo systemctl status ubl-api
\`\`\`

## O que esperar ver

- **Se API está rodando**: status "ok" em \`/health\`
- **Se banco está acessível**: health check do event store retorna "healthy"
- **Se há erros recentes**: logs mostram stack traces ou mensagens de erro

## Próximos passos

1. Se API não está respondendo: verificar se o serviço está rodando
2. Se banco está inacessível: verificar conectividade RDS
3. Se há erros de código: verificar logs e stack traces
4. Se problema persistir: consultar \`docs/OBSERVABILITY-UBL.md\` para mais detalhes
`;
}

export function buildDeployFailureRunbook(context: {
  stage?: string;
}): string {
  const { stage = 'DEPLOY' } = context;
  
  return `# Runbook: Deploy Failure - Stage ${stage}

## O que aconteceu
O deploy falhou na stage **${stage}**.

## Onde olhar

### 1. Log do pipeline
\`\`\`bash
tail -n 500 /tmp/pipeline-oficial-*.log
\`\`\`

### 2. Log do deploy
\`\`\`bash
tail -n 500 /tmp/deploy-aws-*.log
\`\`\`

### 3. Logs de testes (se falhou em TEST)
\`\`\`bash
tail -n 200 /tmp/testar-api-endpoints-*.log
\`\`\`

## Comandos para diagnosticar

### Verificar status AWS
\`\`\`bash
./cicd/verificar-status-aws.sh
\`\`\`

### Testar API pós-deploy
\`\`\`bash
./cicd/testar-api-endpoints.sh http://api.logline.world
\`\`\`

### Verificar logs da aplicação (EC2)
\`\`\`bash
sudo journalctl -u ubl-api -n 100 -f
\`\`\`

## O que esperar ver

- **Se falhou em VALIDATE**: problemas com pré-requisitos ou tags AWS
- **Se falhou em TEST**: testes de API ou integração falharam
- **Se falhou em BUILD**: erro de compilação TypeScript
- **Se falhou em DEPLOY**: problema ao fazer upload ou iniciar serviço

## Próximos passos

1. Identificar a stage exata que falhou
2. Verificar logs específicos dessa stage
3. Corrigir o problema identificado
4. Re-executar o pipeline: \`./cicd/pipeline-oficial.sh\`
`;
}

export function buildRealmInconsistencyRunbook(context: {
  realmId: string;
}): string {
  const { realmId } = context;
  
  return `# Runbook: Realm Inconsistency - ${realmId}

## O que aconteceu
Há uma inconsistência entre o event store e o estado aparente do Realm \`${realmId}\`.

## Onde olhar

### 1. Verificar eventos do Realm
\`\`\`bash
# Via REPL ou CLI (se disponível)
# Buscar eventos do Realm no event store
\`\`\`

### 2. Verificar logs do realm-manager
\`\`\`bash
sudo journalctl -u ubl-api -n 100 | grep "realm-manager"
\`\`\`

## Comandos para diagnosticar

### Reconstruir Realm do event store
O Realm Manager deve reconstruir automaticamente do event store.
Se não estiver funcionando, verifique:

1. Se existe evento \`RealmCreated\` para este Realm
2. Se o event store está acessível
3. Se há erros nos logs do realm-manager

### Verificar Primordial Realm
\`\`\`bash
# O Primordial Realm deve sempre existir
# Verificar se bootstrap foi executado
\`\`\`

## O que esperar ver

- **Realm existe no event store**: deve haver evento \`RealmCreated\`
- **Realm não existe**: \`rebuildRealmFromEvents\` retorna \`null\`
- **Inconsistência**: cache mostra Realm, mas event store não tem eventos

## Próximos passos

1. Verificar se o Realm foi criado via evento (não "hardcoded")
2. Se necessário, recriar o Realm via intent \`createRealm\`
3. Se problema persistir, verificar integridade do event store
4. Consultar \`docs/REALM-CONTRACT.md\` para invariantes
`;
}

// ============================================================================
// GOVERNANCE MESSAGES (FASE 8)
// ============================================================================

export function buildRateLimitExceededMessage(context: {
  realmId?: string;
  intent?: string;
  limit?: number;
  remaining?: number;
  retryAfter?: number;
  traceId?: string;
}): OperatorMessageContent {
  const { realmId, intent, limit, remaining, retryAfter, traceId } = context;
  
  const markdown = `⏱️ **Rate Limit Excedido**

${realmId ? `- **Realm**: \`${realmId}\`` : ''}
${intent ? `- **Intent**: \`${intent}\`` : ''}
${limit !== undefined ? `- **Limite**: ${limit} requisições` : ''}
${remaining !== undefined ? `- **Restantes**: ${remaining}` : ''}
${retryAfter ? `- **Aguarde**: ${retryAfter} segundos antes de tentar novamente` : ''}
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**O que aconteceu:**
Você atingiu o limite de requisições permitidas no período de tempo configurado.

**Sugestões:**

1. **Aguardar o reset do limite:**
   ${retryAfter ? `Aguarde ${retryAfter} segundos e tente novamente.` : 'O limite será resetado em breve.'}

2. **Verificar políticas de rate limiting:**
   \`\`\`bash
   # Ver logs de governança
   grep "governance.decision" /var/log/ubl-api.log | tail -20
   \`\`\`

3. **Se precisar de limites maiores:**
   - Entre em contato com o administrador do sistema
   - Verifique se há planos com limites mais altos disponíveis

4. **Otimizar requisições:**
   - Considere agrupar operações quando possível
   - Use endpoints batch quando disponíveis`;

  return {
    markdown,
    kind: 'guidance',
    suggestions: [
      retryAfter ? `Aguardar ${retryAfter} segundos` : 'Aguardar reset do limite',
      'Verificar logs de governança',
      'Contatar administrador para aumentar limites',
    ],
  };
}

export function buildQuotaExceededMessage(context: {
  realmId?: string;
  resourceType?: string;
  current?: number;
  limit?: number;
  remaining?: number;
  traceId?: string;
}): OperatorMessageContent {
  const { realmId, resourceType, current, limit, remaining, traceId } = context;
  
  const markdown = `📊 **Quota Excedida**

${realmId ? `- **Realm**: \`${realmId}\`` : ''}
${resourceType ? `- **Recurso**: ${resourceType}` : ''}
${current !== undefined && limit !== undefined ? `- **Uso**: ${current}/${limit} (${Math.round((current / limit) * 100)}%)` : ''}
${remaining !== undefined ? `- **Restante**: ${remaining}` : ''}
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**O que aconteceu:**
Você atingiu a quota máxima permitida para este recurso.

**Sugestões:**

1. **Verificar uso atual:**
   \`\`\`bash
   # Ver quotas do realm
   # (comando específico dependeria da implementação)
   \`\`\`

2. **Liberar recursos:**
   - Arquive dados antigos se aplicável
   - Remova entidades/agreements não utilizados
   - Limpe eventos históricos conforme políticas de retenção

3. **Solicitar aumento de quota:**
   - Entre em contato com o administrador
   - Verifique planos com quotas maiores

4. **Otimizar uso:**
   - Revise se há dados duplicados
   - Considere compressão ou arquivamento`;

  return {
    markdown,
    kind: 'guidance',
    suggestions: [
      'Verificar uso atual de recursos',
      'Liberar recursos não utilizados',
      'Solicitar aumento de quota',
      'Otimizar uso de recursos',
    ],
  };
}

export function buildPolicyDeniedMessage(context: {
  policyName?: string;
  realmId?: string;
  reason?: string;
  traceId?: string;
}): OperatorMessageContent {
  const { policyName, realmId, reason, traceId } = context;
  
  const markdown = `🚫 **Operação Negada por Política**

${policyName ? `- **Política**: ${policyName}` : ''}
${realmId ? `- **Realm**: \`${realmId}\`` : ''}
${reason ? `- **Motivo**: ${reason}` : ''}
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**O que aconteceu:**
Esta operação foi negada por uma política de governança configurada no sistema.

**Sugestões:**

1. **Verificar políticas aplicáveis:**
   \`\`\`bash
   # Ver logs de governança
   grep "governance.decision.denied" /var/log/ubl-api.log | tail -20
   \`\`\`

2. **Entender a política:**
   - Revise a documentação de políticas
   - Verifique se há exceções configuráveis

3. **Solicitar exceção:**
   - Entre em contato com o administrador
   - Explique o caso de uso e justificativa

4. **Alternativas:**
   - Use uma abordagem diferente que não viole a política
   - Execute a operação em outro momento/horário se aplicável`;

  return {
    markdown,
    kind: 'guidance',
    suggestions: [
      'Verificar políticas aplicáveis',
      'Revisar documentação de políticas',
      'Solicitar exceção ao administrador',
      'Considerar alternativas',
    ],
  };
}

// ============================================================================
// AFFORDANCE EXPLANATION
// ============================================================================

// ============================================================================
// COMPLIANCE MESSAGES (FASE 8)
// ============================================================================

export function buildExportRequestedMessage(context: {
  exportId: string;
  type: string;
  entityId?: string;
  realmId?: string;
  format?: string;
  traceId?: string;
}): OperatorMessageContent {
  const { exportId, type, entityId, realmId, format, traceId } = context;
  
  const markdown = `📦 **Export Solicitado**

- **ID do Export**: \`${exportId}\`
- **Tipo**: ${type}
${entityId ? `- **Entidade**: \`${entityId}\`` : ''}
${realmId ? `- **Realm**: \`${realmId}\`` : ''}
${format ? `- **Formato**: ${format}` : ''}
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**Status**: Processando...

O export foi solicitado e está sendo processado. Você receberá uma notificação quando estiver pronto.

**Como verificar o status:**

\`\`\`bash
# Ver status do export (via API ou CLI)
curl -s "$API_URL/exports/${exportId}/status" | jq
\`\`\`

**O que esperar:**

- O processamento pode levar alguns minutos dependendo do volume de dados
- Você receberá um link de download quando estiver pronto
- O link expira após um período configurado`;

  return {
    markdown,
    kind: 'informational',
    suggestions: [
      'Verificar status do export',
      'Aguardar notificação de conclusão',
      'Verificar logs de export',
    ],
  };
}

export function buildExportReadyMessage(context: {
  exportId: string;
  downloadUrl: string;
  recordCount?: number;
  sizeBytes?: number;
  traceId?: string;
}): OperatorMessageContent {
  const { exportId, downloadUrl, recordCount, sizeBytes, traceId } = context;
  
  const markdown = `✅ **Export Pronto**

- **ID do Export**: \`${exportId}\`
- **Download**: [Baixar arquivo](${downloadUrl})
${recordCount !== undefined ? `- **Registros**: ${recordCount}` : ''}
${sizeBytes !== undefined ? `- **Tamanho**: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB` : ''}
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**Como baixar:**

\`\`\`bash
# Via curl
curl -O "${downloadUrl}"

# Ou acesse diretamente no navegador
# ${downloadUrl}
\`\`\`

**Importante:**

- O link de download expira após um período configurado
- Baixe o arquivo o quanto antes
- Verifique a integridade do arquivo após o download`;

  return {
    markdown,
    kind: 'informational',
    suggestions: [
      'Baixar arquivo de export',
      'Verificar integridade do arquivo',
      'Armazenar arquivo em local seguro',
    ],
  };
}

export function buildExportFailedMessage(context: {
  exportId: string;
  error?: string;
  traceId?: string;
}): OperatorMessageContent {
  const { exportId, error, traceId } = context;
  
  const markdown = `❌ **Export Falhou**

- **ID do Export**: \`${exportId}\`
${error ? `- **Erro**: ${error}` : ''}
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**O que aconteceu:**

O processamento do export falhou. Isso pode acontecer por vários motivos:
- Dados muito grandes
- Erro no event store
- Timeout no processamento
- Problema de permissões

**Sugestões:**

1. **Verificar logs:**
   \`\`\`bash
   grep "export.request.failed" /var/log/ubl-api.log | grep "${exportId}"
   \`\`\`

2. **Tentar novamente:**
   - Crie um novo export request
   - Se o problema persistir, entre em contato com suporte

3. **Verificar recursos:**
   - Verifique se há espaço em disco suficiente
   - Verifique se o event store está acessível
   - Verifique permissões de escrita

4. **Se necessário, reduzir escopo:**
   - Tente exportar um período menor de tempo
   - Tente exportar apenas uma entidade específica`;

  return {
    markdown,
    kind: 'incident',
    suggestions: [
      'Verificar logs de erro',
      'Tentar criar novo export',
      'Verificar recursos do sistema',
      'Contatar suporte se necessário',
    ],
  };
}

// ============================================================================
// SEARCH & EVENTUAL CONSISTENCY MESSAGES (FASE 9)
// ============================================================================

export function buildSearchLagMessage(context: {
  realmId?: string;
  indexLagEvents: number;
  traceId?: string;
}): OperatorMessageContent {
  const { realmId, indexLagEvents, traceId } = context;
  
  const markdown = `🔎 **Busca com atraso em relação ao ledger**

${realmId ? `- **Realm**: \`${realmId}\`` : ''}
- **Atraso estimado**: ${indexLagEvents} eventos ainda não indexados.
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**O que isso significa:**

- A escrita no ledger está OK.
- A camada de busca ainda não refletiu todos os eventos.
- Isso é **normal** em sistemas com consistência eventual.

**Próximos passos sugeridos:**

1. **Conferir o status do indexer:**
   \`\`\`bash
   # Ver logs de indexação
   grep "search.indexing" /var/log/ubl-api.log | tail -20
   \`\`\`

2. **Aguardar alguns minutos e buscar novamente:**
   - O indexer processa eventos em background
   - Em alguns minutos, os eventos devem estar indexados

3. **Se o atraso continuar crescendo:**
   - Investigar logs de \`search.indexing.*\`
   - Verificar se o indexer está rodando
   - Verificar se há erros no processamento

4. **Se precisar de resultados imediatos:**
   - Considere consultar o event store diretamente
   - Use queries estruturadas em vez de busca textual`;

  return {
    markdown,
    kind: 'diagnostic',
    suggestions: [
      'Verificar logs do indexer',
      'Aguardar alguns minutos e buscar novamente',
      'Investigar se indexer está rodando',
      'Considerar consulta direta ao event store',
    ],
  };
}

export function buildSearchIndexingIssueMessage(context: {
  realmId?: string;
  error?: string;
  traceId?: string;
}): OperatorMessageContent {
  const { realmId, error, traceId } = context;
  
  const markdown = `⚠️ **Problema na Indexação de Busca**

${realmId ? `- **Realm**: \`${realmId}\`` : ''}
${error ? `- **Erro**: ${error}` : ''}
${traceId ? `- **Trace ID**: \`${traceId}\`` : ''}

**O que aconteceu:**

O indexer de busca encontrou um problema ao processar eventos. Isso pode causar:
- Busca não retornando resultados recentes
- Atraso crescente entre ledger e índice

**Sugestões:**

1. **Verificar logs detalhados:**
   \`\`\`bash
   grep "search.indexing.tick.error" /var/log/ubl-api.log | tail -50
   \`\`\`

2. **Verificar status do indexer:**
   \`\`\`bash
   # Verificar se indexer está rodando
   ps aux | grep "search-indexer"
   \`\`\`

3. **Verificar backend de busca:**
   - Se usar Elasticsearch, verificar se está acessível
   - Se usar outro backend, verificar conectividade

4. **Forçar reindexação (se necessário):**
   - Pode ser necessário reprocessar eventos
   - Consulte documentação de reindexação`;

  return {
    markdown,
    kind: 'incident',
    suggestions: [
      'Verificar logs detalhados do indexer',
      'Verificar se indexer está rodando',
      'Verificar backend de busca',
      'Considerar reindexação se necessário',
    ],
  };
}

export function buildSearchIndexerIncidentRunbook(context: {
  realmId?: string;
  error?: string;
}): OperatorMessageContent {
  const { realmId, error } = context;
  
  const markdown = `🚨 **Runbook: Incidente no Indexer de Busca**

${realmId ? `- **Realm afetado**: \`${realmId}\`` : 'Realm: todos'}
${error ? `- **Erro detectado**: ${error}` : ''}

**Passos para investigação:**

1. **Verificar logs do indexer:**
   \`\`\`bash
   # Logs de indexação
   grep "search.indexing" /var/log/ubl-api.log | tail -100
   
   # Erros específicos
   grep "search.indexing.tick.error" /var/log/ubl-api.log | tail -50
   \`\`\`

2. **Verificar status do processo:**
   \`\`\`bash
   # Verificar se indexer está rodando
   ps aux | grep "search-indexer"
   
   # Verificar uso de recursos
   top -p $(pgrep -f "search-indexer")
   \`\`\`

3. **Verificar backend de busca:**
   \`\`\`bash
   # Se usar Elasticsearch
   curl -s http://localhost:9200/_cluster/health | jq
   
   # Verificar conectividade
   curl -s http://localhost:9200/_cat/indices
   \`\`\`

4. **Verificar consistência do índice:**
   \`\`\`bash
   # Verificar lag de indexação
   # (comando dependeria da implementação)
   \`\`\`

5. **Se necessário, reiniciar indexer:**
   \`\`\`bash
   # Reiniciar serviço (se rodar como serviço)
   sudo systemctl restart ubl-search-indexer
   \`\`\`

**Sinais de recuperação:**

- Logs mostram \`search.indexing.tick.success\`
- Lag de indexação começa a diminuir
- Busca retorna resultados recentes

**Se problema persistir:**

- Verificar se há problemas no event store
- Verificar se há problemas de conectividade com backend
- Considerar reindexação completa se necessário`;

  return {
    markdown,
    kind: 'diagnostic',
    suggestions: [
      'Verificar logs do indexer',
      'Verificar status do processo',
      'Verificar backend de busca',
      'Reiniciar indexer se necessário',
    ],
  };
}

export function buildSearchBackendIncidentRunbook(context: {
  engineName?: string;
  error?: string;
}): OperatorMessageContent {
  const { engineName, error } = context;
  
  const markdown = `🚨 **Runbook: Incidente no Backend de Busca**

- **Engine**: ${engineName || 'Desconhecido'}
${error ? `- **Erro**: ${error}` : ''}

**Passos para investigação:**

1. **Verificar status do backend:**
   \`\`\`bash
   # Se Elasticsearch
   curl -s http://localhost:9200/_cluster/health | jq
   
   # Verificar índices
   curl -s http://localhost:9200/_cat/indices?v
   \`\`\`

2. **Verificar logs do backend:**
   \`\`\`bash
   # Logs do Elasticsearch (exemplo)
   tail -100 /var/log/elasticsearch/elasticsearch.log
   \`\`\`

3. **Verificar recursos:**
   \`\`\`bash
   # Espaço em disco
   df -h
   
   # Memória
   free -h
   \`\`\`

4. **Verificar conectividade:**
   \`\`\`bash
   # Testar conexão
   curl -s http://localhost:9200
   \`\`\`

5. **Se necessário, reiniciar backend:**
   \`\`\`bash
   # Reiniciar Elasticsearch (exemplo)
   sudo systemctl restart elasticsearch
   \`\`\`

**Sinais de recuperação:**

- Backend responde a health checks
- Índices estão acessíveis
- Busca retorna resultados

**Se problema persistir:**

- Verificar configuração do backend
- Verificar recursos do sistema
- Considerar escalar recursos se necessário`;

  return {
    markdown,
    kind: 'diagnostic',
    suggestions: [
      'Verificar status do backend',
      'Verificar logs do backend',
      'Verificar recursos do sistema',
      'Reiniciar backend se necessário',
    ],
  };
}

// ============================================================================
// ONBOARDING & CODE PEDAGOGY MESSAGES (FASE 10)
// ============================================================================

export function buildCodePedagogicoExplanationMessage(): OperatorMessageContent {
  const markdown = `📚 **Filosofia de Código Pedagógico do UBL**

O UBL é feito para ser mantido por **humanos + IAs** em pé de igualdade.

**Princípios:**

1. **Redundância Intencional**
   - Exemplos repetidos em contextos diferentes são valiosos
   - Comentários explicando o óbvio ajudam IAs a navegar o contexto
   - Re-exports facilitam descoberta sem necessidade de navegar imports

2. **Testes como Documentação**
   - Testes servem como roteiros de uso executáveis
   - Cenários bem nomeados servem como índice
   - Dados de exemplo legíveis, mesmo que "verbosos"

3. **Comentários de Fase**
   - Comentários marcados com "FASE 10" indicam código pedagógico
   - Protegem contra refactors destrutivos
   - Explicam "por que", não apenas "o quê"

**Onde encontrar exemplos:**

- \`core/universal/primitives.ts\` - Tipos canônicos com exemplos
- \`core/agent/primitives.ts\` - Helpers como âncoras semânticas
- \`tests/integration/*.test.ts\` - Testes como roteiros de uso
- \`docs/CODIGO-PEDAGOGICO-HUMANO-IA.md\` - Documentação completa

**Filosofia:**

> Prefira o caminho que permite que mais gente (e mais IAs)
> consiga entender, operar e evoluir o UBL com segurança.`;

  return {
    markdown,
    kind: 'informational',
    suggestions: [
      'Ler docs/CODIGO-PEDAGOGICO-HUMANO-IA.md',
      'Explorar testes como exemplos de uso',
      'Ver comentários FASE 10 no código',
    ],
  };
}

export function buildOnboardingForNewMaintainerMessage(): OperatorMessageContent {
  const markdown = `🚀 **Onboarding: Se você é novo no UBL**

Bem-vindo! Este guia te ajuda a começar a trabalhar no UBL.

**Passo 1: Entender a Filosofia**

Leia \`docs/REALM-CONTRACT.md\` para entender:
- O que são Realms
- Como Agreements estabelecem Realms
- Por que isolamento é importante

**Passo 2: Rodar o Pipeline**

\`\`\`bash
cd "/Users/voulezvous/new aws/ORGANIZAR"
./cicd/pipeline-oficial.sh
\`\`\`

Isso valida:
- Ambiente configurado
- Testes passando
- Build funcionando

**Passo 3: Testar a API**

\`\`\`bash
# Health check
curl -s http://localhost:3000/health | jq

# Chat com o agente
curl -s -X POST http://localhost:3000/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": { "text": "Olá, me mostra do que você é capaz." },
    "startSession": {
      "realmId": "test-realm",
      "actor": { "type": "System", "systemId": "test" }
    }
  }' | jq
\`\`\`

**Passo 4: Ler Documentação Operacional**

- \`docs/OBSERVABILITY-UBL.md\` - Como ler logs
- \`docs/GOVERNANCA-COMPUTAVEL-UBL.md\` - Como governança funciona
- \`docs/BUSCA-E-CONSISTENCIA-EVENTUAL-UBL.md\` - Como busca funciona

**Passo 5: Explorar Testes como Exemplos**

- \`tests/integration/api-chat.test.ts\` - Como usar a API de chat
- \`tests/integration/realm-contract-invariants.test.ts\` - Como Realms funcionam
- \`tests/integration/search/indexing-eventual-consistency.test.ts\` - Como busca funciona

**Scripts Tutoriais:**

- \`cicd/validate.sh\` - Valida ambiente e configuração
- \`cicd/testar-api-endpoints.sh\` - Mostra como testar a API
- \`cicd/verificar-status-aws.sh\` - Mostra como verificar infraestrutura

**Precisa de ajuda?**

- Pergunte ao agente: "Como fazer X?"
- Leia \`docs/CODIGO-PEDAGOGICO-HUMANO-IA.md\` para entender a filosofia
- Explore testes como exemplos de uso`;

  return {
    markdown,
    kind: 'guidance',
    suggestions: [
      'Ler docs/REALM-CONTRACT.md',
      'Rodar pipeline-oficial.sh',
      'Testar API com curl',
      'Explorar testes como exemplos',
      'Ler documentação operacional',
    ],
  };
}

export function buildAffordanceExplanation(affordances: readonly { intent: string; label: string; description?: string }[]): string {
  if (affordances.length === 0) {
    return 'Nenhuma ação disponível no momento.';
  }
  
  const items = affordances.map(a => {
    const desc = a.description || a.label;
    return `- **\`${a.intent}\`**: ${desc}`;
  }).join('\n');
  
  return `🛠 **Ações disponíveis agora**

${items}

Você pode:
- Clicar nos botões acima (se a interface suportar)
- Falar em linguagem natural (ex.: "cria um realm de staging isolado")
- Usar os comandos sugeridos abaixo`;
}

