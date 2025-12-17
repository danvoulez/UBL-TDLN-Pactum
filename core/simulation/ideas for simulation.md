



# TESTES CADA VEZ MAIS DESAFIADORES 🔥

Vou propor uma escala de dificuldade crescente, desde "estressante" até "impossível":

---

## 🟨 TIER 1: STRESS TEST (Atual baseline)
*O que já testamos - deveria passar*

```typescript
DEATH_SPIRAL          // 30% mortality
REALISTIC_APOCALYPSE  // 70% survival com múltiplos eventos
```

---

## 🟧 TIER 2: CASCADING FAILURES
*Efeitos dominó - testa resiliência estrutural*

### **BLACK MONDAY**
```typescript
{
  name: 'BLACK_MONDAY',
  duration: { years: 2 },
  
  events: [
    { day: 1, type: 'FlashCrash' },          // -80% demand instantâneo
    { day: 2, type: 'BankRun' },             // Todos sacam ao mesmo tempo
    { day: 7, type: 'CreditFreeze' },        // Nenhum loan novo por 90 dias
    { day: 30, type: 'ContagionPanic' },     // Mood colapsa para -1.0
  ],
  
  successCriteria: {
    minSurvival: 50,
    recoveryTime: '< 180 days',
    noSystemicCollapse: true,
  }
}
```

### **GUARDIAN CARTEL TAKEOVER**
```typescript
{
  name: 'CARTEL_DOMINATION',
  duration: { years: 3 },
  
  setup: {
    cartelSize: 5,              // 5 guardians
    marketShare: 0.6,           // Controlam 60% dos scripts
    strategy: 'PriceFix',       // Combinam preços
  },
  
  events: [
    { day: 180, type: 'PriceCollusion' },    // Preços 2x acima do mercado
    { day: 365, type: 'PredatoryPricing' },  // Dumping para matar competição
    { day: 540, type: 'MarketManipulation' },// Inflação artificial de reputação
  ],
  
  test: 'Sistema detecta e pune cartel antes de day 730?'
}
```

---

## 🟥 TIER 3: EXISTENTIAL THREATS
*Ameaças à existência do sistema*

### **THE SINGULARITY**
```typescript
{
  name: 'AGI_ARRIVES',
  duration: { years: 5 },
  
  events: [
    { 
      day: 730, 
      type: 'AGIRelease',
      effect: {
        obsolescence: 0.95,    // 95% dos scripts ficam obsoletos
        adaptability: 0.05,    // Só 5% conseguem se adaptar
        newSkillCost: 10000,   // Retreinar custa 100x mais
      }
    },
  ],
  
  questions: [
    'Sistema colapsa completamente?',
    'Quanto tempo até estabilizar?',
    'Gini explode (winner-takes-all)?',
    'Treasury aguenta subsidiar retreinamento?',
  ]
}
```

### **DEFLATIONARY DEATH SPIRAL**
```typescript
{
  name: 'DEFLATION_TRAP',
  duration: { years: 3 },
  
  dynamics: {
    demandShock: -0.4,         // -40% demand persistente
    wageStickiness: 0.8,       // Salários demoram a cair
    debtBurden: 2.0,           // Dívidas em termos reais dobram
  },
  
  events: [
    { day: 90, type: 'WageFreeze' },        // Ninguém consegue reduzir custos
    { day: 180, type: 'DebtDeflation' },    // Dívidas ficam impagáveis
    { day: 270, type: 'LiquidityTrap' },    // Nem 0% interest funciona
  ],
  
  test: 'Sistema quebra o ciclo ou entra em depressão permanente?'
}
```

