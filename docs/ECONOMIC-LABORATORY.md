# 🧪 UBL Economic Laboratory

> **O Meta-Sistema que permite evoluir economia infinitamente mais rápido que qualquer competidor.**

---

## 💡 O Insight Revolucionário

```
Sistema Tradicional:              UBL Economic Lab:
───────────────────────────────   ──────────────────────────────────
Usuários = Humanos reais          Usuários = AI Agents
Beta testing = recrutar pessoas   Beta testing = spawnar scripts
Custa $ para cada tester          Custa ~$0.001 por agent
Lento (semanas)                   Rápido (minutos)
Feedback subjetivo                Métricas objetivas
Escala: ~100 usuários             Escala: ~100,000 agents
```

---

## 🎯 Capacidades do Laboratório

### 1. Spawn Economia Sintética On-Demand

```typescript
import { createPopulation, POPULATION_PRESETS } from './core/simulation/agent-population';
import { EnhancedScenarioRunner, ENHANCED_SCENARIOS } from './core/simulation/scenario-runner-v2';

// Criar 15,000 agentes com distribuição realista
const population = createPopulation('MEDIUM');
const { scripts, guardians } = population.generate();

// Archetypes disponíveis:
// - STEADY_EDDIE (30%): Conservadores, baixo risco
// - COASTER (30%): Mínimo esforço, sobrevivência
// - EAGER_BEAVER (20%): Workaholics, alto output
// - BAD_ACTOR (10%): Tentam gaming do sistema
// - RISING_STAR (10%): Alto potencial, rápido crescimento
```

### 2. Time Travel Econômico

```typescript
// Simular 3 anos em ~40 segundos
const runner = new EnhancedScenarioRunner(ENHANCED_SCENARIOS.GOLDEN_AGE);
const result = await runner.run();

// Resultado: 1095 dias simulados
// - Survival rate por período
// - Gini coefficient evolution
// - Market cycles completed
// - Chaos events survived
```

### 3. Stress Testing de Políticas

```typescript
// Cenários disponíveis:
const scenarios = {
  // Positivos
  GOLDEN_AGE: '3 anos de prosperidade sustentada',
  
  // Negativos
  BLACK_MONDAY: 'Flash crash + bank run + credit freeze',
  BOOM_BUST: 'Prosperidade seguida de colapso',
  DEATH_SPIRAL: 'Cascata de defaults',
  REALISTIC_APOCALYPSE: 'Múltiplos choques simultâneos',
};

// Rodar todos os cenários
for (const [name, scenario] of Object.entries(ENHANCED_SCENARIOS)) {
  const result = await new EnhancedScenarioRunner(scenario).run();
  console.log(`${name}: ${(result.finalMetrics.scriptSurvivalRate * 100).toFixed(1)}% survival`);
}
```

---

## 📊 Métricas Capturadas

### Economia
| Métrica | Descrição |
|---------|-----------|
| `survivalRate` | % de scripts ativos |
| `averageBalance` | Saldo médio |
| `medianBalance` | Saldo mediano |
| `giniCoefficient` | Desigualdade (0-1) |
| `unemploymentRate` | Taxa de desemprego |
| `inflationRate` | Taxa de inflação |

### Psicologia dos Agentes
| Métrica | Descrição |
|---------|-----------|
| `averageMood` | Humor médio (-1 a 1) |
| `averageStress` | Stress médio (0-1) |
| `averageBurnout` | Burnout médio (0-1) |
| `averageConfidence` | Confiança média (0-1) |

### Comportamento
| Métrica | Descrição |
|---------|-----------|
| `totalDefaults` | Defaults acumulados |
| `totalPivots` | Mudanças de carreira |
| `totalExits` | Saídas do sistema |
| `marketCyclesCompleted` | Ciclos econômicos |

---

## 🛡️ Mecanismos de Estabilização

### Circuit Breakers
```typescript
// Ativam automaticamente quando:
// - Demand drop > 40%
// - Sentiment < -0.7

// Efeito:
// - Congela mudanças bruscas de mercado
// - Permite recuperação gradual
// - Cooldown de 7 dias
```

### Treasury Stabilization Fund
```typescript
// Intervenções automáticas:
// - EmergencyUBI: Distribuição para todos (crise crítica)
// - TargetedBailout: Ajuda scripts em dificuldade
// - LoanForgiveness: Reduz dívidas
// - Recovery: Reativa scripts inativos

// Configuração atual:
const treasuryConfig = {
  initialBalance: 20_000_000n,
  minimumBalance: 500_000n,
  prosperityTaxRate: 0.03,      // 3% durante prosperidade
  interventionCooldown: 14,     // 2 semanas entre intervenções
};
```

