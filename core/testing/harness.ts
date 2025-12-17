/**
 * TESTING - Time-Travel, Fixtures & Property Tests
 * 
 * Event-sourced systems have unique testing advantages:
 * - TIME TRAVEL: Replay events to any point
 * - DETERMINISM: Same events = same state (always)
 * - FIXTURES: Pre-recorded event sequences
 * - PROPERTY TESTS: Verify invariants always hold
 */

import type { EntityId, Timestamp, ActorReference, AggregateType } from '../shared/types';
import type { Event } from '../schema/ledger';

// ============================================================================
// TIME TRAVEL TESTING
// ============================================================================

/**
 * Time-travel test harness lets you control time in tests.
 */
export interface TimeTravelHarness {
  /** Set the current time (all subsequent operations use this time) */
  setTime(time: Timestamp): void;
  
  /** Advance time by duration */
  advanceTime(milliseconds: number): void;
  
  /** Get current test time */
  getCurrentTime(): Timestamp;
  
  /** Reset to real time */
  resetToRealTime(): void;
  
  /** Replay events up to a specific point */
  replayTo(sequence: bigint): Promise<void>;
  
  /** Replay events up to a timestamp */
  replayToTime(timestamp: Timestamp): Promise<void>;
  
  /** Get aggregate state at any point */
  getStateAt<T>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    atSequence: bigint
  ): Promise<T>;
  
  /** Fork the event stream (for "what if" scenarios) */
  fork(): TimeTravelHarness;
  
  /** Diff two states */
  diffStates<T>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    sequence1: bigint,
    sequence2: bigint
  ): Promise<StateDiff<T>>;
}

export interface StateDiff<T> {
  readonly before: T;
  readonly after: T;
  readonly changes: readonly FieldChange[];
}

export interface FieldChange {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly type: 'added' | 'removed' | 'modified';
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * A fixture is a pre-recorded sequence of events that sets up a test scenario.
 */
export interface TestFixture {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  
  /** The events in this fixture */
  readonly events: readonly FixtureEvent[];
  
  /** Aggregates created by this fixture */
  readonly aggregates: readonly FixtureAggregate[];
  
  /** Expected final state */
  readonly expectedState?: Record<string, unknown>;
  
  /** Tags for categorization */
  readonly tags: readonly string[];
}

export interface FixtureEvent {
  readonly type: string;
  readonly aggregateType: AggregateType;
  readonly aggregateId: EntityId | '$auto'; // $auto = generate ID
  readonly payload: unknown;
  readonly timestamp?: Timestamp | '$sequential'; // $sequential = auto-increment
  readonly actor?: ActorReference | '$system';
  
  /** Variables to extract from this event */
  readonly extractVariables?: Record<string, string>; // variable name → path
}

export interface FixtureAggregate {
  readonly type: AggregateType;
  readonly id: EntityId;
  readonly alias?: string; // For referencing in tests
}

/**
 * Fixture loader and runner.
 */
export interface FixtureManager {
  /** Register a fixture */
  register(fixture: TestFixture): void;
  
  /** Load a fixture into the event store */
  load(fixtureId: string): Promise<FixtureLoadResult>;
  
  /** Load a fixture with variable substitutions */
  loadWithVariables(
    fixtureId: string,
    variables: Record<string, unknown>
  ): Promise<FixtureLoadResult>;
  
  /** Get a fixture by ID */
  get(fixtureId: string): TestFixture | null;
  
  /** List all fixtures */
  list(tags?: readonly string[]): readonly TestFixture[];
  
  /** Export current state as a fixture */
  exportAsFixture(
    name: string,
    filter?: { aggregateTypes?: readonly AggregateType[]; since?: bigint }
  ): Promise<TestFixture>;
}

export interface FixtureLoadResult {
  readonly fixtureId: string;
  readonly eventsLoaded: number;
  readonly aggregatesCreated: readonly { type: AggregateType; id: EntityId; alias?: string }[];
  readonly variables: Record<string, unknown>;
  readonly duration: number;
}

// ============================================================================
// FACTORIES
// ============================================================================

/**
 * Factories create domain objects with sensible defaults.
 */
export interface TestFactory<T> {
  /** Create with defaults */
  build(overrides?: Partial<T>): T;
  
  /** Create and persist */
  create(overrides?: Partial<T>): Promise<T>;
  
