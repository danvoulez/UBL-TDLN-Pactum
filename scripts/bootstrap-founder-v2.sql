-- ============================================================================
-- BOOTSTRAP FOUNDER - Dan Voulez
-- ============================================================================
-- Execute UMA ÚNICA VEZ no PostgreSQL do Railway.
-- GUARDE A API KEY gerada - ela não será mostrada novamente.
-- ============================================================================

DO $$
DECLARE
  -- Founder info
  v_name TEXT := 'Dan Voulez';
  v_email TEXT := 'dan@danvoulez.com';
  v_realm TEXT := 'LogLine';
  
  -- IDs
  v_founder_id TEXT := 'founder-dan-voulez-00001';
  v_founder_agr TEXT := 'agr-founder-dan-voulez';
  v_platform_agr TEXT := 'agr-platform-dan-voulez';
  v_realm_id TEXT := 'realm-logline-00001';
  v_realm_agr TEXT := 'agr-realm-admin-dan-voulez';
  v_apikey_id TEXT := 'apikey-founder-dan-voulez';
  
  -- API Key
  v_api_key TEXT := 'ubl_' || encode(gen_random_bytes(12), 'hex');
  
  -- System
  v_system TEXT := '00000000-0000-0000-0000-000000000001';
  v_now BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  
  -- Hash chain
  v_prev TEXT;
  v_hash TEXT;
  v_payload JSONB;
  
  v_existing TEXT;