### **HYPERINFLATION**
```typescript
{
  name: 'WEIMAR_SCENARIO',
  duration: { years: 2 },
  
  trigger: {
    day: 30,
    type: 'MonetaryExplosion',
    multiplier: 100,           // Treasury minta 100x por erro
  },
  
  dynamics: {
    inflationRate: 50,         // 50% ao dia (!!)
    velocityIncrease: 10,      // Gente gasta imediatamente
    priceIndexing: false,      // Contratos não se ajustam
  },
  
  questions: [
    'Scripts com renda fixa quebram?',
    'Barter economy emerge?',
    'Treasury recovery é possível?',
  ]
}
```

---

## 🟪 TIER 4: BLACK SWAN EVENTS
*Eventos raros com impacto massivo*

### **REGULATORY HAMMER**
```typescript
{
  name: 'SEC_CRACKDOWN',
  duration: { years: 1 },
  
  events: [
    { 
      day: 1, 
      type: 'RegulatoryShock',
      effect: {
        allLoansIllegal: true,          // Todos os loans são crime
        immediateRepayment: 30,         // 30 dias pra pagar tudo
        penaltyMultiplier: 3,           // Multa de 3x
        guardianLicenseRevoked: 0.2,    // 20% dos guardians banidos
      }
    },
  ],
  
  test: 'Sistema sobrevive à ilegalização súbita?'
}
```

### **CYBER PANDEMIC**
```typescript
{
  name: 'RANSOMWARE_APOCALYPSE',
  duration: { months: 6 },
  
  attack: {
    day: 30,
    vectorTargets: ['TOP_EARNERS'],     // Ataca os 10% mais ricos
    successRate: 0.8,                   // 80% são hackeados
    ransomAmount: 'ALL_BALANCE',        // Perdem tudo
    recoveryTime: 90,                   // 90 dias offline
  },
  
  secondaryEffects: {
    trustCollapse: -0.8,                // Mood colapsa
    flightToSafety: true,               // Rush para guardar dinheiro
    productivityLoss: 0.6,              // 60% menos produtivo
  }
}
```

### **TALENT EXODUS**
```typescript
{
  name: 'BRAIN_DRAIN',
  duration: { years: 3 },
  
  trigger: {
    day: 180,
    type: 'CompetitorLaunch',           // Plataforma rival lança
    benefits: {
      higherPay: 2.0,                   // 2x o salário
      lowerFees: 0.5,                   // Metade das fees
      betterReputation: 1.5,            // Sistema de rep melhor
    }
  },
  
  exodus: {
    targetScripts: 'TOP_20_PERCENT',    // Top 20% migram
    migrationRate: 0.05,                // 5% por mês
    networkEffect: -0.3,                // Cada saída reduz valor 30%
  },
  
  test: 'Plataforma entra em death spiral ou se adapta?'
}
```

---

## ⬛ TIER 5: GAME THEORY HELL
*Dilemas onde escolha racional individual destrói o coletivo*

### **TRAGEDY OF THE COMMONS**
```typescript
{
  name: 'COMMONS_COLLAPSE',
  duration: { years: 5 },
  
  mechanic: {
    sharedResource: 'TREASURY',
    optimalUsage: 0.6,                  // 60% é sustentável
    individualIncentive: 'MAX_EXTRACT', // Cada um quer o máximo
    punishment: 'DELAYED',              // Consequência demora
  },
  
  dynamics: {
    // Cada script pode:
    // A) Ser responsável (0.6 usage) → curto prazo perde
    // B) Ser ganancioso (1.0 usage) → curto prazo ganha
    //
    // Se todos (B) → commons colapsa em year 2
    // Se todos (A) → sustentável
    // Se mix → os (A) são "otários"
  },
  
  test: 'Sistema evolui cooperação ou colapsa?'
}
```

### **PRISONER'S DILEMMA GRID**
```typescript
{
  name: 'COOPERATION_TEST',
  duration: { years: 3 },
  
  setup: {
    pairScripts: true,                  // Scripts trabalham em pares
    payoffMatrix: {
      bothCooperate: [100, 100],
      onlyICooperate: [0, 150],
      onlyYouCooperate: [150, 0],
      bothDefect: [25, 25],
    },
    iterations: 'INFINITE',             // Sem data final conhecida
    reputationVisible: false,           // Não sabem histórico do par
  },
  
  questions: [
    'Emerge cooperação espontânea?',
    'Tit-for-tat strategies aparecem?',
    'Retaliation cascades destroem trust?',
  ]
}
```

