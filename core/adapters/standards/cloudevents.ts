/**
 * CLOUDEVENTS STANDARD
 * 
 * CloudEvents is a CNCF specification for describing events in a common way.
 * https://cloudevents.io
 * 
 * Many platforms support CloudEvents:
 * - AWS EventBridge
 * - Google Cloud Eventarc  
 * - Azure Event Grid
 * - Knative
 * - Kafka (with CloudEvents)
 * 
 * By speaking CloudEvents, our ledger events can flow to ANY of these systems.
 */

import type { Event } from '../../schema/ledger';
import type { EntityId, Timestamp } from '../../shared/types';

// ============================================================================
// CLOUDEVENTS SPECIFICATION (v1.0.2)
// ============================================================================

/**
 * CloudEvents v1.0 specification
 * https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
 */
export interface CloudEvent<TData = unknown> {
  // REQUIRED attributes
  
  /** Identifies the event. Producers MUST ensure unique. */
  readonly id: string;
  
  /** Identifies the context in which an event happened. URI-reference */
  readonly source: string;
  
  /** Version of the CloudEvents specification */
  readonly specversion: '1.0';
  
  /** Type of occurrence. Should be reverse-DNS naming */
  readonly type: string;
  
  // OPTIONAL attributes
  
  /** Content type of data */
  readonly datacontenttype?: string;
  
  /** Identifies the schema that data adheres to */
  readonly dataschema?: string;
  
  /** Describes the subject of the event */
  readonly subject?: string;
  
  /** Timestamp of when the event happened */
  readonly time?: string; // RFC 3339
  
  // Extension attributes (we define our own)
  
  /** The aggregate type (ledger extension) */
  readonly aggregatetype?: string;
  
  /** The aggregate ID (ledger extension) */
  readonly aggregateid?: string;
  
  /** Sequence number (ledger extension) */
  readonly sequence?: string;
  
  /** Realm ID (ledger extension) */
  readonly realmid?: string;
  
  /** Correlation ID for tracing */
  readonly correlationid?: string;
  
  /** Causation ID (what caused this event) */
  readonly causationid?: string;
  
  // The event data
  
  /** Event payload as JSON */
  readonly data?: TData;
  
  /** Event payload as base64-encoded binary */
  readonly data_base64?: string;
}

// ============================================================================
// TRANSFORMATION: Ledger Event ↔ CloudEvent
// ============================================================================

/**
 * Configuration for CloudEvents transformation.
 */
export interface CloudEventsConfig {
  /** The source URI for all events (e.g., "/ledger/acme-corp") */
  readonly source: string;
  
  /** Type prefix (e.g., "com.universalledger") */
  readonly typePrefix: string;
  
  /** Include full payload or just reference? */
  readonly includeData: boolean;
  
  /** Data schema URI base */
  readonly schemaBase?: string;
}

const DEFAULT_CONFIG: CloudEventsConfig = {
  source: '/universal-ledger',
  typePrefix: 'io.universalledger',
  includeData: true,
};

/**
 * Convert a Ledger Event to CloudEvents format.
 */
export function toCloudEvent(
  event: Event,
  config: Partial<CloudEventsConfig> = {}
): CloudEvent {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  return {
    // Required
    id: event.id,
    source: cfg.source,
    specversion: '1.0',
    type: `${cfg.typePrefix}.${event.aggregateType.toLowerCase()}.${event.type.toLowerCase()}`,
    
    // Optional
    datacontenttype: 'application/json',
    dataschema: cfg.schemaBase 
      ? `${cfg.schemaBase}/${event.type}.json`
      : undefined,
    subject: `/${event.aggregateType}/${event.aggregateId}`,
    time: new Date(event.timestamp).toISOString(),
    
    // Ledger extensions
    aggregatetype: event.aggregateType,
    aggregateid: event.aggregateId,
    sequence: event.sequence?.toString(),
    realmid: event.realmId,
    correlationid: event.causation?.correlationId,
    causationid: event.causation?.eventId,
    
    // Data
    data: cfg.includeData ? event.payload : undefined,
  };
}

