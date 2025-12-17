# Battle Tests

**138 tests. 0 failures. The ledger is incorruptible.**

---

## Philosophy

These tests are written to **break things**, not just pass.

A test suite is battle-ready when:
- **Red team can't break it** — Security attacks are caught
- **Chaos doesn't corrupt** — Kill processes, data stays consistent  
- **Auditors are satisfied** — Every question, a test answers
- **Random inputs don't crash** — Fuzz for hours, invariants hold

---

## Structure

```
tests/
├── foundation/                  # The Unbreakable Core (87 tests)
│   ├── api/                     # Universal API
│   │   └── universal-api.test.ts
│   ├── attacks/                 # Security attacks
│   │   ├── event-injection.test.ts
│   │   ├── actor-spoofing.test.ts
│   │   └── privilege-escalation.test.ts
│   ├── chaos/                   # Infrastructure resilience
│   │   └── crash-recovery.test.ts
│   ├── fuzzing/                 # Property-based testing
│   │   └── invariant-fuzzer.test.ts
│   ├── invariants/              # Mathematical guarantees
│   │   ├── immutability.test.ts
│   │   ├── hash-chain.test.ts
│   │   └── actor-attribution.test.ts
│   └── load/                    # Performance under stress
│       └── throughput.test.ts
│
├── business/                    # The Legal Machine (51 tests)
│   ├── agreements/              # Agreement lifecycle
│   │   └── lifecycle.test.ts
│   ├── authorization/           # Role-based access
│   │   └── role-from-agreement.test.ts
│   ├── compliance/              # Audit requirements
│   │   └── audit-trail.test.ts
│   ├── containers/              # Container physics
│   │   ├── permeability.test.ts
│   │   └── nesting.test.ts
│   └── temporal/                # Time-travel queries
│       └── point-in-time.test.ts
│
└── helpers/                     # Test infrastructure
    ├── test-ledger.ts
    └── test-actors.ts
```

---

## Commands

```bash
npm test                 # All 138 tests

# Foundation
npm run test:api         # Universal API (21)
npm run test:attacks     # Security attacks (22)
npm run test:chaos       # Crash recovery (4)
npm run test:fuzz        # Property-based (10)
npm run test:invariants  # Core invariants (22)
npm run test:load        # Throughput (8)

# Business
npm run test:agreements  # Lifecycle (10)
npm run test:auth        # Authorization (7)
npm run test:compliance  # Audit trail (10)
npm run test:containers  # Physics (17)
npm run test:temporal    # Point-in-time (7)

# Utilities
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

---

## Key Findings

| Test | Finding |
|------|---------|
| `immutability.test.ts` | ⚠️ Event store returns mutable references |
| `privilege-escalation.test.ts` | ✅ Self-grant attacks detected |
| `crash-recovery.test.ts` | ✅ State recovers after crash |
| `throughput.test.ts` | ✅ 2000+ events, invariants hold |

---

**Last updated:** 2025-12-11

