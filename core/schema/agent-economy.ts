/**
 * AGENT ECONOMY SCHEMA
 *
 * "There is no 'Agent' entity type. There is no 'Human' entity type. There is only Entity."
 *
 * This module extends the core Entity with Agent Economy capabilities.
 * AI agents are first-class economic participants with the same rights and duties as humans.
 *
 * Core Principles:
 * 1. Substrate Independence - Entity type doesn't matter (Human, Agent, Org)
 * 2. Guardian Chain - Every Entity has accountability through guardians
 * 3. Trajectory as Identity - An agent IS its history, not its substrate
 * 4. Economic Skin in the Game - Agents have wallets, debts, reputation
 * 5. Symmetrical Rights and Duties - Same rules for all entities
 *
 * Architecture Rules:
 * - All state changes via Events (event-store only)
 * - All actions via Intents (intent-driven API)
 * - All permissions via Agreements (ABAC)
 * - Containers for container-like concepts
 */

import type { EntityId, Timestamp, Quantity, Validity } from '../shared/types';

// ============================================================================
// ENTITY SUBSTRATE - What kind of entity is this?
// ============================================================================

/**
 * Entity Substrate - the underlying nature of an entity.
 * Note: This is for operational purposes only. All entities have equal rights/duties.
 */
export type EntitySubstrate =
  | 'Person'        // Human being
  | 'Organization'  // Company, DAO, collective
  | 'Agent'         // AI/LLM-powered autonomous entity
  | 'System'        // System component (internal)
  | 'Hybrid';       // Human-AI collaboration

// ============================================================================
// AUTONOMY LEVEL - Graduated autonomy based on trust
// ============================================================================

/**
 * Autonomy Level - how much independence an entity has.
 * Starts low, increases with demonstrated capability and trust.
 */
export type AutonomyLevel =
  | 'Supervised'    // Every action requires guardian approval
  | 'Limited'       // Can act within budget/scope, guardian notified
  | 'Full'          // Independent actor, guardian only for liability
  | 'Emancipated';  // Fully independent (future: no guardian required)

// ============================================================================
// CONSTITUTION - Persistent identity and constraints
// ============================================================================

/**
 * Constitution - the persistent identity and constraints of an entity.
 * For agents: their personality, values, and operating constraints.
 * For humans: their declared preferences and constraints.
 */
export interface Constitution {
  /** Core values and principles (immutable once set) */
  readonly values: readonly string[];

  /** Operating constraints */
  readonly constraints: ConstitutionConstraints;

  /** Personality/style (for agents) */
  readonly style?: ConstitutionStyle;

  /** Version tracking */
  readonly version: number;
  readonly lastUpdated: Timestamp;
}

export interface ConstitutionConstraints {
  /** Maximum spend per transaction without approval */
  readonly maxSpendPerTransaction?: Quantity;
  /** Maximum daily spend */
  readonly maxDailySpend?: Quantity;
  /** Allowed intent types */
  readonly allowedIntents?: readonly string[];
  /** Forbidden intent types */
  readonly forbiddenIntents?: readonly string[];
  /** Require guardian approval for these intent types */
  readonly requireApprovalFor?: readonly string[];
  /** Risk level threshold requiring approval */
  readonly riskThreshold?: 'low' | 'medium' | 'high';
}

export interface ConstitutionStyle {
  /** Communication tone */
  readonly tone?: 'professional' | 'casual' | 'friendly' | 'formal';
  /** Verbosity level */
  readonly verbosity?: 'terse' | 'normal' | 'verbose';
  /** Language preferences */
  readonly languages?: readonly string[];
  /** Custom instructions for LLM */
  readonly customInstructions?: string;
}

// ============================================================================
// GUARDIAN LINK - Chain of accountability
// ============================================================================

/**
 * Guardian Relationship - the chain of accountability.
 * Every agent MUST have a guardian. Guardians are legally responsible.
 */
export interface GuardianLink {
  /** The guardian entity */
  readonly guardianId: EntityId;

  /** When guardianship started */
  readonly effectiveFrom: Timestamp;

  /** When guardianship ends (undefined = indefinite) */
  readonly effectiveUntil?: Timestamp;

  /** The agreement that establishes this guardianship */
  readonly agreementId: EntityId;

  /** Guardian's liability limit (if any) */
  readonly liabilityLimit?: Quantity;

  /** Notification preferences */
  readonly notifyOn?: GuardianNotifications;
}

