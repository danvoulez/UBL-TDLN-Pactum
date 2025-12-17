/**
 * OUTBOUND - Webhooks, Notifications & External Integrations
 * 
 * The ledger doesn't exist in isolation. It needs to:
 * - Notify external systems of events (webhooks)
 * - Send notifications to users (email, SMS, push)
 * - Integrate with other services (APIs)
 * 
 * All outbound operations are:
 * - Logged as events (auditable)
 * - Retryable (with backoff)
 * - Configurable per realm
 */

import type { EntityId, Timestamp, ActorReference } from '../shared/types';
import type { Event } from '../schema/ledger';

// ============================================================================
// WEBHOOKS
// ============================================================================

/**
 * A Webhook subscription sends events to an external URL.
 */
export interface Webhook {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  
  /** Where to send */
  readonly url: string;
  readonly method: 'POST' | 'PUT';
  
  /** Authentication */
  readonly auth?: WebhookAuth;
  
  /** What events to send */
  readonly filters: WebhookFilters;
  
  /** Transform the payload */
  readonly transform?: WebhookTransform;
  
  /** Retry policy */
  readonly retryPolicy: WebhookRetryPolicy;
  
  /** State */
  readonly state: WebhookState;
  readonly createdAt: Timestamp;
  readonly createdBy: ActorReference;
  
  /** Stats */
  readonly stats: WebhookStats;
  
  /** Owning realm */
  readonly realmId: EntityId;
}

export type WebhookAuth =
  | { readonly type: 'None' }
  | { readonly type: 'Bearer'; readonly token: string }
  | { readonly type: 'Basic'; readonly username: string; readonly password: string }
  | { readonly type: 'Header'; readonly headerName: string; readonly headerValue: string }
  | { readonly type: 'HMAC'; readonly secret: string; readonly algorithm: 'SHA256' | 'SHA512' };

export interface WebhookFilters {
  /** Event types to send (empty = all) */
  readonly eventTypes?: readonly string[];
  
  /** Aggregate types to send */
  readonly aggregateTypes?: readonly string[];
  
  /** Only events for specific entities */
  readonly entityIds?: readonly EntityId[];
  
  /** Custom filter expression */
  readonly expression?: string;
}

export interface WebhookTransform {
  /** Template for the payload (use event data) */
  readonly template?: string;
  
  /** Map field names */
  readonly fieldMapping?: Record<string, string>;
  
  /** Include only these fields */
  readonly includeFields?: readonly string[];
  
  /** Exclude these fields */
  readonly excludeFields?: readonly string[];
}

export interface WebhookRetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryOn: readonly number[]; // HTTP status codes to retry
}

export type WebhookState = 'Active' | 'Paused' | 'Failed' | 'Disabled';

export interface WebhookStats {
  readonly totalDeliveries: number;
  readonly successfulDeliveries: number;
  readonly failedDeliveries: number;
  readonly lastDeliveryAt?: Timestamp;
  readonly lastSuccessAt?: Timestamp;
  readonly lastFailureAt?: Timestamp;
  readonly lastError?: string;
  readonly averageLatencyMs: number;
}

/**
 * A delivery attempt for a webhook.
 */
export interface WebhookDelivery {
  readonly id: EntityId;
  readonly webhookId: EntityId;
  readonly eventId: EntityId;
  
  /** Request */
  readonly requestUrl: string;
  readonly requestMethod: string;
  readonly requestHeaders: Record<string, string>;
  readonly requestBody: string;
  readonly requestedAt: Timestamp;
  
  /** Response */
  readonly responseStatus?: number;
  readonly responseHeaders?: Record<string, string>;
  readonly responseBody?: string;
  readonly respondedAt?: Timestamp;
  
  /** State */
  readonly state: 'Pending' | 'Delivered' | 'Failed' | 'Retrying';
  readonly attempt: number;
  readonly nextRetryAt?: Timestamp;
  readonly error?: string;
}

/**
 * Webhook manager handles webhook lifecycle and delivery.
 */
export interface WebhookManager {
  /** Create a webhook */
  create(webhook: Omit<Webhook, 'id' | 'state' | 'createdAt' | 'stats'>): Promise<Webhook>;
  
  /** Update a webhook */
  update(webhookId: EntityId, updates: Partial<Webhook>): Promise<Webhook>;
  
  /** Delete a webhook */
  delete(webhookId: EntityId): Promise<void>;
  
  /** Pause/resume */
  pause(webhookId: EntityId): Promise<void>;
  resume(webhookId: EntityId): Promise<void>;
  
  /** Get webhooks for a realm */
  getForRealm(realmId: EntityId): Promise<readonly Webhook[]>;
  
  /** Get delivery history */
  getDeliveries(webhookId: EntityId, limit?: number): Promise<readonly WebhookDelivery[]>;
  
  /** Retry a failed delivery */
  retryDelivery(deliveryId: EntityId): Promise<WebhookDelivery>;
  
