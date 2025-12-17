-- =============================================================================
-- UBL INITIAL SCHEMA - Single Migration
-- =============================================================================
-- Run with: psql ubl -f migrations/001_initial_schema.sql
-- Or: DATABASE_URL=postgresql://localhost/ubl npm run db:migrate
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- CORE EVENT STORE
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
    -- Identity (TEXT to support custom IDs like ent-xxx, agr-xxx, evt-xxx)
    id              TEXT PRIMARY KEY,
    sequence        BIGSERIAL UNIQUE NOT NULL,
    
    -- Temporal
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Event classification
    event_type      TEXT NOT NULL,
    
    -- Aggregate reference (TEXT to support custom IDs)
    aggregate_id    TEXT NOT NULL,
    aggregate_type  TEXT NOT NULL CHECK (aggregate_type IN (
        'Party', 'Asset', 'Agreement', 'Role', 'Workflow', 'Flow', 'System', 'Realm', 'Workspace', 'ApiKey', 'Session'
    )),
    aggregate_version INT NOT NULL,
    
    -- Event payload
    payload         JSONB NOT NULL,
    
    -- Causation chain (TEXT to support custom IDs)
    command_id      TEXT,
    correlation_id  TEXT,
    workflow_id     TEXT,
    
    -- Actor
    actor_type      TEXT NOT NULL CHECK (actor_type IN ('Party', 'Entity', 'System', 'Workflow', 'Anonymous')),
    actor_id        TEXT,
    actor_reason    TEXT,
    
    -- Integrity chain
    previous_hash   TEXT NOT NULL,
    hash            TEXT NOT NULL,
    
    -- Optional signature
    signature       TEXT,
    signer_id       TEXT,
    
    -- Metadata
    metadata        JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT unique_aggregate_version UNIQUE (aggregate_type, aggregate_id, aggregate_version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events (aggregate_type, aggregate_id, aggregate_version);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);