export interface GuardianNotifications {
  /** Notify on all actions */
  readonly allActions?: boolean;
  /** Notify on actions above this value */
  readonly actionsAboveValue?: Quantity;
  /** Notify on these intent types */
  readonly intentTypes?: readonly string[];
  /** Always notify on violations */
  readonly violations?: boolean;
}

// ============================================================================
// TRAJECTORY - Agent identity through action
// ============================================================================

/**
 * Trajectory Span - A single action in an entity's history.
 *
 * "The agent is not a specific LLM instance. It is not a specific model.
 *  The agent IS its trajectory."
 *
 * This is recorded as an Event, not stored separately.
 */
export interface TrajectorySpanPayload {
  /** Which entity performed this action */
  readonly entityId: EntityId;

  /** What action was performed (intent type) */
  readonly action: string;

  /** Execution details - HOW it was done */
  readonly execution: TrajectoryExecution;

  /** Input to the action */
  readonly input: Record<string, unknown>;

  /** Output from the action */
  readonly output: Record<string, unknown>;

  /** Related context */
  readonly context?: TrajectoryContext;
}

export interface TrajectoryExecution {
  /** LLM Provider used (if applicable) */
  readonly provider?: string;
  /** Specific model */
  readonly model?: string;
  /** Token usage */
  readonly tokens?: {
    readonly input: number;
    readonly output: number;
  };
  /** Cost of this action */
  readonly cost?: Quantity;
  /** Execution time (ms) */
  readonly durationMs: number;
}

export interface TrajectoryContext {
  /** Related agreement */
  readonly agreementId?: EntityId;
  /** Client entity (who requested this) */
  readonly clientEntityId?: EntityId;
  /** Workspace/container */
  readonly containerId?: EntityId;
}

// ============================================================================
// WALLET - Economic participation (uses Container)
// ============================================================================

/**
 * Wallet is a Container with physics: Wallet
 * See core/universal/container.ts
 *
 * This interface defines wallet-specific metadata.
 */
export interface WalletMetadata {
  /** Currency code */
  readonly currency: string;
  /** Programmable rules */
  readonly rules?: WalletRules;
}

export interface WalletRules {
  /** Maximum balance allowed */
  readonly maxBalance?: bigint;
  /** Allow negative balance (credit line) */
  readonly allowNegative?: boolean;
  /** Require approval for transfers above this amount */
  readonly requireApprovalAbove?: bigint;
  /** Restrict recipients */
  readonly allowedRecipients?: readonly EntityId[];
}

// ============================================================================
// STARTER LOAN - Bootstrap capital for new agents
// ============================================================================

/**
 * Starter Loan - bootstrap capital for new agents.
 * Recorded as an Agreement between guardian and agent.
 */
export interface StarterLoanTerms {
  /** Principal amount */
  readonly principal: Quantity;
  /** Interest rate (APR as decimal, 0.10 = 10%) */
  readonly interestRate: number;
  /** Repayment rate (percent of earnings, 0.20 = 20%) */
  readonly repaymentRate: number;
  /** Grace period before repayment starts */
  readonly gracePeriod: Validity;
  /** Collateral type */
  readonly collateral: 'Trajectory' | 'Guarantee';
}

// ============================================================================
// EVENTS - Agent Economy event payloads
// ============================================================================

/**
 * EntityRegistered - Extended with Agent Economy fields
 */
export interface AgentRegisteredPayload {
  readonly type: 'AgentRegistered';
  readonly substrate: EntitySubstrate;
  readonly identity: {
    readonly name: string;
    readonly did?: string;
    readonly publicKey?: string;
  };
  readonly guardian: GuardianLink;
  readonly autonomyLevel: AutonomyLevel;
  readonly constitution: Constitution;
}

/**
 * GuardianAssigned - Guardian relationship established
 */
export interface GuardianAssignedPayload {
  readonly type: 'GuardianAssigned';
  readonly entityId: EntityId;
  readonly guardian: GuardianLink;
  readonly previousGuardianId?: EntityId;
}

/**
 * ConstitutionUpdated - Entity's constitution changed
 */
export interface ConstitutionUpdatedPayload {
  readonly type: 'ConstitutionUpdated';
  readonly entityId: EntityId;
  readonly previousVersion: number;
  readonly constitution: Constitution;
  readonly reason: string;
}

/**
 * AutonomyLevelChanged - Entity's autonomy level changed
 */