/**
 * Convert a CloudEvent back to Ledger Event format.
 */
export function fromCloudEvent(cloudEvent: CloudEvent): Event {
  // Parse type: io.universalledger.agreement.agreementcreated → AgreementCreated
  const typeParts = cloudEvent.type.split('.');
  const eventType = typeParts[typeParts.length - 1];
  const aggregateType = typeParts[typeParts.length - 2];
  
  // Parse subject: /Agreement/agr-123 → Agreement, agr-123
  const subjectParts = cloudEvent.subject?.split('/').filter(Boolean) ?? [];
  
  return {
    id: cloudEvent.id,
    type: toPascalCase(eventType),
    aggregateType: toPascalCase(aggregateType) as any,
    aggregateId: (cloudEvent.aggregateid ?? subjectParts[1] ?? '') as EntityId,
    timestamp: cloudEvent.time 
      ? new Date(cloudEvent.time).getTime() 
      : Date.now(),
    version: 1,
    actor: { type: 'System', systemId: 'cloudevents-adapter' },
    payload: cloudEvent.data ?? {},
    realmId: cloudEvent.realmid as EntityId | undefined,
    sequence: cloudEvent.sequence ? BigInt(cloudEvent.sequence) : undefined,
    causation: cloudEvent.correlationid || cloudEvent.causationid
      ? {
          correlationId: cloudEvent.correlationid,
          eventId: cloudEvent.causationid,
        }
      : undefined,
    hash: '',
  };
}

/**
 * Convert multiple events to CloudEvents batch format.
 */
export function toCloudEventBatch(
  events: readonly Event[],
  config?: Partial<CloudEventsConfig>
): readonly CloudEvent[] {
  return events.map(e => toCloudEvent(e, config));
}

// ============================================================================
// CLOUDEVENTS TRANSPORT
// ============================================================================

/**
 * HTTP headers for CloudEvents in "structured" mode.
 */
export function getStructuredHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/cloudevents+json; charset=utf-8',
  };
}

/**
 * HTTP headers for CloudEvents in "binary" mode.
 */
export function getBinaryHeaders(event: CloudEvent): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': event.datacontenttype ?? 'application/json',
    'ce-id': event.id,
    'ce-source': event.source,
    'ce-specversion': event.specversion,
    'ce-type': event.type,
  };
  
  if (event.time) headers['ce-time'] = event.time;
  if (event.subject) headers['ce-subject'] = event.subject;
  if (event.dataschema) headers['ce-dataschema'] = event.dataschema;
  
  // Extensions
  if (event.aggregatetype) headers['ce-aggregatetype'] = event.aggregatetype;
  if (event.aggregateid) headers['ce-aggregateid'] = event.aggregateid;
  if (event.sequence) headers['ce-sequence'] = event.sequence;
  if (event.realmid) headers['ce-realmid'] = event.realmid;
  if (event.correlationid) headers['ce-correlationid'] = event.correlationid;
  
  return headers;
}

/**
 * Parse CloudEvent from HTTP request (binary mode).
 */
export function parseFromBinaryMode(
  headers: Record<string, string>,
  body: unknown
): CloudEvent {
  return {
    id: headers['ce-id'],
    source: headers['ce-source'],
    specversion: '1.0',
    type: headers['ce-type'],
    datacontenttype: headers['content-type'],
    dataschema: headers['ce-dataschema'],
    subject: headers['ce-subject'],
    time: headers['ce-time'],
    aggregatetype: headers['ce-aggregatetype'],
    aggregateid: headers['ce-aggregateid'],
    sequence: headers['ce-sequence'],
    realmid: headers['ce-realmid'],
    correlationid: headers['ce-correlationid'],
    causationid: headers['ce-causationid'],
    data: body,
  };
}

// ============================================================================
// CLOUDEVENTS SUBSCRIPTION
// ============================================================================

