/**
 * QUADRATIC FUNDING
 * 
 * SPRINT E.1: Public goods funding mechanism
 * 
 * Purpose:
 * - Fund public goods democratically
 * - Amplify small contributions
 * - Prevent plutocracy in funding decisions
 * 
 * Formula:
 * Funding = (√c₁ + √c₂ + ... + √cₙ)² - (c₁ + c₂ + ... + cₙ)
 * Where cᵢ is each individual contribution
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface QuadraticFundingConfig {
  /** Matching pool size */
  readonly matchingPool: bigint;
  
  /** Minimum contribution */
  readonly minContribution: bigint;
  
  /** Maximum contribution per donor per project */
  readonly maxContribution: bigint;
  
  /** Round duration (ms) */
  readonly roundDuration: number;
  
  /** Sybil resistance: require identity verification */
  readonly requireVerification: boolean;
  
  /** Cap on matching per project (% of pool) */
  readonly projectMatchingCap: number;
}

export interface FundingRound {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startedAt: Timestamp;
  readonly endsAt: Timestamp;
  readonly status: RoundStatus;
  readonly matchingPool: bigint;
  readonly totalContributions: bigint;
  readonly projectCount: number;
  readonly contributorCount: number;
}

export type RoundStatus = 'Pending' | 'Active' | 'Calculating' | 'Distributed' | 'Cancelled';

export interface Project {
  readonly id: string;
  readonly roundId: string;
  readonly name: string;
  readonly description: string;
  readonly owner: EntityId;
  readonly createdAt: Timestamp;
  readonly status: ProjectStatus;
  readonly contributions: readonly Contribution[];
  readonly matchedAmount?: bigint;
  readonly totalFunding?: bigint;
}

export type ProjectStatus = 'Pending' | 'Approved' | 'Rejected' | 'Funded';

export interface Contribution {
  readonly id: string;
  readonly projectId: string;
  readonly contributor: EntityId;
  readonly amount: bigint;
  readonly timestamp: Timestamp;
  readonly verified: boolean;
}

export interface FundingResult {
  readonly projectId: string;
  readonly projectName: string;
  readonly directContributions: bigint;
  readonly matchedAmount: bigint;
  readonly totalFunding: bigint;
  readonly contributorCount: number;
  readonly matchingRatio: number;
}

// =============================================================================
// QUADRATIC FUNDING ENGINE
// =============================================================================

export class QuadraticFundingEngine {
  private rounds = new Map<string, FundingRound>();
  private projects = new Map<string, Project>();
  private idCounter = 0;
  
  constructor(private readonly config: QuadraticFundingConfig) {}
  
  /**
   * Create a new funding round
   */
  createRound(name: string, description: string, matchingPool?: bigint): FundingRound {
    const id = `round-${++this.idCounter}`;
    const now = Date.now();
    
    const round: FundingRound = {
      id,
      name,
      description,
      startedAt: now,
      endsAt: now + this.config.roundDuration,
      status: 'Active',
      matchingPool: matchingPool ?? this.config.matchingPool,
      totalContributions: 0n,
      projectCount: 0,
      contributorCount: 0,
    };
    
    this.rounds.set(id, round);
    return round;
  }
  
  /**
   * Submit a project for funding
   */
  submitProject(
    roundId: string,
    name: string,
    description: string,
    owner: EntityId
  ): Project {
    const round = this.rounds.get(roundId);
    if (!round) throw new Error(`Round not found: ${roundId}`);
    if (round.status !== 'Active') throw new Error(`Round not active: ${round.status}`);
    
    const id = `proj-${++this.idCounter}`;
    const project: Project = {
      id,
      roundId,
      name,
      description,
      owner,
      createdAt: Date.now(),
      status: 'Approved', // Auto-approve for simplicity
      contributions: [],
    };
    
    this.projects.set(id, project);
    
    // Update round
    const updatedRound: FundingRound = {
      ...round,
      projectCount: round.projectCount + 1,
    };
    this.rounds.set(roundId, updatedRound);
    
    return project;
  }
  
  /**
   * Contribute to a project
   */
  contribute(
    projectId: string,
    contributor: EntityId,
    amount: bigint,
    verified: boolean = false
  ): Contribution {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    
    const round = this.rounds.get(project.roundId);
    if (!round || round.status !== 'Active') {
      throw new Error('Round not active');
    }
    
    // Validate amount
    if (amount < this.config.minContribution) {
      throw new Error(`Contribution below minimum: ${this.config.minContribution}`);
    }
    if (amount > this.config.maxContribution) {
      throw new Error(`Contribution above maximum: ${this.config.maxContribution}`);
    }
    
    // Check verification requirement
    if (this.config.requireVerification && !verified) {
      throw new Error('Contributor verification required');
    }
    
    const contribution: Contribution = {
      id: `contrib-${++this.idCounter}`,
      projectId,
      contributor,
      amount,
      timestamp: Date.now(),
      verified,
    };
    
    // Update project
    const updatedProject: Project = {
      ...project,
      contributions: [...project.contributions, contribution],
    };
    this.projects.set(projectId, updatedProject);
    
    // Update round totals
    const contributors = new Set<EntityId>();
    for (const p of this.projects.values()) {
      if (p.roundId === round.id) {
        for (const c of p.contributions) {
          contributors.add(c.contributor);
        }
      }
    }
    
    const updatedRound: FundingRound = {
      ...round,
      totalContributions: round.totalContributions + amount,
      contributorCount: contributors.size,
    };
    this.rounds.set(round.id, updatedRound);
    
    return contribution;
  }
  