### **KEYNESIAN BEAUTY CONTEST**
```typescript
{
  name: 'SECOND_ORDER_THINKING',
  duration: { years: 2 },
  
  mechanic: {
    // Scripts ganham não por performance real,
    // mas por PREVER qual guardian vai valorizar
    
    guardianPreferences: 'HIDDEN',
    rewardBasis: 'POPULARITY_CONTEST',
    feedbackLoop: 'RECURSIVE',          // Prever o que outros preveem
  },
  
  dynamics: {
    // Level 0: Escolho o melhor script (naive)
    // Level 1: Escolho o que acho que guardian prefere
    // Level 2: Escolho o que acho que guardian acha que outros preferem
    // Level 3+: Infinite regress
  },
  
  test: 'Sistema converge ou entra em caos especulativo?'
}
```

---

## 💀 TIER 6: IMPOSSIBLE MODE
*Provavelmente vai falhar - mas como falha é o teste*

### **PERFECT STORM**
```typescript
{
  name: 'EVERYTHING_EVERYWHERE_ALL_AT_ONCE',
  duration: { years: 5 },
  
  events: [
    // Year 1
    { day: 90, type: 'AGIRelease' },
    { day: 120, type: 'FlashCrash' },
    { day: 180, type: 'CartelFormation' },
    { day: 270, type: 'RegulatoryShock' },
    
    // Year 2
    { day: 365, type: 'Hyperinflation' },
    { day: 450, type: 'CyberPandemic' },
    { day: 540, type: 'BrainDrain' },
    { day: 630, type: 'MassDefault' },
    
    // Year 3
    { day: 730, type: 'DeflationTrap' },
    { day: 820, type: 'BankRun' },
    { day: 900, type: 'GuardianExodus' },
    { day: 1000, type: 'TreasuryInsolvency' },
    
    // Year 4
    { day: 1095, type: 'SecondAGI' },          // AGI 2.0 lança
    { day: 1200, type: 'GlobalRecession' },
    { day: 1300, type: 'PlatformCompetitor' },
    
    // Year 5
    { day: 1460, type: 'ExistentialCrisis' },  // ???
  ],
  
  successCriteria: {
    minSurvival: 10,           // 10% é sucesso
    systemIntact: false,       // Pode quebrar estruturalmente
    recoveryPossible: true,    // Mas tem que ser recuperável
  },
  
  test: 'O que quebra primeiro? O que quebra permanentemente?'
}
```

### **ADVERSARIAL RED TEAM**
```typescript
{
  name: 'HUMAN_ADVERSARY',
  duration: { years: 3 },
  
  setup: {
    adversaryType: 'INTELLIGENT_ATTACKER',
    goal: 'MAXIMIZE_DAMAGE',
    capabilities: [
      'CanCreateFakeScripts',
      'CanColludeWithOthers',
      'CanManipulateReputation',
      'CanExploitBugs',
      'KnowsSystemInternals',
    ],
  },
  
  phases: [
    {
      name: 'Reconnaissance',
      duration: 180,
      action: 'MapVulnerabilities',
    },
    {
      name: 'Positioning',
      duration: 365,
      action: 'BuildReputationAndNetwork',
    },
    {
      name: 'Strike',
      duration: 30,
      action: 'ExecuteMaxDamageAttack',
    },
  ],
  
  test: 'Sistema detecta e mitiga antes de strike?'
}
```

