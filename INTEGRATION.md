# INTEGRATION.md — TDLN-native Clauses + Pactum Kernel + “Chip as Text” (v0.1)

This document defines the **TDLN integration contract** for a UBL host that:
- stores clauses as **TDLN SemanticUnits** (JSON),
- compiles deterministic executable terms into **Pactum**,
- optionally emits **TDLN-Chip** materialization artifacts as **text**, without changing protocol truth.

> **The best “chip” is still a text file.**  
> Hardware acceleration is an optimization layer, never a source of truth.

---

## 0. Normativity and Authority

Three layers exist; do not conflate them:

1) **Pactum SPECIFICATION (RiskPact V0.2)** — normative for `pact/state/envelope/receipt/trace`.
2) **This Integration Spec** — normative for:
   - SemanticUnit minimal contract used by the host
   - host-side TDLN hashing profile (until official TDLN hashing is vendored)
   - materialization artifacts (“chip as text”) and their anchoring
3) **UBL–TDLN–PACTUM PROFILE** — normative for UBL schema usage, hooks, compilation rules, receipt anchoring.

If this doc conflicts with Pactum artifacts, Pactum spec wins for those artifacts.

---

## 1. SemanticUnit Minimal Contract (Host-Required)

The host does not need the full TDLN surface. It needs a minimal, strict contract to ensure:
- canonical hashing,
- deterministic extraction of executable parameters,
- optional materialization hints.

### 1.1 Required fields
A SemanticUnit MUST contain:

- `tdln_spec_version: "2.0.0"` (or compatible supported version)
- `node_type: "semantic_unit"`
- `id: string` (stable identifier for referencing)
- `hash: string` (canonical digest in accepted format)
- `body: object` (semantics + anchors)
- `meta: object` (optional but recommended)

### 1.2 Hash algorithm declaration (recommended)
SemanticUnits SHOULD declare:

- `meta.hash_alg: "blake3"`
- `meta.hash_profile: "TDLN_HASH_PROFILE_0"` (see §2)

If present and unsupported, the host MUST reject the unit with:
- `UBL_ERR_TDLN_UNSUPPORTED_HASH_PROFILE`

---

## 2. Canonical Hashing Profile (Host-Side)

Until the repo vendors the official TDLN hashing algorithm verbatim, the host uses a **versioned hashing profile**.

### 2.1 Profile name
- `TDLN_HASH_PROFILE_0`

### 2.2 Canonicalization rules (normative for this profile)
To compute a SemanticUnit hash:

1. Create `unit_for_hash` from the parsed SemanticUnit.
2. Remove `hash` itself from `unit_for_hash` (to avoid circularity).
3. Canonicalize JSON:
   - Objects: keys sorted lexicographically (byte order of UTF-8 codepoints)
   - Arrays: preserve order
   - No whitespace
   - UTF-8 encoding
4. Compute `BLAKE3(canonical_bytes)`.
5. Encode as: `blake3:<lowercase_hex>`.

### 2.3 Verification rule (normative)
The host MUST recompute the hash under `TDLN_HASH_PROFILE_0` and verify it matches:
- `semanticUnit.hash`, and
- `clause.conditions.tdln_hash` (if present)

On mismatch:
- `UBL_ERR_TDLN_HASH_MISMATCH`

### 2.4 Migration policy
If/when the official TDLN hash spec is vendored:
- introduce `TDLN_HASH_PROFILE_1`,
- allow agreements to declare which profile they use,
- never silently reinterpret old hashes.

---

## 3. Anchors Contract (Executable Parameters)

### 3.1 The rule: anchors are executable, everything else is meaning (normative)
For Pactum compilation in this repo, executable parameters MUST come only from:

- `semanticUnit.body.anchors`

Everything outside `body.anchors` is treated as meaning/provenance and MUST NOT affect executable compilation.

### 3.2 Required anchors (RiskPact V0.2 compiler)
For `pactum-riskpact/0.2`, the compiler requires:

- `metric_id: string`
- `threshold_z: uint-string`
- `duration_d: uint-string`
- `cap_q: uint-string`

Optional (if not sourced elsewhere):
- `oracle_quorum_clock: uint-string`
- `oracle_quorum_metric: uint-string`

If required anchors are missing or invalid:
- `UBL_ERR_TDLN_UNSUPPORTED_EXTRACTION`

### 3.3 Anchor typing rules (recommended)
- All numeric values MUST be **strings** that satisfy Pactum `uint` rules (no leading zeros unless `"0"`).
- Units MUST be explicit in anchor naming or meta (e.g., `duration_d_ms` vs `duration_d`).

---

## 4. Purpose Registry (Clause Semantics)

SemanticUnits SHOULD declare a purpose in either:
- `clause.conditions.purpose`, or
- `semanticUnit.meta.purpose`

Required purposes for RiskPact:
- `riskpact.metric_rule`
- `riskpact.breach_rule`
- `riskpact.settlement_rule`

Missing required purposes:
- `UBL_ERR_TDLN_MISSING_PURPOSE`

---

## 5. Deterministic Extraction Interface

### 5.1 Extraction API (recommended)
The compiler should expose a strict extraction function:

- `extractRiskPactAnchors(semanticUnit) -> Anchors`

where `Anchors` is the validated object from `body.anchors`.

### 5.2 No interpretation rule
Extraction MUST NOT:
- evaluate semantic graphs,
- run inference,
- depend on external data,
- depend on field ordering.

It is a deterministic read of a declared anchor map.

---

## 6. Linking Meaning to Execution

A compiled Pactum `pact.json` SHOULD embed TDLN hashes:

```json
{
  "tdln": {
    "metric_rule_hash": "blake3:...",
    "breach_rule_hash": "blake3:...",
    "settlement_rule_hash": "blake3:..."
  }
}
```

This creates a cryptographic binding between:
- the “meaning artifacts” (SemanticUnits)
- the “execution artifact” (Pactum pact)

---

## 7. TDLN-Chip: Materialization as Text (Optional)

### 7.1 What “chip” means here
A “chip backend” is any acceleration path that preserves semantics and determinism. In this integration, the canonical representation is a **textual IR**.

### 7.2 Chip IR artifact (recommended)
The host MAY emit:

- `chip_ir.txt` (or `chip_ir.json`)
- derived deterministically from:
  - the SemanticUnit(s), and/or
  - the compiled Pactum pact
- hashed as:
  - `chip_ir_hash = hash_json("tdln:chip_ir:0", chip_ir_text_or_json)`

The host SHOULD anchor this as evidence:
- `EvidenceRef { kind: "hash", uri: "tdln-chip:ir", hash: chip_ir_hash }`

### 7.3 Backend parity requirement (normative)
If a chip backend executes Pactum steps, it MUST produce identical:
- `state1`, `outputs`, `trace`, and all receipt hashes
to the software backend for the same inputs.

If not, it is non-conformant for this protocol version.

---

## 8. Stable Error Tokens (Recommended)

UBL-side:
- `UBL_ERR_TDLN_INVALID`
- `UBL_ERR_TDLN_HASH_MISMATCH`
- `UBL_ERR_TDLN_MISSING_PURPOSE`
- `UBL_ERR_TDLN_UNSUPPORTED_EXTRACTION`
- `UBL_ERR_TDLN_UNSUPPORTED_HASH_PROFILE`

Pactum-side:
- `PCT_ERR_*` (see Pactum spec / conformance)

---

## 9. Minimal Implementation Checklist

1. Parse + validate SemanticUnit required fields
2. Implement `TDLN_HASH_PROFILE_0` hashing and verification
3. Enforce purposes for `pactum-riskpact/0.2`
4. Enforce anchors contract (anchors-only executable parameters)
5. Embed SemanticUnit hashes into compiled `pact.json`
6. Optional: emit `chip_ir.txt` evidence (text-first chip)

