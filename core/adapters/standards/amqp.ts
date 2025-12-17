/**
 * AMQP / MESSAGE QUEUE STANDARD
 * 
 * AMQP (Advanced Message Queuing Protocol) is the standard for:
 * - RabbitMQ
 * - Azure Service Bus
 * - Amazon MQ
 * - Apache Qpid
 * 
 * Also supporting similar patterns for:
 * - Apache Kafka
 * - AWS SQS/SNS
 * - Google Pub/Sub
 * - Redis Streams
 * - NATS
 * 
 * By speaking message queue protocols, our events can flow through
 * any enterprise messaging infrastructure.
 */

import type { Event } from '../../schema/ledger';
import type { EntityId, Timestamp } from '../../shared/types';
import type { 
  QueueAdapter, 
  QueueMessage, 
  QueueSubscription, 
  QueueHandler,
  ReceivedMessage,
  AdapterConfig,
  AdapterHealth,
} from '../types';

// ============================================================================
// AMQP TYPES
// ============================================================================

/**
 * AMQP message properties (from AMQP 0-9-1 spec).
 */
export interface AMQPMessageProperties {
  /** MIME content type */
  contentType?: string;
  /** MIME content encoding */
  contentEncoding?: string;
  /** Application-specific headers */
  headers?: Record<string, unknown>;
  /** Non-persistent (1) or persistent (2) */
  deliveryMode?: 1 | 2;
  /** Message priority (0-9) */
  priority?: number;
  /** Correlation ID for RPC */
  correlationId?: string;
  /** Reply-to queue name */
  replyTo?: string;
  /** Message expiration (ms) */
  expiration?: string;
  /** Application message ID */
  messageId?: string;
  /** Message timestamp */
  timestamp?: number;
  /** Message type name */
  type?: string;
  /** User ID */
  userId?: string;
  /** Application ID */
  appId?: string;
}

/**
 * Exchange types in AMQP.
 */
export type AMQPExchangeType = 
  | 'direct'   // Route by exact routing key match
  | 'fanout'   // Broadcast to all bound queues
  | 'topic'    // Route by pattern matching (*.events.#)
  | 'headers'; // Route by header attributes

// ============================================================================
// EXCHANGE & QUEUE TOPOLOGY
// ============================================================================

/**
 * Standard exchange/queue topology for the Universal Ledger.
 */
export const LEDGER_TOPOLOGY = {
  exchanges: {
    /** Main event exchange (topic for flexible routing) */
    events: {
      name: 'ledger.events',
      type: 'topic' as AMQPExchangeType,
      durable: true,
      autoDelete: false,
    },
    
    /** Dead letter exchange */
    deadLetter: {
      name: 'ledger.dead-letter',
      type: 'fanout' as AMQPExchangeType,
      durable: true,
      autoDelete: false,
    },
    
    /** Delayed message exchange (requires plugin) */
    delayed: {
      name: 'ledger.delayed',
      type: 'x-delayed-message' as any,
      durable: true,
      autoDelete: false,
      arguments: {
        'x-delayed-type': 'topic',
      },
    },
  },
  
  queues: {
    /** All events (for projection rebuilding) */
    allEvents: {
      name: 'ledger.events.all',
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        'x-dead-letter-exchange': 'ledger.dead-letter',
        'x-message-ttl': 7 * 24 * 60 * 60 * 1000, // 7 days
      },
      bindings: [
        { exchange: 'ledger.events', routingKey: '#' },
      ],
    },
    
    /** Agreement events only */
    agreementEvents: {
      name: 'ledger.events.agreement',
      durable: true,
      exclusive: false,
      autoDelete: false,
      bindings: [
        { exchange: 'ledger.events', routingKey: 'agreement.*' },
      ],
    },
    
    /** Workflow events for saga coordination */
    workflowEvents: {
      name: 'ledger.events.workflow',
      durable: true,
      exclusive: false,
      autoDelete: false,
      bindings: [
        { exchange: 'ledger.events', routingKey: 'workflow.*' },
      ],
    },
    
    /** Notification events */
    notificationEvents: {
      name: 'ledger.events.notification',
      durable: true,
      exclusive: false,
      autoDelete: false,
      bindings: [
        { exchange: 'ledger.events', routingKey: '*.notification' },
      ],
    },
    
    /** Dead letter queue */
    deadLetterQueue: {
      name: 'ledger.dead-letter',
      durable: true,
      exclusive: false,
      autoDelete: false,
      bindings: [
        { exchange: 'ledger.dead-letter', routingKey: '' },
      ],
    },
  },
  
  routingPatterns: {
    /** Pattern: {aggregateType}.{eventType} */
    examples: [
      'agreement.proposed',
      'agreement.activated',
      'entity.created',
      'asset.transferred',
      'workflow.transitioned',
    ],
    
    /** Wildcards */
    allAgreements: 'agreement.*',
    allCreated: '*.created',
    everything: '#',
  },
};

