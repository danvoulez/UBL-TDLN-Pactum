# DIFF.md — What changes in *current UBL* to implement `INTEGRATION.md` (TDLN → Pactum)

This is a **code-level change plan** for the repo in `UBL-main/` to implement the integration contract described in `INTEGRATION.md`:
- store TDLN SemanticUnits as clauses,
- verify TDLN hashes via a host-side hashing profile,
- compile deterministic Pactum `pact.json`,
- execute Pactum steps and anchor receipts in the UBL ledger,
- optionally emit **TDLN-Chip** materialization as **text artifacts** (hashable evidence).

The goal is **minimum disruption**: reuse UBL’s existing Agreement lifecycle + event sourcing; add a small, strict kernel for TDLN/Pactum.

---

## 0) Summary of the minimal “integration surface”

**New capabilities to add:**
1. `core/tdln/*` — parse/validate/hash SemanticUnits + anchors extraction  
2. `core/pactum/*` — canonicalization + hashing + Ed25519 verify + RiskPact step (V0.2)  
3. AgreementType `pactum-riskpact/0.2` + activation hooks:
   - `ValidateTDLNClauses`
   - `DeployPactumRiskPactV0_2`  
4. New ledger events to anchor Pactum artifacts:
   - `PactumPactDeployed`, `PactumEnvelopeSubmitted`, `PactumStepCommitted`, `PactumStepRejected`  
5. (Optional but recommended) new intents:
   - `pactum:deploy`, `pactum:submit-envelope`, `pactum:state`  
6. Conformance tests:
   - TDLN hash profile tests
   - Pactum fixture tests
   - UBL host anchoring tests (agreement → pact_hash → receipt hash)

---

## 1) Dependencies (package.json)

### MODIFY: `package.json`
Add deterministic Ed25519 + hashes (Node’s `crypto` can verify Ed25519 too, but cross-platform determinism and encoding helpers are easier with noble libs):

**ADD dependencies:**
- `@noble/ed25519`
- `@noble/hashes`
- `base64url` (or implement base64url encode/decode locally)

**Optional:**
- `zod` (strict schema validation for SemanticUnit)

### MODIFY: `package-lock.json`
Regenerate lock.

---

## 2) New modules

### ADD: `core/tdln/`
**Files:**
- `core/tdln/canon.ts` — canonical JSON (TDLN_HASH_PROFILE_0)
- `core/tdln/hash.ts` — `tdlnHashProfile0(unit) -> "blake3:<hex>"`
- `core/tdln/validate.ts` — minimal SemanticUnit checks + stable errors:
  - `UBL_ERR_TDLN_INVALID`
  - `UBL_ERR_TDLN_UNSUPPORTED_HASH_PROFILE`
- `core/tdln/extract.ts` — anchors-only extraction for RiskPact:
  - `extractRiskPactAnchors(unit) -> anchors`
- `core/tdln/index.ts` — exports

**Notes:**
- Hashing profile is explicitly *host-owned* (`TDLN_HASH_PROFILE_0`), so you can vendor the official TDLN hash later without ambiguity.

---

### ADD: `core/pactum/`
**Files:**
- `core/pactum/canon.ts` — Pactum canonical JSON
- `core/pactum/hash.ts` — domain-separated SHA-256 `sha256:<hex>`
- `core/pactum/ed25519.ts` — parse/verify `ed25519:<base64url>`
- `core/pactum/errors.ts` — stable `PCT_ERR_*` tokens
- `core/pactum/riskpact_v0_2.ts` — `stepRiskPactV0_2(pact, state0, envelope)`
- `core/pactum/index.ts` — exports
- `core/pactum/backend.ts` — (optional) backend interface + SoftwareBackend + ChipBackend stub

**Chip-as-text hook (optional):**
- `core/pactum/materialize_chip_ir.ts` — deterministically emits `chip_ir.txt` (text) + `chip_ir_hash = hash_json("tdln:chip_ir:0", ...)`

---

## 3) Agreement type + hooks

### MODIFY: `core/universal/agreement-types.ts`
Add a new AgreementType definition:

- `id: "pactum-riskpact/0.2"`
- requires parties: `a`, `b`, clock oracles, metric oracles
- requires clauses with purposes:
  - `riskpact.metric_rule`
  - `riskpact.breach_rule`
  - `riskpact.settlement_rule`
- defines activation hooks:
  - `{ type: "ValidateTDLNClauses", config: {...} }`
  - `{ type: "DeployPactumRiskPactV0_2", config: {...} }`

> This file already supports string-based hook types via `HookAction` (`hook.type`), so this is additive.

### MODIFY: `core/universal/agreement-hooks-processor.ts`
Add two new hook handlers to the existing `switch (hook.type)`:

1) **`ValidateTDLNClauses`**
   - iterate `agreementState.terms.clauses`
   - for each `type === "tdln.semantic_unit"`:
     - parse JSON
     - validate minimal contract
     - recompute `tdln_hash` under `TDLN_HASH_PROFILE_0`
     - check purpose existence
   - throw stable errors on failure: `UBL_ERR_TDLN_*`

2) **`DeployPactumRiskPactV0_2`**
   - compile Agreement → `pact.json` using anchors-only extraction
   - compute `pact_hash` using Pactum hash rules
   - append ledger events (see §4) anchoring `pact_hash` (+ optionally the pact itself)

---

## 4) Ledger schema additions (anchoring)

### MODIFY: `core/schema/ledger.ts`

Add new Agreement-scoped events:

- `PactumPactDeployed`
- `PactumEnvelopeSubmitted`
- `PactumStepCommitted`
- `PactumStepRejected`

Then extend the union:

