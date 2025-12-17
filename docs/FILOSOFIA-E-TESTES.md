# 🧪 Filosofia e Testes - Universal Business Ledger

**Data:** 2025-12-07  
**Baseado em:** `PHILOSOPHY.md` - Princípios fundamentais do UBL

---

## 🎯 O Que a Filosofia Diz Sobre Testes

A filosofia do UBL **não menciona testes explicitamente**, mas estabelece **5 princípios fundamentais** que têm **implicações diretas e profundas** para como devemos testar o sistema:

---

## 📜 Os 5 Princípios Filosóficos

### **1. Radical Transparency** (Transparência Radical)

> *"Nothing is hidden. Every relationship has a source. Every change has a cause."*

**Implicações para Testes:**

✅ **Testes devem verificar rastreabilidade completa:**
- Todo evento deve ter um `actor` identificável
- Toda relação deve ter um `agreement` que a estabeleceu
- Toda role deve ter um `agreement` que a concedeu
- Toda mudança deve ter um `event` que a causou

✅ **Testes devem validar que nada é "mágico":**
- Não pode haver estados que aparecem do nada
- Não pode haver permissões sem origem
- Não pode haver relacionamentos sem agreements

**Exemplo de Teste:**
```typescript
it('should trace every role to its establishing agreement', async () => {
  const role = await getRole(roleId);
  assert(role.establishedBy, 'Role must have establishing agreement');
  const agreement = await getAgreement(role.establishedBy);
  assert(agreement, 'Establishing agreement must exist');
});
```

---

### **2. Temporal Integrity** (Integridade Temporal)

> *"The past is immutable. We don't rewrite history; we make new history."*

**Implicações para Testes:**

✅ **Testes devem verificar imutabilidade:**
- Eventos não podem ser modificados
- Eventos não podem ser deletados
- Sequência de eventos não pode ser alterada
- Hash chain não pode ser quebrada

✅ **Testes devem validar que o passado é reconstruível:**
- Estado em qualquer ponto no tempo pode ser reconstruído
- Replay de eventos deve produzir o mesmo estado
- Time-travel deve funcionar corretamente

**Exemplo de Teste:**
```typescript
it('should not allow event modification', async () => {
  const event = await eventStore.append(createEvent());
  await assert.rejects(
    eventStore.update(event.id, { ...event, payload: { modified: true } }),
    /immutable|cannot.*modify/i
  );
});

it('should reconstruct state at any point in time', async () => {
  await appendEvents([e1, e2, e3, e4, e5]);
  const stateAt3 = await replayTo(3n);
  const stateAt5 = await replayTo(5n);
  assert.notDeepEqual(stateAt3, stateAt5, 'States should differ');
});
```

---

### **3. Relational Ontology** (Ontologia Relacional)

> *"Things don't have intrinsic properties in isolation. Properties emerge from relationships (agreements)."*

**Implicações para Testes:**

✅ **Testes devem verificar que propriedades vêm de relacionamentos:**
- Uma entidade não "é" um Employee - ela "holds" o role Employee via Agreement
- Um asset não "pertence" a alguém - ele tem um owner via Agreement
- Permissões não são atributos - são concedidas via Agreements

✅ **Testes devem validar que isolamento não existe:**
- Entidades sem relacionamentos não têm propriedades significativas
- Roles só existem no contexto de Agreements
- Assets só têm significado dentro de Agreements

**Exemplo de Teste:**
```typescript
it('should not allow roles without agreements', async () => {
  await assert.rejects(
    createRole({ entityId: 'ent-1', roleType: 'Employee' }), // Sem agreement
    /agreement.*required|must.*via.*agreement/i
  );
});

it('should derive permissions from agreements, not attributes', async () => {
  const entity = await getEntity('ent-1');
  // Entity não tem permissões diretamente
  assert(!entity.permissions, 'Entity should not have direct permissions');
  
  // Permissões vêm de roles, que vêm de agreements
  const roles = await getRoles({ holderId: 'ent-1' });
  const permissions = roles.flatMap(r => r.permissions);
  assert(permissions.length > 0, 'Permissions should come from roles');
});
```

---

### **4. Contractualism** (Contratualismo)

> *"All social/business relationships are fundamentally agreements between parties."*

**Implicações para Testes:**

✅ **Testes devem verificar que tudo é via Agreement:**
- Não pode haver relacionamentos sem Agreement
- Não pode haver mudanças sem Agreement
- Não pode haver transferências sem Agreement

✅ **Testes devem validar que Agreements são o único caminho:**
- Criar relacionamento → Criar Agreement
- Mudar relacionamento → Criar novo Agreement ou modificar Agreement existente
- Terminar relacionamento → Fulfill ou Terminate Agreement

**Exemplo de Teste:**
```typescript
it('should require agreement for all relationships', async () => {
  await assert.rejects(
    createRelationship({ entity1: 'ent-1', entity2: 'ent-2', type: 'partnership' }),
    /agreement.*required/i
  );
  
  // Deve funcionar via agreement
  const agreement = await createAgreement({
    type: 'Partnership',
    parties: [{ entityId: 'ent-1' }, { entityId: 'ent-2' }]
  });
  assert(agreement, 'Relationship should be created via agreement');
});
```

---

### **5. Accountability** (Responsabilidade)

> *"Every action is attributable to an actor. Every role traces to its establishment."*

**Implicações para Testes:**

✅ **Testes devem verificar que toda ação tem um actor:**
- Todo evento deve ter um `actor`
- Toda mudança deve ser atribuível
- Toda decisão deve ter um responsável

✅ **Testes devem validar rastreabilidade de roles:**
- Todo role deve ter um `establishedBy` (agreement)
- Todo role deve ter um `grantedBy` (actor)
- Todo role deve ter um `validFrom` e possivelmente `validUntil`

