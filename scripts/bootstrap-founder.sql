-- ============================================================================
-- BOOTSTRAP FOUNDER - Dan Voulez
-- ============================================================================
-- Este script deve ser executado UMA ÚNICA VEZ no PostgreSQL do Railway.
-- Ele cria o Founder do sistema com todas as permissões necessárias.
-- 
-- IMPORTANTE: Após executar, GUARDE A API KEY gerada. Ela não será mostrada novamente.
-- ============================================================================

-- IDs canônicos do sistema (do bootstrap.ts)
-- PRIMORDIAL_REALM_ID = '00000000-0000-0000-0000-000000000000'
-- PRIMORDIAL_SYSTEM_ID = '00000000-0000-0000-0000-000000000001'

DO $$
DECLARE
  -- Founder info
  v_founder_name TEXT := 'Dan Voulez';
  v_founder_email TEXT := 'dan@danvoulez.com';
  v_realm_name TEXT := 'LogLine';
  
  -- Generated IDs (deterministic for idempotency)
  v_founder_id TEXT := 'founder-dan-voulez-00001';
  v_founder_agreement_id TEXT := 'agr-founder-dan-voulez';
  v_platform_access_agreement_id TEXT := 'agr-platform-dan-voulez';
  v_realm_id TEXT := 'realm-logline-00001';
  v_realm_admin_agreement_id TEXT := 'agr-realm-admin-dan-voulez';
  v_api_key_id TEXT := 'apikey-founder-dan-voulez';
  
  -- API Key (random, secure)
  v_api_key TEXT := 'ubl_' || encode(gen_random_bytes(12), 'hex');
  
  -- System constants
  v_primordial_realm TEXT := '00000000-0000-0000-0000-000000000000';
  v_primordial_system TEXT := '00000000-0000-0000-0000-000000000001';
  v_now_ts TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  
  -- Hash chain
  v_prev_hash TEXT;
  v_current_hash TEXT;
  
  -- Check if founder already exists
  v_existing_founder TEXT;