  /**
   * Calculate quadratic funding for a round
   */
  calculateFunding(roundId: string): readonly FundingResult[] {
    const round = this.rounds.get(roundId);
    if (!round) throw new Error(`Round not found: ${roundId}`);
    
    // Get all projects in round
    const roundProjects = Array.from(this.projects.values())
      .filter(p => p.roundId === roundId && p.status === 'Approved');
    
    // Calculate quadratic scores
    const scores: { projectId: string; score: number; direct: bigint }[] = [];
    
    for (const project of roundProjects) {
      const score = this.calculateQuadraticScore(project.contributions);
      const direct = project.contributions.reduce((sum, c) => sum + c.amount, 0n);
      scores.push({ projectId: project.id, score, direct });
    }
    
    // Calculate total score
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
    
    // Distribute matching pool proportionally
    const results: FundingResult[] = [];
    const matchingPool = Number(round.matchingPool);
    const maxMatching = matchingPool * this.config.projectMatchingCap;
    
    for (const { projectId, score, direct } of scores) {
      const project = this.projects.get(projectId)!;
      
      // Calculate matched amount
      let matched = totalScore > 0 
        ? BigInt(Math.floor((score / totalScore) * matchingPool))
        : 0n;
      
      // Apply cap
      if (Number(matched) > maxMatching) {
        matched = BigInt(Math.floor(maxMatching));
      }
      
      const total = direct + matched;
      
      results.push({
        projectId,
        projectName: project.name,
        directContributions: direct,
        matchedAmount: matched,
        totalFunding: total,
        contributorCount: project.contributions.length,
        matchingRatio: direct > 0n ? Number(matched) / Number(direct) : 0,
      });
      
      // Update project
      const updatedProject: Project = {
        ...project,
        status: 'Funded',
        matchedAmount: matched,
        totalFunding: total,
      };
      this.projects.set(projectId, updatedProject);
    }
    
    // Update round status
    const updatedRound: FundingRound = {
      ...round,
      status: 'Distributed',
    };
    this.rounds.set(roundId, updatedRound);
    
    return results.sort((a, b) => Number(b.totalFunding - a.totalFunding));
  }
  
  /**
   * Calculate quadratic score for a project
   * Score = (Σ√cᵢ)²
   */
  private calculateQuadraticScore(contributions: readonly Contribution[]): number {
    if (contributions.length === 0) return 0;
    
    // Group by contributor (prevent sybil)
    const byContributor = new Map<EntityId, bigint>();
    for (const c of contributions) {
      const current = byContributor.get(c.contributor) ?? 0n;
      byContributor.set(c.contributor, current + c.amount);
    }
    
    // Sum of square roots
    let sumSqrt = 0;
    for (const amount of byContributor.values()) {
      sumSqrt += Math.sqrt(Number(amount));
    }
    
    // Square the sum
    return sumSqrt * sumSqrt;
  }
  
  /**
   * Get round by ID
   */
  getRound(roundId: string): FundingRound | undefined {
    return this.rounds.get(roundId);
  }
  
  /**
   * Get project by ID
   */
  getProject(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }
  
  /**
   * Get projects in a round
   */
  getProjectsInRound(roundId: string): readonly Project[] {
    return Array.from(this.projects.values())
      .filter(p => p.roundId === roundId);
  }
  
  /**
   * Get active rounds
   */
  getActiveRounds(): readonly FundingRound[] {
    return Array.from(this.rounds.values())
      .filter(r => r.status === 'Active');
  }
  
  /**
   * Get statistics
   */
  getStats(): QuadraticFundingStats {
    const rounds = Array.from(this.rounds.values());
    const projects = Array.from(this.projects.values());
    
    const totalMatched = projects.reduce(
      (sum, p) => sum + (p.matchedAmount ?? 0n),
      0n
    );
    
    const totalContributions = rounds.reduce(
      (sum, r) => sum + r.totalContributions,
      0n
    );
    
    return {
      totalRounds: rounds.length,
      activeRounds: rounds.filter(r => r.status === 'Active').length,
      totalProjects: projects.length,
      fundedProjects: projects.filter(p => p.status === 'Funded').length,
      totalContributions,
      totalMatched,
      averageMatchingRatio: totalContributions > 0n
        ? Number(totalMatched) / Number(totalContributions)
        : 0,
    };
  }
}

export interface QuadraticFundingStats {
  totalRounds: number;
  activeRounds: number;
  totalProjects: number;
  fundedProjects: number;
  totalContributions: bigint;
  totalMatched: bigint;
  averageMatchingRatio: number;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createQuadraticFundingEngine(
  config?: Partial<QuadraticFundingConfig>
): QuadraticFundingEngine {
  const defaultConfig: QuadraticFundingConfig = {
    matchingPool: 100000n,
    minContribution: 1n,
    maxContribution: 10000n,
    roundDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
    requireVerification: false,
    projectMatchingCap: 0.25, // 25% max per project
  };
  
  return new QuadraticFundingEngine({ ...defaultConfig, ...config });
}