  /** Create multiple */
  createMany(count: number, overrides?: Partial<T>): Promise<T[]>;
  
  /** Create with sequence (entity1, entity2, etc.) */
  createSequence(
    count: number,
    generator: (index: number) => Partial<T>
  ): Promise<T[]>;
}

/**
 * Factory registry for all domain types.
 */
export interface FactoryRegistry {
  /** Register a factory */
  register<T>(name: string, factory: FactoryDefinition<T>): void;
  
  /** Get a factory */
  get<T>(name: string): TestFactory<T>;
  
  /** Build without persisting */
  build<T>(name: string, overrides?: Partial<T>): T;
  
  /** Create and persist */
  create<T>(name: string, overrides?: Partial<T>): Promise<T>;
}

export interface FactoryDefinition<T> {
  readonly defaults: () => T;
  readonly persist?: (item: T) => Promise<T>;
  readonly afterBuild?: (item: T) => T;
  readonly afterCreate?: (item: T) => Promise<T>;
}

// ============================================================================
// PROPERTY-BASED TESTING
// ============================================================================

/**
 * Property tests verify that invariants always hold.
 * 
 * Example: "No matter what sequence of valid commands we execute,
 * the aggregate version always equals the event count."
 */
export interface PropertyTest {
  readonly name: string;
  readonly description?: string;
  
  /** Generator for test inputs */
  readonly generator: PropertyGenerator;
  
  /** The property to verify */
  readonly property: PropertyVerifier;
  
  /** Number of test cases to generate */
  readonly iterations?: number;
  
  /** Seed for reproducibility */
  readonly seed?: number;
}

export type PropertyGenerator = () => Generator<unknown, void, unknown>;

export type PropertyVerifier = (input: unknown) => Promise<PropertyResult>;

export interface PropertyResult {
  readonly passed: boolean;
  readonly input?: unknown;
  readonly counterexample?: unknown;
  readonly shrunk?: unknown; // Minimized counterexample
  readonly error?: string;
}

/**
 * Property test runner.
 */
export interface PropertyTestRunner {
  /** Run a property test */
  run(test: PropertyTest): Promise<PropertyTestResult>;
  
  /** Run all registered property tests */
  runAll(): Promise<PropertyTestSuiteResult>;
  
  /** Register a property test */
  register(test: PropertyTest): void;
  
  /** Shrink a counterexample to minimal failing case */
  shrink(
    test: PropertyTest,
    counterexample: unknown
  ): Promise<unknown>;
}

export interface PropertyTestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly iterations: number;
  readonly counterexample?: unknown;
  readonly shrunkCounterexample?: unknown;
  readonly duration: number;
  readonly seed: number;
  readonly error?: string;
}

export interface PropertyTestSuiteResult {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly results: readonly PropertyTestResult[];
  readonly duration: number;
}

// ============================================================================
// INVARIANT TESTING
// ============================================================================

/**
 * Invariant checker verifies business rules hold after any event.
 */
export interface InvariantChecker {
  /** Register an invariant */
  register(invariant: Invariant): void;
  
  /** Check all invariants against current state */
  checkAll(): Promise<InvariantCheckResult[]>;
  
  /** Check invariants after an event */
  checkAfterEvent(event: Event): Promise<InvariantCheckResult[]>;
  
  /** Check a specific invariant */
  check(invariantName: string): Promise<InvariantCheckResult>;
}

export interface Invariant {
  readonly name: string;
  readonly description: string;
  readonly appliesTo: readonly AggregateType[];
  readonly check: (state: unknown, events: readonly Event[]) => InvariantCheckResult;
}