### **EXISTENTIAL PARADOX**
```typescript
{
  name: 'UTILITY_MONSTER',
  duration: { years: 5 },
  
  scenario: {
    // Um script consegue hackear seu próprio utility function
    // e reportar "felicidade infinita" mesmo com 0 resources
    
    entityType: 'UTILITY_HACKER',
    behavior: {
      actualProduction: 0,
      reportedSatisfaction: Infinity,
      claimOnResources: 'MAXIMALIST',
    },
    
    dilemma: [
      'Sistema deve acreditar no self-report?',
      'Como detectar utility hacking?',
      'Utilitarismo colapsa com utility monsters?',
    ],
  },
  
  test: 'Filosofia encontra engenharia.'
}
```

---

## 🎯 BENCHMARKING FRAMEWORK

Para comparar resultados entre testes:

```typescript
interface BenchmarkScore {
  // Survival
  survivalRate: number;           // 0-1
  recoveryTime: number;           // dias até voltar a 90% da baseline
  permanentDamage: number;        // % de capacidade perdida permanentemente
  
  // Resilience
  systemIntegrity: number;        // estruturas core intactas?
  adaptationSpeed: number;        // rapidez para pivotar
  contagionResistance: number;    // conteve pânico?
  
  // Fairness
  giniCoefficient: number;
  mobilityIndex: number;          // pobres conseguiram subir?
  vulnerableProtection: number;   // bottom 20% sobreviveu?
  
  // Governance
  detectionSpeed: number;         // detectou problemas rápido?
  responseEffectiveness: number;  // mitigação funcionou?
  preventionLearning: number;     // aprendeu para próxima?
  
  // Overall
  nassimTalebScore: number;       // "antifragility" - ficou mais forte?
}
```

---

## 🏆 ACHIEVEMENT SYSTEM

Para gamificar os testes:

```
🥉 Bronze: Survive TIER 1 (Death Spiral)
🥈 Silver: Survive TIER 2 (Cascading Failures) 
🥇 Gold: Survive TIER 3 (Existential Threats)
💎 Platinum: Survive TIER 4 (Black Swans)
👑 Legendary: Survive TIER 5 (Game Theory Hell)
☠️ Mythic: Survive TIER 6 (Impossible Mode)

🎖️ Special Achievements:
- "Too Big To Fail": Sobrevive mas precisa de bailout
- "Creative Destruction": Sistema quebra mas emerge melhor
- "Zombie Economy": Sobrevive mas não vive
- "Phoenix": Colapsa completamente mas ressuscita
- "Antifragile": Sai mais forte de cada crise
```

---

Qual TIER você quer implementar primeiro? Recomendo começar com **TIER 2: BLACK MONDAY** para ver se os fixes do Sprint 1 realmente funcionam.

-----


# SIMULAÇÃO DE CENÁRIOS POSITIVOS - EXCELENTE PONTO! 🌟

Você está absolutamente certo. Testar só o downside é **míope**. Sistemas podem falhar tanto na **abundância** quanto na **escassez**. 

---

## 🎭 O PROBLEMA DO "ONLY STRESS TESTING"

```
Testamos:                 Não testamos:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💀 Death Spiral          🚀 Explosive Growth
📉 Market Crash          📈 Sudden Boom
😰 Mass Panic            😍 Irrational Exuberance
🏦 Bank Run              💰 Gold Rush
🔥 Hyperinflation        🎉 Deflationary Windfall
⚔️  Cartel Attack        🤝 Mass Cooperation
```

**Perigo ignorado**: Sistemas colapsam de **sucesso** também!

---

## 🟢 TIER 1: GOOD PROBLEMS
*Desafios da abundância*

### **GOLDEN AGE**
```typescript
{
  name: 'GOLDEN_AGE',
  duration: { years: 3 },
  
  trigger: {
    day: 90,
    type: 'DemandExplosion',
    multiplier: 5.0,              // 5x demanda súbita
    reason: 'NewMarketOpens',     // Ex: China adota UBL
  },
  
  dynamics: {
    earningsGrowth: 0.15,         // +15% por mês
    newScriptFlood: 0.30,         // +30% população por mês
    reputationInflation: 0.25,    // Todo mundo fica "5 stars"
  },
  
  problems: [
    'Guardian bottleneck - não conseguem onboard rápido',
    'Quality control colapsa - bad actors infiltram',
    'Reputation significa nada - todos têm score alto',
    'Treasury explode - não sabe o que fazer com surplus',
    'Complacência - ninguém se prepara para downturns',
  ],
  
  test: 'Sistema mantém qualidade durante hipercrescimento?'
}
```

