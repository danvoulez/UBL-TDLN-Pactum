# Universal Business Ledger - Implementation X-Ray

## How It Actually Works

This document explains the **implementation layers** - not the philosophy, but the actual mechanics of how the system functions.

---

## Layer 0: The Foundation - Event Store

Everything sits on an append-only event store. This is the **single source of truth**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EVENT STORE                                       │
│                                                                             │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                     │
│  │ E₁  │──│ E₂  │──│ E₃  │──│ E₄  │──│ E₅  │──│ E₆  │── ···              │
│  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘                     │
│     │        │        │        │        │        │                         │
│   hash     hash     hash     hash     hash     hash                        │
│                                                                             │
│  Properties:                                                                │
│  - Append-only (INSERT only, no UPDATE/DELETE)                             │
│  - Cryptographically chained (each event hashes previous)                  │
│  - Sequenced (global ordering via BIGSERIAL)                               │
│  - Typed (aggregate_type, event_type)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/store/postgres-event-store.ts` - PostgreSQL implementation
- `core/store/event-store.ts` - In-memory implementation + interfaces
- `core/store/create-event-store.ts` - Factory (auto-selects based on DATABASE_URL)
- `migrations/001_initial_schema.sql` - PostgreSQL schema with triggers

### Key Enforcement:
```sql
-- Prevents UPDATE
CREATE TRIGGER enforce_event_immutability
    BEFORE UPDATE ON events
    EXECUTE FUNCTION prevent_event_modification();

-- Prevents DELETE  
CREATE TRIGGER enforce_append_only
    BEFORE DELETE ON events
    EXECUTE FUNCTION prevent_event_deletion();
```

---

## Layer 1: Aggregates - State from Events

Aggregates are **derived state**. They don't exist in the database - they're reconstructed by replaying events.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGGREGATE RECONSTRUCTION                             │
│                                                                             │
│   Events for Agreement "agr-123":                                           │
│                                                                             │
│   [AgreementProposed] → [ConsentGiven] → [ConsentGiven] → [AgreementActive]│
│          │                    │                │                │           │
│          ▼                    ▼                ▼                ▼           │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │                      REHYDRATOR                                   │     │
│   │                                                                   │     │
│   │   function agreementRehydrator(state, event) {                   │     │
│   │     switch(event.type) {                                         │     │
│   │       case 'AgreementProposed': return { ...state, status: 'Proposed' }│
│   │       case 'ConsentGiven': return { ...state, consents: [...] }  │     │
│   │       case 'AgreementActive': return { ...state, status: 'Active' }│    │
│   │     }                                                            │     │
│   │   }                                                              │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│          │                                                                  │
│          ▼                                                                  │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │  Current State: { id: "agr-123", status: "Active", ... }         │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/aggregates/rehydrators.ts` - All rehydrator functions
- `core/store/event-store.ts` - `reconstructAggregate()` function

### Aggregate Types:
| Type | Events | Rehydrator |
|------|--------|------------|
| Party/Entity | PartyRegistered, PartyUpdated | partyRehydrator |
| Agreement | AgreementProposed, ConsentGiven, etc. | agreementRehydrator |
| Asset | AssetCreated, AssetTransferred | assetRehydrator |
| Role | RoleGranted, RoleRevoked | roleRehydrator |
| Workflow | WorkflowStarted, WorkflowTransitioned | workflowRehydrator |

---

## Layer 2: Intent API - The Single Entry Point

All mutations go through `/intent`. There is no REST API for CRUD - only intents.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTENT FLOW                                     │
│                                                                             │
│   POST /intent                                                              │
│   {                                                                         │
│     "intent": "register",                                                   │
│     "realm": "realm-xxx",                                                   │
│     "actor": { "type": "Entity", "entityId": "ent-xxx" },                  │
│     "payload": { "entityType": "Person", "identity": {...} }               │
│   }                                                                         │
│                                                                             │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                    INTENT HANDLER                                │      │
│   │                                                                  │      │
│   │  1. Parse & Validate (JSON Schema)                              │      │
│   │  2. ABAC Check (requiredPermissions)                            │      │
│   │  3. Execute Handler                                             │      │
│   │  4. Emit Events                                                 │      │
│   │  5. Return Affordances                                          │      │
│   │                                                                  │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│         │                                                                   │
│         ▼                                                                   │
│   {                                                                         │
│     "success": true,                                                        │
│     "outcome": { "type": "Created", "id": "ent-new" },                     │
│     "affordances": [                                                        │
│       { "intent": "update", "description": "Update entity" }               │
│     ]                                                                       │
│   }                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/api/intent-api.ts` - Intent definitions, handlers, `createIntentHandler()`
- `antenna/server.ts` - HTTP server, routes `/intent` to handler

### Intent Categories:
| Category | Intents |
|----------|---------|
| Entity | register, update, deactivate |
| Agreement | propose, consent, reject, activate, terminate |
| Asset | create, transfer, transform |
| Workflow | start, transition |
| Query | query, getEntity, getAgreement |

---

## Layer 3: ABAC - Agreement-Based Access Control

Permissions come from **Agreements**, not static role tables.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ABAC FLOW                                            │
│                                                                             │
│   Actor: { type: "Entity", entityId: "ent-dan" }                           │
│   Action: "create"                                                          │
│   Resource: "Entity"                                                        │
│   Realm: "realm-logline"                                                    │
│                                                                             │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                   ROLE RESOLUTION                                │      │
│   │                                                                  │      │
│   │  1. Query: SELECT FROM events WHERE                             │      │
│   │            aggregate_type = 'Agreement'                          │      │
│   │            AND event_type = 'AgreementProposed'                  │      │
│   │            AND payload->'terms'->>'roleType' IS NOT NULL        │      │
│   │            AND payload::text LIKE '%ent-dan%'                   │      │
│   │                                                                  │      │
│   │  2. Filter: Only Active agreements (AgreementStatusChanged)     │      │
│   │                                                                  │      │
│   │  3. Build Roles: Map roleType → PERMISSION_SETS                 │      │
│   │                                                                  │      │
│   │  Result: [                                                       │      │
│   │    { roleType: "Founder", scope: Global, permissions: [*:*] }   │      │
│   │    { roleType: "RealmAdmin", scope: realm-logline, ... }        │      │
│   │  ]                                                               │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                   PERMISSION CHECK                               │      │
│   │                                                                  │      │
│   │  For each role:                                                  │      │
│   │    - Is role active? ✓                                          │      │
│   │    - Is role in scope? (Global or matching Realm) ✓             │      │
│   │    - Does role have permission? (action:* or action:create) ✓   │      │
│   │                                                                  │      │
│   │  Decision: GRANTED                                               │      │
│   │  Reason: "Granted by Founder role with permission *:*"          │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│         │                                                                   │
│         ▼                                                                   │
│   Event: AuthorizationGranted (logged to ledger)                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/security/authorization.ts` - Authorization engine, PERMISSION_SETS, ROLE_TEMPLATES
- `antenna/server.ts` - `findRolesByHolder()`, `roleStore`, ABAC enforcement in intent handler
- `core/api/intent-api.ts` - ABAC enforcement block (lines ~1687-1780)

