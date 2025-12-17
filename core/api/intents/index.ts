/**
 * INTENT DEFINITIONS - Aggregated Index
 * 
 * THE UNIVERSAL API: Everything is an intent.
 * 
 * This module aggregates all intent definitions from domain-specific files.
 * 
 * Structure:
 * - entity-intents.ts    → register
 * - agreement-intents.ts → propose, consent, fulfill, terminate
 * - dispute-intents.ts   → dispute:open, dispute:resolve
 * - asset-intents.ts     → register-asset, transfer, transition
 * - query-intents.ts     → query, explain, simulate, what-can-i-do
 * - auth-intents.ts      → delegate:auth
 * - workspace-intents.ts → file operations
 * - admin-intents.ts     → realm:create, user:create, apikey:create/revoke/query
 */

import type { IntentDefinition } from '../intent-api';
import { ENTITY_INTENTS } from './entity-intents';
import { AGREEMENT_INTENTS } from './agreement-intents';
import { ASSET_INTENTS } from './asset-intents';
import { QUERY_INTENTS } from './query-intents';
import { DISPUTE_INTENTS } from './dispute-intents';
import { AUTH_INTENTS } from './auth-intents';
import { WORKSPACE_INTENTS } from './workspace-intents';
import { ADMIN_INTENTS } from './admin-intents';
import { AGENT_ECONOMY_INTENTS } from './agent-economy-intents';
import { PERCEPTION_INTENTS } from './perception-intents';
import { CONSCIOUSNESS_INTENTS } from './consciousness-intents';
import { OBLIGATION_INTENTS } from './obligation-intents';

/**
 * All built-in intents aggregated from domain modules.
 */
export const ALL_INTENTS: readonly IntentDefinition[] = [
  ...ENTITY_INTENTS,
  ...AGREEMENT_INTENTS,
  ...ASSET_INTENTS,
  ...QUERY_INTENTS,
  ...DISPUTE_INTENTS,
  ...AUTH_INTENTS,
  ...WORKSPACE_INTENTS,
  ...ADMIN_INTENTS,
  ...AGENT_ECONOMY_INTENTS,
  ...PERCEPTION_INTENTS,
  ...CONSCIOUSNESS_INTENTS,
  ...OBLIGATION_INTENTS,
];

// Re-export individual modules for selective imports
export { ENTITY_INTENTS } from './entity-intents';
export { AGREEMENT_INTENTS } from './agreement-intents';
export { ASSET_INTENTS } from './asset-intents';
export { QUERY_INTENTS } from './query-intents';
export { DISPUTE_INTENTS } from './dispute-intents';
export { AUTH_INTENTS } from './auth-intents';
export { WORKSPACE_INTENTS } from './workspace-intents';
export { ADMIN_INTENTS } from './admin-intents';
export { AGENT_ECONOMY_INTENTS } from './agent-economy-intents';
export { PERCEPTION_INTENTS } from './perception-intents';
export { CONSCIOUSNESS_INTENTS } from './consciousness-intents';
export { OBLIGATION_INTENTS } from './obligation-intents';
