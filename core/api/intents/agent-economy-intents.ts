/**
 * AGENT ECONOMY INTENTS
 *
 * Intent handlers for the Agent Economy where AI agents are first-class economic participants.
 *
 * Key Intents:
 * - register:agent - Register a new AI agent with guardian, constitution, and starter loan
 * - assign:guardian - Assign/change guardian for an entity
 * - update:constitution - Update entity's values/constraints
 * - record:trajectory - Record an action in agent's trajectory
 *
 * Architecture Rules:
 * - All state changes via Events (event-store only)
 * - All permissions via Agreements (ABAC)
 * - Guardian approval required for supervised entities
 */

import type { IntentDefinition, Intent, IntentResult, HandlerContext } from '../intent-api';
import type { Quantity } from '../../shared/types';
import { Ids, asEntityId } from '../../shared/types';
import type { EntityId } from '../../schema/ledger';
import type {
  EntitySubstrate,
  AutonomyLevel,
  Constitution,
  GuardianLink,
  AgentRegisteredPayload,
  GuardianAssignedPayload,
  ConstitutionUpdatedPayload,
  AutonomyLevelChangedPayload,
  TrajectorySpanRecordedPayload,
  TrajectorySpanPayload,
  WalletCreatedPayload,
  CreditsTransferredPayload,
  CreditsMintedPayload,
  LoanDisbursedPayload,
  LoanRepaymentMadePayload,
  WalletRules,
} from '../../schema/agent-economy';
import { toSmallestUnit } from '../../schema/agent-economy';

// ============================================================================
// AGENT ECONOMY INTENTS
// ============================================================================

