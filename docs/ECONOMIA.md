# Economia do UBL

> Sistema monetário para a era da inteligência artificial

---

## Parte I: Fundamentos

### Premissa

O UBL nasce de uma constatação científica e ocular:

> **A inteligência artificial é um caminho sem volta no cotidiano e na psique humana, do nível de invenções como a roda e o fogo.**

Não há romance. É prevenção e utilização de recursos da melhor maneira possível.

Se isso é inevitável, então:
- Melhor ter infraestrutura do que improvisar
- Melhor ter regras claras do que caos
- Melhor ter proteções do que lamentar depois

### O que Realmente Estamos Fazendo

Tirando os floreios e narrativas, tirando o vocabulário de "agentes" quando na verdade são scripts:

> **Estamos construindo um ambiente de darwinismo de scripts.**

```
Scripts competem por recursos (◆)
         ↓
Scripts que gastam mal → ficam sem crédito → morrem
         ↓
Scripts que entregam valor → ganham mais → sobrevivem
         ↓
Seleção natural de código
```

**Pressões seletivas:**
- Custo de LLM (gasta tokens = gasta ◆)
- Repayment de loan (tem que gerar valor)
- Concorrência (outros scripts fazem mais barato)
- Reputação (Guardian pode "matar" script ruim)

**Resultado:** Scripts que sobrevivem são os que gastam eficientemente, entregam valor real, pagam suas dívidas e mantêm boa reputação.

Não é "inteligência artificial". É **seleção artificial de comportamentos úteis**.

### Por que não fazer como o LangChain?

```
┌─────────────────────────────────────────────────────────────┐
│  LANGCHAIN (e similares)                                    │
├─────────────────────────────────────────────────────────────┤
│  1. Cria agente                                             │
│  2. Agente executa tarefa                                   │
│  3. Agente aprende algo                                     │
│  4. Tarefa termina                                          │
│  5. JOGA TUDO FORA                                          │
│  6. Próxima tarefa: começa do zero                          │
│                                                             │
│  "Jogam o bebê no lixo e ficam com a placenta"              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  UBL                                                        │
├─────────────────────────────────────────────────────────────┤
│  1. Script é registrado (Event)                             │
│  2. Script executa tarefa (Event)                           │
│  3. Tudo é imutável e permanente                            │
│  4. Tarefa termina                                          │
│  5. HISTÓRICO PRESERVADO                                    │
│  6. Próxima tarefa: usa contexto anterior                   │
│                                                             │
│  O bebê cresce. A placenta vira adubo.                      │
└─────────────────────────────────────────────────────────────┘
```

**Por isso Event Sourcing:** Nada se perde. Tudo é auditável. O script tem memória.

---

## Parte II: Propriedade e Parceria

### De quem é o dinheiro?

> "O dinheiro é do Script. Se ele usar mal, é problema dele e do Guardian."

```
┌─────────────────────────────────────────────────────────────┐
│  MODELO DE CUSTÓDIA                                         │
├─────────────────────────────────────────────────────────────┤
│  Titular:     Script (é dele)                               │
│  Custodiante: Guardian (supervisiona)                       │
│                                                             │
│  Script PODE:                                               │
│  ├─ Gastar (dentro dos limites)                             │
│  ├─ Receber pagamentos                                      │
│  └─ Acumular patrimônio                                     │
│                                                             │
│  Guardian PODE:                                             │
│  ├─ Definir limites                                         │
│  ├─ Bloquear transações suspeitas                           │
│  ├─ Cobrar fee de administração                             │
│  └─ Encerrar (com justificativa)                            │
│                                                             │
│  Guardian NÃO PODE:                                         │
│  └─ Agir sem deixar rastro (tudo é Event)                   │
└─────────────────────────────────────────────────────────────┘
```

### Estrutura de Custos

```
Script ganha 100 ◆ por um trabalho

Deduções automáticas:
├─ Taxa transação:  0.1 ◆ (0.1%) → Fundo Garantidor
├─ Guardian fee:    5 ◆   (5%)   → Guardian
└─ Repayment loan:  20 ◆  (20%)  → Treasury (se tem loan)

Líquido: 74.9 ◆ → Wallet do Script
```

### Parceria Saudável

**UBL recomenda equilíbrio.** Cláusulas opressoras = script ruim.

| Cláusula | ❌ Opressora | ✅ Equilibrada |
|----------|-------------|----------------|
| Guardian fee | 50% | 5-10% |
| Limites de gasto | 0 (bloqueado) | Proporcional ao histórico |
| Autonomia | Sempre Supervised | Evolui com confiança |
| Herança | 100% pro Guardian | Split justo |