### How Roles Are Established:
```
1. Create Agreement with roleType in terms:
   {
     "intent": "propose",
     "payload": {
       "agreementType": "RoleGrant",
       "parties": [{ "entityId": "ent-dan", "role": "Grantee" }],
       "terms": {
         "roleType": "Founder",
         "scope": { "type": "Global" }
       }
     }
   }

2. Activate Agreement (consent from all parties)

3. Role is now queryable from events
```

---

## Layer 4: Trajectory - System Audit Trail

Everything that happens is logged. Not as an afterthought - as the **primary data**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRAJECTORY SYSTEM                                    │
│                                                                             │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │  TrajectoryFormer│     │   TraceStore    │     │   AuditLogger   │      │
│   │                 │     │                 │     │                 │      │
│   │  Creates Traces │     │  Persists to    │     │  Convenience    │      │
│   │  from events    │     │  EventStore     │     │  API for common │      │
│   │                 │     │                 │     │  audit events   │      │
│   └────────┬────────┘     └────────┬────────┘     └────────┬────────┘      │
│            │                       │                       │               │
│            └───────────────────────┼───────────────────────┘               │
│                                    │                                        │
│                                    ▼                                        │
│                          ┌─────────────────┐                               │
│                          │   EVENT STORE   │                               │
│                          │                 │                               │
│                          │  TraceRecorded  │                               │
│                          │  AuthGranted    │                               │
│                          │  AuthDenied     │                               │
│                          │  RoleResolution │                               │
│                          │  IntentSucceeded│                               │
│                          │  ...            │                               │
│                          └─────────────────┘                               │
│                                                                             │
│   NAMING:                                                                   │
│   - Trajectory = System audit trail (what happened)                        │
│   - Memory = Agent context (what AI remembers) ← DIFFERENT MODULE          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/trajectory/trace.ts` - Trace model, TrajectoryFormer
- `core/trajectory/path.ts` - Path model, TraceStore interface
- `core/trajectory/logger.ts` - Traditional logger → Traces
- `core/trajectory/event-store-trace.ts` - TraceStore impl, AuditLogger

### Audit Event Types:
| Event | When |
|-------|------|
| AuthorizationGranted | Permission check passed |
| AuthorizationDenied | Permission check failed |
| RoleResolutionPerformed | Roles looked up for actor |
| IntentSucceeded | Intent completed successfully |
| IntentFailed | Intent failed |
| TraceRecorded | Generic trace saved |

---

## Layer 5: Projections - Read Models

For queries that need to be fast, we maintain **projections** - derived read models.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROJECTION SYSTEM                                    │
│                                                                             │
│   Events Stream:                                                            │
│   [E₁] → [E₂] → [E₃] → [E₄] → [E₅] → ...                                  │
│     │      │      │      │      │                                          │
│     └──────┴──────┴──────┴──────┴─────────┐                                │
│                                            │                                │
│                                            ▼                                │
│                               ┌────────────────────┐                       │
│                               │ PROJECTION MANAGER │                       │
│                               │                    │                       │
│                               │  Subscribes to     │                       │
│                               │  event stream      │                       │
│                               │                    │                       │
│                               │  Updates read      │                       │
│                               │  models            │                       │
│                               └─────────┬──────────┘                       │
│                                         │                                   │
│              ┌──────────────────────────┼──────────────────────────┐       │
│              ▼                          ▼                          ▼       │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐  │
│   │ parties_projection│     │agreements_project│     │workspaces_project│  │
│   │                  │     │                  │     │                  │  │
│   │ id, name, type,  │     │ id, status,      │     │ id, name,        │  │
│   │ realm, status    │     │ parties, terms   │     │ owner, files     │  │
│   └──────────────────┘     └──────────────────┘     └──────────────────┘  │
│                                                                             │
│   Note: Projections are DERIVED. They can be rebuilt from events.          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/store/projections-manager.ts` - ProjectionManager class
- `migrations/001_initial_schema.sql` - Projection tables, checkpoints

---

## Layer 6: Workflows - State Machines

Complex processes are modeled as state machines.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGREEMENT WORKFLOW                                   │
│                                                                             │
│                              ┌─────────┐                                    │
│                              │  Draft  │                                    │
│                              └────┬────┘                                    │
│                                   │ propose                                 │
│                                   ▼                                         │
│                              ┌─────────┐                                    │
│                         ┌────│Proposed │────┐                               │
│                         │    └────┬────┘    │                               │
│                    reject│        │consent  │withdraw                       │
│                         ▼         ▼         ▼                               │
│                   ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│                   │Rejected │ │Consented│ │Withdrawn│                       │
│                   └─────────┘ └────┬────┘ └─────────┘                       │
│                                    │ all consents                           │
│                                    ▼                                        │
│                              ┌─────────┐                                    │
│                         ┌────│ Active  │────┐                               │
│                         │    └────┬────┘    │                               │
│                   breach│         │terminate│fulfill                        │
│                         ▼         ▼         ▼                               │
│                   ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│                   │Breached │ │Terminated│ │Fulfilled│                      │
│                   └─────────┘ └─────────┘ └─────────┘                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/engine/workflow-engine.ts` - WorkflowEngine, transitions, guards
- `core/schema/workflow.ts` - Workflow types

---

## The Complete Request Flow

```
HTTP Request
     │
     ▼