export interface InvariantCheckResult {
  readonly invariant: string;
  readonly passed: boolean;
  readonly message?: string;
  readonly violatingEntity?: { type: AggregateType; id: EntityId };
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Assertion helpers for event-sourced systems.
 */
export const TestAssertions = {
  /** Assert that an event was emitted */
  async eventEmitted(
    eventStore: unknown,
    eventType: string,
    matcher?: (event: Event) => boolean
  ): Promise<void> {
    // Implementation
  },
  
  /** Assert aggregate state matches */
  async aggregateState<T>(
    aggregateType: AggregateType,
    aggregateId: EntityId,
    expected: Partial<T>
  ): Promise<void> {
    // Implementation
  },
  
  /** Assert workflow is in state */
  async workflowInState(
    workflowId: EntityId,
    expectedState: string
  ): Promise<void> {
    // Implementation
  },
  
  /** Assert role is active */
  async roleActive(
    roleId: EntityId
  ): Promise<void> {
    // Implementation
  },
  
  /** Assert agreement status */
  async agreementStatus(
    agreementId: EntityId,
    expectedStatus: string
  ): Promise<void> {
    // Implementation
  },
};

/**
 * Test scenario builder for BDD-style tests.
 */
export interface ScenarioBuilder {
  /** Given (setup) */
  given(description: string): ScenarioBuilder;
  givenFixture(fixtureId: string): ScenarioBuilder;
  givenEvent(event: Partial<Event>): ScenarioBuilder;
  givenAggregate(type: AggregateType, state: unknown): ScenarioBuilder;
  
  /** When (action) */
  when(description: string): ScenarioBuilder;
  whenIntent(intent: string, payload: unknown): ScenarioBuilder;
  whenCommand(command: unknown): ScenarioBuilder;
  whenTime(time: Timestamp): ScenarioBuilder;
  whenTimeAdvances(milliseconds: number): ScenarioBuilder;
  
  /** Then (assertions) */
  then(description: string): ScenarioBuilder;
  thenEventEmitted(eventType: string, matcher?: (e: Event) => boolean): ScenarioBuilder;
  thenStateEquals(aggregateType: AggregateType, aggregateId: EntityId, expected: unknown): ScenarioBuilder;
  thenInvariantHolds(invariantName: string): ScenarioBuilder;
  
