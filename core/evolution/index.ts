/**
 * Evolution Module - Schema Versioning & Migrations
 * 
 * Handles the evolution of events over time:
 * - Schema versions for event types
 * - Upcasting old events to current schema
 * - Migrations for bulk transformations
 * - Aggregate version management
 */

export * from './versioning';

