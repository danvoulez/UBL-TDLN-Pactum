/**
 * ACHIEVEMENTS SYSTEM
 * 
 * SPRINT F.2: Gamification and milestone tracking
 * 
 * Purpose:
 * - Recognize and reward positive behaviors
 * - Track milestones and progress
 * - Encourage healthy system participation
 * - Provide motivation through gamification
 * 
 * Categories:
 * - Survival: Longevity and persistence
 * - Economic: Financial health and growth
 * - Social: Community contribution
 * - Resilience: Recovery and adaptation
 * - Innovation: Experimentation and improvement
 */

import type { EntityId, Timestamp } from '../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AchievementCategory;
  readonly tier: AchievementTier;
  readonly icon: string;
  readonly points: number;
  readonly criteria: AchievementCriteria;
  readonly hidden?: boolean;
  readonly prerequisite?: string;
}

export type AchievementCategory = 
  | 'Survival'
  | 'Economic'
  | 'Social'
  | 'Resilience'
  | 'Innovation'
  | 'Special';

export type AchievementTier = 
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Legendary';

export interface AchievementCriteria {
  readonly type: CriteriaType;
  readonly threshold: number;
  readonly metric: string;
  readonly timeframe?: number; // Days
  readonly conditions?: readonly string[];
}

export type CriteriaType = 
  | 'Threshold'      // Reach a value
  | 'Cumulative'     // Accumulate over time
  | 'Streak'         // Consecutive days/actions
  | 'Ratio'          // Maintain a ratio
  | 'Event'          // Specific event occurred
  | 'Composite';     // Multiple criteria

export interface UnlockedAchievement {
  readonly achievementId: string;
  readonly entityId: EntityId;
  readonly unlockedAt: Timestamp;
  readonly progress: number; // 0-100
  readonly metadata?: Record<string, unknown>;
}

export interface AchievementProgress {
  readonly achievementId: string;
  readonly entityId: EntityId;
  readonly currentValue: number;
  readonly targetValue: number;
  readonly progress: number; // 0-100
  readonly lastUpdated: Timestamp;
}

