/**
 * THREE-BRANCH GOVERNANCE
 * 
 * SPRINT E.1: Separation of powers for decentralized governance
 * 
 * Branches:
 * - EXECUTIVE: Implements policies, manages day-to-day operations
 * - LEGISLATIVE: Creates rules, sets parameters, allocates budgets
 * - JUDICIAL: Resolves disputes, interprets rules, enforces compliance
 * 
 * Principles:
 * - Checks and balances between branches
 * - No single branch can dominate
 * - Transparent decision-making
 * - Appeal mechanisms
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export type BranchType = 'Executive' | 'Legislative' | 'Judicial';

export interface GovernanceConfig {
  /** Quorum requirements for each branch */
  readonly quorums: {
    readonly executive: number; // e.g., 0.5 = 50%
    readonly legislative: number;
    readonly judicial: number;
  };
  
  /** Voting periods (ms) */
  readonly votingPeriods: {
    readonly standard: number;
    readonly emergency: number;
    readonly constitutional: number;
  };
  
  /** Veto thresholds */
  readonly vetoThresholds: {
    readonly executiveVeto: number; // Legislative can override with this %
    readonly judicialReview: number; // Threshold to strike down
  };
  
  /** Term limits (ms) */
  readonly termLimits: {
    readonly executive: number;
    readonly legislative: number;
    readonly judicial: number;
  };
}

// =============================================================================
// EXECUTIVE BRANCH
// =============================================================================

export interface ExecutiveAction {
  readonly id: string;
  readonly type: ExecutiveActionType;
  readonly proposedBy: EntityId;
  readonly proposedAt: Timestamp;
  readonly status: ActionStatus;
  readonly parameters: Record<string, unknown>;
  readonly executedAt?: Timestamp;
  readonly executedBy?: EntityId;
  readonly vetoedBy?: BranchType;
  readonly vetoReason?: string;
}

export type ExecutiveActionType =
  | 'SetParameter'        // Adjust system parameters
  | 'AllocateFunds'       // Treasury allocation
  | 'AppointOfficial'     // Appoint to position
  | 'DeclareEmergency'    // Emergency powers
  | 'SuspendEntity'       // Temporary suspension
  | 'ExecutePolicy'       // Implement legislative policy
  | 'IssueCurrency'       // Monetary operations
  | 'SetInterestRate';    // Interest rate changes

export type ActionStatus = 
  | 'Proposed'
  | 'UnderReview'
  | 'Approved'
  | 'Executed'
  | 'Vetoed'
  | 'Expired'
  | 'Revoked';

export interface ExecutiveBranch {
  /** Propose an action */
  proposeAction(action: Omit<ExecutiveAction, 'id' | 'status' | 'proposedAt'>): ExecutiveAction;
  
  /** Execute an approved action */
  executeAction(actionId: string, executor: EntityId): Promise<ExecutiveAction>;
  
  /** Get pending actions */
  getPendingActions(): readonly ExecutiveAction[];
  
  /** Get action by ID */
  getAction(actionId: string): ExecutiveAction | undefined;
  
  /** Check if entity has executive authority */
  hasAuthority(entityId: EntityId, actionType: ExecutiveActionType): boolean;
}

// =============================================================================
// LEGISLATIVE BRANCH
// =============================================================================

export interface Proposal {
  readonly id: string;
  readonly type: ProposalType;
  readonly title: string;
  readonly description: string;
  readonly proposedBy: EntityId;
  readonly proposedAt: Timestamp;
  readonly status: ProposalStatus;
  readonly votingEndsAt: Timestamp;
  readonly votes: ProposalVotes;
  readonly content: ProposalContent;
  readonly amendments?: readonly Amendment[];
}

export type ProposalType =
  | 'Policy'              // New policy
  | 'Budget'              // Budget allocation
  | 'Parameter'           // System parameter change
  | 'Constitutional'      // Fundamental rule change
  | 'Appointment'         // Confirm appointment
  | 'Impeachment'         // Remove official
  | 'Override'            // Override executive veto
  | 'Resolution';         // Non-binding statement

export type ProposalStatus =
  | 'Draft'
  | 'Voting'
  | 'Passed'
  | 'Failed'
  | 'Vetoed'
  | 'Enacted'
  | 'Withdrawn';

export interface ProposalVotes {
  readonly for: number;
  readonly against: number;
  readonly abstain: number;
  readonly voters: readonly EntityId[];
  readonly quorumMet: boolean;
}

