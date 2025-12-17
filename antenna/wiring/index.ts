/**
 * ANTENNA WIRING - Modular System Initialization
 * 
 * This module provides clean, modular wiring for the Antenna server.
 * Each component is extracted into its own file for maintainability.
 * 
 * Components:
 * - role-store.ts: Agreement-based role resolution
 * - authorization.ts: Authorization engine with ledger persistence
 */

export { createRoleStore, type RoleStoreConfig } from './role-store';
export { createAuthorizationWiring, type AuthorizationWiringConfig, type AuthorizationWiring } from './authorization';