// =============================================================================
// BUILT-IN ACHIEVEMENTS
// =============================================================================

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ---------------------------------------------------------------------------
  // SURVIVAL ACHIEVEMENTS
  // ---------------------------------------------------------------------------
  {
    id: 'first-day',
    name: 'First Day',
    description: 'Complete your first day in the system',
    category: 'Survival',
    tier: 'Bronze',
    icon: '🌅',
    points: 10,
    criteria: { type: 'Threshold', threshold: 1, metric: 'days_active' },
  },
  {
    id: 'survivor-week',
    name: 'Week Survivor',
    description: 'Stay active for 7 consecutive days',
    category: 'Survival',
    tier: 'Bronze',
    icon: '📅',
    points: 25,
    criteria: { type: 'Streak', threshold: 7, metric: 'days_active' },
  },
  {
    id: 'survivor-month',
    name: 'Month Survivor',
    description: 'Stay active for 30 consecutive days',
    category: 'Survival',
    tier: 'Silver',
    icon: '🗓️',
    points: 100,
    criteria: { type: 'Streak', threshold: 30, metric: 'days_active' },
    prerequisite: 'survivor-week',
  },
  {
    id: 'survivor-year',
    name: 'Year Survivor',
    description: 'Stay active for 365 days',
    category: 'Survival',
    tier: 'Gold',
    icon: '🎂',
    points: 500,
    criteria: { type: 'Threshold', threshold: 365, metric: 'days_active' },
    prerequisite: 'survivor-month',
  },
  {
    id: 'immortal',
    name: 'Immortal',
    description: 'Survive for 1000 days',
    category: 'Survival',
    tier: 'Legendary',
    icon: '♾️',
    points: 2000,
    criteria: { type: 'Threshold', threshold: 1000, metric: 'days_active' },
    prerequisite: 'survivor-year',
  },
  
  // ---------------------------------------------------------------------------
  // ECONOMIC ACHIEVEMENTS
  // ---------------------------------------------------------------------------
  {
    id: 'first-credit',
    name: 'First Credit',
    description: 'Earn your first credit',
    category: 'Economic',
    tier: 'Bronze',
    icon: '💰',
    points: 10,
    criteria: { type: 'Threshold', threshold: 1, metric: 'total_earned' },
  },
  {
    id: 'hundred-club',
    name: 'Hundred Club',
    description: 'Accumulate 100 credits',
    category: 'Economic',
    tier: 'Bronze',
    icon: '💵',
    points: 25,
    criteria: { type: 'Threshold', threshold: 100, metric: 'balance' },
  },
  {
    id: 'thousand-club',
    name: 'Thousand Club',
    description: 'Accumulate 1,000 credits',
    category: 'Economic',
    tier: 'Silver',
    icon: '💎',
    points: 100,
    criteria: { type: 'Threshold', threshold: 1000, metric: 'balance' },
    prerequisite: 'hundred-club',
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Accumulate 1,000,000 credits',
    category: 'Economic',
    tier: 'Platinum',
    icon: '🏆',
    points: 1000,
    criteria: { type: 'Threshold', threshold: 1000000, metric: 'balance' },
    prerequisite: 'thousand-club',
  },
  {
    id: 'debt-free',
    name: 'Debt Free',
    description: 'Pay off all loans',
    category: 'Economic',
    tier: 'Silver',
    icon: '🎉',
    points: 150,
    criteria: { type: 'Threshold', threshold: 0, metric: 'total_debt' },
  },
  {
    id: 'good-credit',
    name: 'Good Credit',
    description: 'Maintain 100% loan repayment rate',
    category: 'Economic',
    tier: 'Gold',
    icon: '⭐',
    points: 300,
    criteria: { type: 'Ratio', threshold: 1.0, metric: 'loan_repayment_rate' },
  },
  
  // ---------------------------------------------------------------------------
  // SOCIAL ACHIEVEMENTS
  // ---------------------------------------------------------------------------
  {
    id: 'first-connection',
    name: 'First Connection',
    description: 'Connect with another entity',
    category: 'Social',
    tier: 'Bronze',
    icon: '🤝',
    points: 10,
    criteria: { type: 'Threshold', threshold: 1, metric: 'connections' },
  },
  {
    id: 'networker',
    name: 'Networker',
    description: 'Have 10 active connections',
    category: 'Social',
    tier: 'Silver',
    icon: '🌐',
    points: 100,
    criteria: { type: 'Threshold', threshold: 10, metric: 'connections' },
    prerequisite: 'first-connection',
  },
  {
    id: 'influencer',
    name: 'Influencer',
    description: 'Have 100 active connections',
    category: 'Social',
    tier: 'Gold',
    icon: '📢',
    points: 500,
    criteria: { type: 'Threshold', threshold: 100, metric: 'connections' },
    prerequisite: 'networker',
  },
  {
    id: 'mentor',
    name: 'Mentor',
    description: 'Help 5 new entities get started',
    category: 'Social',
    tier: 'Silver',
    icon: '🎓',
    points: 200,
    criteria: { type: 'Cumulative', threshold: 5, metric: 'entities_mentored' },
  },
  {
    id: 'philanthropist',
    name: 'Philanthropist',
    description: 'Donate 10,000 credits to public goods',
    category: 'Social',
    tier: 'Gold',
    icon: '❤️',
    points: 400,
    criteria: { type: 'Cumulative', threshold: 10000, metric: 'donations' },
  },
  
  // ---------------------------------------------------------------------------
  // RESILIENCE ACHIEVEMENTS
  // ---------------------------------------------------------------------------
  {
    id: 'comeback-kid',
    name: 'Comeback Kid',
    description: 'Recover from negative balance',
    category: 'Resilience',
    tier: 'Silver',
    icon: '💪',
    points: 150,
    criteria: { type: 'Event', threshold: 1, metric: 'recovered_from_negative' },
  },
  {
    id: 'crisis-survivor',
    name: 'Crisis Survivor',
    description: 'Survive a market crash',
    category: 'Resilience',
    tier: 'Gold',
    icon: '🛡️',
    points: 300,
    criteria: { type: 'Event', threshold: 1, metric: 'survived_crash' },
  },
  {
    id: 'antifragile',
    name: 'Antifragile',
    description: 'Grow stronger after 3 crises',
    category: 'Resilience',
    tier: 'Platinum',
    icon: '🔥',
    points: 750,
    criteria: { type: 'Cumulative', threshold: 3, metric: 'crises_overcome' },
    prerequisite: 'crisis-survivor',
  },
  {
    id: 'pivot-master',
    name: 'Pivot Master',
    description: 'Successfully pivot strategy 5 times',
    category: 'Resilience',
    tier: 'Gold',
    icon: '🔄',
    points: 350,
    criteria: { type: 'Cumulative', threshold: 5, metric: 'successful_pivots' },
  },
  
  // ---------------------------------------------------------------------------
  // INNOVATION ACHIEVEMENTS
  // ---------------------------------------------------------------------------
  {
    id: 'experimenter',
    name: 'Experimenter',
    description: 'Try 10 different strategies',
    category: 'Innovation',
    tier: 'Bronze',
    icon: '🧪',
    points: 50,
    criteria: { type: 'Cumulative', threshold: 10, metric: 'strategies_tried' },
  },
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Be among first 100 to use a new feature',
    category: 'Innovation',
    tier: 'Silver',
    icon: '🚀',
    points: 200,
    criteria: { type: 'Event', threshold: 1, metric: 'early_adoption' },
  },
  {
    id: 'innovator',
    name: 'Innovator',
    description: 'Propose 3 accepted improvements',
    category: 'Innovation',
    tier: 'Gold',
    icon: '💡',
    points: 400,
    criteria: { type: 'Cumulative', threshold: 3, metric: 'accepted_proposals' },
  },
  {
    id: 'visionary',
    name: 'Visionary',
    description: 'Predict 5 market trends correctly',
    category: 'Innovation',
    tier: 'Platinum',
    icon: '🔮',
    points: 600,
    criteria: { type: 'Cumulative', threshold: 5, metric: 'correct_predictions' },
  },
  
  // ---------------------------------------------------------------------------
  // SPECIAL ACHIEVEMENTS
  // ---------------------------------------------------------------------------
  {
    id: 'genesis',
    name: 'Genesis',
    description: 'Be among the first 1000 entities',
    category: 'Special',
    tier: 'Legendary',
    icon: '🌟',
    points: 1000,
    criteria: { type: 'Threshold', threshold: 1000, metric: 'entity_number' },
    hidden: true,
  },
  {
    id: 'perfect-score',
    name: 'Perfect Score',
    description: 'Achieve 100 fitness score',
    category: 'Special',
    tier: 'Diamond',
    icon: '💯',
    points: 1500,
    criteria: { type: 'Threshold', threshold: 100, metric: 'fitness_score' },
    hidden: true,
  },
  {
    id: 'completionist',
    name: 'Completionist',
    description: 'Unlock all non-hidden achievements',
    category: 'Special',
    tier: 'Legendary',
    icon: '👑',
    points: 5000,
    criteria: { type: 'Threshold', threshold: 100, metric: 'achievement_completion' },
    hidden: true,
  },
];