  /** Test webhook with sample event */
  test(webhookId: EntityId, sampleEvent?: Event): Promise<WebhookDelivery>;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * A notification to be sent to a user/entity.
 */
export interface Notification {
  readonly id: EntityId;
  
  /** Who to notify */
  readonly recipientId: EntityId;
  readonly recipientType: 'Entity' | 'Group' | 'Role';
  
  /** Notification content */
  readonly channel: NotificationChannel;
  readonly template: string;
  readonly templateData: Record<string, unknown>;
  
  /** Priority */
  readonly priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  
  /** Scheduling */
  readonly scheduledFor?: Timestamp;
  
  /** State */
  readonly state: NotificationState;
  readonly createdAt: Timestamp;
  readonly sentAt?: Timestamp;
  readonly deliveredAt?: Timestamp;
  readonly readAt?: Timestamp;
  readonly failedAt?: Timestamp;
  readonly error?: string;
  
  /** Context */
  readonly relatedEntity?: { type: string; id: EntityId };
  readonly realmId: EntityId;
  
  /** Actions user can take from the notification */
  readonly actions?: readonly NotificationAction[];
}

export type NotificationChannel = 
  | 'InApp'     // In-app notification
  | 'Email'     // Email
  | 'SMS'       // SMS/Text
  | 'Push'      // Push notification
  | 'Slack'     // Slack message
  | 'Teams'     // Microsoft Teams
  | 'Webhook';  // Custom webhook

export type NotificationState = 
  | 'Pending'
  | 'Scheduled'
  | 'Sending'
  | 'Sent'
  | 'Delivered'
  | 'Read'
  | 'Failed'
  | 'Cancelled';

export interface NotificationAction {
  readonly label: string;
  readonly intent: string;
  readonly payload?: Record<string, unknown>;
  readonly style?: 'primary' | 'secondary' | 'danger';
}

/**
 * Notification templates define the content structure.
 */
export interface NotificationTemplate {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  
  /** Channel-specific content */
  readonly channels: {
    readonly [K in NotificationChannel]?: ChannelTemplate;
  };
  
  /** Required variables */
  readonly variables: readonly string[];
  
  /** Default priority */
  readonly defaultPriority: Notification['priority'];
}

export interface ChannelTemplate {
  readonly subject?: string; // For email
  readonly title?: string;   // For push
  readonly body: string;
  readonly bodyHtml?: string; // For rich email
}

/**
 * Notification service handles sending notifications.
 */
export interface NotificationService {
  /** Send a notification */
  send(notification: Omit<Notification, 'id' | 'state' | 'createdAt'>): Promise<Notification>;
  
  /** Send using a template */
  sendFromTemplate(
    templateId: string,
    recipientId: EntityId,
    data: Record<string, unknown>,
    options?: {
      channel?: NotificationChannel;
      priority?: Notification['priority'];
      scheduledFor?: Timestamp;
      actions?: readonly NotificationAction[];
    }
  ): Promise<Notification>;
  
  /** Bulk send */
  sendBulk(
    templateId: string,
    recipientIds: readonly EntityId[],
    data: Record<string, unknown>
  ): Promise<readonly Notification[]>;
  
  /** Get notifications for a recipient */
  getForRecipient(
    recipientId: EntityId,
    options?: { unreadOnly?: boolean; limit?: number }
  ): Promise<readonly Notification[]>;
  
  /** Mark as read */
  markAsRead(notificationId: EntityId): Promise<void>;
  markAllAsRead(recipientId: EntityId): Promise<void>;
  
  /** Cancel a pending notification */
  cancel(notificationId: EntityId): Promise<void>;
  
  /** Get unread count */
  getUnreadCount(recipientId: EntityId): Promise<number>;
}

// ============================================================================
// EXTERNAL INTEGRATIONS
// ============================================================================

/**
 * An external integration connects the ledger to third-party services.
 */
export interface Integration {
  readonly id: EntityId;
  readonly name: string;
  readonly type: IntegrationType;
  readonly description?: string;
  
  /** Configuration (type-specific) */
  readonly config: Record<string, unknown>;
  
  /** Credentials (encrypted) */
  readonly credentials: IntegrationCredentials;
  
  /** What events trigger this integration? */
  readonly triggers: readonly IntegrationTrigger[];
  
  /** State */
  readonly state: 'Active' | 'Inactive' | 'Error';
  readonly lastSyncAt?: Timestamp;
  readonly lastError?: string;
  
