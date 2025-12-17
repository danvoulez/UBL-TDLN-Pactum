-- =============================================================================
-- TEMPORAL LEDGER - PostgreSQL Schema
-- =============================================================================
-- An append-only event store with cryptographic integrity.
-- Designed for immutability, auditability, and temporal queries.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Cryptographic functions

-- =============================================================================
-- CORE EVENT STORE
-- =============================================================================

-- The immutable event log - the single source of truth
CREATE TABLE events (
    -- Identity
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence        BIGSERIAL UNIQUE NOT NULL,  -- Monotonic, gapless
    
    -- Temporal
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Event classification
    event_type      TEXT NOT NULL,
    
    -- Aggregate reference
    aggregate_id    TEXT NOT NULL,  -- Changed from UUID to TEXT to support custom IDs (ent-xxx, agr-xxx, etc.)
    aggregate_type  TEXT NOT NULL,  -- No constraint - allow any aggregate type
    aggregate_version INT NOT NULL,
    
    -- Event payload (JSONB for queryability)
    payload         JSONB NOT NULL,
    
    -- Causation chain
    command_id      UUID,                       -- What command triggered this
    correlation_id  UUID,                       -- Parent event for chains
    workflow_id     UUID,                       -- Workflow instance if applicable
    
    -- Actor (who/what performed the action)
    actor_type      TEXT NOT NULL CHECK (actor_type IN ('Party', 'Entity', 'System', 'Workflow', 'Anonymous')),
    actor_id        TEXT,                       -- Party ID, System ID, or Workflow ID
    actor_reason    TEXT,                       -- For anonymous: reason
    
    -- Integrity chain
    previous_hash   TEXT NOT NULL,              -- Hash of previous event
    hash            TEXT NOT NULL,              -- SHA-256 of this event
    
    -- Optional cryptographic signature
    signature       TEXT,
    signer_id       UUID,
    
    -- Metadata
    metadata        JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT unique_aggregate_version UNIQUE (aggregate_type, aggregate_id, aggregate_version),
    CONSTRAINT valid_hash_format CHECK (hash ~ '^sha256:[a-f0-9]+$')
);

-- Indexes for common query patterns
CREATE INDEX idx_events_aggregate ON events (aggregate_type, aggregate_id, aggregate_version);
CREATE INDEX idx_events_type ON events (event_type);
CREATE INDEX idx_events_timestamp ON events (timestamp);
CREATE INDEX idx_events_actor ON events (actor_type, actor_id);
CREATE INDEX idx_events_correlation ON events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_events_workflow ON events (workflow_id) WHERE workflow_id IS NOT NULL;

-- Payload JSONB indexes for common queries
CREATE INDEX idx_events_payload ON events USING GIN (payload jsonb_path_ops);

-- =============================================================================
-- APPEND-ONLY ENFORCEMENT
-- =============================================================================

-- Prevent updates to events (immutability)
CREATE OR REPLACE FUNCTION prevent_event_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Events are immutable and cannot be modified. Event ID: %', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_event_immutability
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_event_modification();

-- Prevent deletion of events (append-only)
CREATE OR REPLACE FUNCTION prevent_event_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Events cannot be deleted. The ledger is append-only. Event ID: %', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_append_only
    BEFORE DELETE ON events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_event_deletion();

-- =============================================================================
-- HASH CHAIN INTEGRITY
-- =============================================================================

-- Verify hash chain on insert
CREATE OR REPLACE FUNCTION verify_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    last_event RECORD;
    expected_prev_hash TEXT;
    computed_hash TEXT;
    canonical_json TEXT;
BEGIN
    -- Get the last event
    SELECT hash INTO expected_prev_hash
    FROM events
    ORDER BY sequence DESC
    LIMIT 1;
    
    -- If this is the first event, previous_hash should be 'genesis'
    IF expected_prev_hash IS NULL THEN
        expected_prev_hash := 'genesis';
    END IF;
    
    -- Verify previous_hash matches
    IF NEW.previous_hash != expected_prev_hash THEN
        RAISE EXCEPTION 'Hash chain broken. Expected previous_hash: %, got: %',
            expected_prev_hash, NEW.previous_hash;
    END IF;
    
    -- Compute and verify hash (simplified - in production, use proper canonical JSON)
    canonical_json := json_build_object(
        'id', NEW.id,
        'sequence', NEW.sequence,
        'timestamp', NEW.timestamp,
        'event_type', NEW.event_type,
        'aggregate_id', NEW.aggregate_id,
        'aggregate_type', NEW.aggregate_type,
        'aggregate_version', NEW.aggregate_version,
        'payload', NEW.payload,
        'actor_type', NEW.actor_type,
        'actor_id', NEW.actor_id,
        'previous_hash', NEW.previous_hash
    )::text;
    
    computed_hash := 'sha256:' || encode(digest(canonical_json, 'sha256'), 'hex');
    
    -- Verify hash matches
    IF NEW.hash != computed_hash THEN
        RAISE EXCEPTION 'Invalid hash. Computed: %, provided: %', computed_hash, NEW.hash;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verify_hash_chain_on_insert
    BEFORE INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION verify_hash_chain();