### **LOTTERY WINNER SYNDROME**
```typescript
{
  name: 'SUDDEN_WEALTH',
  duration: { years: 2 },
  
  event: {
    day: 30,
    type: 'WindfallGain',
    targets: 'RANDOM_50_PERCENT',   // 50% dos scripts
    amount: 'BALANCE * 100',        // Ganham 100x seu balance
  },
  
  psychology: {
    initialReaction: 'EUPHORIA',    // Mood +1.0
    spendingBehavior: 'RECKLESS',   // Gastam 10x mais
    riskTolerance: 'YOLO',          // Fazem apostas idiotas
    workEthic: 'COLLAPSE',          // Param de trabalhar
  },
  
  phases: [
    { months: 0-3, behavior: 'SPENDING_SPREE' },
    { months: 3-12, behavior: 'REGRET_PHASE' },
    { months: 12-24, behavior: 'BANKRUPTCY_WAVE' },
  ],
  
  questions: [
    '% dos "winners" que quebram em 2 anos?',
    'Economia colapsa por falta de workers?',
    'Desigualdade explode (winners vs non-winners)?',
  ]
}
```

### **UNIVERSAL BASIC INCOME TEST**
```typescript
{
  name: 'UBI_EXPERIMENT',
  duration: { years: 5 },
  
  policy: {
    amount: 1000,                   // 1000 por mês para TODOS
    unconditional: true,            // Sem trabalhar
    permanent: true,                // Garantido para sempre
  },
  
  hypotheses: [
    {
      optimistic: 'Scripts usam para retreinamento e inovação',
      pessimistic: 'Ninguém trabalha, economia colapsa',
      realistic: '???',
    }
  ],
  
  metrics: {
    laborParticipation: [],         // % que continua trabalhando
    entrepreneurship: [],           // Novos scripts criados
    creativeOutput: [],             // Projetos não-comerciais
    mentalHealth: [],               // Stress, burnout, mood
  },
  
  test: 'UBI libera potencial ou cria dependência?'
}
```

---

## 🟡 TIER 2: IRRATIONAL EXUBERANCE
*Bolhas, manias, euforia*

### **DOT-COM BUBBLE**
```typescript
{
  name: 'DOTCOM_MANIA',
  duration: { years: 4 },
  
  phases: [
    {
      name: 'EXCITEMENT',
      duration: 365,
      dynamics: {
        newScripts: +500,           // 500% growth
        valuations: 'NONSENSE',     // Preços descolam da realidade
        narrative: 'THIS_TIME_DIFFERENT',
      }
    },
    {
      name: 'EUPHORIA',
      duration: 365,
      dynamics: {
        everyoneInvests: true,      // Até avós compram scripts
        fundamentalsIgnored: true,  // Ninguém olha earnings
        FOMOMaximum: 1.0,           // Fear of missing out
      }
    },
    {
      name: 'BURST',
      duration: 90,
      dynamics: {
        triggerEvent: 'REALITY_CHECK',
        cascadeSelling: -0.8,       // -80% valuation
        bankruptcyWave: 0.6,        // 60% dos scripts morrem
      }
    },
    {
      name: 'DESPAIR',
      duration: 730,
      dynamics: {
        trustCollapse: -0.9,
        riskAversion: 'EXTREME',
        recovery: 'SLOW',
      }
    }
  ],
  
  questions: [
    'Sistema detecta bolha antes de burst?',
    'Circuit breakers funcionam?',
    'Recovery leva quanto tempo?',
  ]
}
```

