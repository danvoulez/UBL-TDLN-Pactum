/**
 * PERCEPTION LAYER TESTS - Watchers
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createInMemoryEventStore } from '../../../core/store/event-store';
import type { EventStore } from '../../../core/store/event-store';
import {
  createWatcher,
  createShadowEntity,
  calculateWatcherMonthlyCost,
  isValidPollInterval,
  WATCHER_PRICING,
} from '../../../core/schema/perception';
import type {
  Watcher,
  ShadowEntity,
  WatcherSource,
  WatcherFilter,
  WatcherAction,
} from '../../../core/schema/perception';
import { Ids, asEntityId } from '../../../core/shared/types';

describe('Perception Layer - Watchers', () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });

  describe('Watcher Creation', () => {
    it('should create a basic watcher', () => {
      const watcherId = Ids.entity();
      const ownerId = Ids.entity();

      const source: WatcherSource = {
        type: 'rss',
        endpoint: 'https://news.ycombinator.com/rss',
      };

      const filter: WatcherFilter = {
        keywords: ['AI', 'LLM', 'GPT'],
      };

      const action: WatcherAction = {
        type: 'notify',
      };

      const watcher = createWatcher(watcherId, ownerId, 'Tech News', source, filter, action);

      assert.strictEqual(watcher.id, watcherId);
      assert.strictEqual(watcher.ownerId, ownerId);
      assert.strictEqual(watcher.name, 'Tech News');
      assert.strictEqual(watcher.status, 'Active');
      assert.strictEqual(watcher.tier, 'Basic');
      assert.strictEqual(watcher.stats.triggerCount, 0);
    });

    it('should create watcher with different tiers', () => {
      const watcherId = Ids.entity();
      const ownerId = Ids.entity();

      const source: WatcherSource = { type: 'poll', endpoint: 'https://api.example.com' };
      const filter: WatcherFilter = {};
      const action: WatcherAction = { type: 'store' };

      const basicWatcher = createWatcher(watcherId, ownerId, 'Basic', source, filter, action, 'Basic');
      const standardWatcher = createWatcher(watcherId, ownerId, 'Standard', source, filter, action, 'Standard');
      const premiumWatcher = createWatcher(watcherId, ownerId, 'Premium', source, filter, action, 'Premium');

      assert.strictEqual(basicWatcher.tier, 'Basic');
      assert.strictEqual(standardWatcher.tier, 'Standard');
      assert.strictEqual(premiumWatcher.tier, 'Premium');
    });

    it('should support different source types', () => {
      const watcherId = Ids.entity();
      const ownerId = Ids.entity();
      const filter: WatcherFilter = {};
      const action: WatcherAction = { type: 'notify' };

      const sources: WatcherSource[] = [
        { type: 'webhook', webhookPath: '/hooks/my-hook' },
        { type: 'poll', endpoint: 'https://api.example.com/data' },
        { type: 'email', emailAddress: 'watch@example.com' },
        { type: 'rss', endpoint: 'https://blog.example.com/feed' },
        { type: 'cron', cronExpression: '0 9 * * *' },
        { type: 'event_stream', eventTypes: ['OrderCreated', 'OrderShipped'] },
      ];

      for (const source of sources) {
        const watcher = createWatcher(watcherId, ownerId, `${source.type} watcher`, source, filter, action);
        assert.strictEqual(watcher.source.type, source.type);
      }
    });
  });

  describe('Watcher Pricing', () => {
    it('should calculate correct monthly cost for each tier', () => {
      assert.strictEqual(calculateWatcherMonthlyCost('Basic'), 10);
      assert.strictEqual(calculateWatcherMonthlyCost('Standard'), 50);
      assert.strictEqual(calculateWatcherMonthlyCost('Premium'), 200);
    });

    it('should have correct pricing configuration', () => {
      assert.strictEqual(WATCHER_PRICING.Basic.monthlyCost, 10);
      assert.strictEqual(WATCHER_PRICING.Basic.maxWatchers, 5);
      
      assert.strictEqual(WATCHER_PRICING.Standard.monthlyCost, 50);
      assert.strictEqual(WATCHER_PRICING.Standard.maxWatchers, 20);
      
      assert.strictEqual(WATCHER_PRICING.Premium.monthlyCost, 200);
      assert.strictEqual(WATCHER_PRICING.Premium.maxWatchers, 100);
    });

    it('should validate poll intervals for tiers', () => {
      // Basic: minimum 1 hour (3600000 ms)
      assert.strictEqual(isValidPollInterval('Basic', 3600000), true);
      assert.strictEqual(isValidPollInterval('Basic', 1800000), false); // 30 min - too fast

      // Standard: minimum 5 minutes (300000 ms)
      assert.strictEqual(isValidPollInterval('Standard', 300000), true);
      assert.strictEqual(isValidPollInterval('Standard', 60000), false); // 1 min - too fast

      // Premium: minimum 1 minute (60000 ms)
      assert.strictEqual(isValidPollInterval('Premium', 60000), true);
      assert.strictEqual(isValidPollInterval('Premium', 30000), false); // 30 sec - too fast
    });
  });

  describe('Watcher Filters', () => {
    it('should support keyword filtering', () => {
      const filter: WatcherFilter = {
        keywords: ['urgent', 'critical', 'error'],
      };

      assert.strictEqual(filter.keywords?.length, 3);
      assert.ok(filter.keywords?.includes('urgent'));
    });

    it('should support pattern filtering', () => {
      const filter: WatcherFilter = {
        pattern: '^ERROR:\\s+.*',
      };

      assert.ok(filter.pattern);
    });

    it('should support condition filtering', () => {
      const filter: WatcherFilter = {
        conditions: [
          { path: '$.status', operator: 'eq', value: 'active' },
          { path: '$.price', operator: 'gt', value: 100 },
          { path: '$.tags', operator: 'contains', value: 'important' },
        ],
      };

      assert.strictEqual(filter.conditions?.length, 3);
    });
  });

  describe('Watcher Actions', () => {
    it('should support notify action', () => {
      const action: WatcherAction = { type: 'notify' };
      assert.strictEqual(action.type, 'notify');
    });

    it('should support intent action', () => {
      const action: WatcherAction = {
        type: 'intent',
        intentType: 'send:email',
        intentPayload: { to: 'user@example.com', subject: 'Alert!' },
      };

      assert.strictEqual(action.type, 'intent');
      assert.strictEqual(action.intentType, 'send:email');
    });

    it('should support webhook action', () => {
      const action: WatcherAction = {
        type: 'webhook',
        webhookUrl: 'https://hooks.slack.com/services/xxx',
      };

      assert.strictEqual(action.type, 'webhook');
      assert.ok(action.webhookUrl);
    });

    it('should support chain action', () => {
      const nextWatcherId = Ids.entity();
      const action: WatcherAction = {
        type: 'chain',
        chainWatcherId: nextWatcherId,
      };

      assert.strictEqual(action.type, 'chain');
      assert.strictEqual(action.chainWatcherId, nextWatcherId);
    });
  });
});

describe('Perception Layer - Shadow Entities', () => {
  describe('Shadow Creation', () => {
    it('should create a basic shadow entity', () => {
      const shadowId = Ids.entity();
      const ownerId = Ids.entity();

      const shadow = createShadowEntity(
        shadowId,
        ownerId,
        [{ platform: 'twitter', externalId: '12345', handle: '@johndoe' }],
        'Person',
        'John Doe',
        'Potential client'
      );

      assert.strictEqual(shadow.id, shadowId);
      assert.strictEqual(shadow.ownerId, ownerId);
      assert.strictEqual(shadow.name, 'John Doe');
      assert.strictEqual(shadow.type, 'Person');
      assert.strictEqual(shadow.trustLevel, 'Unknown');
      assert.strictEqual(shadow.reputation, 50);
      assert.strictEqual(shadow.identities.length, 1);
      assert.strictEqual(shadow.notes, 'Potential client');
    });

    it('should support multiple identities', () => {
      const shadowId = Ids.entity();
      const ownerId = Ids.entity();

      const shadow = createShadowEntity(
        shadowId,
        ownerId,
        [
          { platform: 'twitter', externalId: '12345', handle: '@johndoe' },
          { platform: 'github', externalId: 'johndoe', url: 'https://github.com/johndoe' },
          { platform: 'email', externalId: 'john@example.com' },
        ],
        'Person',
        'John Doe'
      );

      assert.strictEqual(shadow.identities.length, 3);
      assert.strictEqual(shadow.identities[0].platform, 'twitter');
      assert.strictEqual(shadow.identities[1].platform, 'github');
      assert.strictEqual(shadow.identities[2].platform, 'email');
    });

    it('should support different shadow types', () => {
      const shadowId = Ids.entity();
      const ownerId = Ids.entity();
      const identity = [{ platform: 'web', externalId: 'test' }];

      const personShadow = createShadowEntity(shadowId, ownerId, identity, 'Person', 'Person');
      const orgShadow = createShadowEntity(shadowId, ownerId, identity, 'Organization', 'Org');
      const serviceShadow = createShadowEntity(shadowId, ownerId, identity, 'Service', 'Service');
      const accountShadow = createShadowEntity(shadowId, ownerId, identity, 'Account', 'Account');
      const unknownShadow = createShadowEntity(shadowId, ownerId, identity, 'Unknown', 'Unknown');

      assert.strictEqual(personShadow.type, 'Person');
      assert.strictEqual(orgShadow.type, 'Organization');
      assert.strictEqual(serviceShadow.type, 'Service');
      assert.strictEqual(accountShadow.type, 'Account');
      assert.strictEqual(unknownShadow.type, 'Unknown');
    });
  });

  describe('Shadow Properties', () => {
    it('should initialize with default values', () => {
      const shadowId = Ids.entity();
      const ownerId = Ids.entity();

      const shadow = createShadowEntity(
        shadowId,
        ownerId,
        [{ platform: 'test', externalId: '1' }],
        'Unknown',
        'Test'
      );

      assert.deepStrictEqual(shadow.inferredAttributes, {});
      assert.deepStrictEqual(shadow.tags, []);
      assert.deepStrictEqual(shadow.interactions, []);
      assert.strictEqual(shadow.promotedToEntityId, undefined);
    });

    it('should have timestamps', () => {
      const before = Date.now();
      const shadowId = Ids.entity();
      const ownerId = Ids.entity();

      const shadow = createShadowEntity(
        shadowId,
        ownerId,
        [{ platform: 'test', externalId: '1' }],
        'Unknown',
        'Test'
      );

      const after = Date.now();

      assert.ok(shadow.createdAt >= before);
      assert.ok(shadow.createdAt <= after);
      assert.ok(shadow.lastUpdatedAt >= before);
      assert.ok(shadow.lastUpdatedAt <= after);
    });
  });
});

describe('Perception Layer - Integration', () => {
  it('should support watcher → shadow workflow', () => {
    // Scenario: Watcher detects a new Twitter user mentioning our service
    // → Creates a shadow entity to track them

    const watcherId = Ids.entity();
    const ownerId = Ids.entity();

    // 1. Create watcher for Twitter mentions
    const watcher = createWatcher(
      watcherId,
      ownerId,
      'Twitter Mentions',
      { type: 'poll', endpoint: 'https://api.twitter.com/mentions' },
      { keywords: ['@ourservice'] },
      { type: 'intent', intentType: 'create:shadow' }
    );

    assert.strictEqual(watcher.status, 'Active');

    // 2. Watcher triggers, creates shadow
    const shadowId = Ids.entity();
    const shadow = createShadowEntity(
      shadowId,
      ownerId,
      [{ platform: 'twitter', externalId: '98765', handle: '@newuser' }],
      'Person',
      'New User',
      'Mentioned us in tweet'
    );

    assert.strictEqual(shadow.type, 'Person');
    assert.strictEqual(shadow.notes, 'Mentioned us in tweet');
  });
});