BEGIN
  -- Check existing founder
  SELECT aggregate_id INTO v_existing FROM events 
  WHERE aggregate_type = 'Party' AND event_type = 'EntityCreated' 
  AND (payload->'meta'->>'isFounder')::boolean = true LIMIT 1;
  
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Founder already exists: %', v_existing;
  END IF;
  
  -- Get last hash
  SELECT hash INTO v_prev FROM events ORDER BY sequence DESC LIMIT 1;
  IF v_prev IS NULL THEN v_prev := 'sha256:genesis'; END IF;

  -- 1. Founder Entity
  v_payload := jsonb_build_object(
    'type', 'EntityCreated', 'entityType', 'Person',
    'identity', jsonb_build_object('name', v_name, 
      'identifiers', jsonb_build_array(jsonb_build_object('scheme', 'email', 'value', v_email, 'verified', true)),
      'contacts', jsonb_build_array(jsonb_build_object('type', 'email', 'value', v_email))),
    'meta', jsonb_build_object('isFounder', true, 'bootstrappedAt', v_now));
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-1', 'EntityCreated', v_founder_id, 'Party', 1, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  v_prev := v_hash;
  RAISE NOTICE '✅ 1/9 Founder entity: %', v_founder_id;

  -- 2. Founder Agreement Proposed
  v_payload := jsonb_build_object('type', 'AgreementProposed', 'agreementType', 'founder-grant',
    'parties', jsonb_build_array(
      jsonb_build_object('entityId', v_system, 'role', 'System', 'consent', jsonb_build_object('givenAt', v_now, 'method', 'Implicit')),
      jsonb_build_object('entityId', v_founder_id, 'role', 'Founder', 'consent', jsonb_build_object('givenAt', v_now, 'method', 'Implicit'))),
    'terms', jsonb_build_object('description', 'Founder grant for ' || v_name, 'roleType', 'Founder', 
      'scope', jsonb_build_object('type', 'Global'),
      'grantedPermissions', jsonb_build_array(jsonb_build_object('action', '*', 'resource', '*'))),
    'validity', jsonb_build_object('effectiveFrom', v_now));
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-2', 'AgreementProposed', v_founder_agr, 'Agreement', 1, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  v_prev := v_hash;

  -- 3. Founder Agreement Activated
  v_payload := jsonb_build_object('type', 'AgreementStatusChanged', 'previousStatus', 'Proposed', 'newStatus', 'Active');
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-3', 'AgreementStatusChanged', v_founder_agr, 'Agreement', 2, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  v_prev := v_hash;
  RAISE NOTICE '✅ 2-3/9 Founder agreement activated';

  -- 4. Realm Created
  v_payload := jsonb_build_object('type', 'ContainerCreated', 'name', v_realm, 'containerType', 'Realm',
    'physics', jsonb_build_object('fungibility', 'Strict', 'topology', 'Subjects', 'permeability', 'Gated', 'execution', 'Full'),
    'governanceAgreementId', v_founder_agr, 'realmId', '00000000-0000-0000-0000-000000000000', 'ownerId', v_founder_id);
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-4', 'ContainerCreated', v_realm_id, 'Container', 1, v_payload, 'Entity', v_founder_id, v_prev, v_hash);
  v_prev := v_hash;
  RAISE NOTICE '✅ 4/9 Realm: % (%)', v_realm, v_realm_id;

  -- 5. TenantAdmin Agreement Proposed
  v_payload := jsonb_build_object('type', 'AgreementProposed', 'agreementType', 'realm-admin',
    'parties', jsonb_build_array(
      jsonb_build_object('entityId', v_system, 'role', 'System', 'consent', jsonb_build_object('givenAt', v_now, 'method', 'Implicit')),
      jsonb_build_object('entityId', v_founder_id, 'role', 'TenantAdmin', 'consent', jsonb_build_object('givenAt', v_now, 'method', 'Implicit'))),
    'terms', jsonb_build_object('description', 'Admin of ' || v_realm, 'roleType', 'TenantAdmin', 
      'scope', jsonb_build_object('type', 'Realm', 'targetId', v_realm_id)),
    'validity', jsonb_build_object('effectiveFrom', v_now));
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-5', 'AgreementProposed', v_realm_agr, 'Agreement', 1, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  v_prev := v_hash;

  -- 6. TenantAdmin Agreement Activated
  v_payload := jsonb_build_object('type', 'AgreementStatusChanged', 'previousStatus', 'Proposed', 'newStatus', 'Active');
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-6', 'AgreementStatusChanged', v_realm_agr, 'Agreement', 2, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  v_prev := v_hash;
  RAISE NOTICE '✅ 5-6/9 TenantAdmin activated';

  -- 7. Platform Access Proposed
  v_payload := jsonb_build_object('type', 'AgreementProposed', 'agreementType', 'platform-access',
    'parties', jsonb_build_array(
      jsonb_build_object('entityId', v_system, 'role', 'Platform', 'consent', jsonb_build_object('givenAt', v_now, 'method', 'Implicit')),
      jsonb_build_object('entityId', v_founder_id, 'role', 'User', 'consent', jsonb_build_object('givenAt', v_now, 'method', 'Implicit'))),
    'terms', jsonb_build_object('description', 'Platform access for ' || v_name, 'roleType', 'PlatformUser'),
    'validity', jsonb_build_object('effectiveFrom', v_now));
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-7', 'AgreementProposed', v_platform_agr, 'Agreement', 1, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  v_prev := v_hash;

  -- 8. Platform Access Activated
  v_payload := jsonb_build_object('type', 'AgreementStatusChanged', 'previousStatus', 'Proposed', 'newStatus', 'Active');
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-8', 'AgreementStatusChanged', v_platform_agr, 'Agreement', 2, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  v_prev := v_hash;
  RAISE NOTICE '✅ 7-8/9 Platform access activated';

  -- 9. API Key (uses 'System' aggregate type since ApiKey is not in allowed list)
  v_payload := jsonb_build_object('type', 'ApiKeyCreated', 'key', v_api_key, 'name', v_name || ' - Founder Key',
    'realmId', v_realm_id, 'entityId', v_founder_id, 'scopes', jsonb_build_array('*'), 'createdAt', v_now);
  v_hash := 'sha256:' || encode(sha256((v_prev || v_payload::text)::bytea), 'hex');
  INSERT INTO events (id, event_type, aggregate_id, aggregate_type, aggregate_version, payload, actor_type, actor_id, previous_hash, hash)
  VALUES ('evt-founder-9', 'ApiKeyCreated', v_apikey_id, 'System', 1, v_payload, 'System', 'bootstrap', v_prev, v_hash);
  RAISE NOTICE '✅ 9/9 API Key created';

  -- Summary
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '                 FOUNDER BOOTSTRAP COMPLETE                     ';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Founder:    % <%>', v_name, v_email;
  RAISE NOTICE 'Founder ID: %', v_founder_id;
  RAISE NOTICE 'Realm:      % (%)', v_realm, v_realm_id;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '🔑 API KEY (SAVE THIS):';
  RAISE NOTICE '';
  RAISE NOTICE '   %', v_api_key;
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- Verify
SELECT 'Events:' as info, COUNT(*) as count FROM events WHERE actor_id = 'bootstrap';
SELECT 'API Key:' as info, payload->>'key' as api_key FROM events WHERE event_type = 'ApiKeyCreated' AND aggregate_id = 'apikey-founder-dan-voulez';