BEGIN
  -- ========================================================================
  -- CHECK: Founder already exists?
  -- ========================================================================
  SELECT aggregate_id INTO v_existing_founder
  FROM events
  WHERE aggregate_type = 'Party'
    AND event_type = 'EntityCreated'
    AND (payload->'meta'->>'isFounder')::boolean = true
  LIMIT 1;
  
  IF v_existing_founder IS NOT NULL THEN
    RAISE EXCEPTION 'Founder already exists: %. Only one Founder per system.', v_existing_founder;
  END IF;

  -- ========================================================================
  -- 1. CREATE FOUNDER ENTITY
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_founder_id || '-created',
    'EntityCreated',
    v_founder_id,
    'Party',
    1,
    jsonb_build_object(
      'type', 'EntityCreated',
      'entityType', 'Person',
      'identity', jsonb_build_object(
        'name', v_founder_name,
        'identifiers', jsonb_build_array(
          jsonb_build_object('scheme', 'email', 'value', v_founder_email, 'verified', true)
        ),
        'contacts', jsonb_build_array(
          jsonb_build_object('type', 'email', 'value', v_founder_email)
        )
      ),
      'meta', jsonb_build_object('isFounder', true, 'bootstrappedAt', v_now_ms)
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 1/9 Founder entity created: %', v_founder_id;

  -- ========================================================================
  -- 2. CREATE FOUNDER AGREEMENT (System grants Founder role)
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_founder_agreement_id || '-proposed',
    'AgreementProposed',
    v_founder_agreement_id,
    'Agreement',
    1,
    jsonb_build_object(
      'type', 'AgreementProposed',
      'agreementType', 'founder-grant',
      'parties', jsonb_build_array(
        jsonb_build_object('entityId', v_primordial_system, 'role', 'System', 'consent', jsonb_build_object('givenAt', v_now_ms, 'method', 'Implicit')),
        jsonb_build_object('entityId', v_founder_id, 'role', 'Founder', 'consent', jsonb_build_object('givenAt', v_now_ms, 'method', 'Implicit'))
      ),
      'terms', jsonb_build_object(
        'description', 'Founder agreement granting ' || v_founder_name || ' full system access',
        'roleType', 'Founder',
        'scope', jsonb_build_object('type', 'Global'),
        'grantedPermissions', jsonb_build_array(
          jsonb_build_object('action', '*', 'resource', '*'),
          jsonb_build_object('action', 'create', 'resource', 'Realm'),
          jsonb_build_object('action', 'delegate', 'resource', '*'),
          jsonb_build_object('action', 'grant', 'resource', 'Role:*')
        )
      ),
      'validity', jsonb_build_object('effectiveFrom', v_now_ms)
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 2/9 Founder agreement proposed: %', v_founder_agreement_id;

  -- ========================================================================
  -- 3. ACTIVATE FOUNDER AGREEMENT
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_founder_agreement_id || '-activated',
    'AgreementStatusChanged',
    v_founder_agreement_id,
    'Agreement',
    2,
    jsonb_build_object(
      'type', 'AgreementStatusChanged',
      'previousStatus', 'Proposed',
      'newStatus', 'Active'
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 3/9 Founder agreement activated';

  -- ========================================================================
  -- 4. CREATE REALM LOGLINE
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_realm_id || '-created',
    'ContainerCreated',
    v_realm_id,
    'Container',
    1,
    jsonb_build_object(
      'type', 'ContainerCreated',
      'name', v_realm_name,
      'containerType', 'Realm',
      'physics', jsonb_build_object(
        'fungibility', 'Strict',
        'topology', 'Subjects',
        'permeability', 'Gated',
        'execution', 'Full'
      ),
      'governanceAgreementId', v_founder_agreement_id,
      'realmId', v_primordial_realm,
      'ownerId', v_founder_id
    ),
    'Entity',
    v_founder_id,
    v_now_ts
  );
  RAISE NOTICE '✅ 4/9 Realm created: % (%)', v_realm_name, v_realm_id;

  -- ========================================================================
  -- 5. CREATE TENANTADMIN AGREEMENT (Dan Voulez admin of LogLine)
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_realm_admin_agreement_id || '-proposed',
    'AgreementProposed',
    v_realm_admin_agreement_id,
    'Agreement',
    1,
    jsonb_build_object(
      'type', 'AgreementProposed',
      'agreementType', 'realm-admin',
      'parties', jsonb_build_array(
        jsonb_build_object('entityId', v_primordial_system, 'role', 'System', 'consent', jsonb_build_object('givenAt', v_now_ms, 'method', 'Implicit')),
        jsonb_build_object('entityId', v_founder_id, 'role', 'TenantAdmin', 'consent', jsonb_build_object('givenAt', v_now_ms, 'method', 'Implicit'))
      ),
      'terms', jsonb_build_object(
        'description', 'Admin access to ' || v_realm_name,
        'roleType', 'TenantAdmin',
        'scope', jsonb_build_object('type', 'Realm', 'targetId', v_realm_id)
      ),
      'validity', jsonb_build_object('effectiveFrom', v_now_ms)
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 5/9 TenantAdmin agreement proposed';

  -- ========================================================================
  -- 6. ACTIVATE TENANTADMIN AGREEMENT
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_realm_admin_agreement_id || '-activated',
    'AgreementStatusChanged',
    v_realm_admin_agreement_id,
    'Agreement',
    2,
    jsonb_build_object(
      'type', 'AgreementStatusChanged',
      'previousStatus', 'Proposed',
      'newStatus', 'Active'
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 6/9 TenantAdmin agreement activated';

  -- ========================================================================
  -- 7. CREATE PLATFORM ACCESS AGREEMENT (for chat access)
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_platform_access_agreement_id || '-proposed',
    'AgreementProposed',
    v_platform_access_agreement_id,
    'Agreement',
    1,
    jsonb_build_object(
      'type', 'AgreementProposed',
      'agreementType', 'platform-access',
      'parties', jsonb_build_array(
        jsonb_build_object('entityId', v_primordial_system, 'role', 'Platform', 'consent', jsonb_build_object('givenAt', v_now_ms, 'method', 'Implicit')),
        jsonb_build_object('entityId', v_founder_id, 'role', 'User', 'consent', jsonb_build_object('givenAt', v_now_ms, 'method', 'Implicit'))
      ),
      'terms', jsonb_build_object(
        'description', 'Platform access for ' || v_founder_name,
        'roleType', 'PlatformUser'
      ),
      'validity', jsonb_build_object('effectiveFrom', v_now_ms)
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 7/9 Platform access agreement proposed';

  -- ========================================================================
  -- 8. ACTIVATE PLATFORM ACCESS AGREEMENT
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_platform_access_agreement_id || '-activated',
    'AgreementStatusChanged',
    v_platform_access_agreement_id,
    'Agreement',
    2,
    jsonb_build_object(
      'type', 'AgreementStatusChanged',
      'previousStatus', 'Proposed',
      'newStatus', 'Active'
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 8/9 Platform access activated';

  -- ========================================================================
  -- 9. CREATE API KEY
  -- ========================================================================
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, timestamp)
  VALUES (
    'evt-' || v_api_key_id || '-created',
    'ApiKeyCreated',
    v_api_key_id,
    'ApiKey',
    1,
    jsonb_build_object(
      'type', 'ApiKeyCreated',
      'key', v_api_key,
      'name', v_founder_name || ' - Founder Key',
      'realmId', v_realm_id,
      'entityId', v_founder_id,
      'scopes', jsonb_build_array('*'),
      'createdAt', v_now_ms
    ),
    'System',
    'bootstrap-founder',
    v_now_ts
  );
  RAISE NOTICE '✅ 9/9 API Key created';

  -- ========================================================================
  -- SUMMARY
  -- ========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '                    FOUNDER BOOTSTRAP COMPLETE                  ';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Founder:     % <%>', v_founder_name, v_founder_email;
  RAISE NOTICE 'Founder ID:  %', v_founder_id;
  RAISE NOTICE 'Realm:       % (%)', v_realm_name, v_realm_id;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔑 API KEY (SAVE THIS - IT WILL NOT BE SHOWN AGAIN):';
  RAISE NOTICE '';
  RAISE NOTICE '   %', v_api_key;
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Use this key in the X-API-Key header:';
  RAISE NOTICE '  curl -X POST https://api.ubl.agency/chat \';
  RAISE NOTICE '    -H "X-API-Key: %" \', v_api_key;
  RAISE NOTICE '    -H "Content-Type: application/json" \';
  RAISE NOTICE '    -d ''{"message": {"text": "Hello!"}}''';
  RAISE NOTICE '';

END $$;

-- Verify the bootstrap
SELECT 'Events created:' as info, COUNT(*) as count FROM events WHERE actor_id = 'bootstrap-founder';
SELECT 'Founder entity:' as info, aggregate_id, payload->>'type' as type FROM events WHERE aggregate_id = 'founder-dan-voulez-00001' AND event_type = 'EntityCreated';
SELECT 'API Key:' as info, payload->>'key' as api_key FROM events WHERE aggregate_id = 'apikey-founder-dan-voulez' AND event_type = 'ApiKeyCreated';