-- =============================================================================
-- AGGREGATE VERSION ENFORCEMENT
-- =============================================================================

-- Ensure aggregate versions are sequential
CREATE OR REPLACE FUNCTION verify_aggregate_version()
RETURNS TRIGGER AS $$
DECLARE
    expected_version INT;
BEGIN
    -- Get current max version for this aggregate
    SELECT COALESCE(MAX(aggregate_version), 0) + 1 INTO expected_version
    FROM events
    WHERE aggregate_type = NEW.aggregate_type
      AND aggregate_id = NEW.aggregate_id;
    
    IF NEW.aggregate_version != expected_version THEN
        RAISE EXCEPTION 'Optimistic concurrency violation. Expected version: %, got: %',
            expected_version, NEW.aggregate_version;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verify_aggregate_version_on_insert
    BEFORE INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION verify_aggregate_version();

-- =============================================================================
-- SNAPSHOTS (Performance optimization for long event streams)
-- =============================================================================

CREATE TABLE snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type  TEXT NOT NULL,
    aggregate_id    TEXT NOT NULL,  -- Changed from UUID to TEXT to support custom IDs
    version         INT NOT NULL,
    state           JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_sequence  BIGINT NOT NULL REFERENCES events(sequence),
    
    CONSTRAINT unique_snapshot UNIQUE (aggregate_type, aggregate_id, version)
);

CREATE INDEX idx_snapshots_aggregate ON snapshots (aggregate_type, aggregate_id, version DESC);

-- =============================================================================
-- PROJECTIONS (Read models)
-- =============================================================================

-- Projection checkpoints - track which events have been processed
CREATE TABLE projection_checkpoints (
    projection_name TEXT PRIMARY KEY,
    last_sequence   BIGINT NOT NULL DEFAULT 0,
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'rebuilding', 'error')),
    error_message   TEXT
);

-- =============================================================================
-- PARTY PROJECTION (Current state view)
-- =============================================================================

CREATE TABLE parties_projection (
    id              TEXT PRIMARY KEY,
    party_type      TEXT NOT NULL CHECK (party_type IN ('Person', 'Organization', 'System', 'Witness')),
    name            TEXT NOT NULL,
    identifiers     JSONB NOT NULL DEFAULT '[]'::jsonb,
    contacts        JSONB NOT NULL DEFAULT '[]'::jsonb,
    status          TEXT NOT NULL DEFAULT 'Active',
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         INT NOT NULL,
    
    -- Denormalized for queries
    active_roles    JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_parties_name ON parties_projection USING GIN (to_tsvector('simple', name));
CREATE INDEX idx_parties_type ON parties_projection (party_type);
CREATE INDEX idx_parties_identifiers ON parties_projection USING GIN (identifiers jsonb_path_ops);

-- =============================================================================
-- ASSET PROJECTION
-- =============================================================================

CREATE TABLE assets_projection (
    id              TEXT PRIMARY KEY,
    asset_type      TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('Created', 'InStock', 'Reserved', 'Sold', 'Transferred', 'Consumed', 'Destroyed')),
    owner_id        TEXT,
    custodian_id    TEXT,
    properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
    quantity_amount NUMERIC,
    quantity_unit   TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         INT NOT NULL
);

CREATE INDEX idx_assets_type ON assets_projection (asset_type);
CREATE INDEX idx_assets_status ON assets_projection (status);
CREATE INDEX idx_assets_owner ON assets_projection (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_assets_properties ON assets_projection USING GIN (properties jsonb_path_ops);

-- =============================================================================
-- AGREEMENT PROJECTION
-- =============================================================================

CREATE TABLE agreements_projection (
    id              TEXT PRIMARY KEY,
    agreement_type  TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('Draft', 'Proposed', 'UnderReview', 'Accepted', 'Active', 'Fulfilled', 'Breached', 'Terminated', 'Expired')),
    parties         JSONB NOT NULL DEFAULT '[]'::jsonb,
    terms           JSONB NOT NULL DEFAULT '{}'::jsonb,
    assets          JSONB NOT NULL DEFAULT '[]'::jsonb,
    parent_id       TEXT,
    effective_from  TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         INT NOT NULL
);

