# UBL–TDLN–PACTUM PROFILE v0.1

This profile defines how **UBL Agreements** host **TDLN-native clauses** and how those clauses are **materialized into Pactum** (deterministic executable kernel + receipts) while preserving UBL’s governance, identity, and evidence model.

This document is the **host contract**. It specifies:
- how UBL stores/validates TDLN clauses,
- how UBL compiles Agreements into Pactum `pact.json`,
- how UBL anchors Pactum receipts back into the ledger.

---

## 0. Normativity and Authority

Three layers exist; do not conflate them:

1) **Pactum SPECIFICATION (RiskPact V0.2)** — *normative* for:
   - canonicalization and domain tags
   - signature message format
   - state transition semantics
   - trace shape (when marked normative)
   - receipt field meanings + hash recomputation rules

2) **TDLN Integration Spec (this repo’s `INTEGRATION.md`)** — *normative* for:
   - SemanticUnit minimal contract
   - host-side TDLN hashing profile (until official TDLN hash is vendored)
   - “chip as text” materialization artifacts and their hashing/anchoring

3) **This Profile** — *normative* for:
   - UBL schema usage (clauses/events/evidence)
   - validation gates at Agreement creation/activation
   - compilation inputs and determinism constraints
   - how Pactum receipts are stored and rehydrated inside UBL

If this profile conflicts with Pactum artifacts (`pact.json`, `state.json`, `envelope.json`, receipt/trace), **Pactum spec wins** for those artifacts.

---

## 1. Goals

### 1.1 Primary goals
- **TDLN-native clauses:** Agreement terms are already `.tdln` SemanticUnits (JSON).
- **Deterministic compilation:** Agreement → Pactum `pact.json` is deterministic and yields a stable `pact_hash`.
- **Verifiable execution:** envelopes produce receipts; receipts are anchored in UBL ledger events/evidence.
- **Adoptable:** no breaking changes to UBL schema required for V0.1.

### 1.2 Non-goals (V0.1)
- General “document UBL” support (Invoice/Order/etc.).
- ZK proofs.
- Oracle-set rotation.

---

## 2. UBL Surfaces Used (No schema break)

This profile reuses existing UBL surfaces:

- `AgreementCreated.terms.clauses[]` shape (as currently modeled):
  - `id: string`
  - `type: string`
  - `content: string`  (UTF-8 JSON)
  - `conditions?: Record<string, unknown>` (metadata + hints)

- Agreement lifecycle hooks:
  - activation hooks (recommended) for validation + deployment

- Evidence storage (recommended):
  - store hashes/URIs for Pactum + TDLN artifacts

---

## 3. Clause Contract: TDLN SemanticUnit in UBL

### 3.1 Clause typing (normative)
TDLN clauses MUST use:
- `clause.type = "tdln.semantic_unit"`

### 3.2 Clause content (normative)
`clause.content` MUST be a UTF-8 string containing JSON that parses to a **TDLN SemanticUnit**.

### 3.3 Clause metadata (recommended)
`clause.conditions` SHOULD include:

```json
{
  "tdln_spec_version": "2.0.0",
  "tdln_node_type": "semantic_unit",
  "tdln_id": "su_...",
  "tdln_hash": "blake3:<64hex>",
  "purpose": "riskpact.metric_rule | riskpact.breach_rule | riskpact.settlement_rule",
  "compiler": "ubl-tdln-pactum-profile/0.1",
  "materialization": {
    "preferred": "software | chip",
    "chip_profile": "tdln-chip/v0",
    "hot_path": true
  }
}
```

Notes:
- `tdln_node_type` lives in `conditions`. Inside the SemanticUnit JSON, use `node_type`.

### 3.4 Clause validation gate (normative)
At Agreement creation or activation (choose at least activation), the host MUST:

1. Parse `clause.content` as JSON.
2. Validate the minimal SemanticUnit contract (see `INTEGRATION.md`).
3. Recompute the SemanticUnit hash using the host’s **TDLN hashing profile** and verify:
   - `semanticUnit.hash` matches recomputation, and
   - `conditions.tdln_hash` (if present) matches `semanticUnit.hash`.
4. Validate `purpose` presence for agreement type requirements (see §4.3).

On failure, the host MUST fail activation with stable UBL tokens:
- `UBL_ERR_TDLN_INVALID`
- `UBL_ERR_TDLN_HASH_MISMATCH`
- `UBL_ERR_TDLN_MISSING_PURPOSE`

---

## 4. Agreement Type: Pactum RiskPact V0.2

### 4.1 Agreement type identifier (normative)
Define a UBL AgreementType:
- `agreementType = "pactum-riskpact/0.2"`