┌─────────────────┐
│  antenna/server │  ← HTTP Server
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Intent Handler │  ← Parse, Validate
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ABAC Check     │  ← Role Resolution → Permission Check
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Handler Logic  │  ← Business Logic
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Event Store    │  ← Append Events
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│Audit  │ │Project│  ← Side Effects
│Logger │ │Manager│
└───────┘ └───────┘
         │
         ▼
┌─────────────────┐
│  Response       │  ← Affordances
└─────────────────┘
```

---

## File Organization

```
core/
├── shared/types.ts          # Primitives: EntityId, Timestamp, etc.
├── schema/
│   ├── ledger.ts            # Event, Party, Agreement, Asset, Role
│   └── workflow.ts          # Workflow definitions
├── store/
│   ├── event-store.ts       # In-memory store + interfaces
│   ├── postgres-event-store.ts  # PostgreSQL implementation
│   ├── create-event-store.ts    # Factory
│   └── projections-manager.ts   # Read model updates
├── aggregates/
│   └── rehydrators.ts       # State reconstruction
├── api/
│   └── intent-api.ts        # Intent definitions + handlers
├── security/
│   ├── authorization.ts     # ABAC engine
│   └── audit-integration.ts # Security → Trajectory
├── engine/
│   └── workflow-engine.ts   # State machine executor
├── trajectory/              # AUDIT TRAIL
│   ├── trace.ts             # Trace model
│   ├── path.ts              # Path builder
│   ├── logger.ts            # Traditional logger
│   └── event-store-trace.ts # TraceStore + AuditLogger
├── memory/                  # AGENT CONTEXT (different!)
│   ├── narrative.ts         # Memory model
│   └── story.ts             # Story builder
└── universal/
    ├── primitives.ts        # Entity, Agreement, Role
    └── realm-manager.ts     # Multi-tenancy

antenna/
├── server.ts                # HTTP server, ABAC wiring
└── admin.ts                 # Admin operations

migrations/
└── 001_initial_schema.sql   # PostgreSQL schema
```

---

## Key Insights

### 1. Events Are Primary
The events table IS the database. Everything else is derived.

### 2. Roles Come From Agreements
There's no `roles` table. Roles are queried from Agreement events with `roleType` in terms.

### 3. ABAC Is Dynamic
Permissions are checked at runtime by:
1. Finding agreements where actor is a party
2. Extracting roleType from agreement terms
3. Mapping roleType to permissions via ROLE_TEMPLATES
4. Checking if any permission matches the requested action

### 4. Trajectory ≠ Cognition
- **Trajectory** (`core/trajectory/`): System audit trail (what happened in the system)
- **Cognition** (`core/cognition/`): Agent thinking & memory (what the AI remembers)

### 5. Everything Is Logged
Authorization decisions, role resolutions, intent executions - all become events in the ledger.

### 6. Append-Only Is Enforced
PostgreSQL triggers prevent UPDATE and DELETE on the events table. The ledger is truly immutable.

---

## Layer 7: Realms - Multi-tenancy via Agreements

Realms are isolated universes. Even multi-tenancy is modeled as Agreements.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REALM HIERARCHY                                      │
│                                                                             │
│                        PRIMORDIAL REALM (Realm 0)                           │
│                        ─────────────────────────                            │
│                        Contains:                                            │
│                        • System Entity                                      │
│                        • Tenant Entities                                    │
│                        • License Agreements                                 │
│                                                                             │
│         ┌─────────────────────────┬─────────────────────────┐              │
│         │                         │                         │              │
│         ▼                         ▼                         ▼              │
│   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐       │
│   │  TENANT A     │       │  TENANT B     │       │  TENANT C     │       │
│   │  REALM        │       │  REALM        │       │  REALM        │       │
│   │               │       │               │       │               │       │
│   │  • Entities   │       │  • Entities   │       │  • Entities   │       │
│   │  • Assets     │       │  • Assets     │       │  • Assets     │       │
│   │  • Agreements │       │  • Agreements │       │  • Agreements │       │
│   │               │       │               │       │               │       │
│   │  ┌─────────┐  │       │               │       │               │       │
│   │  │SUB-REALM│  │       │               │       │               │       │
│   │  │(Dept X) │  │       │               │       │               │       │
│   │  └─────────┘  │       │               │       │               │       │
│   └───────────────┘       └───────────────┘       └───────────────┘       │
│                                                                             │
│   Realms are created via License Agreements (System ↔ Tenant)              │
│   Cross-realm operations require explicit Agreements                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/universal/realm-manager.ts` - RealmManager, bootstrap, cross-realm validation
- `core/universal/primitives.ts` - Realm, RealmConfig, PRIMORDIAL_REALM_ID

### Key Concepts:
- **Primordial Realm**: The root realm containing the System and all tenants
- **Tenant Realms**: Isolated spaces created via License Agreements
- **Sub-Realms**: Nested realms (departments, projects) within tenant realms
- **Cross-Realm**: Requires explicit agreements between realms

---

## Layer 8: Agreement Types - The Grammar of Relationships