// =============================================================================
// ACHIEVEMENT ENGINE
// =============================================================================

export class AchievementEngine {
  private achievements: Map<string, Achievement>;
  private unlocked = new Map<EntityId, Map<string, UnlockedAchievement>>();
  private progress = new Map<EntityId, Map<string, AchievementProgress>>();
  
  constructor(customAchievements?: readonly Achievement[]) {
    this.achievements = new Map();
    
    // Load built-in achievements
    for (const achievement of ACHIEVEMENTS) {
      this.achievements.set(achievement.id, achievement);
    }
    
    // Load custom achievements
    if (customAchievements) {
      for (const achievement of customAchievements) {
        this.achievements.set(achievement.id, achievement);
      }
    }
  }
  
  /**
   * Check and update progress for an entity
   */
  checkProgress(entityId: EntityId, metrics: Record<string, number>): UnlockedAchievement[] {
    const newlyUnlocked: UnlockedAchievement[] = [];
    
    for (const achievement of this.achievements.values()) {
      // Skip if already unlocked
      if (this.isUnlocked(entityId, achievement.id)) continue;
      
      // Skip if prerequisite not met
      if (achievement.prerequisite && !this.isUnlocked(entityId, achievement.prerequisite)) continue;
      
      // Check criteria
      const metricValue = metrics[achievement.criteria.metric] ?? 0;
      const progress = this.calculateProgress(achievement, metricValue);
      
      // Update progress
      this.updateProgress(entityId, achievement.id, metricValue, achievement.criteria.threshold, progress);
      
      // Check if unlocked
      if (progress >= 100) {
        const unlocked = this.unlock(entityId, achievement.id);
        newlyUnlocked.push(unlocked);
      }
    }
    
    return newlyUnlocked;
  }
  
  /**
   * Calculate progress for an achievement
   */
  private calculateProgress(achievement: Achievement, currentValue: number): number {
    const { type, threshold } = achievement.criteria;
    
    switch (type) {
      case 'Threshold':
      case 'Cumulative':
      case 'Streak':
        return Math.min(100, (currentValue / threshold) * 100);
      
      case 'Ratio':
        return currentValue >= threshold ? 100 : (currentValue / threshold) * 100;
      
      case 'Event':
        return currentValue >= threshold ? 100 : 0;
      
      default:
        return 0;
    }
  }
  