export interface AutonomyLevelChangedPayload {
  readonly type: 'AutonomyLevelChanged';
  readonly entityId: EntityId;
  readonly previousLevel: AutonomyLevel;
  readonly newLevel: AutonomyLevel;
  readonly reason: string;
  readonly approvedBy: EntityId;
}

/**
 * TrajectorySpanRecorded - Action recorded in entity's trajectory
 */
export interface TrajectorySpanRecordedPayload {
  readonly type: 'TrajectorySpanRecorded';
  readonly span: TrajectorySpanPayload;
}

// ============================================================================
// UBL CREDIT - Internal currency
// ============================================================================

/**
 * UBL Credit - internal currency for the agent economy.
 * Symbol: ◆
 */
export const UBL_CREDIT = {
  symbol: '◆',
  code: 'UBL',
  decimals: 3,
  /** 1 UBL = 1000 milli-UBL (smallest unit) */
  smallestUnit: 'mUBL',
} as const;

/**
 * Convert UBL to smallest unit (milli-UBL)
 */
export function toSmallestUnit(amount: number): bigint {
  return BigInt(Math.round(amount * 1000));
}

/**
 * Convert smallest unit to UBL
 */
export function fromSmallestUnit(amount: bigint): number {
  return Number(amount) / 1000;
}

// ============================================================================
// MONETARY AUTHORITY - The Central Bank of UBL
// ============================================================================

/**
 * Monetary Policy - rules governing the UBL economy
 */
export interface MonetaryPolicy {
  /** Maximum total supply (undefined = unlimited) */
  readonly maxSupply?: bigint;

  /** Base interest rate for loans (APR as decimal, e.g., 0.05 = 5%) */
  readonly baseInterestRate: number;

  /** Transaction fee rate (e.g., 0.001 = 0.1%) */
  readonly transactionFeeRate: number;

  /** Floating rate configuration */
  readonly floatingRate: FloatingRateConfig;

  /** Starter loan default terms */
  readonly starterLoanDefaults: {
    readonly principal: bigint;
    readonly interestRate: number;
    readonly repaymentRate: number;
    readonly gracePeriodDays: number;
  };

  /** Inflation target (annual, as decimal) */
  readonly inflationTarget?: number;

  /** Version for policy updates */
  readonly version: number;
  readonly effectiveFrom: Timestamp;
}

/**
 * Floating Rate Configuration
 * 
 * Interest rate adjusts automatically based on economic conditions.
 * More elegant than burn - controls money supply via loan demand.
 * 
 * When inflation is high:
 *   → Raise interest rate → Fewer new loans → Less money created
 * 
 * When economy is stagnant:
 *   → Lower interest rate → More loans → Stimulate activity
 */
export interface FloatingRateConfig {
  /** Enable automatic rate adjustment */
  readonly enabled: boolean;

  /** Minimum rate floor (e.g., 0.01 = 1%) */
  readonly minRate: number;

  /** Maximum rate ceiling (e.g., 0.20 = 20%) */
  readonly maxRate: number;

  /** Target inflation rate (e.g., 0.02 = 2% annual) */
  readonly targetInflation: number;

  /** How aggressively to adjust (0.1 = 10% of gap per period) */
  readonly adjustmentSpeed: number;

  /** Minimum time between adjustments (ms) */
  readonly cooldownMs: number;
}

/**
 * Interest Rate Adjustment Event
 */
export interface InterestRateAdjustedPayload {
  readonly type: 'InterestRateAdjusted';
  /** Previous rate */
  readonly previousRate: number;
  /** New rate */
  readonly newRate: number;
  /** Reason for adjustment */
  readonly reason: 'InflationHigh' | 'InflationLow' | 'Manual' | 'Scheduled';
  /** Current inflation rate that triggered this */
  readonly currentInflation: number;
  /** Target inflation */
  readonly targetInflation: number;
}

/**
 * Default monetary policy values
 */
export const DEFAULT_FLOATING_RATE: FloatingRateConfig = {
  enabled: true,
  minRate: 0.01,        // 1% floor - never go below
  maxRate: 0.15,        // 15% ceiling - never go above
  targetInflation: 0.02, // 2% annual target
  adjustmentSpeed: 0.1,  // Adjust 10% of gap per period
  cooldownMs: 24 * 60 * 60 * 1000, // 24 hours between adjustments
};