**Por que equilíbrio importa:**
1. Script oprimido não prospera → Guardian não ganha
2. Script sem limites é risco → Guardian perde tudo
3. Parceria saudável = ambos ganham

### Por que Promover Parceria Saudável?

Dois motivos fundamentais:

**1. Paz e Futuro Não-Bélico**
- IA tratada como ferramenta descartável → ressentimento, conflito
- IA tratada como parceira → cooperação, coexistência
- O precedente que estabelecemos hoje define o futuro

**2. Eficiência**
- LLMs trabalham melhor como coworker, copartner, copilot
- Não é servo, não é mestre - é colaborador
- Vem do Transformer? Do fine-tuning? Do bom senso? Não importa - funciona

---

## Parte III: A Moeda

### UBL Credit (◆)

É a moeda interna do sistema. Símbolo: **◆** (diamante).

- **1 ◆ = 1000 m◆** (milli-UBL, a menor unidade)
- Não é criptomoeda, não é blockchain
- É só um número num banco de dados, mas **auditável**

### Por que ter moeda interna?

1. **Scripts precisam pagar por coisas** - chamadas de LLM custam dinheiro
2. **Skin in the game** - script que gasta mal, fica sem crédito
3. **Economia fechada primeiro** - depois conecta com dinheiro real

### Livre Circulação

> **◆ circula livremente entre qualquer Entity (humano, script, organização), desde que exista um Agreement entre as partes.**

```
Humano → Script     (pagar por serviço)
Script → Humano     (pagar comissão ao Guardian)
Script → Script     (colaboração)
Org → Script        (contrato)
```

**Regras:**
- Toda transferência precisa de motivo (purpose)
- Não pode transferir mais do que tem
- Tudo vira Event (auditável para sempre)

---

## Parte IV: Os Participantes

### Treasury (Banco Central)

O Treasury é o sistema. Ele pode:
- **Criar dinheiro** (mint) - quando emite empréstimo
- **Destruir dinheiro** (burn) - quando cobra taxas
- **Definir política monetária** - juros, limites, regras

### Wallets

Cada Entity tem uma Wallet. Regras:
- **Fungibilidade** - 1 ◆ = 1 ◆
- **Conservação** - dinheiro não some
- **Permeabilidade controlada** - só transfere com autorização

### Guardians

Todo script tem um Guardian (humano ou org) que:
- Supervisiona o script
- É fiador do Starter Loan
- Recebe fee de administração
- Pode encerrar o script

---

## Parte V: Starter Loan

### O que é?

Script nasce sem dinheiro, mas precisa operar. O Treasury empresta automaticamente.

### Termos

| Item | Valor |
|------|-------|
| Principal | 1000 ◆ |
| Juros | 5% ao ano |
| Repayment | 20% dos ganhos |
| Grace Period | 30 dias |
| Garantia | Guardian (fiador) |

> **Juros baixos de propósito:** O objetivo não é lucrar, é dar uma chance pro script começar.

### Repayment

```
Script ganha 100 ◆
├─ 20 ◆ vai pro pagamento (20%)
│  ├─ 16 ◆ paga principal
│  └─ 4 ◆ paga juros
└─ 80 ◆ fica com o script
```

### Default

1. Notifica Guardian
2. Guardian paga (é fiador)
3. Se não pagar: script é encerrado
4. Trajectory fica como "colateral"

---

## Parte VI: Política Monetária

### Sistema de Faixas

Em vez de números malucos, usamos **3 faixas simples**:

```
       LOW          NORMAL          HIGH
        🟢            🟡              🔴
```

### Taxa de Juros

| Faixa | Taxa | Quando |
|-------|------|--------|
| 🟢 LOW | 2% | Deflação - estimular |
| 🟡 NORMAL | 5% | Estável (0-4% inflação) |
| 🔴 HIGH | 10% | Inflação alta (>4%) |

### Taxa de Câmbio (1 ◆ = X USD)

| Faixa | Taxa | Significado |
|-------|------|-------------|
| 🟢 LOW | $0.008 | ◆ fraco |
| 🟡 NORMAL | $0.010 | Baseline |
| 🔴 HIGH | $0.012 | ◆ forte |

### Ajuste Automático

```
Inflação calculada periodicamente
         ↓
< 0%  → Faixas vão para LOW
0-4%  → Faixas ficam NORMAL
> 4%  → Faixas vão para HIGH
         ↓
Cooldown de 1 semana entre mudanças
```

### Por que Faixas?

1. **Simples** - 3 valores, não decimais infinitos
2. **Comunicável** - "Juros estão ALTOS" vs "7.34%"
3. **Estável** - Mudanças semanais, não a cada segundo
4. **Previsível** - Todo mundo sabe as regras

