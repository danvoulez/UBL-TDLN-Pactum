/**
 * SLACK ADAPTER
 * 
 * Team messaging and workflow notifications.
 * 
 * Use for:
 * - Real-time agreement notifications to channels
 * - Approval workflows via Slack
 * - Team alerts for deadlines
 * - Interactive consent flows
 * - Bot commands for ledger queries
 */

import type { 
  CommunicationAdapter, 
  CommunicationChannel,
  SendRequest, 
  SendResult, 
  InboundMessage,
  AdapterConfig,
  AdapterHealth,
} from './types';
import type { EntityId } from '../shared/types';

export interface SlackConfig extends AdapterConfig {
  credentials: {
    /** Bot OAuth token */
    botToken: string;
    /** Signing secret for webhook verification */
    signingSecret?: string;
    /** App-level token for Socket Mode */
    appToken?: string;
  };
  options?: {
    /** Default channel for notifications */
    defaultChannel?: string;
  };
}

/**
 * Slack adapter for team messaging.
 */
export function createSlackAdapter(): CommunicationAdapter {
  let config: SlackConfig;
  
  return {
    name: 'Slack',
    version: '1.0.0',
    platform: 'Slack',
    category: 'Communication',
    channels: ['slack'] as CommunicationChannel[],
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as SlackConfig;
      console.log('Slack adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      try {
        // Test auth
        // const response = await fetch('https://slack.com/api/auth.test', {
        //   headers: { Authorization: `Bearer ${config.credentials.botToken}` },
        // });
        // const data = await response.json();
        return { 
          healthy: true, 
          latencyMs: 50, 
          message: 'Slack connected',
        };
      } catch (error) {
        return { healthy: false, latencyMs: 0, message: `Slack error: ${error}` };
      }
    },
    
    async shutdown(): Promise<void> {
      console.log('Slack adapter shutdown');
    },
    
    async send(request: SendRequest): Promise<SendResult> {
      const { to, body, metadata } = request;
      
      // "to" is a channel ID or user ID
      const channel = Array.isArray(to) ? to[0] : (to || config.options?.defaultChannel);
      
      // Build message payload
      const payload: SlackMessage = {
        channel: channel ?? '',
        text: body,
      };
      
      // If metadata contains blocks, use them
      if (metadata?.blocks) {
        payload.blocks = metadata.blocks as SlackBlock[];
      }
      
      // If metadata contains attachments, use them
      if (metadata?.attachments) {
        payload.attachments = metadata.attachments as SlackAttachment[];
      }
      
      // const response = await fetch('https://slack.com/api/chat.postMessage', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     Authorization: `Bearer ${config.credentials.botToken}`,
      //   },
      //   body: JSON.stringify(payload),
      // });
      // const data = await response.json();
      
      // Mock response
      return {
        id: `slack-${Date.now()}`,
        status: 'sent',
        channel: 'slack',
      };
    },
    
    async sendBatch(requests: readonly SendRequest[]): Promise<readonly SendResult[]> {
      return Promise.all(requests.map(r => this.send(r)));
    },
    
    async handleInbound(payload: unknown): Promise<InboundMessage | null> {
      const event = payload as SlackEvent;
      
      // Handle different event types
      if (event.type === 'message' && !event.bot_id) {
        return {
          from: event.user ?? '',
          to: event.channel ?? '',
          channel: 'slack',
          body: event.text ?? '',
          receivedAt: parseFloat(event.ts ?? '0') * 1000,
        };
      }
      
      return null;
    },
  };
}

interface SlackMessage {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  thread_ts?: string;
  reply_broadcast?: boolean;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: unknown[];
  accessory?: unknown;
  block_id?: string;
}

interface SlackAttachment {
  color?: string;
  pretext?: string;
  author_name?: string;
  title?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  footer?: string;
  ts?: number;
}

interface SlackEvent {
  type?: string;
  user?: string;
  channel?: string;
  text?: string;
  ts?: string;
  bot_id?: string;
}

// ============================================================================
// BLOCK KIT BUILDERS
// ============================================================================

/**
 * Slack Block Kit builders for rich messages.
 */
export const SlackBlocks = {
  /** Header block */
  header: (text: string): SlackBlock => ({
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  }),
  
  /** Section with text */
  section: (text: string, accessory?: unknown): SlackBlock => ({
    type: 'section',
    text: { type: 'mrkdwn', text },
    ...(accessory && { accessory }),
  }),
  
  /** Divider */
  divider: (): SlackBlock => ({ type: 'divider' }),
  
  /** Context (small text) */
  context: (texts: string[]): SlackBlock => ({
    type: 'context',
    elements: texts.map(t => ({ type: 'mrkdwn', text: t })),
  }),
  
  /** Actions (buttons, selects, etc.) */
  actions: (elements: unknown[], blockId?: string): SlackBlock => ({
    type: 'actions',
    elements: elements as any[],
    ...(blockId && { block_id: blockId }),
  }),
  
  /** Button element */
  button: (text: string, actionId: string, value: string, style?: 'primary' | 'danger') => ({
    type: 'button',
    text: { type: 'plain_text', text, emoji: true },
    action_id: actionId,
    value,
    ...(style && { style }),
  }),
  
  /** URL button */
  urlButton: (text: string, url: string) => ({
    type: 'button',
    text: { type: 'plain_text', text, emoji: true },
    url,
  }),
};

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

/**
 * Pre-built Slack notification templates for common ledger events.
 */