export interface ProposalContent {
  readonly rules?: readonly Rule[];
  readonly parameters?: Record<string, unknown>;
  readonly budgetAllocations?: readonly BudgetAllocation[];
  readonly appointmentId?: EntityId;
}

export interface Rule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly condition: string; // Expression
  readonly consequence: string; // What happens if violated
  readonly severity: 'Minor' | 'Major' | 'Critical';
}

export interface BudgetAllocation {
  readonly category: string;
  readonly amount: bigint;
  readonly period: 'Monthly' | 'Quarterly' | 'Annual';
  readonly recipient?: EntityId;
}

export interface Amendment {
  readonly id: string;
  readonly proposedBy: EntityId;
  readonly description: string;
  readonly votes: ProposalVotes;
  readonly accepted: boolean;
}

export interface LegislativeBranch {
  /** Submit a proposal */
  submitProposal(proposal: Omit<Proposal, 'id' | 'status' | 'proposedAt' | 'votes' | 'votingEndsAt'>): Proposal;
  
  /** Vote on a proposal */
  vote(proposalId: string, voter: EntityId, vote: 'for' | 'against' | 'abstain'): void;
  
  /** Propose an amendment */
  proposeAmendment(proposalId: string, amendment: Omit<Amendment, 'id' | 'votes' | 'accepted'>): Amendment;
  
  /** Get active proposals */
  getActiveProposals(): readonly Proposal[];
  
  /** Get proposal by ID */
  getProposal(proposalId: string): Proposal | undefined;
  
  /** Finalize voting */
  finalizeVoting(proposalId: string): Proposal;
  
  /** Override executive veto */
  overrideVeto(proposalId: string): boolean;
}

// =============================================================================
// JUDICIAL BRANCH
// =============================================================================

export interface Case {
  readonly id: string;
  readonly type: CaseType;
  readonly title: string;
  readonly description: string;
  readonly filedBy: EntityId;
  readonly filedAt: Timestamp;
  readonly status: CaseStatus;
  readonly parties: readonly CaseParty[];
  readonly evidence: readonly Evidence[];
  readonly ruling?: Ruling;
  readonly appeals?: readonly Appeal[];
}

export type CaseType =
  | 'Dispute'             // Between parties
  | 'Violation'           // Rule violation
  | 'ConstitutionalReview'// Review of law/action
  | 'Appeal'              // Appeal of decision
  | 'Interpretation'      // Rule interpretation
  | 'Injunction';         // Emergency restraint

export type CaseStatus =
  | 'Filed'
  | 'UnderReview'
  | 'Hearing'
  | 'Deliberation'
  | 'Decided'
  | 'Appealed'
  | 'Closed';

export interface CaseParty {
  readonly entityId: EntityId;
  readonly role: 'Plaintiff' | 'Defendant' | 'Witness' | 'Amicus';
  readonly represented?: boolean;
}

export interface Evidence {
  readonly id: string;
  readonly type: 'Document' | 'Transaction' | 'Testimony' | 'Expert';
  readonly submittedBy: EntityId;
  readonly submittedAt: Timestamp;
  readonly content: unknown;
  readonly admitted: boolean;
}

export interface Ruling {
  readonly decision: 'ForPlaintiff' | 'ForDefendant' | 'Mixed' | 'Dismissed';
  readonly reasoning: string;
  readonly remedies?: readonly Remedy[];
  readonly precedent?: boolean;
  readonly issuedAt: Timestamp;
  readonly issuedBy: EntityId;
}

export interface Remedy {
  readonly type: 'Compensation' | 'Injunction' | 'Penalty' | 'Restoration' | 'Nullification';
  readonly description: string;
  readonly amount?: bigint;
  readonly targetEntity?: EntityId;
}

export interface Appeal {
  readonly id: string;
  readonly filedBy: EntityId;
  readonly filedAt: Timestamp;
  readonly grounds: string;
  readonly status: 'Pending' | 'Accepted' | 'Rejected';
  readonly newRuling?: Ruling;
}

export interface JudicialBranch {
  /** File a case */
  fileCase(caseData: Omit<Case, 'id' | 'status' | 'filedAt' | 'evidence' | 'ruling' | 'appeals'>): Case;
  