CREATE INDEX idx_agreements_type ON agreements_projection (agreement_type);
CREATE INDEX idx_agreements_status ON agreements_projection (status);
CREATE INDEX idx_agreements_parties ON agreements_projection USING GIN (parties jsonb_path_ops);
CREATE INDEX idx_agreements_effective ON agreements_projection (effective_from, effective_until);

-- =============================================================================
-- ROLE PROJECTION
-- =============================================================================

CREATE TABLE roles_projection (
    id              TEXT PRIMARY KEY,
    role_type       TEXT NOT NULL,
    holder_id       TEXT NOT NULL,
    context_type    TEXT NOT NULL,
    context_id      TEXT,
    established_by  TEXT NOT NULL,  -- Agreement ID
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_until     TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         INT NOT NULL
);

CREATE INDEX idx_roles_holder ON roles_projection (holder_id);
CREATE INDEX idx_roles_type ON roles_projection (role_type);
CREATE INDEX idx_roles_active ON roles_projection (is_active) WHERE is_active = true;
CREATE INDEX idx_roles_context ON roles_projection (context_type, context_id);

-- =============================================================================
-- WORKFLOW PROJECTION
-- =============================================================================

CREATE TABLE workflows_projection (
    id                  TEXT PRIMARY KEY,
    definition_id       TEXT NOT NULL,
    definition_version  INT NOT NULL,
    target_type         TEXT NOT NULL,
    target_id           TEXT NOT NULL,
    current_state       TEXT NOT NULL,
    is_complete         BOOLEAN NOT NULL DEFAULT false,
    completed_at        TIMESTAMPTZ,
    context             JSONB NOT NULL DEFAULT '{}'::jsonb,
    history             JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL,
    version             INT NOT NULL
);

CREATE INDEX idx_workflows_target ON workflows_projection (target_type, target_id);
CREATE INDEX idx_workflows_state ON workflows_projection (current_state);
CREATE INDEX idx_workflows_active ON workflows_projection (is_complete) WHERE is_complete = false;

-- =============================================================================
-- WORKSPACE PROJECTION (Read-optimized view for workspaces)
-- =============================================================================

CREATE TABLE workspace_projection (
    id                  TEXT PRIMARY KEY,
    realm_id            TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    runtime             TEXT NOT NULL,
    resources           JSONB NOT NULL DEFAULT '{}'::jsonb,
    status              TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Archived')),
    version             BIGINT NOT NULL,
    created_at          BIGINT NOT NULL,
    created_by          JSONB NOT NULL,
    last_activity_at    BIGINT NOT NULL,
    repositories        JSONB DEFAULT '[]'::jsonb,
    files               JSONB DEFAULT '[]'::jsonb,
    functions           UUID[] DEFAULT ARRAY[]::UUID[],
    updated_at          BIGINT NOT NULL
);

CREATE INDEX idx_workspace_projection_realm ON workspace_projection(realm_id);
CREATE INDEX idx_workspace_projection_status ON workspace_projection(status);
CREATE INDEX idx_workspace_projection_name ON workspace_projection USING GIN (to_tsvector('simple', name));
CREATE INDEX idx_workspace_projection_files ON workspace_projection USING GIN (files jsonb_path_ops);
CREATE INDEX idx_workspace_projection_functions ON workspace_projection USING GIN (functions);

-- =============================================================================
-- TEMPORAL QUERIES - Point-in-time reconstruction
-- =============================================================================