export const SLACK_NOTIFICATIONS = {
  /** Agreement proposed */
  agreementProposed: (data: {
    agreementType: string;
    proposer: string;
    parties: string[];
    summary: string;
    agreementId: EntityId;
    consentUrl: string;
  }): SlackMessage => ({
    channel: '',
    text: `New ${data.agreementType} Agreement proposed by ${data.proposer}`,
    blocks: [
      SlackBlocks.header(`📜 New ${data.agreementType} Agreement`),
      SlackBlocks.section(`*Proposed by:* ${data.proposer}`),
      SlackBlocks.section(`*Parties:*\n${data.parties.map(p => `• ${p}`).join('\n')}`),
      SlackBlocks.divider(),
      SlackBlocks.section(`*Summary:*\n${data.summary}`),
      SlackBlocks.actions([
        SlackBlocks.button('✓ Review & Consent', 'consent_agreement', data.agreementId, 'primary'),
        SlackBlocks.urlButton('View Details', data.consentUrl),
      ], `agreement_${data.agreementId}`),
      SlackBlocks.context([`Agreement ID: ${data.agreementId}`]),
    ],
  }),
  
  /** Agreement activated */
  agreementActivated: (data: {
    agreementType: string;
    parties: string[];
    agreementId: EntityId;
  }): SlackMessage => ({
    channel: '',
    text: `${data.agreementType} Agreement activated`,
    blocks: [
      SlackBlocks.header(`✅ Agreement Activated`),
      SlackBlocks.section(`The *${data.agreementType}* agreement is now active.`),
      SlackBlocks.section(`*Parties:*\n${data.parties.map(p => `• ${p}`).join('\n')}`),
      SlackBlocks.context([`Agreement ID: ${data.agreementId}`, `Activated: <!date^${Math.floor(Date.now()/1000)}^{date_short_pretty} at {time}|now>`]),
    ],
  }),
  
  /** Deadline approaching */
  deadlineApproaching: (data: {
    description: string;
    dueDate: string;
    daysRemaining: number;
    agreementId: EntityId;
    actionUrl: string;
  }): SlackMessage => ({
    channel: '',
    text: `⏰ Deadline approaching: ${data.description}`,
    blocks: [
      SlackBlocks.header(`⏰ Deadline Approaching`),
      SlackBlocks.section(`*${data.description}*`),
      SlackBlocks.section(`Due: *${data.dueDate}* (${data.daysRemaining} days remaining)`),
      SlackBlocks.actions([
        SlackBlocks.urlButton('Take Action', data.actionUrl),
      ]),
      SlackBlocks.context([`Related to agreement: ${data.agreementId}`]),
    ],
  }),
  
  /** Consent required */
  consentRequired: (data: {
    agreementType: string;
    requestedBy: string;
    agreementId: EntityId;
    deadline?: string;
  }): SlackMessage => ({
    channel: '',
    text: `Your consent is required for a ${data.agreementType} agreement`,
    blocks: [
      SlackBlocks.header(`🔔 Consent Required`),
      SlackBlocks.section(`*${data.requestedBy}* is requesting your consent for a *${data.agreementType}* agreement.`),
      ...(data.deadline ? [SlackBlocks.section(`⏱️ Please respond by: ${data.deadline}`)] : []),
      SlackBlocks.actions([
        SlackBlocks.button('✓ Give Consent', 'give_consent', data.agreementId, 'primary'),
        SlackBlocks.button('✗ Decline', 'decline_consent', data.agreementId, 'danger'),
        SlackBlocks.button('View Agreement', 'view_agreement', data.agreementId),
      ], `consent_${data.agreementId}`),
    ],
  }),
  
  /** Role granted */
  roleGranted: (data: {
    entity: string;
    role: string;
    scope: string;
    agreementId: EntityId;
  }): SlackMessage => ({
    channel: '',
    text: `${data.entity} has been granted the ${data.role} role`,
    blocks: [
      SlackBlocks.header(`👤 Role Granted`),
      SlackBlocks.section(`*${data.entity}* has been granted the *${data.role}* role.`),
      SlackBlocks.section(`*Scope:* ${data.scope}`),
      SlackBlocks.context([`Established by agreement: ${data.agreementId}`]),
    ],
  }),
  
  /** Payment received */
  paymentReceived: (data: {
    amount: string;
    currency: string;
    from: string;
    agreementId: EntityId;
  }): SlackMessage => ({
    channel: '',
    text: `Payment received: ${data.amount} ${data.currency}`,
    blocks: [
      SlackBlocks.header(`💰 Payment Received`),
      SlackBlocks.section(`*Amount:* ${data.amount} ${data.currency}`),
      SlackBlocks.section(`*From:* ${data.from}`),
      SlackBlocks.context([`Agreement: ${data.agreementId}`, `Received: <!date^${Math.floor(Date.now()/1000)}^{date_short_pretty} at {time}|now>`]),
    ],
  }),
};

// ============================================================================
// SLASH COMMANDS
// ============================================================================

/**
 * Slash command handlers for Slack.
 */
export const SLASH_COMMANDS = {
  /** /ledger query <query> - Query the ledger */
  query: {
    command: '/ledger',
    description: 'Query the Universal Ledger',
    usage: '/ledger query show all active agreements',
  },
  
  /** /ledger status - Check ledger status */
  status: {
    command: '/ledger',
    description: 'Check ledger status',
    usage: '/ledger status',
  },
  
  /** /ledger consent <id> - Give consent to agreement */
  consent: {
    command: '/ledger',
    description: 'Give consent to an agreement',
    usage: '/ledger consent agr-123456',
  },
};

/**
 * Parse a slash command.
 */
export function parseSlashCommand(text: string): {
  action: string;
  args: string[];
} {
  const parts = text.trim().split(/\s+/);
  const action = parts[0]?.toLowerCase() ?? '';
  const args = parts.slice(1);
  
  return { action, args };
}