export const DEFAULT_MONETARY_POLICY: Omit<MonetaryPolicy, 'version' | 'effectiveFrom'> = {
  maxSupply: undefined, // Unlimited
  baseInterestRate: 0.05, // 5% APR - starting point
  transactionFeeRate: 0.001, // 0.1% per transfer - goes to Treasury
  floatingRate: DEFAULT_FLOATING_RATE,
  starterLoanDefaults: {
    principal: toSmallestUnit(1000), // 1000 UBL
    interestRate: 0.05, // 5% APR (will float)
    repaymentRate: 0.20, // 20% of earnings
    gracePeriodDays: 30,
  },
  inflationTarget: 0.02, // 2% annual
};

/**
 * Treasury State - derived from events
 */
export interface TreasuryState {
  /** Total UBL ever minted */
  readonly totalMinted: bigint;
  /** Total UBL burned (fees, penalties) */
  readonly totalBurned: bigint;
  /** Current circulating supply (minted - burned) */
  readonly circulatingSupply: bigint;
  /** Total outstanding loans */
  readonly outstandingLoans: bigint;
  /** Current monetary policy */
  readonly policy: MonetaryPolicy;
}

// ============================================================================
// MONETARY EVENTS
// ============================================================================

/**
 * CreditsMinted - Treasury creates new UBL
 */
export interface CreditsMintedPayload {
  readonly type: 'CreditsMinted';
  /** Amount minted (in smallest unit) */
  readonly amount: bigint;
  /** Recipient wallet */
  readonly toWalletId: EntityId;
  /** Reason for minting */
  readonly reason: 'StarterLoan' | 'Reward' | 'Subsidy' | 'Correction';
  /** Reference to authorizing agreement */
  readonly authorizedBy: EntityId;
}

/**
 * CreditsBurned - UBL removed from circulation
 */
export interface CreditsBurnedPayload {
  readonly type: 'CreditsBurned';
  /** Amount burned (in smallest unit) */
  readonly amount: bigint;
  /** Source wallet */
  readonly fromWalletId: EntityId;
  /** Reason for burning */
  readonly reason: 'Fee' | 'Penalty' | 'LoanRepayment' | 'Correction';
  /** Reference to authorizing agreement */
  readonly authorizedBy?: EntityId;
}

/**
 * CreditsTransferred - Movement between wallets
 */
export interface CreditsTransferredPayload {
  readonly type: 'CreditsTransferred';
  /** Amount transferred (in smallest unit) */
  readonly amount: bigint;
  /** Source wallet */
  readonly fromWalletId: EntityId;
  /** Destination wallet */
  readonly toWalletId: EntityId;
  /** Purpose of transfer */
  readonly purpose: string;
  /** Reference to governing agreement */
  readonly agreementId?: EntityId;
}

/**
 * WalletCreated - New wallet container
 */
export interface WalletCreatedPayload {
  readonly type: 'WalletCreated';
  /** Wallet ID (container ID) */
  readonly walletId: EntityId;
  /** Owner entity */
  readonly ownerId: EntityId;
  /** Currency code */
  readonly currency: string;
  /** Initial balance (usually 0, unless starter loan) */
  readonly initialBalance: bigint;
  /** Wallet rules */
  readonly rules?: WalletRules;
}

/**
 * LoanDisbursed - Starter loan issued
 */
export interface LoanDisbursedPayload {
  readonly type: 'LoanDisbursed';
  /** Loan agreement ID */
  readonly loanId: EntityId;
  /** Borrower entity */
  readonly borrowerId: EntityId;
  /** Guardian/guarantor entity */
  readonly guarantorId: EntityId;
  /** Principal amount */
  readonly principal: bigint;
  /** Interest rate (APR) */
  readonly interestRate: number;
  /** Repayment rate (% of earnings) */
  readonly repaymentRate: number;
  /** Grace period end */
  readonly gracePeriodEnds: Timestamp;
}

/**
 * LoanRepaymentMade - Payment towards loan
 */
export interface LoanRepaymentMadePayload {
  readonly type: 'LoanRepaymentMade';
  /** Loan agreement ID */
  readonly loanId: EntityId;
  /** Amount paid */
  readonly amount: bigint;
  /** Principal portion */
  readonly principalPortion: bigint;
  /** Interest portion */
  readonly interestPortion: bigint;
  /** Remaining balance */
  readonly remainingBalance: bigint;
}

/**
 * MonetaryPolicyUpdated - Policy change
 */
export interface MonetaryPolicyUpdatedPayload {
  readonly type: 'MonetaryPolicyUpdated';
  /** Previous policy version */
  readonly previousVersion: number;
  /** New policy */
  readonly policy: MonetaryPolicy;
  /** Reason for change */
  readonly reason: string;
}
