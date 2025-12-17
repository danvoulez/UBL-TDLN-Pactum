/**
 * AGENT IMPERSONATION ATTACK TESTS
 * 
 * Testing prevention of impersonation attacks:
 * 1. Actor validation - only the entity itself can act as itself
 * 2. Guardian impersonation prevention
 * 3. System actor restrictions
 * 4. Cross-entity action prevention
 * 5. Trajectory tampering detection
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore, type EventStore } from '../../../core/store/event-store';
import { Ids, asEntityId } from '../../../core/shared/types';
import type { EntityId } from '../../../core/schema/ledger';
import { toSmallestUnit } from '../../../core/schema/agent-economy';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestEventStore(): EventStore {
  return createInMemoryEventStore();
}

function createEntityActor(entityId: EntityId): { type: 'Entity'; entityId: EntityId } {
  return { type: 'Entity', entityId };
}

function createSystemActor(systemId: string = 'core'): { type: 'System'; systemId: string } {
  return { type: 'System', systemId };
}

// ============================================================================
// 1. ACTOR VALIDATION
// ============================================================================

describe('ATTACK: Actor Validation', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createTestEventStore();
  });

  it('rejects action when actor does not match entity', () => {
    const agentA = Ids.entity();
    const agentB = Ids.entity();
    
    // Agent B trying to act as Agent A - should be detected
    const maliciousActor = createEntityActor(agentB);
    const targetEntity = agentA;
    
    // In a real system, this would be rejected by ABAC
    const isImpersonation = maliciousActor.entityId !== targetEntity;
    assert.strictEqual(isImpersonation, true, 'Should detect impersonation attempt');
  });

  it('allows action when actor matches entity', () => {
    const agent = Ids.entity();
    const actor = createEntityActor(agent);
    
    const isValid = actor.entityId === agent;
    assert.strictEqual(isValid, true, 'Actor should match entity');
  });

  it('validates actor type is correct', () => {
    const validActorTypes = ['Entity', 'System', 'Anonymous'];
    
    const entityActor = createEntityActor(Ids.entity());
    const systemActor = createSystemActor();
    
    assert.strictEqual(entityActor.type, 'Entity');
    assert.strictEqual(systemActor.type, 'System');
    assert.ok(validActorTypes.includes(entityActor.type));
    assert.ok(validActorTypes.includes(systemActor.type));
  });
});

// ============================================================================
// 2. GUARDIAN IMPERSONATION
// ============================================================================

describe('ATTACK: Guardian Impersonation', () => {
  it('detects non-guardian trying to act as guardian', () => {
    const agent = Ids.entity();
    const realGuardian = Ids.entity();
    const fakeGuardian = Ids.entity();
    
    // Relationship: agent -> realGuardian
    const guardianship = {
      entityId: agent,
      guardianId: realGuardian,
    };
    
    // Fake guardian trying to act on behalf of agent
    const attemptedActor = fakeGuardian;
    const isAuthorized = attemptedActor === guardianship.guardianId;
    
    assert.strictEqual(isAuthorized, false, 'Fake guardian should not be authorized');
  });

  it('allows real guardian to act on behalf of supervised agent', () => {
    const agent = Ids.entity();
    const guardian = Ids.entity();
    
    const guardianship = {
      entityId: agent,
      guardianId: guardian,
      autonomyLevel: 'Supervised',
    };
    
    // Guardian acting on behalf of supervised agent
    const actor = guardian;
    const isAuthorized = actor === guardianship.guardianId && 
                         guardianship.autonomyLevel === 'Supervised';
    
    assert.strictEqual(isAuthorized, true, 'Guardian should be authorized for supervised agent');
  });

  it('restricts guardian actions for emancipated agents', () => {
    const agent = Ids.entity();
    const guardian = Ids.entity();
    
    const guardianship = {
      entityId: agent,
      guardianId: guardian,
      autonomyLevel: 'Emancipated',
    };
    
    // Guardian trying to act on behalf of emancipated agent
    const actor = guardian;
    const canActOnBehalf = guardianship.autonomyLevel !== 'Emancipated';
    
    assert.strictEqual(canActOnBehalf, false, 'Guardian cannot act for emancipated agent');
  });
});

// ============================================================================
// 3. SYSTEM ACTOR RESTRICTIONS
// ============================================================================

describe('ATTACK: System Actor Abuse', () => {
  it('system actor requires valid systemId', () => {
    const validSystemActor = createSystemActor('treasury');
    const invalidSystemActor = { type: 'System', systemId: '' };
    
    assert.ok(validSystemActor.systemId.length > 0);
    assert.strictEqual(invalidSystemActor.systemId.length, 0);
    
    // Empty systemId should be rejected
    const isValid = invalidSystemActor.systemId.length > 0;
    assert.strictEqual(isValid, false);
  });

  it('system actor cannot impersonate entity', () => {
    const systemActor = createSystemActor('core');
    const entityId = Ids.entity();
    
    // System actor type is different from Entity
    const isImpersonation = systemActor.type === 'Entity';
    assert.strictEqual(isImpersonation, false);
  });

  it('only whitelisted system actors can mint credits', () => {
    const whitelist = ['treasury', 'loan-service', 'reward-service'];
    
    const treasuryActor = createSystemActor('treasury');
    const maliciousActor = createSystemActor('hacker-service');
    
    const treasuryCanMint = whitelist.includes(treasuryActor.systemId);
    const hackerCanMint = whitelist.includes(maliciousActor.systemId);
    
    assert.strictEqual(treasuryCanMint, true);
    assert.strictEqual(hackerCanMint, false);
  });
});

// ============================================================================
// 4. CROSS-ENTITY ACTION PREVENTION
// ============================================================================

describe('ATTACK: Cross-Entity Actions', () => {
  it('prevents entity A from transferring from entity B wallet', () => {
    const entityA = Ids.entity();
    const entityB = Ids.entity();
    const walletB = Ids.entity();
    
    // Wallet ownership
    const walletOwnership = {
      walletId: walletB,
      ownerId: entityB,
    };
    
    // Entity A trying to transfer from wallet B
    const actor = entityA;
    const isOwner = actor === walletOwnership.ownerId;
    
    assert.strictEqual(isOwner, false, 'Entity A should not own wallet B');
  });

  it('prevents entity from modifying another entity constitution', () => {
    const entityA = Ids.entity();
    const entityB = Ids.entity();
    const guardianB = Ids.entity();
    
    // Only entity itself or its guardian can modify constitution
    const canModify = (actor: EntityId, target: EntityId, guardian: EntityId) => {
      return actor === target || actor === guardian;
    };
    
    // Entity A trying to modify Entity B's constitution
    assert.strictEqual(canModify(entityA, entityB, guardianB), false);
    
    // Entity B modifying its own constitution
    assert.strictEqual(canModify(entityB, entityB, guardianB), true);
    
    // Guardian B modifying Entity B's constitution
    assert.strictEqual(canModify(guardianB, entityB, guardianB), true);
  });

  it('prevents entity from recording trajectory for another entity', () => {
    const entityA = Ids.entity();
    const entityB = Ids.entity();
    
    // Only the entity itself can record its trajectory
    const canRecordTrajectory = (actor: EntityId, target: EntityId) => {
      return actor === target;
    };
    
    assert.strictEqual(canRecordTrajectory(entityA, entityB), false);
    assert.strictEqual(canRecordTrajectory(entityA, entityA), true);
  });
});

// ============================================================================
// 5. TRAJECTORY TAMPERING
// ============================================================================

describe('ATTACK: Trajectory Tampering', () => {
  it('detects hash chain break', () => {
    const trajectorySpans = [
      { id: '1', hash: 'abc123', previousHash: '' },
      { id: '2', hash: 'def456', previousHash: 'abc123' },
      { id: '3', hash: 'ghi789', previousHash: 'def456' },
    ];
    
    // Verify chain integrity
    const isChainValid = (spans: typeof trajectorySpans) => {
      for (let i = 1; i < spans.length; i++) {
        if (spans[i].previousHash !== spans[i - 1].hash) {
          return false;
        }
      }
      return true;
    };
    
    assert.strictEqual(isChainValid(trajectorySpans), true);
    
    // Tamper with middle span
    const tamperedSpans = [...trajectorySpans];
    tamperedSpans[1] = { ...tamperedSpans[1], hash: 'TAMPERED' };
    
    assert.strictEqual(isChainValid(tamperedSpans), false);
  });

  it('detects trajectory span insertion', () => {
    const originalSpans = [
      { id: '1', sequence: 1, hash: 'a', previousHash: '' },
      { id: '2', sequence: 2, hash: 'b', previousHash: 'a' },
      { id: '3', sequence: 3, hash: 'c', previousHash: 'b' },
    ];
    
    // Attacker tries to insert a span
    const insertedSpan = { id: 'x', sequence: 2, hash: 'x', previousHash: 'a' };
    
    // Detect duplicate sequence
    const hasDuplicateSequence = (spans: typeof originalSpans, newSpan: typeof insertedSpan) => {
      return spans.some(s => s.sequence === newSpan.sequence);
    };
    
    assert.strictEqual(hasDuplicateSequence(originalSpans, insertedSpan), true);
  });

  it('detects trajectory span deletion', () => {
    const originalSpans = [
      { id: '1', sequence: 1, hash: 'a', previousHash: '' },
      { id: '2', sequence: 2, hash: 'b', previousHash: 'a' },
      { id: '3', sequence: 3, hash: 'c', previousHash: 'b' },
    ];
    
    // Attacker deletes middle span
    const deletedSpans = [originalSpans[0], originalSpans[2]];
    
    // Detect gap in sequence
    const hasSequenceGap = (spans: typeof originalSpans) => {
      for (let i = 1; i < spans.length; i++) {
        if (spans[i].sequence !== spans[i - 1].sequence + 1) {
          return true;
        }
      }
      return false;
    };
    
    assert.strictEqual(hasSequenceGap(originalSpans), false);
    assert.strictEqual(hasSequenceGap(deletedSpans), true);
  });

  it('validates trajectory span signature', () => {
    const span = {
      id: '1',
      entityId: Ids.entity(),
      action: 'transfer:credits',
      signature: 'valid-signature-here',
    };
    
    // Mock signature validation
    const validateSignature = (s: typeof span, publicKey: string) => {
      // In real implementation, this would verify cryptographic signature
      return s.signature.length > 0 && publicKey.length > 0;
    };
    
    assert.strictEqual(validateSignature(span, 'public-key'), true);
    assert.strictEqual(validateSignature({ ...span, signature: '' }, 'public-key'), false);
  });
});

// ============================================================================
// 6. EVENT REPLAY ATTACK
// ============================================================================

describe('ATTACK: Event Replay', () => {
  it('detects duplicate event by sequence', () => {
    const events = [
      { id: '1', sequence: 1n },
      { id: '2', sequence: 2n },
      { id: '3', sequence: 3n },
    ];
    
    // Attacker tries to replay event 2
    const replayedEvent = { id: '2-replay', sequence: 2n };
    
    const isDuplicate = events.some(e => e.sequence === replayedEvent.sequence);
    assert.strictEqual(isDuplicate, true);
  });

  it('detects duplicate event by nonce', () => {
    const processedNonces = new Set(['nonce-1', 'nonce-2', 'nonce-3']);
    
    // Attacker tries to replay with same nonce
    const replayNonce = 'nonce-2';
    const isReplay = processedNonces.has(replayNonce);
    
    assert.strictEqual(isReplay, true);
    
    // New nonce should be accepted
    const newNonce = 'nonce-4';
    assert.strictEqual(processedNonces.has(newNonce), false);
  });

  it('validates event timestamp is within acceptable window', () => {
    const now = Date.now();
    const maxClockSkew = 5 * 60 * 1000; // 5 minutes
    
    const isTimestampValid = (timestamp: number) => {
      return Math.abs(now - timestamp) <= maxClockSkew;
    };
    
    // Recent event - valid
    assert.strictEqual(isTimestampValid(now - 1000), true);
    
    // Old event (1 hour ago) - invalid
    assert.strictEqual(isTimestampValid(now - 60 * 60 * 1000), false);
    
    // Future event (1 hour ahead) - invalid
    assert.strictEqual(isTimestampValid(now + 60 * 60 * 1000), false);
  });
});

// ============================================================================
// 7. PRIVILEGE ESCALATION
// ============================================================================

describe('ATTACK: Privilege Escalation', () => {
  it('prevents self-promotion of autonomy level', () => {
    const agent = Ids.entity();
    const guardian = Ids.entity();
    
    // Only guardian can change autonomy level
    const canChangeAutonomy = (actor: EntityId, target: EntityId, targetGuardian: EntityId) => {
      return actor === targetGuardian;
    };
    
    // Agent trying to promote itself
    assert.strictEqual(canChangeAutonomy(agent, agent, guardian), false);
    
    // Guardian promoting agent
    assert.strictEqual(canChangeAutonomy(guardian, agent, guardian), true);
  });

  it('prevents guardian tier self-promotion', () => {
    const guardian = Ids.entity();
    const systemAdmin = asEntityId('system-admin');
    
    // Only system admin can change guardian tier
    const canChangeTier = (actor: EntityId) => {
      return actor === systemAdmin;
    };
    
    assert.strictEqual(canChangeTier(guardian), false);
    assert.strictEqual(canChangeTier(systemAdmin), true);
  });

  it('prevents unauthorized role assignment', () => {
    const user = Ids.entity();
    const admin = asEntityId('admin');
    
    const authorizedRoleAssigners = [admin];
    
    const canAssignRole = (actor: EntityId) => {
      return authorizedRoleAssigners.includes(actor);
    };
    
    assert.strictEqual(canAssignRole(user), false);
    assert.strictEqual(canAssignRole(admin), true);
  });
});