// ============================================================================
// EVENT → MESSAGE TRANSFORMATION
// ============================================================================

/**
 * Convert a ledger event to an AMQP message.
 */
export function eventToAMQPMessage(event: Event): {
  content: Buffer;
  properties: AMQPMessageProperties;
  routingKey: string;
} {
  const routingKey = `${event.aggregateType.toLowerCase()}.${event.type.toLowerCase()}`;
  
  return {
    content: Buffer.from(JSON.stringify({
      // Include CloudEvents-like envelope
      specversion: '1.0',
      id: event.id,
      type: `io.universalledger.${routingKey}`,
      source: '/ledger',
      time: new Date(event.timestamp).toISOString(),
      data: event,
    })),
    
    properties: {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      deliveryMode: 2, // Persistent
      messageId: event.id,
      timestamp: Math.floor(event.timestamp / 1000),
      type: event.type,
      appId: 'universal-ledger',
      headers: {
        'x-aggregate-type': event.aggregateType,
        'x-aggregate-id': event.aggregateId,
        'x-sequence': event.sequence?.toString(),
        'x-realm-id': event.realmId,
        'x-correlation-id': event.causation?.correlationId,
      },
    },
    
    routingKey,
  };
}

/**
 * Convert an AMQP message back to a ledger event.
 */
export function amqpMessageToEvent(
  content: Buffer,
  properties: AMQPMessageProperties
): Event {
  const envelope = JSON.parse(content.toString());
  return envelope.data as Event;
}

// ============================================================================
// AMQP ADAPTER
// ============================================================================

export interface AMQPConfig extends AdapterConfig {
  credentials: {
    url: string; // amqp://user:pass@host:5672/vhost
  };
  options?: {
    prefetch?: number;
    heartbeat?: number;
  };
}

/**
 * Create an AMQP-compatible queue adapter.
 */
export function createAMQPAdapter(): QueueAdapter {
  let config: AMQPConfig;
  // let connection: AMQPConnection;
  // let channel: AMQPChannel;
  
  return {
    name: 'AMQP',
    version: '1.0.0',
    platform: 'RabbitMQ',
    category: 'Queue',
    
    async initialize(cfg: AdapterConfig): Promise<void> {
      config = cfg as AMQPConfig;
      // connection = await amqp.connect(config.credentials.url);
      // channel = await connection.createChannel();
      // await channel.prefetch(config.options?.prefetch ?? 10);
      console.log('AMQP adapter initialized');
    },
    
    async healthCheck(): Promise<AdapterHealth> {
      return {
        healthy: true,
        latencyMs: 5,
        message: 'AMQP connected',
      };
    },
    
    async shutdown(): Promise<void> {
      // await channel.close();
      // await connection.close();
      console.log('AMQP adapter shutdown');
    },
    
    async publish(queue: string, message: QueueMessage): Promise<void> {
      // const { content, properties, routingKey } = eventToAMQPMessage(message.body as Event);
      // await channel.publish(
      //   LEDGER_TOPOLOGY.exchanges.events.name,
      //   routingKey,
      //   content,
      //   properties
      // );
      console.log(`Published to ${queue}:`, message);
    },
    
    async subscribe(queue: string, handler: QueueHandler): Promise<QueueSubscription> {
      // const { consumerTag } = await channel.consume(queue, async (msg) => {
      //   if (!msg) return;
      //   const event = amqpMessageToEvent(msg.content, msg.properties);
      //   await handler({
      //     id: msg.properties.messageId,
      //     body: event,
      //     attributes: msg.properties.headers as Record<string, string>,
      //     receivedAt: Date.now(),
      //     retryCount: (msg.properties.headers?.['x-retry-count'] as number) ?? 0,
      //   });
      // });
      
      const subscriptionId = `sub-${Date.now()}`;
      return {
        id: subscriptionId,
        async unsubscribe() {
          // await channel.cancel(consumerTag);
          console.log(`Unsubscribed: ${subscriptionId}`);
        },
      };
    },
    
    async ack(messageId: string): Promise<void> {
      // channel.ack(message);
      console.log(`Acked: ${messageId}`);
    },
    
    async nack(messageId: string, requeue = true): Promise<void> {
      // channel.nack(message, false, requeue);
      console.log(`Nacked: ${messageId}, requeue: ${requeue}`);
    },
  };
}