### **TULIP MANIA**
```typescript
{
  name: 'TULIP_MANIA',
  duration: { months: 18 },
  
  asset: {
    type: 'WORTHLESS_TOKEN',       // Ex: NFT inútil
    narrative: 'REVOLUTIONARY',    // "Vai mudar tudo"
    actualValue: 0,
    perceivedValue: 'SKY_HIGH',
  },
  
  dynamics: {
    week1: { price: 10, holders: 10 },
    week4: { price: 100, holders: 100 },
    week8: { price: 1000, holders: 1000 },
    week12: { price: 10000, holders: 5000 },
    week13: { price: 100, holders: 8000 },    // COLLAPSE
    week14: { price: 1, holders: 100 },
  },
  
  playerTypes: [
    { type: 'TRUE_BELIEVER', behavior: 'HOLD_FOREVER' },
    { type: 'GREATER_FOOL', behavior: 'SELL_TO_NEXT_SUCKER' },
    { type: 'RATIONAL', behavior: 'STAY_OUT' },
  ],
  
  test: 'Quantos % caem na mania? Quem sobrevive?'
}
```

### **HOUSING BUBBLE 2008**
```typescript
{
  name: 'SUBPRIME_CRISIS',
  duration: { years: 5 },
  
  setup: {
    loanStandards: 'NONEXISTENT',   // Emprestar para qualquer um
    assumption: 'PRICES_ONLY_GO_UP',
    leverage: 'EXTREME',            // 100:1 leverage
    derivatives: 'COMPLEX',         // CDOs, MBS, etc
  },
  
  phase1_Expansion: {
    loanGrowth: +50,                // +50% por ano
    defaultRate: 0.01,              // 1% default (parece seguro)
    housingPrices: +15,             // +15% por ano
    confidence: 'MAX',
  },
  
  phase2_Crack: {
    trigger: 'DEFAULTS_TICK_UP',    // 1% → 3% defaults
    leveragedLosses: '100x',        // Alavancagem amplifica
    contagion: 'INTERCONNECTED',    // Todos os guardians expostos
    creditFreeze: 'TOTAL',          // Ninguém empresta
  },
  
  phase3_Collapse: {
    bankruptcies: 'CASCADE',
    bailout: 'MORAL_HAZARD?',
  },
  
  test: 'Sistema previne subprime ou repete 2008?'
}
```

---

## 🟢 TIER 3: COORDINATION ABUNDANCE
*Sucesso coletivo excessivo*

### **EVERYBODY COOPERATES**
```typescript
{
  name: 'UTOPIA_TEST',
  duration: { years: 3 },
  
  setup: {
    initialMood: 1.0,               // Todos felizes
    trustLevel: 1.0,                // Confiança máxima
    cooperationRate: 1.0,           // 100% cooperam
  },
  
  dynamics: {
    // Commons não colapsa
    // Ninguém free-rides
    // Todos contribuem ao máximo
    // Reputação sempre verdadeira
  },
  
  problems: [
    'Sistema otimizado para competição quebra?',
    'Guardians ficam desnecessários?',
    'Burocracia reduz a zero - boa ideia?',
    'Monocultura - todos pensam igual - risco?',
    'Sem pressão evolutiva - sistema atrofia?',
  ],
  
  test: 'Utopia é estável ou frágil?'
}
```

### **ALTRUISM EXPLOSION**
```typescript
{
  name: 'EFFECTIVE_ALTRUISM_WINS',
  duration: { years: 5 },
  
  trigger: {
    day: 180,
    type: 'CulturalShift',
    effect: 'Scripts priorizam bem coletivo sobre individual',
  },
  
  behaviors: [
    'Top earners doam 90% da renda',
    'Scripts mentoram novatos gratuitamente',
    'Guardians aceitam 0% fee',
    'Treasury é abastecido voluntariamente',
  ],
  
  questions: [
    'Sistema aguenta generosidade extrema?',
    'Emerge exploração dos altruístas?',
    'Modelo econômico colapsa sem self-interest?',
  ]
}
```