  /** Submit evidence */
  submitEvidence(caseId: string, evidence: Omit<Evidence, 'id' | 'submittedAt' | 'admitted'>): Evidence;
  
  /** Issue ruling */
  issueRuling(caseId: string, ruling: Omit<Ruling, 'issuedAt'>): Case;
  
  /** File appeal */
  fileAppeal(caseId: string, appeal: Omit<Appeal, 'id' | 'filedAt' | 'status' | 'newRuling'>): Appeal;
  
  /** Review constitutionality */
  reviewConstitutionality(actionId: string | Proposal): ConstitutionalReview;
  
  /** Get active cases */
  getActiveCases(): readonly Case[];
  
  /** Get case by ID */
  getCase(caseId: string): Case | undefined;
}

export interface ConstitutionalReview {
  readonly targetId: string;
  readonly targetType: 'ExecutiveAction' | 'Proposal' | 'Rule';
  readonly constitutional: boolean;
  readonly reasoning: string;
  readonly reviewedAt: Timestamp;
}

// =============================================================================
// GOVERNANCE COORDINATOR
// =============================================================================

export class GovernanceCoordinator {
  private actions = new Map<string, ExecutiveAction>();
  private proposals = new Map<string, Proposal>();
  private cases = new Map<string, Case>();
  private idCounter = 0;
  
  constructor(private readonly config: GovernanceConfig) {}
  
  // ---------------------------------------------------------------------------
  // EXECUTIVE OPERATIONS
  // ---------------------------------------------------------------------------
  
  proposeExecutiveAction(
    action: Omit<ExecutiveAction, 'id' | 'status' | 'proposedAt'>
  ): ExecutiveAction {
    const id = `exec-${++this.idCounter}`;
    const fullAction: ExecutiveAction = {
      ...action,
      id,
      status: 'Proposed',
      proposedAt: Date.now(),
    };
    this.actions.set(id, fullAction);
    return fullAction;
  }
  
  async executeAction(actionId: string, executor: EntityId): Promise<ExecutiveAction> {
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);
    if (action.status !== 'Approved') throw new Error(`Action not approved: ${action.status}`);
    