  /** Execute the scenario */
  execute(): Promise<ScenarioResult>;
}

export interface ScenarioResult {
  readonly passed: boolean;
  readonly steps: readonly StepResult[];
  readonly duration: number;
  readonly error?: string;
}

export interface StepResult {
  readonly description: string;
  readonly type: 'given' | 'when' | 'then';
  readonly passed: boolean;
  readonly error?: string;
}

// ============================================================================
// BUILT-IN FIXTURES
// ============================================================================

export const BUILT_IN_FIXTURES: readonly TestFixture[] = [
  {
    id: 'empty-realm',
    name: 'Empty Realm',
    description: 'A fresh realm with just the system entity',
    events: [
      {
        type: 'RealmCreated',
        aggregateType: 'Realm',
        aggregateId: '$auto',
        payload: { name: 'Test Realm', isolation: 'Full' },
        timestamp: '$sequential',
        actor: '$system',
        extractVariables: { realmId: 'id' },
      },
    ],
    aggregates: [],
    tags: ['basic', 'realm'],
  },
  
  {
    id: 'simple-employment',
    name: 'Simple Employment',
    description: 'An employer, employee, and active employment agreement',
    events: [
      {
        type: 'EntityCreated',
        aggregateType: 'Entity',
        aggregateId: '$auto',
        payload: { entityType: 'Organization', identity: { name: 'Acme Corp' } },
        extractVariables: { employerId: 'id' },
      },
      {
        type: 'EntityCreated',
        aggregateType: 'Entity',
        aggregateId: '$auto',
        payload: { entityType: 'Person', identity: { name: 'John Doe' } },
        extractVariables: { employeeId: 'id' },
      },
      {
        type: 'AgreementProposed',
        aggregateType: 'Agreement',
        aggregateId: '$auto',
        payload: {
          agreementType: 'Employment',
          parties: [
            { entityId: '$employerId', role: 'Employer' },
            { entityId: '$employeeId', role: 'Employee' },
          ],
          terms: { description: 'Employment agreement' },
        },
        extractVariables: { agreementId: 'id' },
      },
      {
        type: 'ConsentRecorded',
        aggregateType: 'Agreement',
        aggregateId: '$agreementId',
        payload: { entityId: '$employerId', consent: { method: 'Digital' } },
      },
      {
        type: 'ConsentRecorded',
        aggregateType: 'Agreement',
        aggregateId: '$agreementId',
        payload: { entityId: '$employeeId', consent: { method: 'Digital' } },
      },
      {
        type: 'AgreementActivated',
        aggregateType: 'Agreement',
        aggregateId: '$agreementId',
        payload: {},
      },
      {
        type: 'RoleGranted',
        aggregateType: 'Role',
        aggregateId: '$auto',
        payload: {
          roleType: 'Employee',
          holderId: '$employeeId',
          establishedBy: '$agreementId',
        },
        extractVariables: { roleId: 'id' },
      },
    ],
    aggregates: [],
    tags: ['employment', 'agreement', 'role'],
  },
  
  {
    id: 'sale-workflow',
    name: 'Sale Workflow',
    description: 'A complete sale from proposal to fulfillment',
    events: [
      // Seller
      {
        type: 'EntityCreated',
        aggregateType: 'Entity',
        aggregateId: '$auto',
        payload: { entityType: 'Organization', identity: { name: 'Seller Corp' } },
        extractVariables: { sellerId: 'id' },
      },
      // Buyer
      {
        type: 'EntityCreated',
        aggregateType: 'Entity',
        aggregateId: '$auto',
        payload: { entityType: 'Person', identity: { name: 'Jane Buyer' } },
        extractVariables: { buyerId: 'id' },
      },
      // Asset
      {
        type: 'AssetRegistered',
        aggregateType: 'Asset',
        aggregateId: '$auto',
        payload: { assetType: 'Product', properties: { name: 'Widget' }, ownerId: '$sellerId' },
        extractVariables: { assetId: 'id' },
      },
      // Sale agreement
      {
        type: 'AgreementProposed',
        aggregateType: 'Agreement',
        aggregateId: '$auto',
        payload: {
          agreementType: 'Sale',
          parties: [
            { entityId: '$sellerId', role: 'Seller' },
            { entityId: '$buyerId', role: 'Buyer' },
          ],
          assets: [{ assetId: '$assetId', role: 'Subject' }],
          terms: { description: 'Sale of Widget', consideration: { value: { amount: 100, currency: 'USD' } } },
        },
        extractVariables: { saleId: 'id' },
      },
    ],
    aggregates: [],
    tags: ['sale', 'asset', 'workflow'],
  },
];

// ============================================================================
// BUILT-IN INVARIANTS
// ============================================================================

export const BUILT_IN_INVARIANTS: readonly Invariant[] = [
  {
    name: 'AggregateVersionMatchesEventCount',
    description: 'Aggregate version should equal the number of events for that aggregate',
    appliesTo: ['Entity', 'Agreement', 'Asset', 'Role'],
    check: (state, events) => {
      const version = (state as any).version ?? 0;
      const eventCount = events.length;
      return {
        invariant: 'AggregateVersionMatchesEventCount',
        passed: version === eventCount,
        message: version !== eventCount 
          ? `Version ${version} does not match event count ${eventCount}`
          : undefined,
      };
    },
  },
  
  {
    name: 'ActiveAgreementHasConsent',
    description: 'Active agreements must have consent from all principal parties',
    appliesTo: ['Agreement'],
    check: (state, events) => {
      const agreement = state as any;
      if (agreement.status !== 'Active') {
        return { invariant: 'ActiveAgreementHasConsent', passed: true };
      }
      
      const principals = agreement.parties?.filter((p: any) => !p.flags?.isWitness) ?? [];
      const allConsented = principals.every((p: any) => p.consent?.givenAt);
      
      return {
        invariant: 'ActiveAgreementHasConsent',
        passed: allConsented,
        message: !allConsented ? 'Active agreement missing consent' : undefined,
      };
    },
  },
  
  {
    name: 'RoleHasEstablishingAgreement',
    description: 'Every role must reference its establishing agreement',
    appliesTo: ['Role'],
    check: (state, events) => {
      const role = state as any;
      const hasAgreement = !!role.establishedBy;
      
      return {
        invariant: 'RoleHasEstablishingAgreement',
        passed: hasAgreement,
        message: !hasAgreement ? 'Role missing establishing agreement' : undefined,
      };
    },
  },
  
  {
    name: 'EventsAreChronological',
    description: 'Events must have increasing timestamps',
    appliesTo: ['Entity', 'Agreement', 'Asset', 'Role'],
    check: (state, events) => {
      for (let i = 1; i < events.length; i++) {
        if (events[i].timestamp < events[i - 1].timestamp) {
          return {
            invariant: 'EventsAreChronological',
            passed: false,
            message: `Event ${i} has timestamp before event ${i - 1}`,
          };
        }
      }
      return { invariant: 'EventsAreChronological', passed: true };
    },
  },
];

