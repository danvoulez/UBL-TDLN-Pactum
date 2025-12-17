# Contribuindo para o UBL

Este documento explica como contribuir para o Universal Business Ledger, com foco em **co-manutenção humano-IA**.

---

## Filosofia de Código Pedagógico

O UBL é feito para ser mantido por **humanos + IAs** em pé de igualdade. Isso significa:

- **Redundância intencional** é parte do contrato, não lixo para limpeza
- **Exemplos repetidos** em contextos diferentes são valiosos
- **Comentários explicando o óbvio** ajudam IAs a navegar o contexto
- **Testes são documentação executável**, não apenas verificação

📖 **Leia mais**: `docs/CODIGO-PEDAGOGICO-HUMANO-IA.md`

---

## Diretrizes para Refactors Assistidos por IA

### ❌ NÃO FAZER

1. **Nunca remover comentários pedagógicos** sem substituição equivalente
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

## Comentários Pedagógicos

Comentários marcados indicam:

- **Código pedagógico**: Serve como exemplo vivo
- **Redundância intencional**: Não remover sem substituição
- **Teste como documentação**: Preservar clareza dos cenários

### Exemplos

```typescript
// CÓDIGO PEDAGÓGICO
// Este bloco funciona como exemplo vivo para humanos + IAs.
// Não remover "redundâncias" aqui sem substituir por algo igualmente didático.
```

```typescript
// REDUNDÂNCIA INTENCIONAL
// Esta função parece óbvia/repetida, mas existe como âncora semântica.
// Não "otimizar" removendo sem garantir um equivalente igualmente didático.
```

```typescript
// TESTE COMO DOCUMENTAÇÃO
// Este arquivo também funciona como "guia de uso" para humanos + IAs.
// Ao alterar, preserve a clareza dos cenários e dados de exemplo.
```

---

## Testes como Documentação

Testes importantes estão marcados como **documentação executável**:

- `tests/integration/api-chat.test.ts` - Como usar a API de chat
- `tests/integration/realm-contract-invariants.test.ts` - Como Realms funcionam
- `tests/integration/realm-manager-eventstore.test.ts` - Como reconstruir Realms
- `tests/integration/search/indexing-eventual-consistency.test.ts` - Como busca funciona
- `tests/integration/compliance/export-gdpr.test.ts` - Como export funciona

**Ao alterar:**
- Preserve a clareza dos cenários
- Mantenha dados de exemplo legíveis
- Use nomes descritivos para cenários

---

## Processo de Contribuição

1. **Fork** o repositório
2. **Crie uma branch** (`git checkout -b feature/amazing-feature`)
3. **Siga as diretrizes** de código pedagógico
4. **Adicione testes** que funcionem como exemplos de uso
5. **Commit** suas mudanças (`git commit -m 'Add amazing feature'`)
6. **Push** para a branch (`git push origin feature/amazing-feature`)
7. **Abra um Pull Request**

---

## Checklist para Pull Requests

- [ ] Código segue as diretrizes de código pedagógico
- [ ] Comentários explicam "por que", não apenas "o quê"
- [ ] Testes servem como exemplos de uso
- [ ] Nenhum comentário pedagógico foi removido sem substituição
- [ ] Build passa (`npm run build`)
- [ ] Testes passam (`npm test`)
- [ ] Linter passa (`npm run lint`)

---

## Precisando de Ajuda?

- Leia `docs/CODIGO-PEDAGOGICO-HUMANO-IA.md` para entender a filosofia
- Explore testes como exemplos de uso
- Pergunte ao agente: "Como fazer X?"

---

**Última atualização:** 2025-12-12