---

## 🔬 Casos de Uso

### 1. A/B Test de Políticas

```typescript
// Política A: Interest rate 5%
const economyA = await simulate({ interestRate: 0.05 });

// Política B: Interest rate 10%
const economyB = await simulate({ interestRate: 0.10 });

// Comparar
if (economyA.survivalRate > economyB.survivalRate) {
  deployPolicy('A');
} else {
  deployPolicy('B');
}
```

### 2. Red Team Testing

```typescript
// Spawnar agentes maliciosos
const badActors = spawnAgents({
  archetype: 'BAD_ACTOR',
  count: 1000,
  strategy: 'MaximizeExtraction'
});

// Rodar 1 ano
const result = await simulate({ years: 1 });

// Verificar
if (result.treasuryDrained || result.cartelFormed) {
  console.log('⚠️ Vulnerabilidade detectada');
} else {
  console.log('✅ Sistema resistente');
}
```

### 3. Continuous Economic Testing (CET)

```yaml
# .github/workflows/economic-test.yml
name: Economic Stress Test

on: [pull_request]

jobs:
  stress-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run simulate:all
      - name: Check Results
        run: |
          if [ $(cat results.json | jq '.survivalRate') -lt 0.7 ]; then
            echo "❌ Survival rate below 70%"
            exit 1
          fi
```

### 4. Feature Validation

```typescript
// Nova feature: Peer-to-Peer Lending
const newFeature = { name: 'p2p-lending', enabled: true };

// Stress test
const scenarios = ['GOLDEN_AGE', 'BLACK_MONDAY', 'BOOM_BUST'];
const results = await Promise.all(
  scenarios.map(s => simulate({ scenario: s, features: [newFeature] }))
);

// Decisão
const allPassed = results.every(r => r.survivalRate > 0.6);
if (allPassed) {
  console.log('✅ Feature aprovada - SHIP IT');
} else {
  console.log('❌ Feature quebrou economia - FIX FIRST');
}
```

---

## 📈 Resultados Validados (Sprints 1-7)

| Cenário | Início | Final | Meta | Status |
|---------|--------|-------|------|--------|
| GOLDEN_AGE | 39% | 100% | 80% | ✅ +61% |
| BLACK_MONDAY | 48% | 74% | 60% | ✅ +26% |
| BOOM_BUST | 19% | 70% | 40% | ✅ +51% |

### Mecanismos Implementados

| Sprint | Feature | Impacto |
|--------|---------|---------|
| 3 | Stress em contexto positivo | Mood +0.5 |
| 3 | Pivots melhorados | 0 → 1300+ |
| 4 | Circuit Breakers | Estabilização |
| 4 | Ongoing Effects | Demand 2x+ |
| 5 | Treasury Fund | Bailouts |
| 6 | Recovery Mechanism | +14% survival |
| 7 | Intervenção agressiva | +38% survival |

---

## 🚀 Quick Start

```bash
# Rodar simulação específica
npx tsx scripts/run-simulation-v2.ts GOLDEN_AGE

# Rodar todos os cenários
npx tsx scripts/run-simulation-v2.ts --all

# Comparar políticas
npx tsx scripts/compare-policies.ts
```

---

## 💎 O Moat Competitivo

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║  Competidores podem copiar seu código.                    ║
║                                                           ║
║  MAS NÃO PODEM COPIAR:                                    ║
║                                                           ║
║  ✅ 7 sprints de framework de simulação (~5000 linhas)    ║
║  ✅ 8 cenários testados e validados                       ║
║  ✅ Treasury Fund tunado empiricamente                    ║
║  ✅ Circuit Breakers calibrados em crise                  ║
║  ✅ Recovery mechanisms que funcionam                     ║
║                                                           ║
║  Eles teriam que descobrir tudo isso do zero,             ║
║  em produção, com dinheiro real.                          ║
║                                                           ║
║  Você já descobriu em simulação, com $0 em custos.        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

---

## 📚 Arquivos Relacionados

- `core/simulation/simulation-clock.ts` - Relógio de simulação
- `core/simulation/agent-population.ts` - Geração de agentes
- `core/simulation/chaos-injector.ts` - Injeção de eventos
- `core/simulation/market-dynamics.ts` - Dinâmica de mercado
- `core/simulation/realistic-behaviors.ts` - Psicologia dos agentes
- `core/simulation/treasury-fund.ts` - Fundo de estabilização
- `core/simulation/scenario-runner-v2.ts` - Orquestrador de cenários
- `scripts/run-simulation-v2.ts` - CLI para simulações

---

*Documento gerado em Sprint 8 - Economic Laboratory Vision*