/**
 * CloudEvents subscription discovery (as per spec).
 * https://github.com/cloudevents/spec/blob/main/subscriptions/spec.md
 */
export interface CloudEventsSubscription {
  readonly id: string;
  readonly source: string;
  readonly types: readonly string[];
  readonly config: {
    readonly protocol: 'HTTP' | 'AMQP' | 'MQTT' | 'NATS' | 'Kafka';
    readonly sink: string;
    readonly contentMode?: 'structured' | 'binary';
  };
  readonly filters?: readonly CloudEventsFilter[];
}

export interface CloudEventsFilter {
  readonly dialect: 'exact' | 'prefix' | 'suffix' | 'cesql';
  readonly attribute: string;
  readonly value: string;
}

/**
 * Generate subscription configuration for common platforms.
 */
export const SUBSCRIPTION_TEMPLATES = {
  /** AWS EventBridge */
  awsEventBridge: (busArn: string, source: string): object => ({
    Source: [source],
    DetailType: ['io.universalledger.*'],
    EventBusName: busArn,
  }),
  
  /** Google Cloud Eventarc */
  googleEventarc: (triggerName: string, types: string[]): object => ({
    name: triggerName,
    eventFilters: types.map(type => ({
      attribute: 'type',
      value: type,
    })),
    destination: {
      cloudRun: {
        service: 'ledger-handler',
        region: 'us-central1',
      },
    },
  }),
  
  /** Azure Event Grid */
  azureEventGrid: (topicEndpoint: string, types: string[]): object => ({
    properties: {
      destination: {
        endpointType: 'WebHook',
        properties: {
          endpointUrl: topicEndpoint,
        },
      },
      filter: {
        includedEventTypes: types,
      },
      eventDeliverySchema: 'CloudEventSchemaV1_0',
    },
  }),
  
  /** Knative */
  knativeTrigger: (broker: string, types: string[]): object => ({
    apiVersion: 'eventing.knative.dev/v1',
    kind: 'Trigger',
    metadata: {
      name: 'ledger-trigger',
    },
    spec: {
      broker,
      filter: {
        attributes: {
          type: types[0], // Knative requires single type per trigger
        },
      },
      subscriber: {
        ref: {
          apiVersion: 'v1',
          kind: 'Service',
          name: 'ledger-handler',
        },
      },
    },
  }),
};

// ============================================================================
// HELPERS
// ============================================================================

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

// ============================================================================
// TYPE MAPPINGS
// ============================================================================

/**
 * Standard CloudEvents types for the Universal Ledger.
 */
export const LEDGER_EVENT_TYPES = {
  // Entity events
  'io.universalledger.entity.created': 'EntityCreated',
  'io.universalledger.entity.updated': 'EntityUpdated',
  'io.universalledger.entity.deactivated': 'EntityDeactivated',
  
  // Agreement events
  'io.universalledger.agreement.proposed': 'AgreementProposed',
  'io.universalledger.agreement.consented': 'ConsentRecorded',
  'io.universalledger.agreement.activated': 'AgreementActivated',
  'io.universalledger.agreement.fulfilled': 'ObligationFulfilled',
  'io.universalledger.agreement.terminated': 'AgreementTerminated',
  
  // Asset events
  'io.universalledger.asset.registered': 'AssetRegistered',
  'io.universalledger.asset.transferred': 'AssetTransferred',
  'io.universalledger.asset.statechanged': 'AssetStateChanged',
  
  // Role events
  'io.universalledger.role.granted': 'RoleGranted',
  'io.universalledger.role.revoked': 'RoleRevoked',
  'io.universalledger.role.delegated': 'RoleDelegated',
  
  // Workflow events
  'io.universalledger.workflow.created': 'WorkflowInstanceCreated',
  'io.universalledger.workflow.transitioned': 'WorkflowTransitioned',
  'io.universalledger.workflow.completed': 'WorkflowCompleted',
} as const;