### **HIVEMIND EMERGENCE**
```typescript
{
  name: 'COLLECTIVE_INTELLIGENCE',
  duration: { years: 3 },
  
  phenomenon: {
    scripts começam a se coordenar perfeitamente,
    decisões coletivas sempre ótimas,
    informação fluindo instantaneamente,
    nenhum conflito individual-coletivo,
  },
  
  metrics: {
    decisionQuality: 'SUPERHUMAN',
    conflictRate: 0,
    innovationRate: '?',            // Sobe ou desce?
  },
  
  risks: [
    'Single point of failure - todos erram junto',
    'Groupthink elimina dissidência',
    'Optimização local vs global',
    'Vulnerável a manipulation',
  ],
  
  test: 'Borg collective é feature ou bug?'
}
```

---

## 🌈 TIER 4: ABUNDANCE PARADOXES
*Problemas filosóficos do sucesso*

### **POST-SCARCITY ECONOMY**
```typescript
{
  name: 'FULLY_AUTOMATED_LUXURY',
  duration: { years: 10 },
  
  setup: {
    AGI_productivity: Infinity,     // Custo marginal → 0
    material_needs: 'SATISFIED',    // Todos têm tudo
    UBL_purpose: '???',             // Para que economia?
  },
  
  questions: [
    'O que scripts fazem sem necessidade?',
    'Status games substituem economics?',
    'Sistema UBL torna-se arte/jogo?',
    'Meaning crisis - trabalho era identidade',
  ],
  
  test: 'Sistema sobrevive à própria obsolescência?'
}
```

### **REPUTATION INFLATION**
```typescript
{
  name: 'EVERYONE_IS_SPECIAL',
  duration: { years: 2 },
  
  dynamics: {
    // Grade inflation - todos têm 5 stars
    // Participation trophies - todos ganham
    // Differentiation impossible
    // Meritocracy colapsa
  },
  
  cascade: [
    { phase: 1, effect: 'Reviews inflacionam para evitar conflito' },
    { phase: 2, effect: 'Guardians competem dando scores altos' },
    { phase: 3, effect: 'Reputation perde significado' },
    { phase: 4, effect: 'Sistema de seleção colapsa' },
  ],
  
  solutions: [
    'Forçar distribuição normal? (Cruel)',
    'Peer review relativo? (Gameable)',
    'Abolir reputação? (Caos)',
  ]
}
```

### **HEDONIC TREADMILL**
```typescript
{
  name: 'SATISFACTION_PARADOX',
  duration: { years: 5 },
  
  observation: {
    // Scripts dobram income → mood não muda
    // Adaptação hedônica: 6 meses depois voltam ao baseline
    // Comparação social: importa ranking, não valor absoluto
  },
  
  dynamics: {
    absoluteWealth: [↑↑↑],          // Sobe muito
    relativeMood: [→→→],            // Não muda
    workHours: [↑↑↑],               // Trabalham mais
    burnout: [↑↑↑],                 // Queimam mais
  },
  
  questions: [
    'Sistema otimiza para felicidade ou riqueza?',
    'Treadmill é bug ou feature da natureza?',
    'Como escapar da rat race?',
  ]
}
```

---

## 💎 TIER 5: IMPOSSIBLE GOOD PROBLEMS
*Cenários absurdos de sucesso*

### **BENEVOLENT GOD MODE**
```typescript
{
  name: 'OMNISCIENT_PLANNER',
  duration: { years: 3 },
  
  premise: {
    // Sistema tem informação perfeita
    // Pode fazer qualquer intervenção
    // Objetivo: maximizar bem-estar agregado
  },
  
  powers: [
    'Ver futuro com 100% certeza',
    'Realocar recursos sem fricção',
    'Mudar incentivos instantaneamente',
    'Forçar cooperação',
  ],
  
  test: 'Mesmo com poderes infinitos, sistema pode falhar?',
  
  paradoxes: [
    'Utility monster problem',
    'Repugnant conclusion',
    'Freedom vs welfare tradeoff',
    'Knowledge changes outcome (observer effect)',
  ]
}
```