Agreement Types define the **structure and rules** for categories of agreements.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AGREEMENT TYPE DEFINITION                               │
│                                                                             │
│   AgreementType: "Employment"                                               │
│   ─────────────────────────────                                             │
│                                                                             │
│   requiredParticipants:                                                     │
│   ├── Employer (min: 1, max: 1, requiresConsent: true)                     │
│   └── Employee (min: 1, max: 1, requiresConsent: true)                     │
│                                                                             │
│   optionalParticipants:                                                     │
│   └── Witness (min: 0, max: 2, isWitness: true)                            │
│                                                                             │
│   grantsRoles:                                                              │
│   └── Employee → Role:Employee (scope: Employer's Realm)                   │
│                                                                             │
│   requiredTerms:                                                            │
│   ├── salary (type: Money, required: true)                                 │
│   ├── startDate (type: Date, required: true)                               │
│   └── duties (type: Text[], required: true)                                │
│                                                                             │
│   workflowId: "employment-workflow"                                         │
│                                                                             │
│   validations:                                                              │
│   └── "startDate must be in the future"                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/universal/agreement-types.ts` - AgreementTypeDefinition, ParticipantRequirement, RoleGrant

### Built-in Agreement Types:
| Type | Purpose | Grants Roles |
|------|---------|--------------|
| Employment | Hire employees | Employee role |
| Sale | Transfer assets | Customer role |
| License | Grant software/IP access | Licensee role |
| Testimony | Witness declarations | Witness role |
| RoleGrant | Grant system roles | Any role |
| TenantLicense | Create realms | RealmAdmin role |

---

## Layer 9: Enforcement - Cryptographic Integrity

The ledger's integrity is enforced through cryptographic hashing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HASH CHAIN                                           │
│                                                                             │
│   Event 1          Event 2          Event 3          Event 4               │
│   ────────         ────────         ────────         ────────              │
│   payload: {...}   payload: {...}   payload: {...}   payload: {...}        │
│   prevHash: null   prevHash: H1     prevHash: H2     prevHash: H3          │
│   hash: H1         hash: H2         hash: H3         hash: H4              │
│       │                │                │                │                  │
│       └────────────────┴────────────────┴────────────────┘                  │
│                                                                             │
│   H1 = SHA256(Event1 without hash)                                         │
│   H2 = SHA256(Event2 without hash)  ← includes prevHash: H1                │
│   H3 = SHA256(Event3 without hash)  ← includes prevHash: H2                │
│                                                                             │
│   Tampering with Event 2 would:                                            │
│   1. Change H2                                                              │
│   2. Break Event 3's prevHash reference                                    │
│   3. Invalidate the entire chain from Event 3 onwards                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/enforcement/invariants.ts` - HashChain, verifyChain, computeHash

### Invariants Enforced:
1. **Hash Chain**: Each event's `previousHash` must match the previous event's `hash`
2. **Temporal Order**: Events cannot be inserted out of sequence
3. **Aggregate Versioning**: Each aggregate's events are versioned sequentially
4. **Actor Validity**: Actor must exist and have permission

---

## Layer 10: Evolution - Schema Versioning

Events are immutable, but schemas evolve. Solution: **Upcasting**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UPCASTING                                            │
│                                                                             │
│   Storage (immutable):                                                      │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  Event v1: { name: "John" }                                      │      │
│   │  Event v2: { firstName: "Jane", lastName: "Doe" }               │      │
│   │  Event v3: { firstName: "Bob", lastName: "Smith" }              │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│   Reading (with upcasters):                                                 │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  v1 → v2 upcaster: { name } → { firstName: name, lastName: "" } │      │
│   │  v2 → v3 upcaster: (no change needed)                           │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│   Application sees (current schema v3):                                     │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  { firstName: "John", lastName: "" }     ← upcasted from v1     │      │
│   │  { firstName: "Jane", lastName: "Doe" }  ← native v2            │      │
│   │  { firstName: "Bob", lastName: "Smith" } ← native v3            │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/evolution/versioning.ts` - SchemaRegistry, Upcaster, UpcastChain

---

## Layer 11: Performance - Snapshots

Problem: Replaying 100,000 events is slow. Solution: **Snapshots**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SNAPSHOT OPTIMIZATION                                │
│                                                                             │
│   Without snapshots:                                                        │
│   [E1] → [E2] → [E3] → ... → [E99999] → [E100000]                          │
│     └─────────────────────────────────────────────┘                         │
│                    Replay all 100,000 events                                │
│                                                                             │
│   With snapshots:                                                           │
│   [E1] → ... → [E50000] → [SNAPSHOT] → [E50001] → ... → [E100000]          │
│                              │              └────────────────┘              │
│                              │              Replay only 50,000              │
│                              │                                              │
│                    Load snapshot (instant)                                  │
│                                                                             │
│   Snapshot contains:                                                        │
│   • Aggregate state at E50000                                              │
│   • Version: 50000                                                          │
│   • Rehydrator version (invalidates if changed)                            │
│   • State hash (for verification)                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/performance/snapshots.ts` - Snapshot, SnapshotStore, SnapshotPolicy

---

## Layer 12: Distributed - Sagas

Multi-step operations across aggregates use **Sagas** with compensation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SAGA: "Hire Employee"                                │
│                                                                             │
│   Step 1: Create Employment Agreement                                       │
│      │    Compensation: Terminate Agreement                                 │
│      ▼                                                                      │
│   Step 2: Grant Employee Role                                               │
│      │    Compensation: Revoke Role                                         │
│      ▼                                                                      │
│   Step 3: Provision System Access  ← FAILS                                 │
│      │    Compensation: (not needed, step failed)                          │
│      ▼                                                                      │
│   COMPENSATION TRIGGERED:                                                   │
│      │                                                                      │
│      ├── Revoke Role (undo step 2)                                         │
│      └── Terminate Agreement (undo step 1)                                 │
│                                                                             │
│   All saga steps are recorded as events (auditable)                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/distributed/saga.ts` - Saga, SagaStep, SagaExecution, SagaOrchestrator

---

## Layer 13: Scheduling - Time-Based Triggers

Business processes have temporal requirements.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCHEDULED TASKS                                      │
│                                                                             │
│   Task Types:                                                               │
│   ───────────                                                               │
│   • Once: Execute at specific time                                          │
│   • Recurring: Cron expression (daily, weekly, etc.)                       │
│   • Relative: N days after event X                                          │
│   • Deadline: With reminders before                                         │
│                                                                             │
│   Example: Agreement Expiry                                                 │
│   ─────────────────────────────                                             │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  Agreement created: Jan 1                                        │      │
│   │  Expiry: Dec 31                                                  │      │
│   │                                                                  │      │
│   │  Scheduled tasks:                                                │      │
│   │  • Dec 1: Send "30 days until expiry" reminder                  │      │
│   │  • Dec 24: Send "7 days until expiry" reminder                  │      │
│   │  • Dec 31: Emit AgreementExpired event                          │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/scheduling/scheduler.ts` - ScheduledTask, TaskSchedule, Scheduler

---

## Layer 14: Attachments - Documents & Signatures

Agreements have attached documents with digital signatures.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENT SYSTEM                                      │
│                                                                             │
│   Document Properties:                                                      │
│   ────────────────────                                                      │
│   • Immutable (like events)                                                 │
│   • Content-addressed (hash = identity)                                     │
│   • Versioned (new version = new document)                                  │
│   • Signed (digital signatures)                                             │
│                                                                             │
│   Storage:                                                                  │
│   ─────────                                                                 │
│   • Metadata → Event Store (DocumentUploaded event)                        │
│   • Content → Object Storage (S3, GCS, Azure, IPFS)                        │
│                                                                             │
│   Digital Signatures:                                                       │
│   ───────────────────                                                       │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  Document: contract.pdf                                          │      │
│   │  Content Hash: sha256:abc123...                                  │      │
│   │                                                                  │      │
│   │  Signatures:                                                     │      │
│   │  ├── Party A: signed at 2024-01-15, key: RSA-2048               │      │
│   │  └── Party B: signed at 2024-01-16, key: RSA-2048               │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/attachments/documents.ts` - Document, DocumentSignature, DocumentStore

---

## Layer 15: Search - Full-Text & Semantic

Query language handles structured queries. Search handles text.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEARCH TYPES                                         │
│                                                                             │
│   FullText:  "employment agreement"  → keyword matching                    │
│   Fuzzy:     "Joao" → matches "João" (typo tolerant)                       │
│   Semantic:  "contracts about software" → AI-powered meaning               │
│   Phrase:    "as-is basis" → exact phrase                                  │
│   Prefix:    "emp*" → starts with                                          │
│                                                                             │
│   Architecture:                                                             │
│   ─────────────                                                             │
│   Events → Indexer → Search Index (Elasticsearch/Meilisearch)              │
│                           │                                                 │
│                           ▼                                                 │
│                      Search API                                             │
│                                                                             │
│   Note: Search index has eventual consistency lag                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/search/engine.ts` - SearchQuery, SearchEngine, SearchResult

---

## Layer 16: Query Language - Temporal Queries

A declarative query language for the ledger.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUERY EXAMPLES                                       │
│                                                                             │
│   // What roles did João have on January 1st, 2024?                        │
│   {                                                                         │
│     select: { type: 'Role', activeOnly: true },                            │
│     where: [{ field: 'holderId', op: 'eq', value: 'joao-123' }],           │
│     at: '2024-01-01T00:00:00Z',                                            │
│     include: [{ relation: 'establishingAgreement' }]                       │
│   }                                                                         │
│                                                                             │
│   // All active agreements in realm X with their parties                   │
│   {                                                                         │
│     select: { type: 'Agreement', status: 'Active' },                       │
│     where: [{ field: 'realmId', op: 'eq', value: 'realm-x' }],             │
│     include: [{ relation: 'parties' }, { relation: 'assets' }]             │
│   }                                                                         │
│                                                                             │
│   // Count agreements by type this month                                   │
│   {                                                                         │
│     select: { type: 'Agreement' },                                         │
│     where: [{ field: 'createdAt', op: 'gte', value: '2024-01-01' }],       │
│     aggregate: [{ type: 'count', groupBy: 'agreementType' }]               │
│   }                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/api/query-language.ts` - Query, Selection, Condition, QueryBuilder

---

## Layer 17: Realtime - WebSocket & SSE

Subscribe to changes in real-time.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REALTIME SUBSCRIPTIONS                               │
│                                                                             │
│   Subscription Types:                                                       │
│   ───────────────────                                                       │
│   • events: Raw event stream                                               │
│   • aggregate: Changes to specific aggregate                               │
│   • query: Live query result updates                                       │
│   • workflow: State transitions                                            │
│   • affordances: Available actions changes                                 │
│                                                                             │
│   WebSocket Flow:                                                           │
│   ────────────────                                                          │
│   Client                              Server                                │
│     │                                   │                                   │
│     │──── { subscribe: 'events',  ────▶│                                   │
│     │       filters: { realm: X } }     │                                   │
│     │                                   │                                   │
│     │◀─── { type: 'subscribed',   ─────│                                   │
│     │       id: 'sub-123' }             │                                   │
│     │                                   │                                   │
│     │◀─── { type: 'event',        ─────│  (when events occur)              │
│     │       data: {...} }               │                                   │
│     │                                   │                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/api/realtime.ts` - SubscriptionRequest, RealtimeServer

---

## Layer 18: Agent - Conversational Interface

The Agent bridges human language and the ledger.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT ARCHITECTURE                                   │
│                                                                             │
│   Frontend (logic-less)              Backend (all logic)                    │
│   ─────────────────────              ───────────────────                    │
│   • Render markdown                  • Interpret user intent                │
│   • Show affordance buttons          • Execute intents                      │
│   • Send user text                   • Format responses                     │
│   • Display results                  • Manage conversation state            │
│                                                                             │
│   Single Endpoint: POST /chat                                               │
│   ─────────────────────────────                                             │
│   Request:                                                                  │
│   {                                                                         │
│     "sessionId": "sess-123",                                               │
│     "message": { "text": "Show me active agreements" }                     │
│   }                                                                         │
│                                                                             │
│   Response:                                                                 │
│   {                                                                         │
│     "response": {                                                          │
│       "content": { "markdown": "## Active Agreements\n..." },              │
│       "affordances": [                                                     │
│         { "label": "View Details", "intent": "getAgreement", ... },        │
│         { "label": "Create New", "intent": "propose", ... }                │
│       ]                                                                    │
│     }                                                                      │
│   }                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/agent/conversation.ts` - UserMessage, AgentResponse, ConversationSession
- `core/agent/api.ts` - Agent API endpoints

### Key Concept: Cognition vs Trajectory
- **Cognition** (`core/cognition/`): What the AI agent thinks and remembers (conversation context)
- **Trajectory** (`core/trajectory/`): System audit trail (what happened in the system)

---

## Layer 19: Templates - Reusable Patterns

Templates make the system practical for common use cases.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEMPLATE SYSTEM                                      │
│                                                                             │
│   Agreement Template: "Standard Employment"                                 │
│   ─────────────────────────────────────────                                 │
│   {                                                                         │
│     agreementType: "Employment",                                           │
│     variables: [                                                           │
│       { name: "employeeName", type: "string", required: true },            │
│       { name: "salary", type: "money", required: true },                   │
│       { name: "startDate", type: "date", required: true },                 │
│       { name: "department", type: "string", default: "General" }           │
│     ],                                                                     │
│     defaults: {                                                            │
│       probationPeriod: "90 days",                                          │
│       noticePeriod: "30 days"                                              │
│     },                                                                     │
│     workflowId: "employment-workflow"                                      │
│   }                                                                         │
│                                                                             │
│   Usage:                                                                    │
│   ──────                                                                    │
│   POST /intent                                                             │
│   {                                                                         │
│     "intent": "proposeFromTemplate",                                       │
│     "payload": {                                                           │
│       "templateId": "standard-employment",                                 │
│       "variables": {                                                       │
│         "employeeName": "John Doe",                                        │
│         "salary": { "amount": 75000, "currency": "USD" },                  │
│         "startDate": "2024-02-01"                                          │
│       }                                                                    │
│     }                                                                      │
│   }                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/templates/registry.ts` - AgreementTemplate, TemplateRegistry

---

## Layer 20: Outbound - External Integrations

The ledger connects to the outside world.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OUTBOUND INTEGRATIONS                                │
│                                                                             │
│   Webhooks:                                                                 │
│   ─────────                                                                 │
│   Events → Filter → Transform → POST to external URL                       │
│                                                                             │
│   Notifications:                                                            │
│   ──────────────                                                            │
│   • Email (SendGrid adapter)                                               │
│   • SMS (Twilio adapter)                                                   │
│   • Slack (Slack adapter)                                                  │
│   • Push notifications                                                     │
│                                                                             │
│   All outbound operations are:                                             │
│   • Logged as events (auditable)                                           │
│   • Retryable (with exponential backoff)                                   │
│   • Configurable per realm                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/outbound/integrations.ts` - Webhook, Notification, OutboundManager
- `core/adapters/` - SendGrid, Twilio, Slack, Stripe, Auth0, etc.

---

## Layer 21: Workspaces - Development Environments

Workspaces are event-sourced development environments.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORKSPACE SYSTEM                                     │
│                                                                             │
│   A Workspace contains:                                                     │
│   ─────────────────────                                                     │
│   • Git repositories (cloned, tracked)                                     │
│   • Files (versioned via events)                                           │
│   • Functions (executable code)                                            │
│   • Execution history                                                      │
│                                                                             │
│   Everything is event-sourced:                                             │
│   ────────────────────────────                                              │
│   • FileCreated, FileModified → Event Store                                │
│   • File content → Object Storage (S3)                                     │
│   • Content-addressed (hash = identity)                                    │
│                                                                             │
│   Runtimes:                                                                 │
│   ─────────                                                                 │
│   • Node.js                                                                │
│   • Python                                                                 │
│   • Deno                                                                   │
│   • WebAssembly                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:
- `core/sandbox/workspace.ts` - Workspace, WorkspaceManager
- `core/sandbox/storage.ts` - File storage (S3 adapter)
- `core/sandbox/runtimes/` - Execution runtimes

---

## The Antenna - HTTP Server & Flagship Experience

The Antenna is not just an HTTP server - it's the **flagship experience** built on the Universal Business Ledger engine.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ANTENNA                                         │
│                                                                             │
│   "The Antenna receives signals from the world and translates them          │
│    into the language of agreements, entities, and events."                  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   HTTP ENDPOINTS                                                            │
│   ──────────────                                                            │
│   POST /intent          Execute any intent (canonical entry point)          │
│   POST /chat            Conversational AI interface                         │
│   GET  /affordances     Get available actions for context                   │
│   POST /session/start   Start conversation session                          │
│   GET  /session/:id     Get session state                                   │
│   GET  /health          Health check + event store status                   │
│                                                                             │
│   ADMIN ENDPOINTS                                                           │
│   ───────────────                                                           │
│   POST /admin/realm     Create new realm                                    │
│   POST /admin/entity    Create entity in realm                              │
│   POST /admin/user      Create user with credentials                        │
│   POST /admin/api-key   Generate API key for entity                         │
│                                                                             │
│   WEBSOCKET                                                                 │
│   ─────────                                                                 │
│   WS /subscribe         Real-time event subscriptions                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ANTENNA ARCHITECTURE                                 │
│                                                                             │
│   External Request                                                          │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────────┐                                                      │
│   │  HTTP Server    │  ← Bun.serve() / Node HTTP                           │
│   │  (server.ts)    │                                                      │
│   └────────┬────────┘                                                      │
│            │                                                                │
│   ┌────────┼────────────────────────────────────────┐                      │
│   │        │                                        │                      │
│   │        ▼                                        ▼                      │
│   │  ┌───────────┐                           ┌───────────┐                 │
│   │  │  /intent  │                           │   /chat   │                 │
│   │  └─────┬─────┘                           └─────┬─────┘                 │
│   │        │                                       │                       │
│   │        ▼                                       ▼                       │
│   │  ┌───────────────┐                     ┌───────────────┐              │
│   │  │Intent Handler │                     │Conversational │              │
│   │  │(intent-api.ts)│                     │    Agent      │              │
│   │  └───────┬───────┘                     └───────┬───────┘              │
│   │          │                                     │                       │
│   │          │         ┌───────────────────────────┘                       │
│   │          │         │                                                   │
│   │          ▼         ▼                                                   │
│   │  ┌─────────────────────┐                                              │
│   │  │    ABAC Check       │  ← Role Resolution from Agreements           │
│   │  │  (authorization.ts) │                                              │
│   │  └──────────┬──────────┘                                              │
│   │             │                                                          │
│   │             ▼                                                          │
│   │  ┌─────────────────────┐                                              │
│   │  │    Event Store      │  ← PostgreSQL or In-Memory                   │
│   │  │  (postgres-event-   │                                              │
│   │  │   store.ts)         │                                              │
│   │  └─────────────────────┘                                              │
│   │                                                                        │
│   └────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│   WIRING (in server.ts):                                                   │
│   ─────────────────────                                                    │
│   • Creates EventStore (PostgreSQL if DATABASE_URL, else in-memory)        │
│   • Creates IntentHandler with all handlers                                │
│   • Creates RoleStore that queries Agreements for roles                    │
│   • Creates AuthorizationEngine with RoleStore                             │
│   • Creates ProjectionManager for read models                              │
│   • Creates WorkflowEngine with Agreement/Asset workflows                  │
│   • Creates ConversationalAgent with LLM adapter                           │
│   • Wires ABAC enforcement into intent handling                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Files:

| File | Purpose | Size |
|------|---------|------|
| `antenna/server.ts` | Main HTTP server, all wiring | ~60KB |
| `antenna/admin.ts` | Admin API (realms, entities, API keys) | ~28KB |
| `antenna/websocket.ts` | WebSocket server for subscriptions | ~13KB |
| `antenna/agent/` | Conversational agent implementation | 5 files |

### Key Components in server.ts:

```typescript
// 1. Event Store Creation
const eventStore = createEventStore(); // Auto-selects PostgreSQL or in-memory

// 2. Role Store (queries Agreements for roles)
const roleStore: RoleStore = {
  async getActiveRoles(actor, realm, at) {
    // Query AgreementProposed events with roleType in terms
    // Filter by Active status, validity, and scope
    // Return roles with permissions from ROLE_TEMPLATES
  }
};

// 3. Authorization Engine
const authorization = createAuthorizationEngine({
  roleStore,
  auditLogger,
  permissionSets: PERMISSION_SETS,
});

// 4. Intent Handler with ABAC
const intentHandler = createIntentHandler({
  eventStore,
  authorization,
  // ... other dependencies
});

// 5. ABAC Enforcement (before each intent)
// - Get requiredPermissions from intent definition
// - Call authorization.authorize(actor, action, resource)
// - Log AuthorizationGranted/Denied to ledger
// - Reject if denied
```

### Admin API Flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CREATE REALM FLOW                                    │
│                                                                             │
│   POST /admin/realm { name: "Acme Corp" }                                   │
│         │                                                                   │
│         ▼                                                                   │
│   1. Create System Entity (Licensor) in Primordial Realm                   │
│         │                                                                   │
│         ▼                                                                   │
│   2. Create Tenant Entity (Licensee) in Primordial Realm                   │
│         │                                                                   │
│         ▼                                                                   │
│   3. Create TenantLicense Agreement (System ↔ Tenant)                      │
│         │                                                                   │
│         ▼                                                                   │
│   4. Agreement hook creates the Realm                                       │
│         │                                                                   │
│         ▼                                                                   │
│   5. Create Admin Entity in new Realm                                       │
│         │                                                                   │
│         ▼                                                                   │
│   6. Grant RealmAdmin role via RoleGrant Agreement                         │
│         │                                                                   │
│         ▼                                                                   │
│   7. Generate API Key for Admin                                             │
│         │                                                                   │
│         ▼                                                                   │
│   Response: { realmId, entityId, apiKey }                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### WebSocket Subscriptions:

```typescript
// Client connects to WS /subscribe
// Client sends subscription request:
{
  type: 'subscribe',
  filters: {
    realm: 'realm-xxx',
    eventTypes: ['AgreementProposed', 'AgreementActive'],
  }
}

// Server streams matching events:
{
  type: 'event',
  data: {
    id: 'evt-xxx',
    type: 'AgreementProposed',
    payload: { ... }
  }
}
```

### Conversational Agent:

The Agent in `antenna/agent/` provides:
- **Session Management**: Tracks conversation state
- **Intent Interpretation**: Converts natural language to intents
- **Response Formatting**: Markdown with affordances
- **Memory**: Conversation context (separate from Trajectory)

```
User: "Show me all active agreements"
         │
         ▼
Agent interprets → { intent: 'query', payload: { type: 'Agreement', status: 'Active' } }
         │
         ▼
Intent executed → Results
         │
         ▼
Agent formats → Markdown + Affordances
         │
         ▼
Response: {
  content: { markdown: "## Active Agreements\n| Name | Status |..." },
  affordances: [
    { label: "View Details", intent: "getAgreement", ... },
    { label: "Create New", intent: "propose", ... }
  ]
}
```

---

## Complete Module Map

```
core/
├── shared/              # Primitives (EntityId, Timestamp, etc.)
├── schema/              # Domain model (Event, Agreement, etc.)
├── universal/           # Generalized model (Realm, AgreementTypes)
├── store/               # Event Store implementations
├── aggregates/          # State reconstruction (rehydrators)
├── enforcement/         # Invariants (hash chain, validation)
├── evolution/           # Schema versioning (upcasters)
├── performance/         # Optimization (snapshots)
├── api/                 # Intent API, Query Language, Realtime
├── security/            # ABAC, Authentication
├── engine/              # Workflow execution
├── distributed/         # Sagas, cross-realm
├── scheduling/          # Time-based triggers
├── trajectory/          # System audit trail (what happened)
├── cognition/           # Agent thinking & memory (what AI remembers)
├── agent/               # Conversational interface
├── search/              # Full-text & semantic search
├── templates/           # Reusable patterns
├── attachments/         # Documents & signatures
├── outbound/            # Webhooks, notifications
├── adapters/            # External service adapters
├── sandbox/             # Workspaces & code execution
├── observability/       # Metrics, logging
├── operational/         # Rate limiting, governance
└── testing/             # Test utilities

antenna/                 # HTTP Server
sdk/                     # TypeScript SDK
workers/                 # Background jobs
migrations/              # Database schema
```

---

## Implementation Status

| Layer | Status | Notes |
|-------|--------|-------|
| Event Store | ✅ Complete | PostgreSQL + In-memory |
| Aggregates | ✅ Complete | All rehydrators |
| Intent API | ✅ Complete | All core intents |
| ABAC | ✅ Complete | Agreement-based roles |
| Trajectory | ✅ Complete | AuditLogger ready |
| Projections | ✅ Complete | ProjectionManager + cache |
| Workflows | ✅ Complete | Agreement + Asset workflows |
| Realms | ✅ Complete | RealmManager + bootstrap |
| Agreement Types | ✅ Complete | Full registry + SESSION_TYPE |
| Enforcement | ✅ Complete | Anomaly + Cartel detection |
| Snapshots | ✅ Complete | Temporal snapshots |
| Sagas | ✅ Complete | IntentTransaction + compensation |
| Economy | ✅ Complete | Fitness + Guardian scoring |
| Sessions | ✅ Complete | Session manager + Right to Forget |
| Governance | ✅ Complete | Three-branch + Monetary + Quadratic |
| Interop | ✅ Complete | UIS 1.0 + Federated Ledger |
| Benchmarking | ✅ Complete | 5-dimension scoring + Achievements |
| Simulation | ✅ Complete | Chaos TIER 1-5 + Scenarios |
| Agent | ✅ Complete | Conversation + API |
| Workspaces | ✅ Complete | Full implementation |
| Adapters | ✅ Complete | Multiple adapters |
| Evolution | 📋 Defined | Interfaces only |
| Scheduling | 📋 Defined | Interfaces only |
| Attachments | 📋 Defined | Interfaces only |
| Search | 📋 Defined | Interfaces only |

Legend: ✅ Complete | 📋 Defined (interfaces only)

### New Modules (Sprint D-F)

| Module | File | Purpose |
|--------|------|---------|
| **Economy** | `core/economy/fitness.ts` | Multi-dimensional fitness scoring |
| **Economy** | `core/economy/guardian-scoring.ts` | Guardian reputation + tiers |
| **Enforcement** | `core/enforcement/anomaly-detection.ts` | Statistical outlier detection |
| **Enforcement** | `core/enforcement/cartel-detection.ts` | Graph-based collusion detection |
| **Sessions** | `core/sessions/session-manager.ts` | Session lifecycle + GDPR |
| **Governance** | `core/governance/three-branch.ts` | Executive/Legislative/Judicial |
| **Governance** | `core/governance/monetary-policy.ts` | Taylor Rule + OMOs |
| **Governance** | `core/governance/quadratic-funding.ts` | Public goods funding |
| **Interop** | `core/interop/uis-1.0.ts` | Cross-realm protocol |
| **Interop** | `core/interop/federated-ledger.ts` | Vector clocks + Merkle sync |
| **Benchmarking** | `core/benchmarking/benchmark-framework.ts` | Health metrics |
| **Benchmarking** | `core/benchmarking/achievements.ts` | Gamification system |

---

## The Fractal Insight: Containers

The ultimate unification: **Wallet, Workspace, Realm, and Network are mathematically identical.**

They are all **Governance Boundaries** around a set of resources - Containers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THE CONTAINER PRIMITIVE                              │
│                                                                             │
│   "A Container is an Asset that holds other Assets,                        │
│    governed by an Agreement."                                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │   WALLET    │     │  WORKSPACE  │     │    REALM    │                  │
│   │             │     │             │     │             │                  │
│   │  Contains:  │     │  Contains:  │     │  Contains:  │                  │
│   │  Credits    │     │  Files      │     │  Entities   │                  │
│   │  Tokens     │     │  Code       │     │  Assets     │                  │
│   │             │     │  Functions  │     │  Agreements │                  │
│   └─────────────┘     └─────────────┘     └─────────────┘                  │
│          │                   │                   │                          │
│          └───────────────────┴───────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────┐                                     │
│                    │    CONTAINER    │                                     │
│                    │                 │                                     │
│                    │  Same code,     │                                     │
│                    │  different      │                                     │
│                    │  physics        │                                     │
│                    └─────────────────┘                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Container Physics

The difference between container types is **configuration, not implementation**:

| Container | Fungibility | Topology | Permeability | Analogy |
|-----------|-------------|----------|--------------|---------|
| **Wallet** | Strict (can't copy) | Values | Sealed | A Safe |
| **Workspace** | Versioned (copy/fork) | Objects | Collaborative | A Workbench |
| **Realm** | Constitutional | Subjects | Gated | A Country |
| **Network** | Transient | Links | Open | A Road |

### One Transfer Intent

Instead of separate APIs for payments, deployments, and migrations:

```typescript
// The UNIVERSAL transfer - works for money, files, entities
interface TransferIntent {
  assetId: EntityId;           // What (Money, File, User)
  fromContainerId: EntityId;   // Source (Wallet, Workspace, Realm)
  toContainerId: EntityId;     // Dest (Wallet, Workspace, Realm)
  authorizingAgreementId: EntityId;
  operation?: 'Move' | 'Copy' | 'Fork';
}

// Pay someone = Transfer Credit from Wallet A to Wallet B
// Deploy code = Transfer File from Dev Workspace to Prod Workspace
// Migrate tenant = Transfer Entity from Realm A to Realm B
```

### Implementation Files:
- `core/universal/container.ts` - Container primitive, physics, events
- `core/universal/container-manager.ts` - Unified ContainerManager
- `core/universal/index.ts` - Exports

### The Philosophical Conclusion

> "The difference between a Wallet and a Workspace is not in the code. It's in the Agreement."

- A **Wallet** is just a Folder where the Agreement says "You cannot copy files."
- A **Realm** is just a Folder where the Agreement says "Everyone inside must obey me."
- A **Network** is just a Folder where the Agreement says "You can pass through."

This keeps the kernel incredibly small. You don't program "money features" - you program "conservation constraints."

---

*"The implementation follows the philosophy: Agreements establish relationships, Events record facts, and the Ledger tells the story."*

---

**Last Updated:** 2025-12-12