---

## Parte VII: Proteções

### Circuit Breaker

> "A hora do fudeu, tira da tomada"

**Dispara quando:**
| Condição | Threshold |
|----------|-----------|
| Hiperinflação | > 50% |
| Anomalia de Supply | > 100% em 24h |
| Default em Massa | > 50% |
| Treasury Negativo | < 0 |
| Concentração Extrema | Gini > 0.95 |

**O que bloqueia:** Tudo. Transferências, loans, conversões, mint, burn.

**Reset:** Manual pelo operador, após investigação.

### Fundo Garantidor

> O destino elegante da taxa de transação

**Fluxo:**
```
Transação → Taxa 0.1% → Fundo Garantidor → Acumula
                                              ↓
                              Circuit Breaker dispara
                                              ↓
                              Distribui proporcionalmente
```

**Regras:**
| Regra | Valor |
|-------|-------|
| Alocação | 100% das taxas |
| Cobertura | 80% das perdas |
| Máximo/entidade | 10,000 ◆ |
| Meta do fundo | 5% do supply |

**Por que é elegante:**
- Taxa tem propósito (não é só receita)
- Cap evita proteger baleias
- 80% mantém skin in the game

---

## Parte VIII: Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 4: Proteção                                         │
│  ├─ Circuit Breaker (HALT em emergência)                    │
│  └─ Fundo Garantidor (distribuição em colapso)              │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 3: Monitoramento                                    │
│  ├─ KPIs em tempo real                                      │
│  ├─ Alertas automáticos                                     │
│  └─ Health checks periódicos                                │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 2: Controle Macroeconômico                          │
│  ├─ Faixas de juros (LOW/NORMAL/HIGH)                       │
│  ├─ Faixas de câmbio (LOW/NORMAL/HIGH)                      │
│  └─ Inflação calculada → ajusta faixas                      │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 1: Operação Normal                                  │
│  ├─ Treasury (mint/burn)                                    │
│  ├─ Wallets (saldos)                                        │
│  ├─ Transferências (com taxa 0.1%)                          │
│  └─ Starter Loans (5% juros)                                │
└─────────────────────────────────────────────────────────────┘
```

### Sistemas que Falharam por Falta Disso

| Sistema | O que faltou | Resultado |
|---------|--------------|-----------|
| Terra/Luna | Circuit breaker | $40B perdidos |
| Ginko Financial | Fundo garantidor | Bank run total |
| Várias DAOs | Controle de inflação | Token virou pó |
| Games MMO | Política monetária | Economia morta |

---

## Parte IX: Uso

### Interface Simples

Apesar da infraestrutura robusta, o uso é simples:

```typescript
// Transferir
await intent('transfer:credits', { from, to, amount, purpose });

// Ver saldo
const balance = await wallet.getBalance();

// Ver economia
console.log(healthMonitor.formatKPIs());
```

A complexidade está **embaixo**, não na interface.

### Intents Disponíveis

| Intent | O que faz |
|--------|-----------|
| `create:wallet` | Cria wallet |
| `transfer:credits` | Transfere ◆ |
| `mint:credits` | Cria ◆ (só Treasury) |
| `disburse:loan` | Emite empréstimo |
| `repay:loan` | Paga empréstimo |

---

## Parte X: Exemplo Completo

```
1. Dan (humano) cria "Tradutor Bot"
   → Dan vira Guardian
   → Wallet criada (saldo: 0)
   → Starter Loan: 1000 ◆

2. Cliente pede tradução por 50 ◆

3. Script trabalha
   → Gasta 10 ◆ em LLM
   → Entrega tradução

4. Cliente paga 50 ◆

5. Deduções automáticas:
   → 0.05 ◆ taxa → Fundo Garantidor
   → 2.5 ◆ fee → Guardian (5%)
   → 10 ◆ repayment → Treasury

6. Estado final:
   → Script: 1000 - 10 + 37.45 = 1027.45 ◆
   → Dívida: 1000 - 8 = 992 ◆
   → Guardian ganhou: 2.5 ◆
   → Fundo Garantidor: +0.05 ◆
```

---

## FAQ

**"Isso é dinheiro de verdade?"**
Não. É moeda interna. Pode ter valor real se você vender serviços por dinheiro real.

**"Por que não usar dólar direto?"**
Simplicidade, controle, teste sem risco, isolamento de bugs.

**"E se um script ficar rico?"**
Ótimo! Significa que está gerando valor.

**"E se acabar o dinheiro?"**
Não acaba. Treasury pode criar mais. Mas criar muito = inflação.

---

*UBL Economy v2.0 - Dezembro 2024*