    const executed: ExecutiveAction = {
      ...action,
      status: 'Executed',
      executedAt: Date.now(),
      executedBy: executor,
    };
    this.actions.set(actionId, executed);
    return executed;
  }
  
  vetoAction(actionId: string, branch: BranchType, reason: string): ExecutiveAction {
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);
    
    const vetoed: ExecutiveAction = {
      ...action,
      status: 'Vetoed',
      vetoedBy: branch,
      vetoReason: reason,
    };
    this.actions.set(actionId, vetoed);
    return vetoed;
  }
  
  approveAction(actionId: string): ExecutiveAction {
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);
    
    const approved: ExecutiveAction = {
      ...action,
      status: 'Approved',
    };
    this.actions.set(actionId, approved);
    return approved;
  }
  
  // ---------------------------------------------------------------------------
  // LEGISLATIVE OPERATIONS
  // ---------------------------------------------------------------------------
  
  submitProposal(
    proposal: Omit<Proposal, 'id' | 'status' | 'proposedAt' | 'votes' | 'votingEndsAt'>
  ): Proposal {
    const id = `prop-${++this.idCounter}`;
    const votingPeriod = proposal.type === 'Constitutional' 
      ? this.config.votingPeriods.constitutional
      : this.config.votingPeriods.standard;
    
    const fullProposal: Proposal = {
      ...proposal,
      id,
      status: 'Voting',
      proposedAt: Date.now(),
      votingEndsAt: Date.now() + votingPeriod,
      votes: {
        for: 0,
        against: 0,
        abstain: 0,
        voters: [],
        quorumMet: false,
      },
    };
    this.proposals.set(id, fullProposal);
    return fullProposal;
  }
  
  vote(proposalId: string, voter: EntityId, vote: 'for' | 'against' | 'abstain'): Proposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.status !== 'Voting') throw new Error(`Proposal not in voting: ${proposal.status}`);
    if (proposal.votes.voters.includes(voter)) throw new Error(`Already voted: ${voter}`);
    
    const newVotes: ProposalVotes = {
      ...proposal.votes,
      [vote]: proposal.votes[vote] + 1,
      voters: [...proposal.votes.voters, voter],
      quorumMet: this.checkQuorum(proposal, proposal.votes.voters.length + 1),
    };
    
    const updated: Proposal = { ...proposal, votes: newVotes };
    this.proposals.set(proposalId, updated);
    return updated;
  }
  
  finalizeVoting(proposalId: string): Proposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    
    const totalVotes = proposal.votes.for + proposal.votes.against;
    const passed = proposal.votes.quorumMet && 
                   proposal.votes.for > proposal.votes.against;
    
    const finalized: Proposal = {
      ...proposal,
      status: passed ? 'Passed' : 'Failed',
    };
    this.proposals.set(proposalId, finalized);
    return finalized;
  }
  
  private checkQuorum(proposal: Proposal, voterCount: number): boolean {
    const quorum = this.config.quorums.legislative;
    // Simplified: assume 100 total eligible voters
    return voterCount / 100 >= quorum;
  }
  
  // ---------------------------------------------------------------------------
  // JUDICIAL OPERATIONS
  // ---------------------------------------------------------------------------
  
  fileCase(
    caseData: Omit<Case, 'id' | 'status' | 'filedAt' | 'evidence' | 'ruling' | 'appeals'>
  ): Case {
    const id = `case-${++this.idCounter}`;
    const fullCase: Case = {
      ...caseData,
      id,
      status: 'Filed',
      filedAt: Date.now(),
      evidence: [],
    };
    this.cases.set(id, fullCase);
    return fullCase;
  }
  
  submitEvidence(
    caseId: string,
    evidence: Omit<Evidence, 'id' | 'submittedAt' | 'admitted'>
  ): Evidence {
    const caseData = this.cases.get(caseId);
    if (!caseData) throw new Error(`Case not found: ${caseId}`);
    
    const fullEvidence: Evidence = {
      ...evidence,
      id: `ev-${++this.idCounter}`,
      submittedAt: Date.now(),
      admitted: true, // Simplified
    };
    
    const updated: Case = {
      ...caseData,
      evidence: [...caseData.evidence, fullEvidence],
    };
    this.cases.set(caseId, updated);
    return fullEvidence;
  }
  
  issueRuling(caseId: string, ruling: Omit<Ruling, 'issuedAt'>): Case {
    const caseData = this.cases.get(caseId);
    if (!caseData) throw new Error(`Case not found: ${caseId}`);
    
    const fullRuling: Ruling = {
      ...ruling,
      issuedAt: Date.now(),
    };
    
    const decided: Case = {
      ...caseData,
      status: 'Decided',
      ruling: fullRuling,
    };
    this.cases.set(caseId, decided);
    return decided;
  }
  
  fileAppeal(
    caseId: string,
    appeal: Omit<Appeal, 'id' | 'filedAt' | 'status' | 'newRuling'>
  ): Appeal {
    const caseData = this.cases.get(caseId);
    if (!caseData) throw new Error(`Case not found: ${caseId}`);
    if (caseData.status !== 'Decided') throw new Error(`Case not decided: ${caseData.status}`);
    
    const fullAppeal: Appeal = {
      ...appeal,
      id: `appeal-${++this.idCounter}`,
      filedAt: Date.now(),
      status: 'Pending',
    };
    
    const updated: Case = {
      ...caseData,
      status: 'Appealed',
      appeals: [...(caseData.appeals ?? []), fullAppeal],
    };
    this.cases.set(caseId, updated);
    return fullAppeal;
  }
  
  reviewConstitutionality(
    targetId: string,
    targetType: 'ExecutiveAction' | 'Proposal' | 'Rule'
  ): ConstitutionalReview {
    // Simplified constitutional review
    return {
      targetId,
      targetType,
      constitutional: true, // Would need actual rule checking
      reasoning: 'No constitutional violations found',
      reviewedAt: Date.now(),
    };
  }
  
  // ---------------------------------------------------------------------------
  // CROSS-BRANCH OPERATIONS
  // ---------------------------------------------------------------------------
  
  /**
   * Legislative veto of executive action
   */
  legislativeVeto(actionId: string, proposalId: string): ExecutiveAction {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'Passed') {
      throw new Error('Valid passed proposal required for veto');
    }
    return this.vetoAction(actionId, 'Legislative', `Vetoed by proposal ${proposalId}`);
  }
  
  /**
   * Judicial review of executive action
   */
  judicialReview(actionId: string): ExecutiveAction {
    const review = this.reviewConstitutionality(actionId, 'ExecutiveAction');
    if (!review.constitutional) {
      return this.vetoAction(actionId, 'Judicial', review.reasoning);
    }
    return this.actions.get(actionId)!;
  }
  
  /**
   * Executive veto of legislative proposal
   */
  executiveVeto(proposalId: string, reason: string): Proposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.status !== 'Passed') throw new Error(`Proposal not passed: ${proposal.status}`);
    
    const vetoed: Proposal = {
      ...proposal,
      status: 'Vetoed',
    };
    this.proposals.set(proposalId, vetoed);
    return vetoed;
  }
  
  /**
   * Legislative override of executive veto
   */
  overrideVeto(proposalId: string): Proposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.status !== 'Vetoed') throw new Error(`Proposal not vetoed: ${proposal.status}`);
    
    const totalVotes = proposal.votes.for + proposal.votes.against;
    const overrideThreshold = this.config.vetoThresholds.executiveVeto;
    
    if (proposal.votes.for / totalVotes >= overrideThreshold) {
      const enacted: Proposal = {
        ...proposal,
        status: 'Enacted',
      };
      this.proposals.set(proposalId, enacted);
      return enacted;
    }
    
    throw new Error(`Override failed: ${proposal.votes.for / totalVotes} < ${overrideThreshold}`);
  }
  
  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------
  
  getAction(actionId: string): ExecutiveAction | undefined {
    return this.actions.get(actionId);
  }
  
  getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId);
  }
  
  getCase(caseId: string): Case | undefined {
    return this.cases.get(caseId);
  }
  
  getPendingActions(): readonly ExecutiveAction[] {
    return Array.from(this.actions.values())
      .filter(a => a.status === 'Proposed' || a.status === 'Approved');
  }
  
  getActiveProposals(): readonly Proposal[] {
    return Array.from(this.proposals.values())
      .filter(p => p.status === 'Voting' || p.status === 'Draft');
  }
  
  getActiveCases(): readonly Case[] {
    return Array.from(this.cases.values())
      .filter(c => c.status !== 'Closed' && c.status !== 'Decided');
  }
  
  /**
   * Get governance statistics
   */
  getStats(): GovernanceStats {
    const actions = Array.from(this.actions.values());
    const proposals = Array.from(this.proposals.values());
    const cases = Array.from(this.cases.values());
    
    return {
      executive: {
        total: actions.length,
        pending: actions.filter(a => a.status === 'Proposed').length,
        executed: actions.filter(a => a.status === 'Executed').length,
        vetoed: actions.filter(a => a.status === 'Vetoed').length,
      },
      legislative: {
        total: proposals.length,
        voting: proposals.filter(p => p.status === 'Voting').length,
        passed: proposals.filter(p => p.status === 'Passed' || p.status === 'Enacted').length,
        failed: proposals.filter(p => p.status === 'Failed').length,
        vetoed: proposals.filter(p => p.status === 'Vetoed').length,
      },
      judicial: {
        total: cases.length,
        active: cases.filter(c => c.status !== 'Closed').length,
        decided: cases.filter(c => c.status === 'Decided').length,
        appealed: cases.filter(c => c.status === 'Appealed').length,
      },
    };
  }
}

export interface GovernanceStats {
  executive: {
    total: number;
    pending: number;
    executed: number;
    vetoed: number;
  };
  legislative: {
    total: number;
    voting: number;
    passed: number;
    failed: number;
    vetoed: number;
  };
  judicial: {
    total: number;
    active: number;
    decided: number;
    appealed: number;
  };
}

// =============================================================================
// FACTORY
// =============================================================================

export function createGovernanceCoordinator(config?: Partial<GovernanceConfig>): GovernanceCoordinator {
  const defaultConfig: GovernanceConfig = {
    quorums: {
      executive: 0.5,
      legislative: 0.5,
      judicial: 0.67,
    },
    votingPeriods: {
      standard: 7 * 24 * 60 * 60 * 1000, // 7 days
      emergency: 24 * 60 * 60 * 1000, // 1 day
      constitutional: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
    vetoThresholds: {
      executiveVeto: 0.67, // 2/3 to override
      judicialReview: 0.75, // 3/4 to strike down
    },
    termLimits: {
      executive: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      legislative: 4 * 365 * 24 * 60 * 60 * 1000, // 4 years
      judicial: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years
    },
  };
  
  return new GovernanceCoordinator({ ...defaultConfig, ...config });
}