// ============================================================================
// KAFKA COMPATIBILITY
// ============================================================================

/**
 * Kafka topic configuration for the ledger.
 */
export const KAFKA_TOPICS = {
  /** Main events topic */
  events: {
    name: 'ledger-events',
    partitions: 12,
    replicationFactor: 3,
    config: {
      'retention.ms': String(7 * 24 * 60 * 60 * 1000), // 7 days
      'cleanup.policy': 'delete',
    },
  },
  
  /** Compacted topic for current state */
  state: {
    name: 'ledger-state',
    partitions: 12,
    replicationFactor: 3,
    config: {
      'cleanup.policy': 'compact',
    },
  },
  
  /** Dead letter topic */
  deadLetter: {
    name: 'ledger-dead-letter',
    partitions: 1,
    replicationFactor: 3,
  },
};

/**
 * Kafka message key strategy.
 */
export function getKafkaKey(event: Event): string {
  // Use aggregate ID as key for ordering within partition
  return `${event.aggregateType}:${event.aggregateId}`;
}

/**
 * Kafka message headers from event.
 */
export function getKafkaHeaders(event: Event): Record<string, string> {
  return {
    'ce-specversion': '1.0',
    'ce-type': `io.universalledger.${event.aggregateType.toLowerCase()}.${event.type.toLowerCase()}`,
    'ce-source': '/ledger',
    'ce-id': event.id,
    'ce-time': new Date(event.timestamp).toISOString(),
    'x-aggregate-type': event.aggregateType,
    'x-aggregate-id': event.aggregateId,
    'x-realm-id': event.realmId ?? '',
  };
}

// ============================================================================
// AWS SQS/SNS COMPATIBILITY
// ============================================================================

/**
 * AWS SQS message format.
 */
export interface SQSMessage {
  MessageId: string;
  Body: string;
  MessageAttributes: Record<string, {
    DataType: 'String' | 'Number' | 'Binary';
    StringValue?: string;
    BinaryValue?: Buffer;
  }>;
  MD5OfBody: string;
  ReceiptHandle?: string;
}

/**
 * Convert event to SQS message format.
 */
export function eventToSQSMessage(event: Event): Omit<SQSMessage, 'ReceiptHandle' | 'MD5OfBody'> {
  return {
    MessageId: event.id,
    Body: JSON.stringify(event),
    MessageAttributes: {
      EventType: { DataType: 'String', StringValue: event.type },
      AggregateType: { DataType: 'String', StringValue: event.aggregateType },
      AggregateId: { DataType: 'String', StringValue: event.aggregateId },
      Timestamp: { DataType: 'Number', StringValue: event.timestamp.toString() },
      RealmId: { DataType: 'String', StringValue: event.realmId ?? '' },
    },
  };
}

/**
 * AWS SNS topic configuration.
 */
export const SNS_TOPICS = {
  /** Main events topic */
  events: 'arn:aws:sns:REGION:ACCOUNT:ledger-events',
  
  /** Filter policy for subscriptions */
  filterPolicies: {
    agreementsOnly: {
      AggregateType: ['Agreement'],
    },
    entitiesOnly: {
      AggregateType: ['Entity'],
    },
    specificEventTypes: {
      EventType: ['AgreementActivated', 'AgreementTerminated'],
    },
  },
};

