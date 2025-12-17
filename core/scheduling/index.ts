/**
 * Scheduling Module - Time-Based Triggers & Deadlines
 * 
 * Makes time a first-class participant:
 * - Scheduled tasks (one-time, recurring, relative)
 * - Deadlines with reminder stages
 * - Auto-escalation and expiration
 * 
 * FASE 7: Cluster-safe scheduler with distributed locking and idempotency.
 */

export * from './scheduler';
export * from './lock';
export * from './idempotency';
export * from './scheduler-impl';