**Exemplo de Teste:**
```typescript
it('should require actor for every action', async () => {
  await assert.rejects(
    eventStore.append({ ...event, actor: undefined }),
    /actor.*required/i
  );
});

it('should trace every role to its establishment', async () => {
  const role = await getRole(roleId);
  assert(role.establishedBy, 'Role must have establishing agreement');
  assert(role.grantedBy, 'Role must have granting actor');
  assert(role.validFrom, 'Role must have validity period');
});
```

---

## ⏰ The Arrow of Time (A Seta do Tempo)

A filosofia também estabelece o conceito de **"The Arrow of Time"**:

> *"Events are facts. They happened. They cannot be undone—only compensated. State is derived by replaying events. Any point in time can be reconstructed. Audit trail is perfect and complete."*

**Implicações para Testes:**

✅ **Testes devem verificar imutabilidade de eventos:**
- Eventos são fatos imutáveis
- Eventos não podem ser desfeitos
- Compensação só via novos eventos

✅ **Testes devem validar que estado é derivado:**
- Estado não é armazenado diretamente
- Estado é reconstruído replaying eventos
- Qualquer ponto no tempo pode ser reconstruído

✅ **Testes devem verificar audit trail completo:**
- Todo evento está no log
- Nada pode ser perdido
- Rastreabilidade completa

**Exemplo de Teste:**
```typescript
it('should derive state from events, not store it', async () => {
  // Estado não deve existir antes de eventos
  let state = await getAggregateState('agg-1');
  assert(!state.exists, 'State should not exist before events');
  
  // Após eventos, estado deve ser derivado
  await appendEvent({ type: 'Created', aggregateId: 'agg-1' });
  state = await getAggregateState('agg-1');
  assert(state.exists, 'State should exist after events');
  
  // Estado deve ser reconstruível
  const replayedState = await replayTo(1n);
  assert.deepEqual(state, replayedState, 'State should match replayed state');
});
```

---

## 🎯 Princípios de Teste Derivados da Filosofia

Com base nos 5 princípios filosóficos, derivamos **princípios de teste**:

### **1. Testes de Rastreabilidade (Radical Transparency)**
- ✅ Todo evento tem actor
- ✅ Todo relacionamento tem agreement
- ✅ Toda role tem origem
- ✅ Toda mudança tem causa

### **2. Testes de Imutabilidade (Temporal Integrity)**
- ✅ Eventos não podem ser modificados
- ✅ Eventos não podem ser deletados
- ✅ Hash chain não pode ser quebrada
- ✅ Sequência não pode ser alterada

### **3. Testes de Relacionamentos (Relational Ontology)**
- ✅ Propriedades vêm de relacionamentos
- ✅ Roles vêm de agreements
- ✅ Permissões vêm de roles
- ✅ Nada existe isoladamente

### **4. Testes de Agreements (Contractualism)**
- ✅ Tudo via agreement
- ✅ Não há relacionamentos sem agreement
- ✅ Não há mudanças sem agreement
- ✅ Agreements são o único caminho

### **5. Testes de Responsabilidade (Accountability)**
- ✅ Toda ação tem actor
- ✅ Toda decisão tem responsável
- ✅ Toda role tem origem
- ✅ Rastreabilidade completa

### **6. Testes de Time-Travel (Arrow of Time)**
- ✅ Estado é derivado de eventos
- ✅ Qualquer ponto no tempo pode ser reconstruído
- ✅ Replay deve produzir mesmo estado
- ✅ Audit trail completo

---

## 📋 Checklist de Testes Filosóficos

Antes de considerar um teste como "completo", verificar:

### **Rastreabilidade:**
- [ ] Todo evento tem `actor`?
- [ ] Todo relacionamento tem `agreement`?
- [ ] Toda role tem `establishedBy`?
- [ ] Toda mudança tem `event`?

### **Imutabilidade:**
- [ ] Eventos não podem ser modificados?
- [ ] Eventos não podem ser deletados?
- [ ] Hash chain é verificada?
- [ ] Sequência é monotônica?

### **Relacionamentos:**
- [ ] Propriedades vêm de relacionamentos?
- [ ] Roles vêm de agreements?
- [ ] Permissões vêm de roles?
- [ ] Nada existe isoladamente?

### **Agreements:**
- [ ] Tudo via agreement?
- [ ] Não há relacionamentos sem agreement?
- [ ] Não há mudanças sem agreement?
- [ ] Agreements são o único caminho?

### **Responsabilidade:**
- [ ] Toda ação tem actor?
- [ ] Toda decisão tem responsável?
- [ ] Toda role tem origem?
- [ ] Rastreabilidade completa?

### **Time-Travel:**
- [ ] Estado é derivado de eventos?
- [ ] Qualquer ponto no tempo pode ser reconstruído?
- [ ] Replay produz mesmo estado?
- [ ] Audit trail completo?

---

## 🎓 Conclusão

A filosofia do UBL **não menciona testes explicitamente**, mas estabelece **princípios fundamentais** que **devem ser validados por testes**:

1. **Radical Transparency** → Testes de rastreabilidade
2. **Temporal Integrity** → Testes de imutabilidade
3. **Relational Ontology** → Testes de relacionamentos
4. **Contractualism** → Testes de agreements
5. **Accountability** → Testes de responsabilidade
6. **Arrow of Time** → Testes de time-travel

**Os testes não são apenas sobre funcionalidade—são sobre validar que o sistema mantém sua integridade filosófica.**

---

**Status:** ✅ **DOCUMENTO CRIADO**  
**Última atualização:** 2025-12-07