-- Get aggregate state at a specific point in time
CREATE OR REPLACE FUNCTION get_events_at_time(
    p_aggregate_type TEXT,
    p_aggregate_id TEXT,
    p_at_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS SETOF events AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM events
    WHERE aggregate_type = p_aggregate_type
      AND aggregate_id = p_aggregate_id
      AND timestamp <= p_at_time
    ORDER BY aggregate_version ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get aggregate state at a specific version
CREATE OR REPLACE FUNCTION get_events_at_version(
    p_aggregate_type TEXT,
    p_aggregate_id TEXT,
    p_version INT
)
RETURNS SETOF events AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM events
    WHERE aggregate_type = p_aggregate_type
      AND aggregate_id = p_aggregate_id
      AND aggregate_version <= p_version
    ORDER BY aggregate_version ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- AUDIT QUERIES
-- =============================================================================

-- Get audit trail for an aggregate
CREATE OR REPLACE FUNCTION get_audit_trail(
    p_aggregate_type TEXT,
    p_aggregate_id TEXT,
    p_from_time TIMESTAMPTZ DEFAULT NULL,
    p_to_time TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    event_id UUID,
    sequence BIGINT,
    timestamp TIMESTAMPTZ,
    event_type TEXT,
    actor_type TEXT,
    actor_id TEXT,
    payload JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.sequence,
        e.timestamp,
        e.event_type,
        e.actor_type,
        e.actor_id,
        e.payload
    FROM events e
    WHERE e.aggregate_type = p_aggregate_type
      AND e.aggregate_id = p_aggregate_id
      AND (p_from_time IS NULL OR e.timestamp >= p_from_time)
      AND (p_to_time IS NULL OR e.timestamp <= p_to_time)
    ORDER BY e.sequence DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get all actions by an actor
CREATE OR REPLACE FUNCTION get_actor_actions(
    p_actor_type TEXT,
    p_actor_id TEXT,
    p_from_time TIMESTAMPTZ DEFAULT NULL,
    p_to_time TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    event_id UUID,
    sequence BIGINT,
    timestamp TIMESTAMPTZ,
    event_type TEXT,
    aggregate_type TEXT,
    aggregate_id TEXT,
    payload JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.sequence,
        e.timestamp,
        e.event_type,
        e.aggregate_type,
        e.aggregate_id,
        e.payload
    FROM events e
    WHERE e.actor_type = p_actor_type
      AND e.actor_id = p_actor_id
      AND (p_from_time IS NULL OR e.timestamp >= p_from_time)
      AND (p_to_time IS NULL OR e.timestamp <= p_to_time)
    ORDER BY e.sequence DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- INTEGRITY VERIFICATION
-- =============================================================================

-- Verify the hash chain integrity
CREATE OR REPLACE FUNCTION verify_chain_integrity(
    p_from_sequence BIGINT DEFAULT 1,
    p_to_sequence BIGINT DEFAULT NULL
)
RETURNS TABLE (
    is_valid BOOLEAN,
    broken_at_sequence BIGINT,
    error_message TEXT
) AS $$
DECLARE
    prev_hash TEXT := 'genesis';
    curr RECORD;
    expected_hash TEXT;
    canonical_json TEXT;
BEGIN
    FOR curr IN
        SELECT *
        FROM events
        WHERE sequence >= p_from_sequence
          AND (p_to_sequence IS NULL OR sequence <= p_to_sequence)
        ORDER BY sequence ASC
    LOOP
        -- Check previous hash link
        IF curr.previous_hash != prev_hash THEN
            RETURN QUERY SELECT
                false,
                curr.sequence,
                format('Chain broken at sequence %s. Expected previous_hash: %s, got: %s',
                       curr.sequence, prev_hash, curr.previous_hash);
            RETURN;
        END IF;
        
        -- Update previous hash for next iteration
        prev_hash := curr.hash;
    END LOOP;
    
    -- Chain is valid
    RETURN QUERY SELECT true, NULL::BIGINT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- NOTIFICATION (for real-time subscriptions)
-- =============================================================================

-- Notify on new events
CREATE OR REPLACE FUNCTION notify_new_event()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'new_event',
        json_build_object(
            'id', NEW.id,
            'sequence', NEW.sequence,
            'event_type', NEW.event_type,
            'aggregate_type', NEW.aggregate_type,
            'aggregate_id', NEW.aggregate_id
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_on_event_insert
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_event();

-- =============================================================================
-- INITIAL GENESIS EVENT
-- =============================================================================

-- Insert genesis event (first event in the chain)
INSERT INTO events (
    id,
    event_type,
    aggregate_id,
    aggregate_type,
    aggregate_version,
    payload,
    actor_type,
    actor_id,
    previous_hash,
    hash
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'GenesisEvent',
    '00000000-0000-0000-0000-000000000000',
    'System',
    1,
    '{"message": "In the beginning was the Event, and the Event was with the Ledger, and the Event was the Ledger."}'::jsonb,
    'System',
    'genesis',
    'genesis',
    'sha256:' || encode(digest('genesis', 'sha256'), 'hex')
);

-- Initialize projection checkpoints
INSERT INTO projection_checkpoints (projection_name, last_sequence) VALUES
    ('parties', 1),
    ('assets', 1),
    ('agreements', 1),
    ('roles', 1),
    ('workflows', 1),
    ('workspaces', 1);

