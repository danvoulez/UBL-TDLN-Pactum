/**
 * ACHIEVEMENTS SYSTEM TESTS
 * 
 * SPRINT F.2: Tests for gamification and milestones
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  AchievementEngine,
  createAchievementEngine,
  ACHIEVEMENTS,
  type Achievement,
} from '../../../core/benchmarking/achievements';
import type { EntityId } from '../../../core/schema/ledger';

describe('Achievements System (SPRINT F.2)', () => {
  
  let engine: AchievementEngine;
  const entityA = 'entity-a' as EntityId;
  const entityB = 'entity-b' as EntityId;
  
  beforeEach(() => {
    engine = createAchievementEngine();
  });
  
  describe('Built-in Achievements', () => {
    it('has built-in achievements', () => {
      const achievements = engine.getAllAchievements();
      assert.ok(achievements.length > 0);
    });
    
    it('has achievements in all categories', () => {
      const achievements = engine.getAllAchievements(true);
      const categories = new Set(achievements.map(a => a.category));
      
      assert.ok(categories.has('Survival'));
      assert.ok(categories.has('Economic'));
      assert.ok(categories.has('Social'));
      assert.ok(categories.has('Resilience'));
      assert.ok(categories.has('Innovation'));
      assert.ok(categories.has('Special'));
    });
    
    it('has achievements in all tiers', () => {
      const achievements = engine.getAllAchievements(true);
      const tiers = new Set(achievements.map(a => a.tier));
      
      assert.ok(tiers.has('Bronze'));
      assert.ok(tiers.has('Silver'));
      assert.ok(tiers.has('Gold'));
    });
    
    it('hides hidden achievements by default', () => {
      const visible = engine.getAllAchievements(false);
      const all = engine.getAllAchievements(true);
      
      assert.ok(all.length > visible.length);
    });
  });
  
  describe('Progress Tracking', () => {
    it('tracks progress toward achievement', () => {
      engine.checkProgress(entityA, { days_active: 3 });
      
      const progress = engine.getProgress(entityA);
      const firstDayProgress = progress.find(p => p.achievementId === 'first-day');
      
      assert.ok(firstDayProgress);
      assert.strictEqual(firstDayProgress.progress, 100); // Already unlocked
    });
    
    it('unlocks achievement when criteria met', () => {
      const unlocked = engine.checkProgress(entityA, { days_active: 1 });
      
      const firstDay = unlocked.find(u => u.achievementId === 'first-day');
      assert.ok(firstDay);
      assert.strictEqual(firstDay.progress, 100);
    });
    
    it('does not unlock achievement when criteria not met', () => {
      const unlocked = engine.checkProgress(entityA, { days_active: 0 });
      
      const firstDay = unlocked.find(u => u.achievementId === 'first-day');
      assert.ok(!firstDay);
    });
    
    it('tracks partial progress', () => {
      engine.checkProgress(entityA, { days_active: 3 });
      
      const progress = engine.getProgress(entityA);
      const weekProgress = progress.find(p => p.achievementId === 'survivor-week');
      
      assert.ok(weekProgress);
      assert.ok(weekProgress.progress > 0 && weekProgress.progress < 100);
    });
  });
  
  describe('Prerequisites', () => {
    it('respects prerequisites', () => {
      // Try to unlock month survivor without week survivor
      const unlocked = engine.checkProgress(entityA, { days_active: 30 });
      
      // Should unlock first-day and survivor-week first
      const monthSurvivor = unlocked.find(u => u.achievementId === 'survivor-month');
      
      // Month survivor should be unlocked because week survivor was also unlocked
      assert.ok(monthSurvivor);
    });
    
    it('unlocks chain of achievements', () => {
      const unlocked = engine.checkProgress(entityA, { days_active: 365 });
      
      // Should unlock: first-day, survivor-week, survivor-month, survivor-year
      assert.ok(unlocked.find(u => u.achievementId === 'first-day'));
      assert.ok(unlocked.find(u => u.achievementId === 'survivor-week'));
      assert.ok(unlocked.find(u => u.achievementId === 'survivor-month'));
      assert.ok(unlocked.find(u => u.achievementId === 'survivor-year'));
    });
  });
  
  describe('Points System', () => {
    it('calculates total points', () => {
      engine.checkProgress(entityA, { days_active: 7 });
      
      const points = engine.getTotalPoints(entityA);
      assert.ok(points > 0);
    });
    
    it('accumulates points from multiple achievements', () => {
      engine.checkProgress(entityA, { days_active: 30, total_earned: 100, balance: 100 });
      
      const points = engine.getTotalPoints(entityA);
      // first-day (10) + survivor-week (25) + survivor-month (100) + first-credit (10) + hundred-club (25)
      assert.ok(points >= 170);
    });
  });
  
  describe('Completion Tracking', () => {
    it('calculates completion percentage', () => {
      engine.checkProgress(entityA, { days_active: 1 });
      
      const completion = engine.getCompletionPercentage(entityA);
      assert.ok(completion > 0);
    });
    
    it('returns 0 for no achievements', () => {
      const completion = engine.getCompletionPercentage(entityA);
      assert.strictEqual(completion, 0);
    });
  });
  
  describe('Leaderboard', () => {
    it('generates leaderboard', () => {
      engine.checkProgress(entityA, { days_active: 30 });
      engine.checkProgress(entityB, { days_active: 7 });
      
      const leaderboard = engine.getLeaderboard();
      
      assert.ok(leaderboard.length >= 2);
      assert.ok(leaderboard[0].points >= leaderboard[1].points);
    });
    
    it('limits leaderboard size', () => {
      engine.checkProgress(entityA, { days_active: 1 });
      engine.checkProgress(entityB, { days_active: 1 });
      
      const leaderboard = engine.getLeaderboard(1);
      assert.strictEqual(leaderboard.length, 1);
    });
  });
  
  describe('Statistics', () => {
    it('provides statistics', () => {
      engine.checkProgress(entityA, { days_active: 7 });
      engine.checkProgress(entityB, { days_active: 1 });
      
      const stats = engine.getStats();
      
      assert.ok(stats.totalAchievements > 0);
      assert.strictEqual(stats.totalEntities, 2);
      assert.ok(stats.totalUnlocked > 0);
      assert.ok(stats.totalPoints > 0);
    });
  });
  
  describe('Custom Achievements', () => {
    it('supports custom achievements', () => {
      const customAchievement: Achievement = {
        id: 'custom-test',
        name: 'Custom Test',
        description: 'A custom achievement',
        category: 'Special',
        tier: 'Bronze',
        icon: '🎯',
        points: 50,
        criteria: { type: 'Threshold', threshold: 1, metric: 'custom_metric' },
      };
      
      const customEngine = createAchievementEngine([customAchievement]);
      const achievement = customEngine.getAchievement('custom-test');
      
      assert.ok(achievement);
      assert.strictEqual(achievement.name, 'Custom Test');
    });
  });
  
  describe('Achievement Lookup', () => {
    it('gets achievement by ID', () => {
      const achievement = engine.getAchievement('first-day');
      
      assert.ok(achievement);
      assert.strictEqual(achievement.name, 'First Day');
    });
    
    it('returns undefined for unknown ID', () => {
      const achievement = engine.getAchievement('nonexistent');
      assert.strictEqual(achievement, undefined);
    });
  });
  
  describe('Unlocked Achievements', () => {
    it('gets unlocked achievements for entity', () => {
      engine.checkProgress(entityA, { days_active: 7 });
      
      const unlocked = engine.getUnlockedAchievements(entityA);
      assert.ok(unlocked.length > 0);
    });
    
    it('checks if achievement is unlocked', () => {
      engine.checkProgress(entityA, { days_active: 1 });
      
      assert.strictEqual(engine.isUnlocked(entityA, 'first-day'), true);
      assert.strictEqual(engine.isUnlocked(entityA, 'survivor-year'), false);
    });
  });
  
  describe('Factory', () => {
    it('createAchievementEngine works without arguments', () => {
      const defaultEngine = createAchievementEngine();
      assert.ok(defaultEngine);
    });
  });
});