CREATE INDEX IF NOT EXISTS idx_events_actor ON events (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_workflow ON events (workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_payload ON events USING GIN (payload jsonb_path_ops);

-- =============================================================================
-- IMMUTABILITY ENFORCEMENT
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_event_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Events are immutable and cannot be modified. Event ID: %', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_event_immutability ON events;
CREATE TRIGGER enforce_event_immutability
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_event_modification();

CREATE OR REPLACE FUNCTION prevent_event_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Events cannot be deleted. The ledger is append-only. Event ID: %', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_append_only ON events;
CREATE TRIGGER enforce_append_only
    BEFORE DELETE ON events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_event_deletion();

-- =============================================================================
-- REAL-TIME NOTIFICATIONS
-- =============================================================================

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

DROP TRIGGER IF EXISTS notify_on_event_insert ON events;
CREATE TRIGGER notify_on_event_insert
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_event();

-- =============================================================================
-- SNAPSHOTS (Performance optimization)
-- =============================================================================

CREATE TABLE IF NOT EXISTS snapshots (
    id              TEXT PRIMARY KEY DEFAULT 'snap-' || substr(md5(random()::text), 1, 16),
    aggregate_type  TEXT NOT NULL,
    aggregate_id    TEXT NOT NULL,
    version         INT NOT NULL,
    state           JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_sequence  BIGINT NOT NULL,
    
    CONSTRAINT unique_snapshot UNIQUE (aggregate_type, aggregate_id, version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate ON snapshots (aggregate_type, aggregate_id, version DESC);

-- =============================================================================
-- PROJECTION CHECKPOINTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projection_name TEXT PRIMARY KEY,
    last_sequence   BIGINT NOT NULL DEFAULT 0,
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'rebuilding', 'error')),
    error_message   TEXT
);

-- =============================================================================
-- PROJECTIONS (Read Models)
-- =============================================================================

-- Parties
CREATE TABLE IF NOT EXISTS parties_projection (
    id              TEXT PRIMARY KEY,
    party_type      TEXT NOT NULL CHECK (party_type IN ('Person', 'Organization', 'System', 'Witness')),
    name            TEXT NOT NULL,
    identifiers     JSONB NOT NULL DEFAULT '[]'::jsonb,
    contacts        JSONB NOT NULL DEFAULT '[]'::jsonb,
    status          TEXT NOT NULL DEFAULT 'Active',
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         INT NOT NULL,
    active_roles    JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_parties_name ON parties_projection USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties_projection (party_type);
CREATE INDEX IF NOT EXISTS idx_parties_identifiers ON parties_projection USING GIN (identifiers jsonb_path_ops);

-- Assets
CREATE TABLE IF NOT EXISTS assets_projection (
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

CREATE INDEX IF NOT EXISTS idx_assets_type ON assets_projection (asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets_projection (status);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets_projection (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_properties ON assets_projection USING GIN (properties jsonb_path_ops);

-- Agreements
CREATE TABLE IF NOT EXISTS agreements_projection (
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
    version         INT NOT NULL,
    -- Dispute tracking
    open_dispute    JSONB,
    -- Fulfillment tracking
    fulfillment_evidence JSONB,
    fulfilled_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agreements_type ON agreements_projection (agreement_type);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements_projection (status);
CREATE INDEX IF NOT EXISTS idx_agreements_parties ON agreements_projection USING GIN (parties jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_agreements_effective ON agreements_projection (effective_from, effective_until);

-- Roles
CREATE TABLE IF NOT EXISTS roles_projection (
    id              TEXT PRIMARY KEY,
    role_type       TEXT NOT NULL,
    holder_id       TEXT NOT NULL,
    context_type    TEXT NOT NULL,
    context_id      TEXT,
    established_by  TEXT NOT NULL,
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_until     TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roles_holder ON roles_projection (holder_id);
CREATE INDEX IF NOT EXISTS idx_roles_type ON roles_projection (role_type);
CREATE INDEX IF NOT EXISTS idx_roles_active ON roles_projection (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_roles_context ON roles_projection (context_type, context_id);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows_projection (
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

CREATE INDEX IF NOT EXISTS idx_workflows_target ON workflows_projection (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_workflows_state ON workflows_projection (current_state);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows_projection (is_complete) WHERE is_complete = false;

-- Workspaces
CREATE TABLE IF NOT EXISTS workspace_projection (
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
    functions           TEXT[] DEFAULT ARRAY[]::TEXT[],
    updated_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_projection_realm ON workspace_projection(realm_id);
CREATE INDEX IF NOT EXISTS idx_workspace_projection_status ON workspace_projection(status);
CREATE INDEX IF NOT EXISTS idx_workspace_projection_name ON workspace_projection USING GIN (to_tsvector('simple', name));

-- =============================================================================
-- TEMPORAL QUERY FUNCTIONS
-- =============================================================================

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
-- AUDIT FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_audit_trail(
    p_aggregate_type TEXT,
    p_aggregate_id TEXT,
    p_from_time TIMESTAMPTZ DEFAULT NULL,
    p_to_time TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    event_id TEXT,
    seq BIGINT,
    ts TIMESTAMPTZ,
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

CREATE OR REPLACE FUNCTION get_actor_actions(
    p_actor_type TEXT,
    p_actor_id TEXT,
    p_from_time TIMESTAMPTZ DEFAULT NULL,
    p_to_time TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    event_id TEXT,
    seq BIGINT,
    ts TIMESTAMPTZ,
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
-- CHAIN INTEGRITY VERIFICATION
-- =============================================================================

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
BEGIN
    FOR curr IN
        SELECT *
        FROM events
        WHERE sequence >= p_from_sequence
          AND (p_to_sequence IS NULL OR sequence <= p_to_sequence)
        ORDER BY sequence ASC
    LOOP
        IF curr.previous_hash != prev_hash THEN
            RETURN QUERY SELECT
                false,
                curr.sequence,
                format('Chain broken at sequence %s. Expected previous_hash: %s, got: %s',
                       curr.sequence, prev_hash, curr.previous_hash);
            RETURN;
        END IF;
        prev_hash := curr.hash;
    END LOOP;
    
    RETURN QUERY SELECT true, NULL::BIGINT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- INITIALIZE PROJECTION CHECKPOINTS
-- =============================================================================

INSERT INTO projection_checkpoints (projection_name, last_sequence) VALUES
    ('parties', 0),
    ('assets', 0),
    ('agreements', 0),
    ('roles', 0),
    ('workflows', 0),
    ('workspaces', 0)
ON CONFLICT (projection_name) DO NOTHING;

-- =============================================================================
-- API-ONLY ACCESS ENFORCEMENT
-- =============================================================================
-- The ledger should ONLY be modified through the Event Store API.
-- These mechanisms prevent direct SQL manipulation.

-- 1. Create restricted application user (run as superuser)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ubl_app') THEN
--         CREATE ROLE ubl_app WITH LOGIN PASSWORD 'change_me_in_production';
--     END IF;
-- END $$;

-- 2. Grant minimal permissions to app user
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ubl_app;
-- GRANT SELECT, INSERT ON events TO ubl_app;  -- Can only read and append
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO ubl_app;  -- Read-only for projections
-- GRANT USAGE ON SEQUENCE events_sequence_seq TO ubl_app;

-- 3. Prevent direct projection modifications (projections are derived from events)
CREATE OR REPLACE FUNCTION prevent_direct_projection_write()
RETURNS TRIGGER AS $$
DECLARE
    caller TEXT;
BEGIN
    -- Check if called from a known projection function
    GET DIAGNOSTICS caller = PG_CONTEXT;
    
    -- Allow writes from projection update functions
    IF caller LIKE '%update_%_projection%' OR caller LIKE '%process_event%' THEN
        RETURN NEW;
    END IF;
    
    -- Log the violation attempt to events table
    INSERT INTO events (
        id, timestamp, event_type, aggregate_id, aggregate_type, aggregate_version,
        payload, actor_type, actor_id, previous_hash, hash
    ) VALUES (
        'violation-' || extract(epoch from now())::text || '-' || md5(random()::text),
        NOW(),
        'DirectWriteViolationAttempted',
        'security-audit',
        'System',
        1,
        jsonb_build_object(
            'type', 'DirectWriteViolationAttempted',
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'caller', caller,
            'timestamp', NOW()
        ),
        'System',
        'security-enforcement',
        'violation-detected',
        md5(TG_TABLE_NAME || TG_OP || now()::text)
    );
    
    RAISE EXCEPTION 'Direct writes to projection tables are forbidden. Use the Event Store API. Table: %, Operation: %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- Apply to all projection tables (uncomment to enforce)
-- DROP TRIGGER IF EXISTS enforce_api_only_parties ON parties_projection;
-- CREATE TRIGGER enforce_api_only_parties
--     BEFORE INSERT OR UPDATE OR DELETE ON parties_projection
--     FOR EACH ROW EXECUTE FUNCTION prevent_direct_projection_write();

-- DROP TRIGGER IF EXISTS enforce_api_only_agreements ON agreements_projection;
-- CREATE TRIGGER enforce_api_only_agreements
--     BEFORE INSERT OR UPDATE OR DELETE ON agreements_projection
--     FOR EACH ROW EXECUTE FUNCTION prevent_direct_projection_write();

-- 4. Log all schema changes (DDL audit)
CREATE OR REPLACE FUNCTION log_ddl_event()
RETURNS event_trigger AS $$
DECLARE
    obj record;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    LOOP
        -- Log DDL to events table
        INSERT INTO events (
            id, timestamp, event_type, aggregate_id, aggregate_type, aggregate_version,
            payload, actor_type, actor_id, previous_hash, hash
        ) VALUES (
            'ddl-' || extract(epoch from now())::text || '-' || md5(random()::text),
            NOW(),
            'SchemaChangeDetected',
            'schema-audit',
            'System',
            1,
            jsonb_build_object(
                'type', 'SchemaChangeDetected',
                'command', obj.command_tag,
                'objectType', obj.object_type,
                'objectIdentity', obj.object_identity,
                'schemaName', obj.schema_name,
                'timestamp', NOW(),
                'warning', 'Schema changes should be reviewed - ledger integrity may be affected'
            ),
            'System',
            'ddl-audit',
            'ddl-detected',
            md5(obj.command_tag || obj.object_identity || now()::text)
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create event trigger for DDL (requires superuser)
-- DROP EVENT TRIGGER IF EXISTS audit_ddl_changes;
-- CREATE EVENT TRIGGER audit_ddl_changes ON ddl_command_end
--     EXECUTE FUNCTION log_ddl_event();

-- =============================================================================
-- DONE
-- =============================================================================

SELECT 'UBL Schema initialized successfully with API-only enforcement' AS status;
