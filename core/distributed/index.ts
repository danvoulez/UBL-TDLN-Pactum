/**
 * Distributed Module - Sagas, Cross-Realm & Conflicts
 * 
 * Handles distributed operations:
 * - Saga pattern for multi-step transactions with compensation
 * - Cross-realm operations with explicit agreements
 * - Conflict resolution for concurrent modifications
 * 
 * FASE 7: Persistent sagas with recovery and cross-realm integration.
 */

export * from './saga';
export * from './saga-coordinator-impl';
export * from './cross-realm-saga';