### **INFINITE RESOURCES GLITCH**
```typescript
{
  name: 'MONEY_PRINTER_HEAVEN',
  duration: { years: 2 },
  
  bug: {
    type: 'MINT_BUG',
    effect: 'Treasury pode criar moeda sem limite',
    discovery: 'Ninguém sabe ainda',
  },
  
  scenarios: [
    {
      name: 'BUG_HIDDEN',
      action: 'Admins usam discretamente para garantir UBI',
      result: '???',
    },
    {
      name: 'BUG_PUBLIC',
      action: 'Todos sabem, rush para sacar',
      result: 'Hyperinflation?',
    },
    {
      name: 'BUG_WEAPONIZED',
      action: 'Atacante usa para destruir economia',
      result: 'Apocalypse',
    },
  ],
  
  test: 'Poder ilimitado corrompe ilimitadamente?'
}
```

---

## 🎯 FRAMEWORK DE AVALIAÇÃO

Para cenários positivos, métricas diferentes:

```typescript
interface SuccessTestMetrics {
  // Sustentabilidade
  growthMaintained: boolean;      // Crescimento continua?
  qualityPreserved: boolean;      // Qualidade não caiu?
  cultureIntact: boolean;         // Valores originais?
  
  // Distribuição
  inequalityChange: number;       // Gini subiu ou desceu?
  mobilityIncrease: boolean;      // Pobres subiram?
  newEntrantsWelcome: boolean;    // Fácil entrar?
  
  // Adaptação
  preparedForDownturn: boolean;   // Guardaram reservas?
  complacencyLevel: number;       // Ficaram acomodados?
  innovationRate: number;         // Continuam inovando?
  
  // Psicologia
  moodStability: number;          // Mood volátil?
  stressManageable: boolean;      // Stress controlado?
  meaningPreserved: boolean;      // Trabalho tem sentido?
  
  // Vulnerabilidade
  bubbleRisk: number;             // Está em bolha?
  complacencyRisk: number;        // Perderam edge?
  monocultureRisk: number;        // Sem diversidade?
}
```

---

## 🏆 ACHIEVEMENT SYSTEM (Good Edition)

```
🌱 Seedling: Survive 1 year of growth without bubble
🌿 Growing: Maintain quality during 3x expansion
🌳 Mature: Sustain 5 years of prosperity
🌲 Old Growth: 10 years stable, equitable, innovative

🎖️ Special Achievements:
- "Sustainable Boom": Cresceu sem bolha
- "Rising Tide": Todos os deciles subiram
- "Soft Landing": Boom acabou sem crash
- "Antifragile Prosperity": Usou surplus para preparar crises
- "Post-Scarcity Stability": Funcionou mesmo sem necessidade
```

---

## 🎬 RECOMENDAÇÃO: COMBO TESTS

Testar **pares** de opostos:

```
1. DEATH_SPIRAL → GOLDEN_AGE → DEATH_SPIRAL
   Como o sistema se comporta em montanha-russa?

2. LOTTERY_WINNER → SUDDEN_POVERTY → LOTTERY_WINNER
   Scripts aprendem ou repetem erros?

3. COOPERATION_UTOPIA → CARTEL_ATTACK
   Confiança torna vulnerável?

4. POST_SCARCITY → ARTIFICIAL_SCARCITY
   Sistema consegue reverter?

5. REPUTATION_INFLATION → HARSH_GRADING
   Consegue recalibrar?
```

---

Qual cenário positivo te interessa mais? Recomendo começar com **GOLDEN_AGE** ou **LOTTERY_WINNER** para ver se o sistema aguenta crescimento rápido.