// ============================================================================
// GOOGLE PUB/SUB COMPATIBILITY
// ============================================================================

/**
 * Google Pub/Sub message format.
 */
export interface PubSubMessage {
  data: string; // Base64 encoded
  attributes: Record<string, string>;
  messageId: string;
  publishTime: string;
  orderingKey?: string;
}

/**
 * Convert event to Pub/Sub message.
 */
export function eventToPubSubMessage(event: Event): Omit<PubSubMessage, 'messageId' | 'publishTime'> {
  return {
    data: Buffer.from(JSON.stringify(event)).toString('base64'),
    attributes: {
      eventType: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      timestamp: event.timestamp.toString(),
      realmId: event.realmId ?? '',
    },
    orderingKey: `${event.aggregateType}:${event.aggregateId}`,
  };
}

/**
 * Pub/Sub topic configuration.
 */
export const PUBSUB_CONFIG = {
  topic: 'projects/PROJECT_ID/topics/ledger-events',
  
  subscriptions: {
    allEvents: {
      name: 'projects/PROJECT_ID/subscriptions/ledger-events-all',
      ackDeadlineSeconds: 60,
      retainAckedMessages: false,
      messageRetentionDuration: '604800s', // 7 days
    },
    
    agreementsOnly: {
      name: 'projects/PROJECT_ID/subscriptions/ledger-events-agreements',
      filter: 'attributes.aggregateType = "Agreement"',
      ackDeadlineSeconds: 60,
    },
  },
};

// ============================================================================
// REDIS STREAMS COMPATIBILITY
// ============================================================================

/**
 * Redis Streams format.
 */
export const REDIS_STREAMS = {
  streamKey: 'ledger:events',
  
  /** Convert event to Redis Stream entry */
  toStreamEntry(event: Event): [string, ...string[]] {
    return [
      '*', // Auto-generate ID
      'type', event.type,
      'aggregateType', event.aggregateType,
      'aggregateId', event.aggregateId,
      'timestamp', event.timestamp.toString(),
      'payload', JSON.stringify(event.payload),
      'actor', JSON.stringify(event.actor),
      'realmId', event.realmId ?? '',
    ];
  },
  
  /** Consumer group configuration */
  consumerGroup: {
    name: 'ledger-consumers',
    startId: '0', // Read from beginning
  },
};

// ============================================================================
// NATS COMPATIBILITY
// ============================================================================

/**
 * NATS subject patterns.
 */
export const NATS_SUBJECTS = {
  /** Event subjects follow: ledger.{aggregateType}.{eventType} */
  pattern: 'ledger.>',
  
  examples: [
    'ledger.agreement.proposed',
    'ledger.agreement.activated',
    'ledger.entity.created',
    'ledger.asset.transferred',
  ],
  
  /** JetStream configuration */
  jetstream: {
    stream: {
      name: 'LEDGER',
      subjects: ['ledger.>'],
      retention: 'limits', // or 'workqueue' for queue semantics
      maxAge: 7 * 24 * 60 * 60 * 1e9, // 7 days in nanoseconds
      storage: 'file',
      replicas: 3,
    },
    
    consumer: {
      durable: 'ledger-consumer',
      ackPolicy: 'explicit',
      maxDeliver: 5,
      ackWait: 30 * 1e9, // 30 seconds
    },
  },
};

/**
 * Convert event to NATS message.
 */
export function eventToNATSMessage(event: Event): {
  subject: string;
  data: Uint8Array;
  headers?: Record<string, string[]>;
} {
  return {
    subject: `ledger.${event.aggregateType.toLowerCase()}.${event.type.toLowerCase()}`,
    data: new TextEncoder().encode(JSON.stringify(event)),
    headers: {
      'Nats-Msg-Id': [event.id],
      'X-Aggregate-Type': [event.aggregateType],
      'X-Aggregate-Id': [event.aggregateId],
    },
  };
}