  /**
   * Update progress for an entity
   */
  private updateProgress(
    entityId: EntityId,
    achievementId: string,
    currentValue: number,
    targetValue: number,
    progress: number
  ): void {
    if (!this.progress.has(entityId)) {
      this.progress.set(entityId, new Map());
    }
    
    this.progress.get(entityId)!.set(achievementId, {
      achievementId,
      entityId,
      currentValue,
      targetValue,
      progress,
      lastUpdated: Date.now(),
    });
  }
  
  /**
   * Unlock an achievement
   */
  private unlock(entityId: EntityId, achievementId: string): UnlockedAchievement {
    if (!this.unlocked.has(entityId)) {
      this.unlocked.set(entityId, new Map());
    }
    
    const unlocked: UnlockedAchievement = {
      achievementId,
      entityId,
      unlockedAt: Date.now(),
      progress: 100,
    };
    
    this.unlocked.get(entityId)!.set(achievementId, unlocked);
    return unlocked;
  }
  
  /**
   * Check if achievement is unlocked
   */
  isUnlocked(entityId: EntityId, achievementId: string): boolean {
    return this.unlocked.get(entityId)?.has(achievementId) ?? false;
  }
  
  /**
   * Get all achievements
   */
  getAllAchievements(includeHidden: boolean = false): readonly Achievement[] {
    return Array.from(this.achievements.values())
      .filter(a => includeHidden || !a.hidden);
  }
  
  /**
   * Get achievement by ID
   */
  getAchievement(achievementId: string): Achievement | undefined {
    return this.achievements.get(achievementId);
  }
  
  /**
   * Get unlocked achievements for entity
   */
  getUnlockedAchievements(entityId: EntityId): readonly UnlockedAchievement[] {
    return Array.from(this.unlocked.get(entityId)?.values() ?? []);
  }
  
  /**
   * Get progress for entity
   */
  getProgress(entityId: EntityId): readonly AchievementProgress[] {
    return Array.from(this.progress.get(entityId)?.values() ?? []);
  }
  
  /**
   * Get total points for entity
   */
  getTotalPoints(entityId: EntityId): number {
    const unlocked = this.getUnlockedAchievements(entityId);
    return unlocked.reduce((sum, u) => {
      const achievement = this.achievements.get(u.achievementId);
      return sum + (achievement?.points ?? 0);
    }, 0);
  }
  
  /**
   * Get completion percentage
   */
  getCompletionPercentage(entityId: EntityId, includeHidden: boolean = false): number {
    const total = this.getAllAchievements(includeHidden).length;
    const unlocked = this.getUnlockedAchievements(entityId).length;
    return total > 0 ? (unlocked / total) * 100 : 0;
  }
  
  /**
   * Get leaderboard
   */
  getLeaderboard(limit: number = 10): readonly { entityId: EntityId; points: number; achievements: number }[] {
    const entities = Array.from(this.unlocked.keys());
    
    return entities
      .map(entityId => ({
        entityId,
        points: this.getTotalPoints(entityId),
        achievements: this.getUnlockedAchievements(entityId).length,
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);
  }
  
  /**
   * Get statistics
   */
  getStats(): AchievementStats {
    const totalAchievements = this.achievements.size;
    const totalEntities = this.unlocked.size;
    
    let totalUnlocked = 0;
    let totalPoints = 0;
    
    for (const entityUnlocked of this.unlocked.values()) {
      totalUnlocked += entityUnlocked.size;
      for (const unlocked of entityUnlocked.values()) {
        const achievement = this.achievements.get(unlocked.achievementId);
        totalPoints += achievement?.points ?? 0;
      }
    }
    
    return {
      totalAchievements,
      totalEntities,
      totalUnlocked,
      totalPoints,
      averagePerEntity: totalEntities > 0 ? totalUnlocked / totalEntities : 0,
    };
  }
}

export interface AchievementStats {
  totalAchievements: number;
  totalEntities: number;
  totalUnlocked: number;
  totalPoints: number;
  averagePerEntity: number;
}

// =============================================================================
// FACTORY
// =============================================================================

export function createAchievementEngine(customAchievements?: readonly Achievement[]): AchievementEngine {
  return new AchievementEngine(customAchievements);
}