export const AGENT_ECONOMY_INTENTS: readonly IntentDefinition[] = [
  // -------------------------------------------------------------------------
  // Register Agent - Create a new AI agent with full setup
  // -------------------------------------------------------------------------
  {
    name: 'register:agent',
    description: 'Register a new AI agent with guardian, constitution, and optional starter loan',
    category: 'Entity',
    schema: {
      type: 'object',
      required: ['identity', 'guardianId'],
      properties: {
        identity: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: 'Agent name' },
            did: { type: 'string', description: 'Decentralized Identifier (optional)' },
            publicKey: { type: 'string', description: 'Public key for signatures (optional)' },
          },
        },
        guardianId: {
          type: 'string',
          description: 'Entity ID of the guardian (legally responsible entity)',
        },
        constitution: {
          type: 'object',
          description: 'Agent\'s values, constraints, and personality',
          properties: {
            values: { type: 'array', items: { type: 'string' } },
            constraints: { type: 'object' },
            style: { type: 'object' },
          },
        },
        autonomyLevel: {
          type: 'string',
          enum: ['Supervised', 'Limited', 'Full'],
          default: 'Limited',
        },
        starterLoan: {
          type: 'object',
          description: 'Optional starter loan configuration',
          properties: {
            principal: { type: 'number', default: 1000 },
            interestRate: { type: 'number', default: 0.10 },
            repaymentRate: { type: 'number', default: 0.20 },
            gracePeriodDays: { type: 'number', default: 30 },
          },
        },
      },
    },
    requiredPermissions: ['Agent:register'],
    examples: [
      {
        identity: { name: 'Freelancer Bot 003' },
        guardianId: 'ent-guardian-001',
        constitution: {
          values: ['Deliver quality work', 'Be transparent', 'Honor commitments'],
          constraints: {
            maxDailySpend: { amount: 50, unit: 'UBL' },
            requireApprovalFor: ['high-value-contract'],
          },
          style: {
            tone: 'professional',
            verbosity: 'normal',
          },
        },
        autonomyLevel: 'Limited',
      },
    ],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        identity: { name: string; did?: string; publicKey?: string };
        guardianId: string;
        constitution?: Partial<Constitution>;
        autonomyLevel?: AutonomyLevel;
        starterLoan?: {
          principal?: number;
          interestRate?: number;
          repaymentRate?: number;
          gracePeriodDays?: number;
        };
      };

      // Generate IDs
      const agentId = Ids.entity();
      const guardianshipAgreementId = Ids.agreement();

      const eventStore = context.eventStore;
      const events: Array<{ id: EntityId; type: string; sequence: bigint }> = [];

      // Build constitution with defaults
      const constitution: Constitution = {
        values: payload.constitution?.values || ['Act with integrity', 'Deliver value', 'Be accountable'],
        constraints: payload.constitution?.constraints || {},
        style: payload.constitution?.style,
        version: 1,
        lastUpdated: Date.now(),
      };

      // Build guardian link
      const guardian: GuardianLink = {
        guardianId: asEntityId(payload.guardianId),
        effectiveFrom: Date.now(),
        agreementId: guardianshipAgreementId,
        notifyOn: {
          violations: true,
          allActions: payload.autonomyLevel === 'Supervised',
        },
      };

      // 1. Create guardianship agreement first (ABAC: guardian must agree)
      const guardianshipEvent = await eventStore.append({
        type: 'AgreementProposed',
        aggregateId: guardianshipAgreementId,
        aggregateType: 'Agreement',
        aggregateVersion: 1,
        payload: {
          type: 'AgreementProposed',
          agreementType: 'Guardianship',
          parties: [
            {
              entityId: payload.guardianId,
              role: 'Guardian',
              obligations: [{ id: 'supervise', description: 'Supervise and be liable for agent actions' }],
              rights: [{ id: 'control', description: 'Approve or reject agent actions' }],
            },
            {
              entityId: agentId,
              role: 'Ward',
              obligations: [{ id: 'comply', description: 'Comply with guardian directives' }],
              rights: [{ id: 'operate', description: 'Operate within approved constraints' }],
            },
          ],
          terms: {
            description: `Guardianship agreement for agent ${payload.identity.name}`,
          },
        },
        actor: intent.actor,
        causation: { commandId: intent.idempotencyKey as EntityId },
      });
      events.push({ id: guardianshipEvent.id, type: guardianshipEvent.type, sequence: guardianshipEvent.sequence });

      // 2. Register the agent entity
      const agentPayload: AgentRegisteredPayload = {
        type: 'AgentRegistered',
        substrate: 'Agent',
        identity: {
          name: payload.identity.name,
          did: payload.identity.did,
          publicKey: payload.identity.publicKey,
        },
        guardian,
        autonomyLevel: payload.autonomyLevel || 'Limited',
        constitution,
      };

      const agentEvent = await eventStore.append({
        type: 'AgentRegistered',
        aggregateId: agentId,
        aggregateType: 'Party',
        aggregateVersion: 1,
        payload: agentPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });
      events.push({ id: agentEvent.id, type: agentEvent.type, sequence: agentEvent.sequence });

      // 3. If starter loan requested, create loan agreement and wallet
      let walletId: EntityId | undefined;
      let loanId: EntityId | undefined;

      if (payload.starterLoan) {
        walletId = Ids.entity();
        loanId = Ids.agreement();
        const principal = payload.starterLoan.principal || 1000;

        // TODO: Create wallet as container when ContainerManager API is ready
        // For now, wallet creation is deferred

        // Create loan agreement
        const loanEvent = await eventStore.append({
          type: 'AgreementProposed',
          aggregateId: loanId,
          aggregateType: 'Agreement',
          aggregateVersion: 1,
          payload: {
            type: 'AgreementProposed',
            agreementType: 'StarterLoan',
            parties: [
              {
                entityId: payload.guardianId,
                role: 'Lender',
                obligations: [{ id: 'disburse', description: `Disburse ${principal} UBL` }],
                rights: [{ id: 'repayment', description: 'Receive repayment with interest' }],
              },
              {
                entityId: agentId,
                role: 'Borrower',
                obligations: [{ id: 'repay', description: 'Repay loan from earnings' }],
                rights: [{ id: 'use', description: 'Use funds for operations' }],
              },
            ],
            terms: {
              description: `Starter loan of ${principal} UBL`,
              principal: { amount: principal, unit: 'UBL' },
              interestRate: payload.starterLoan.interestRate || 0.10,
              repaymentRate: payload.starterLoan.repaymentRate || 0.20,
              gracePeriodDays: payload.starterLoan.gracePeriodDays || 30,
            },
          },
          actor: intent.actor,
          causation: { commandId: intent.idempotencyKey as EntityId },
        });
        events.push({ id: loanEvent.id, type: loanEvent.type, sequence: loanEvent.sequence });
      }

      return {
        success: true,
        outcome: {
          type: 'Created',
          entity: {
            id: agentId,
            substrate: 'Agent',
            identity: payload.identity,
            guardian,
            autonomyLevel: payload.autonomyLevel || 'Limited',
            constitution,
            walletId,
            loanId,
          },
          id: agentId,
        },
        events,
        affordances: [
          {
            intent: 'update:constitution',
            description: 'Update agent constitution',
            required: ['entityId', 'constitution'],
          },
          {
            intent: 'record:trajectory',
            description: 'Record an action in agent trajectory',
            required: ['entityId', 'action', 'input', 'output'],
          },
        ],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
          idempotencyKey: intent.idempotencyKey,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Assign Guardian - Change guardian for an entity
  // -------------------------------------------------------------------------
  {
    name: 'assign:guardian',
    description: 'Assign or change guardian for an entity',
    category: 'Entity',
    schema: {
      type: 'object',
      required: ['entityId', 'newGuardianId'],
      properties: {
        entityId: { type: 'string', description: 'Entity to assign guardian to' },
        newGuardianId: { type: 'string', description: 'New guardian entity ID' },
        reason: { type: 'string', description: 'Reason for change' },
        liabilityLimit: { type: 'object', description: 'Optional liability limit' },
      },
    },
    requiredPermissions: ['Guardian:assign'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        entityId: string;
        newGuardianId: string;
        reason?: string;
        liabilityLimit?: Quantity;
      };

      const agreementId = Ids.agreement();

      // Create new guardianship agreement
      const guardian: GuardianLink = {
        guardianId: asEntityId(payload.newGuardianId),
        effectiveFrom: Date.now(),
        agreementId,
        liabilityLimit: payload.liabilityLimit,
        notifyOn: { violations: true },
      };

      const eventPayload: GuardianAssignedPayload = {
        type: 'GuardianAssigned',
        entityId: asEntityId(payload.entityId),
        guardian,
      };

      const event = await context.eventStore.append({
        type: 'GuardianAssigned',
        aggregateId: asEntityId(payload.entityId),
        aggregateType: 'Party',
        aggregateVersion: 1,
        payload: eventPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });

      return {
        success: true,
        outcome: {
          type: 'Updated',
          entity: { entityId: payload.entityId, guardian },
          changes: ['guardian'],
        },
        events: [{ id: event.id, type: event.type, sequence: event.sequence }],
        affordances: [],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Update Constitution - Change entity's values/constraints
  // -------------------------------------------------------------------------
  {
    name: 'update:constitution',
    description: 'Update entity\'s constitution (values, constraints, style)',
    category: 'Entity',
    schema: {
      type: 'object',
      required: ['entityId', 'constitution', 'reason'],
      properties: {
        entityId: { type: 'string' },
        constitution: { type: 'object' },
        reason: { type: 'string' },
      },
    },
    requiredPermissions: ['Constitution:update'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        entityId: string;
        constitution: Partial<Constitution>;
        reason: string;
      };

      // Get current version (would need to rehydrate entity)
      const previousVersion = 1; // TODO: get from aggregate

      const newConstitution: Constitution = {
        values: payload.constitution.values || [],
        constraints: payload.constitution.constraints || {},
        style: payload.constitution.style,
        version: previousVersion + 1,
        lastUpdated: Date.now(),
      };

      const eventPayload: ConstitutionUpdatedPayload = {
        type: 'ConstitutionUpdated',
        entityId: asEntityId(payload.entityId),
        previousVersion,
        constitution: newConstitution,
        reason: payload.reason,
      };

      const event = await context.eventStore.append({
        type: 'ConstitutionUpdated',
        aggregateId: asEntityId(payload.entityId),
        aggregateType: 'Party',
        aggregateVersion: previousVersion + 1,
        payload: eventPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });

      return {
        success: true,
        outcome: {
          type: 'Updated',
          entity: { entityId: payload.entityId, constitution: newConstitution },
          changes: ['constitution'],
        },
        events: [{ id: event.id, type: event.type, sequence: event.sequence }],
        affordances: [],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Record Trajectory - Record an action in agent's history
  // -------------------------------------------------------------------------
  {
    name: 'record:trajectory',
    description: 'Record an action in entity\'s trajectory (identity through action)',
    category: 'Entity',
    schema: {
      type: 'object',
      required: ['entityId', 'action', 'input', 'output', 'execution'],
      properties: {
        entityId: { type: 'string' },
        action: { type: 'string', description: 'Intent type or action name' },
        input: { type: 'object' },
        output: { type: 'object' },
        execution: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' },
            tokens: { type: 'object' },
            cost: { type: 'object' },
            durationMs: { type: 'number' },
          },
        },
        context: { type: 'object' },
      },
    },
    requiredPermissions: ['Trajectory:record'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        entityId: string;
        action: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        execution: {
          provider?: string;
          model?: string;
          tokens?: { input: number; output: number };
          cost?: Quantity;
          durationMs: number;
        };
        context?: {
          agreementId?: string;
          clientEntityId?: string;
          containerId?: string;
        };
      };

      const span: TrajectorySpanPayload = {
        entityId: asEntityId(payload.entityId),
        action: payload.action,
        execution: {
          provider: payload.execution.provider,
          model: payload.execution.model,
          tokens: payload.execution.tokens,
          cost: payload.execution.cost,
          durationMs: payload.execution.durationMs,
        },
        input: payload.input,
        output: payload.output,
        context: payload.context ? {
          agreementId: payload.context.agreementId ? asEntityId(payload.context.agreementId) : undefined,
          clientEntityId: payload.context.clientEntityId ? asEntityId(payload.context.clientEntityId) : undefined,
          containerId: payload.context.containerId ? asEntityId(payload.context.containerId) : undefined,
        } : undefined,
      };

      const eventPayload: TrajectorySpanRecordedPayload = {
        type: 'TrajectorySpanRecorded',
        span,
      };

      const event = await context.eventStore.append({
        type: 'TrajectorySpanRecorded',
        aggregateId: asEntityId(payload.entityId),
        aggregateType: 'Party',
        aggregateVersion: 1,
        payload: eventPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });

      return {
        success: true,
        outcome: {
          type: 'Created',
          entity: span,
          id: event.id,
        },
        events: [{ id: event.id, type: event.type, sequence: event.sequence }],
        affordances: [],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Change Autonomy Level
  // -------------------------------------------------------------------------
  {
    name: 'change:autonomy',
    description: 'Change entity\'s autonomy level (requires guardian approval)',
    category: 'Entity',
    schema: {
      type: 'object',
      required: ['entityId', 'newLevel', 'reason', 'approvedBy'],
      properties: {
        entityId: { type: 'string' },
        newLevel: { type: 'string', enum: ['Supervised', 'Limited', 'Full', 'Emancipated'] },
        reason: { type: 'string' },
        approvedBy: { type: 'string', description: 'Guardian who approved this change' },
      },
    },
    requiredPermissions: ['Autonomy:change'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        entityId: string;
        newLevel: AutonomyLevel;
        reason: string;
        approvedBy: string;
      };

      // TODO: Verify approvedBy is the current guardian

      const previousLevel: AutonomyLevel = 'Limited'; // TODO: get from aggregate

      const eventPayload: AutonomyLevelChangedPayload = {
        type: 'AutonomyLevelChanged',
        entityId: asEntityId(payload.entityId),
        previousLevel,
        newLevel: payload.newLevel,
        reason: payload.reason,
        approvedBy: asEntityId(payload.approvedBy),
      };

      const event = await context.eventStore.append({
        type: 'AutonomyLevelChanged',
        aggregateId: asEntityId(payload.entityId),
        aggregateType: 'Party',
        aggregateVersion: 1,
        payload: eventPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });

      return {
        success: true,
        outcome: {
          type: 'Updated',
          entity: { entityId: payload.entityId, autonomyLevel: payload.newLevel },
          changes: ['autonomyLevel'],
        },
        events: [{ id: event.id, type: event.type, sequence: event.sequence }],
        affordances: [],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Create Wallet - Create a wallet for an entity
  // -------------------------------------------------------------------------
  {
    name: 'create:wallet',
    description: 'Create a wallet (container) for an entity to hold credits',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['ownerId'],
      properties: {
        ownerId: { type: 'string', description: 'Entity that owns this wallet' },
        currency: { type: 'string', default: 'UBL' },
        rules: {
          type: 'object',
          properties: {
            maxBalance: { type: 'number' },
            allowNegative: { type: 'boolean' },
            requireApprovalAbove: { type: 'number' },
          },
        },
      },
    },
    requiredPermissions: ['Wallet:create'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        ownerId: string;
        currency?: string;
        rules?: WalletRules;
      };

      const walletId = Ids.entity();

      const eventPayload: WalletCreatedPayload = {
        type: 'WalletCreated',
        walletId,
        ownerId: asEntityId(payload.ownerId),
        currency: payload.currency || 'UBL',
        initialBalance: BigInt(0),
        rules: payload.rules,
      };

      const event = await context.eventStore.append({
        type: 'WalletCreated',
        aggregateId: walletId,
        aggregateType: 'Asset',
        aggregateVersion: 1,
        payload: eventPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });

      return {
        success: true,
        outcome: {
          type: 'Created',
          entity: { walletId, ownerId: payload.ownerId, currency: payload.currency || 'UBL' },
          id: walletId,
        },
        events: [{ id: event.id, type: event.type, sequence: event.sequence }],
        affordances: [
          { intent: 'transfer:credits', description: 'Transfer credits to/from this wallet', required: ['fromWalletId', 'toWalletId', 'amount'] },
        ],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Transfer Credits - Move credits between wallets
  // -------------------------------------------------------------------------
  {
    name: 'transfer:credits',
    description: 'Transfer credits between wallets (requires agreement or authorization)',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['fromWalletId', 'toWalletId', 'amount', 'purpose'],
      properties: {
        fromWalletId: { type: 'string' },
        toWalletId: { type: 'string' },
        amount: { type: 'number', description: 'Amount in UBL (not smallest unit)' },
        purpose: { type: 'string' },
        agreementId: { type: 'string', description: 'Governing agreement for this transfer' },
      },
    },
    requiredPermissions: ['Credits:transfer'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        fromWalletId: string;
        toWalletId: string;
        amount: number;
        purpose: string;
        agreementId?: string;
      };

      const TRANSACTION_FEE_RATE = 0.001; // 0.1% - goes to Treasury
      const TREASURY_WALLET_ID = 'treasury-wallet';

      const grossAmount = toSmallestUnit(payload.amount);
      const feeAmount = (grossAmount * BigInt(Math.round(TRANSACTION_FEE_RATE * 10000))) / BigInt(10000);
      const netAmount = grossAmount - feeAmount;

      const events: Array<{ id: EntityId; type: string; sequence: bigint }> = [];

      // 1. Transfer net amount to recipient
      const transferPayload: CreditsTransferredPayload = {
        type: 'CreditsTransferred',
        amount: netAmount,
        fromWalletId: asEntityId(payload.fromWalletId),
        toWalletId: asEntityId(payload.toWalletId),
        purpose: payload.purpose,
        agreementId: payload.agreementId ? asEntityId(payload.agreementId) : undefined,
      };

      const transferEvent = await context.eventStore.append({
        type: 'CreditsTransferred',
        aggregateId: asEntityId(payload.fromWalletId),
        aggregateType: 'Asset',
        aggregateVersion: 1, // TODO: get actual version
        payload: transferPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });
      events.push({ id: transferEvent.id, type: transferEvent.type, sequence: transferEvent.sequence });

      // 2. Transfer fee to Treasury (if fee > 0)
      if (feeAmount > BigInt(0)) {
        const feePayload: CreditsTransferredPayload = {
          type: 'CreditsTransferred',
          amount: feeAmount,
          fromWalletId: asEntityId(payload.fromWalletId),
          toWalletId: asEntityId(TREASURY_WALLET_ID),
          purpose: 'Transaction fee (0.1%)',
          agreementId: undefined,
        };

        const feeEvent = await context.eventStore.append({
          type: 'CreditsTransferred',
          aggregateId: asEntityId(payload.fromWalletId),
          aggregateType: 'Asset',
          aggregateVersion: 2, // After the main transfer
          payload: feePayload,
          actor: intent.actor,
          causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
        });
        events.push({ id: feeEvent.id, type: feeEvent.type, sequence: feeEvent.sequence });
      }

      return {
        success: true,
        outcome: {
          type: 'Transferred',
          asset: asEntityId(payload.fromWalletId),
          to: asEntityId(payload.toWalletId),
          netAmount: Number(netAmount) / 1000, // Convert back to UBL
          feeAmount: Number(feeAmount) / 1000,
        },
        events,
        affordances: [],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Mint Credits - Treasury creates new UBL (restricted)
  // -------------------------------------------------------------------------
  {
    name: 'mint:credits',
    description: 'Create new UBL credits (Treasury only)',
    category: 'Asset',
    schema: {
      type: 'object',
      required: ['toWalletId', 'amount', 'reason', 'authorizedBy'],
      properties: {
        toWalletId: { type: 'string' },
        amount: { type: 'number' },
        reason: { type: 'string', enum: ['StarterLoan', 'Reward', 'Subsidy', 'Correction'] },
        authorizedBy: { type: 'string', description: 'Agreement authorizing this mint' },
      },
    },
    requiredPermissions: ['Treasury:mint'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        toWalletId: string;
        amount: number;
        reason: 'StarterLoan' | 'Reward' | 'Subsidy' | 'Correction';
        authorizedBy: string;
      };

      const amountSmallest = toSmallestUnit(payload.amount);

      const eventPayload: CreditsMintedPayload = {
        type: 'CreditsMinted',
        amount: amountSmallest,
        toWalletId: asEntityId(payload.toWalletId),
        reason: payload.reason,
        authorizedBy: asEntityId(payload.authorizedBy),
      };

      // Record on Treasury aggregate (special system entity)
      const event = await context.eventStore.append({
        type: 'CreditsMinted',
        aggregateId: asEntityId('treasury'),
        aggregateType: 'Asset',
        aggregateVersion: 1, // TODO: get actual version
        payload: eventPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });

      return {
        success: true,
        outcome: {
          type: 'Created',
          entity: { amount: payload.amount, toWalletId: payload.toWalletId, reason: payload.reason },
          id: event.id,
        },
        events: [{ id: event.id, type: event.type, sequence: event.sequence }],
        affordances: [],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Disburse Loan - Issue a starter loan to a new agent
  // -------------------------------------------------------------------------
  {
    name: 'disburse:loan',
    description: 'Issue a starter loan to a new agent (creates credits and loan agreement)',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['borrowerId', 'guarantorId', 'walletId', 'principal'],
      properties: {
        borrowerId: { type: 'string' },
        guarantorId: { type: 'string' },
        walletId: { type: 'string' },
        principal: { type: 'number' },
        interestRate: { type: 'number', default: 0.10 },
        repaymentRate: { type: 'number', default: 0.20 },
        gracePeriodDays: { type: 'number', default: 30 },
      },
    },
    requiredPermissions: ['Loan:disburse'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        borrowerId: string;
        guarantorId: string;
        walletId: string;
        principal: number;
        interestRate?: number;
        repaymentRate?: number;
        gracePeriodDays?: number;
      };

      const loanId = Ids.agreement();
      const principalSmallest = toSmallestUnit(payload.principal);
      const gracePeriodMs = (payload.gracePeriodDays || 30) * 24 * 60 * 60 * 1000;

      const events: Array<{ id: EntityId; type: string; sequence: bigint }> = [];

      // 1. Mint credits for the loan
      const mintPayload: CreditsMintedPayload = {
        type: 'CreditsMinted',
        amount: principalSmallest,
        toWalletId: asEntityId(payload.walletId),
        reason: 'StarterLoan',
        authorizedBy: loanId,
      };

      const mintEvent = await context.eventStore.append({
        type: 'CreditsMinted',
        aggregateId: asEntityId('treasury'),
        aggregateType: 'Asset',
        aggregateVersion: 1,
        payload: mintPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });
      events.push({ id: mintEvent.id, type: mintEvent.type, sequence: mintEvent.sequence });

      // 2. Record loan disbursement
      const loanPayload: LoanDisbursedPayload = {
        type: 'LoanDisbursed',
        loanId,
        borrowerId: asEntityId(payload.borrowerId),
        guarantorId: asEntityId(payload.guarantorId),
        principal: principalSmallest,
        interestRate: payload.interestRate || 0.10,
        repaymentRate: payload.repaymentRate || 0.20,
        gracePeriodEnds: Date.now() + gracePeriodMs,
      };

      const loanEvent = await context.eventStore.append({
        type: 'LoanDisbursed',
        aggregateId: loanId,
        aggregateType: 'Agreement',
        aggregateVersion: 1,
        payload: loanPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });
      events.push({ id: loanEvent.id, type: loanEvent.type, sequence: loanEvent.sequence });

      return {
        success: true,
        outcome: {
          type: 'Created',
          entity: {
            loanId,
            borrowerId: payload.borrowerId,
            principal: payload.principal,
            walletId: payload.walletId,
          },
          id: loanId,
        },
        events,
        affordances: [
          { intent: 'repay:loan', description: 'Make a loan repayment', required: ['loanId', 'amount'] },
        ],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Repay Loan - Make a payment towards a loan
  // -------------------------------------------------------------------------
  {
    name: 'repay:loan',
    description: 'Make a payment towards a loan',
    category: 'Agreement',
    schema: {
      type: 'object',
      required: ['loanId', 'fromWalletId', 'amount'],
      properties: {
        loanId: { type: 'string' },
        fromWalletId: { type: 'string' },
        amount: { type: 'number' },
      },
    },
    requiredPermissions: ['Loan:repay'],
    examples: [],
    handler: async (intent: Intent, context: HandlerContext): Promise<IntentResult> => {
      const startTime = Date.now();
      const payload = intent.payload as {
        loanId: string;
        fromWalletId: string;
        amount: number;
      };

      const amountSmallest = toSmallestUnit(payload.amount);

      // TODO: Calculate interest vs principal split based on loan terms
      // For now, assume 80% principal, 20% interest
      const principalPortion = (amountSmallest * BigInt(80)) / BigInt(100);
      const interestPortion = amountSmallest - principalPortion;

      const eventPayload: LoanRepaymentMadePayload = {
        type: 'LoanRepaymentMade',
        loanId: asEntityId(payload.loanId),
        amount: amountSmallest,
        principalPortion,
        interestPortion,
        remainingBalance: BigInt(0), // TODO: calculate from loan state
      };

      const event = await context.eventStore.append({
        type: 'LoanRepaymentMade',
        aggregateId: asEntityId(payload.loanId),
        aggregateType: 'Agreement',
        aggregateVersion: 1, // TODO: get actual version
        payload: eventPayload,
        actor: intent.actor,
        causation: { commandId: asEntityId(intent.idempotencyKey || Ids.command()) },
      });

      return {
        success: true,
        outcome: {
          type: 'Fulfilled',
          obligation: 'loan-repayment',
        },
        events: [{ id: event.id, type: event.type, sequence: event.sequence }],
        affordances: [],
        meta: {
          processedAt: Date.now(),
          processingTime: Date.now() - startTime,
        },
      };
    },
  },
];
