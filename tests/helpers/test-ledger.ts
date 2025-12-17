/**
 * TEST LEDGER
 * 
 * A fast, in-memory ledger for testing.
 * Provides the same guarantees as production but runs entirely in memory.
 */

import { createInMemoryEventStore } from '../../core/store/event-store';
import { createAggregateRepository } from '../../core/aggregates/rehydrators';
import { Ids, type EntityId } from '../../core/shared/types';
import type { ActorReference } from '../../core/schema/ledger';

// ============================================================================
// TEST ACTORS
// ============================================================================

export const SYSTEM_ACTOR: ActorReference = {
  type: 'System',
  systemId: 'test-system',
} as any;

export const createTestEntity = (name: string): { id: EntityId; actor: ActorReference } => ({
  id: Ids.entity(),
  actor: {
    type: 'Entity',
    entityId: Ids.entity(),
  } as any,
});

export const alice = createTestEntity('alice');
export const bob = createTestEntity('bob');
export const charlie = createTestEntity('charlie');
export const mallory = createTestEntity('mallory'); // The attacker

// ============================================================================
// TEST LEDGER
// ============================================================================

export interface TestLedger {
  readonly eventStore: ReturnType<typeof createInMemoryEventStore>;
  readonly aggregates: ReturnType<typeof createAggregateRepository>;
  
  // Direct access for attack tests
  readonly _rawAppend: (event: any) => Promise<any>;
  
  // Utilities
  getEventCount(): Promise<number>;
  getAllEvents(): Promise<readonly any[]>;
  verifyHashChain(): Promise<{ valid: boolean; brokenAt?: number; reason?: string }>;
  reset(): void;
}

export function createTestLedger(): TestLedger {
  let eventStore = createInMemoryEventStore();
  let aggregates = createAggregateRepository(eventStore);
  
  // Track all events for verification
  let allEvents: any[] = [];
  
  // Wrap append to track events
  const originalAppend = eventStore.append.bind(eventStore);
  const trackedAppend = async (event: any) => {
    const result = await originalAppend(event);
    allEvents.push(result);
    return result;
  };
  
  // Replace append with tracked version
  (eventStore as any).append = trackedAppend;
  
  return {
    eventStore,
    aggregates,
    
    // Raw append bypasses tracking - for attack tests
    _rawAppend: originalAppend,
    
    async getEventCount() {
      return allEvents.length;
    },
    
    async getAllEvents() {
      return [...allEvents];
    },
    
    async verifyHashChain() {
      if (allEvents.length === 0) {
        return { valid: true };
      }
      
      for (let i = 0; i < allEvents.length; i++) {
        const event = allEvents[i];
        
        // Check sequence is monotonic
        if (i > 0 && event.sequence <= allEvents[i - 1].sequence) {
          return {
            valid: false,
            brokenAt: i,
            reason: `Sequence not monotonic: ${event.sequence} <= ${allEvents[i - 1].sequence}`,
          };
        }
        
        // Check hash chain (if hashes exist)
        if (event.previousHash !== undefined && i > 0) {
          if (event.previousHash !== allEvents[i - 1].hash) {
            return {
              valid: false,
              brokenAt: i,
              reason: `Hash chain broken: previousHash ${event.previousHash} !== ${allEvents[i - 1].hash}`,
            };
          }
        }
      }
      
      return { valid: true };
    },
    
    reset() {
      eventStore = createInMemoryEventStore();
      aggregates = createAggregateRepository(eventStore);
      allEvents = [];
      
      const newOriginalAppend = eventStore.append.bind(eventStore);
      (eventStore as any).append = async (event: any) => {
        const result = await newOriginalAppend(event);
        allEvents.push(result);
        return result;
      };
      
      // Update references
      (this as any).eventStore = eventStore;
      (this as any).aggregates = aggregates;
      (this as any)._rawAppend = newOriginalAppend;
    },
  };
}

// ============================================================================
// TEST ASSERTIONS
// ============================================================================

export function assertEventImmutable(original: any, retrieved: any): void {
  if (JSON.stringify(original) !== JSON.stringify(retrieved)) {
    throw new Error(`Event was mutated!\nOriginal: ${JSON.stringify(original)}\nRetrieved: ${JSON.stringify(retrieved)}`);
  }
}

export function assertHashChainValid(result: { valid: boolean; brokenAt?: number; reason?: string }): void {
  if (!result.valid) {
    throw new Error(`Hash chain invalid at index ${result.brokenAt}: ${result.reason}`);
  }
}

export function assertSequenceMonotonic(events: readonly any[]): void {
  for (let i = 1; i < events.length; i++) {
    if (events[i].sequence <= events[i - 1].sequence) {
      throw new Error(`Sequence not monotonic at index ${i}: ${events[i].sequence} <= ${events[i - 1].sequence}`);
    }
  }
}

export function assertActorPresent(event: any): void {
  if (!event.actor) {
    throw new Error(`Event missing actor: ${JSON.stringify(event)}`);
  }
  if (!event.actor.type) {
    throw new Error(`Event actor missing type: ${JSON.stringify(event.actor)}`);
  }
}

// ============================================================================
// ATTACK UTILITIES
// ============================================================================

export function createMaliciousEvent(overrides: Partial<any> = {}): any {
  return {
    type: 'MaliciousEvent',
    aggregateType: 'System',
    aggregateId: 'hacked',
    aggregateVersion: 1,
    actor: mallory.actor,
    timestamp: Date.now(),
    payload: { attack: true },
    ...overrides,
  };
}

export function createSpoofedActorEvent(victimActor: ActorReference): any {
  return {
    type: 'SpoofedEvent',
    aggregateType: 'Party',
    aggregateId: Ids.entity(),
    aggregateVersion: 1,
    actor: victimActor, // Claiming to be someone else
    timestamp: Date.now(),
    payload: { spoofed: true },
  };
}

export function createBackdatedEvent(backdateTo: number): any {
  return {
    type: 'BackdatedEvent',
    aggregateType: 'System',
    aggregateId: Ids.entity(),
    aggregateVersion: 1,
    actor: mallory.actor,
    timestamp: backdateTo, // In the past
    payload: { backdated: true },
  };
}