- `export type AgreementEvent = ... | PactumPactDeployed | PactumEnvelopeSubmitted | PactumStepCommitted | PactumStepRejected;`

**Payload shapes (recommended minimal):**

- `PactumPactDeployed { pact_hash: string, evidence?: EvidenceRef[] }`
- `PactumEnvelopeSubmitted { envelope_hash: string, evidence?: EvidenceRef[] }`
- `PactumStepCommitted { receipt: object, receipt_hash?: string, state_hashes: {...}, outputs_hash: string, trace_hash: string }`
- `PactumStepRejected { envelope_hash: string, error_token: string }`

This keeps UBL event sourcing authoritative and makes Pactum replay/audit possible from ledger history.

---

## 5) Rehydration (AgreementState grows `pactum` substate)

### MODIFY: `core/aggregates/rehydrators.ts`
In the **Agreement rehydrator**, extend `AgreementState` with:

```ts
pactum?: {
  pact_hash: string;
  pact?: any;            // optional: store full pact JSON
  last_receipt_hash?: string;
  last_receipt?: any;    // optional
  last_state_hash?: string;
  last_outputs_hash?: string;
  last_trace_hash?: string;
};
```

Handle the new events:
- `PactumPactDeployed` sets `pactum.pact_hash` (and optional pact JSON)
- `PactumStepCommitted` updates `last_*` fields
- `PactumStepRejected` optionally stores last error token

---

## 6) API: new intents (optional but recommended)

### ADD: `core/api/intents/pactum-intents.ts`
Add intents for operating Pactum as a hosted kernel:

- `pactum:deploy` (optional; if you rely only on activation hooks, you can omit)
- `pactum:submit-envelope` (core)
- `pactum:state` (read helper)

### MODIFY: `core/api/intents/index.ts`
Include `PACTUM_INTENTS` into `ALL_INTENTS`.

### ADD: handler logic (pattern already used by other intents)
- rehydrate Agreement
- pull `pactum.pact_hash` + pact JSON + current derived state
- run `stepRiskPactV0_2`
- append `PactumEnvelopeSubmitted` + `PactumStepCommitted` (or `Rejected`)

---

## 7) Authorization (defense-in-depth)

### MODIFY: `core/security/*` (wherever intent authorization is enforced)
Enforce that:
- Party A can submit `collateral_post`
- Party B can submit `claim_request`
- Oracle signers must be allowlisted by class
- oracle hardening: `oracle_id == signer_pub` is enforced inside Pactum; host can pre-check too

This can be *policy* (ABL/roles) or *intent-level* validation, depending on how UBL currently enforces auth.

---

## 8) Conformance tests in this UBL repo

UBL already has `test:compliance` and uses Node’s test runner (`node --test ...`).  
Add tests under `tests/business/compliance/`:

### ADD: `tests/business/compliance/tdln-hash-profile.test.ts`
- parses a small SemanticUnit fixture
- checks `TDLN_HASH_PROFILE_0` hash recomputation
- checks mismatch path produces `UBL_ERR_TDLN_HASH_MISMATCH`

### ADD: `tests/business/compliance/pactum-fixtures/*.test.ts`
- vendor Pactum fixtures (case1…case11) into `tests/fixtures/pactum/...`
- verify:
  - state/outputs/trace match
  - receipt hashes recompute
  - negative tests match stable `PCT_ERR_*` tokens

### ADD: `tests/business/compliance/ubl-host-anchoring.test.ts`
- propose agreement with TDLN clauses
- activate agreement (hooks deploy pact)
- submit envelope via intent
- assert ledger contains:
  - `PactumPactDeployed` with `pact_hash`
  - `PactumStepCommitted` with valid receipt hash chain

---

## 9) “Chip as text” (optional integration; no execution dependency)

### ADD: `core/tdln_chip/` (optional)
- `materialize.ts` — takes SemanticUnits + pact and emits `chip_ir.txt`
- `hash.ts` — `hash_json("tdln:chip_ir:0", ...)`

### MODIFY: (optional) activation hook / intent
- on deploy or on first execution, record a `EvidenceRef { kind:"hash", uri:"tdln-chip:ir", hash: chip_ir_hash }`

**Important invariant:** chip artifacts are evidence/optimization. They must never change protocol truth.

---

## 10) File-by-file checklist (quick)

**ADD**
- `core/tdln/*`
- `core/pactum/*`
- `core/api/intents/pactum-intents.ts` (optional)
- `tests/business/compliance/*` conformance tests
- `tests/fixtures/pactum/*` fixtures (vendored)

**MODIFY**
- `package.json` (+ lock)
- `core/universal/agreement-types.ts`
- `core/universal/agreement-hooks-processor.ts`
- `core/schema/ledger.ts`
- `core/aggregates/rehydrators.ts`
- `core/api/intents/index.ts` (if adding intents)
- `core/security/*` (auth checks, if desired)

---

## 11) Proof of Done (practical)

1) `npm test` passes:
- TDLN hash profile test
- Pactum fixture parity tests (positive + negative)
- Host anchoring test

2) A full flow works:
- `propose` Agreement with `tdln.semantic_unit` clauses and purposes
- `activate` triggers `ValidateTDLNClauses` + `DeployPactumRiskPactV0_2`
- `pactum:submit-envelope` produces a committed receipt
- Ledger rehydration shows `agreementState.pactum.last_receipt_hash`

---

## 12) Notes on “not forcing the chip”

This integration treats **TDLN-Chip as optional**:
- default execution is software (deterministic kernel),
- chip artifacts are text evidence (`chip_ir.txt`) + hashes,
- chip backend is only valid if it reproduces identical receipts/hashes.

That way, the system is **already complete without hardware**, and hardware is a *plug-in optimization*.