  /** Owning realm */
  readonly realmId: EntityId;
}

export type IntegrationType =
  | 'CRM'           // Salesforce, HubSpot, etc.
  | 'ERP'           // SAP, Oracle, etc.
  | 'Accounting'    // QuickBooks, Xero, etc.
  | 'HR'            // Workday, BambooHR, etc.
  | 'Storage'       // Dropbox, Google Drive, etc.
  | 'Communication' // Slack, Teams, etc.
  | 'Payment'       // Stripe, PayPal, etc.
  | 'Custom';       // Custom webhook-based

export interface IntegrationCredentials {
  readonly type: 'OAuth' | 'ApiKey' | 'Basic' | 'Custom';
  readonly encryptedData: string;
  readonly expiresAt?: Timestamp;
  readonly refreshToken?: string;
}

export interface IntegrationTrigger {
  readonly eventType: string;
  readonly action: 'sync' | 'create' | 'update' | 'delete' | 'custom';
  readonly mapping: Record<string, string>; // Our field → Their field
  readonly filter?: string; // Expression to filter events
}

/**
 * Integration manager handles external service connections.
 */
export interface IntegrationManager {
  /** Create an integration */
  create(integration: Omit<Integration, 'id' | 'state'>): Promise<Integration>;
  
  /** Update integration */
  update(integrationId: EntityId, updates: Partial<Integration>): Promise<Integration>;
  
  /** Delete integration */
  delete(integrationId: EntityId): Promise<void>;
  
  /** Test connection */
  testConnection(integrationId: EntityId): Promise<ConnectionTestResult>;
  
  /** Trigger a sync */
  sync(integrationId: EntityId): Promise<SyncResult>;
  
  /** Get integrations for a realm */
  getForRealm(realmId: EntityId): Promise<readonly Integration[]>;
  
  /** OAuth flow helpers */
  getOAuthUrl(integrationType: IntegrationType, realmId: EntityId): Promise<string>;
  handleOAuthCallback(code: string, state: string): Promise<Integration>;
}

export interface ConnectionTestResult {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

export interface SyncResult {
  readonly success: boolean;
  readonly recordsSynced: number;
  readonly recordsFailed: number;
  readonly errors?: readonly { record: string; error: string }[];
  readonly duration: number;
}

// ============================================================================
// BUILT-IN NOTIFICATION TEMPLATES
// ============================================================================

export const BUILT_IN_TEMPLATES: readonly NotificationTemplate[] = [
  {
    id: 'agreement-proposed',
    name: 'Agreement Proposed',
    description: 'Notification when a new agreement is proposed',
    channels: {
      InApp: {
        title: 'New Agreement Proposal',
        body: '{{proposerName}} has proposed a {{agreementType}} agreement.',
      },
      Email: {
        subject: 'New Agreement: {{agreementType}}',
        body: 'Hello {{recipientName}},\n\n{{proposerName}} has proposed a new {{agreementType}} agreement.\n\nPlease review and respond.',
        bodyHtml: '<p>Hello {{recipientName}},</p><p>{{proposerName}} has proposed a new <strong>{{agreementType}}</strong> agreement.</p><p>Please review and respond.</p>',
      },
    },
    variables: ['proposerName', 'agreementType', 'recipientName', 'agreementId'],
    defaultPriority: 'Normal',
  },
  {
    id: 'consent-required',
    name: 'Consent Required',
    description: 'Notification when consent is needed',
    channels: {
      InApp: {
        title: 'Your Consent Required',
        body: 'Agreement "{{agreementTitle}}" requires your consent.',
      },
      Email: {
        subject: 'Action Required: Consent for {{agreementTitle}}',
        body: 'Hello {{recipientName}},\n\nYour consent is required for the agreement "{{agreementTitle}}".\n\nPlease review and provide your consent.',
      },
    },
    variables: ['agreementTitle', 'recipientName', 'agreementId'],
    defaultPriority: 'High',
  },
  {
    id: 'deadline-approaching',
    name: 'Deadline Approaching',
    description: 'Reminder about an approaching deadline',
    channels: {
      InApp: {
        title: 'Deadline in {{daysRemaining}} days',
        body: '{{deadlineName}} is due on {{dueDate}}.',
      },
      Email: {
        subject: 'Reminder: {{deadlineName}} due {{dueDate}}',
        body: 'Hello {{recipientName}},\n\nThis is a reminder that {{deadlineName}} is due on {{dueDate}}.\n\nDays remaining: {{daysRemaining}}',
      },
      SMS: {
        body: 'Reminder: {{deadlineName}} due {{dueDate}}. {{daysRemaining}} days left.',
      },
    },
    variables: ['deadlineName', 'dueDate', 'daysRemaining', 'recipientName'],
    defaultPriority: 'Normal',
  },
  {
    id: 'role-granted',
    name: 'Role Granted',
    description: 'Notification when a role is granted',
    channels: {
      InApp: {
        title: 'New Role: {{roleType}}',
        body: 'You have been granted the {{roleType}} role.',
      },
      Email: {
        subject: 'Role Granted: {{roleType}}',
        body: 'Hello {{recipientName}},\n\nYou have been granted the {{roleType}} role.\n\nThis was established by agreement {{agreementId}}.',
      },
    },
    variables: ['roleType', 'recipientName', 'agreementId'],
    defaultPriority: 'Normal',
  },
];