### 4.2 Required roles (normative)
The AgreementType MUST bind these roles:
- `party.a` (collateral poster)
- `party.b` (claimant)
- `oracle.clock[]`
- `oracle.metric[]`

Bindings MUST resolve to Pactum-compatible Ed25519 public keys.

### 4.3 Required clause purposes (normative)
A `pactum-riskpact/0.2` Agreement MUST include SemanticUnits with purposes:

- `riskpact.metric_rule`
- `riskpact.breach_rule`
- `riskpact.settlement_rule`

Optional:
- `riskpact.oracle_policy`
- `riskpact.dispute_policy`

---

## 5. Deterministic Extraction Rule (TDLN → Executable Terms)

### 5.1 “Anchors-only” rule for executable parameters (normative)
For **RiskPact compilation**, the compiler MUST read executable numeric parameters **only** from:

- `semanticUnit.body.anchors.*`

Everything outside `body.anchors` is treated as **non-executable meaning** (provenance, narrative, derived explanation, etc.).

If required anchors are missing or not parseable as Pactum `uint` strings, compilation MUST fail with:
- `UBL_ERR_TDLN_UNSUPPORTED_EXTRACTION`

---

## 6. Deterministic Compilation: Agreement → Pactum `pact.json`

### 6.1 Outputs
Compilation produces:
- `pact.json` (Pactum IR)
- `pact_hash = hash_json("pactum:pact:0", pact.json)` (per Pactum)

### 6.2 Allowed inputs (normative)
The compiler MUST use only:
- Agreement roles + resolved public keys
- SemanticUnit anchors (validated)
- explicit versioned defaults

The compiler MUST NOT depend on:
- wall-clock time
- randomness
- storage insertion order
- non-canonical JSON serialization

### 6.3 Recommended Pact metadata (meaning ↔ execution link)
Include the TDLN hashes inside `pact.json` metadata:

```json
{
  "tdln": {
    "metric_rule_hash": "blake3:...",
    "breach_rule_hash": "blake3:...",
    "settlement_rule_hash": "blake3:..."
  }
}
```

This binds the executable pact to the meaning artifacts without requiring a TDLN evaluator at runtime.

---

## 7. Execution: Pactum inside UBL

### 7.1 Envelope submission
UBL-side intent/events are converted into Pactum `envelope.json` containing:
- `clock_event`
- `metric_event`
- `collateral_post`
- `claim_request`

The host MUST preserve Pactum rules:
- signature verification
- allowlists per oracle class
- party auth for party events
- hardening: `oracle_id == signer_pub` for oracle events

### 7.2 Anchoring receipts in UBL (normative)
On executing `step_risk_pact_v0_2(pact, state0, envelope)`, the host MUST record evidence sufficient to:
- prove which `pact_hash` was used
- prove which `envelope_hash` was applied
- prove which `receipt_hash` was produced (or store full receipt)

Recommended UBL ledger events (profile-defined):
- `PactumPactDeployed { agreementId, pact_hash, pact_json? }`
- `PactumEnvelopeSubmitted { agreementId, envelope_hash, envelope_json? }`
- `PactumStepCommitted { agreementId, receipt, receipt_hash?, state_hashes, outputs_hash, trace_hash }`
- `PactumStepRejected { agreementId, envelope_hash, error_token }`

### 7.3 Rehydration rule (normative)
A Pactum-enabled Agreement’s canonical execution state MUST be derivable from:
- `pact_hash`
- the latest committed receipt (or receipt chain)
- optional replay of envelopes (light clients may store only hash chain)

---

## 8. TDLN-Chip: “Chip as Text” (optional, non-authoritative)

### 8.1 The principle
Chip acceleration is never the source of truth. The canonical chip is a **text artifact**.

### 8.2 Chip artifact
A host MAY emit a chip IR artifact (text) derived deterministically from SemanticUnits and/or `pact.json`:

- `chip_ir.txt` (or `chip_ir.json`)
- `chip_ir_hash = hash_json("tdln:chip_ir:0", chip_ir_text_or_json)`

This artifact SHOULD be anchored as EvidenceRef (or an equivalent ledger event).

### 8.3 Backend parity requirement
If a chip backend is used, it MUST produce identical:
- `state1`, `outputs`, `trace`, and receipt hashes
to the software backend for the same inputs. Otherwise it is non-conformant.

---

## 9. Conformance

See `CONFORMANCE.md` for:
- Pactum kernel conformance (fixtures cases)
- UBL-host conformance for compilation + anchoring
- negative tests via stable tokens

---

## 10. Versioning Policy

Any change that affects:
- SemanticUnit hash profile
- anchors contract
- compilation mapping to `pact.json`
- ledger event anchoring semantics
must bump the profile version and add/extend conformance fixtures.

