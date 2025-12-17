/**
 * RICH INTERFACE - Agent Response System
 * 
 * Extracted from frontend-minicontratos, all logic now lives here.
 * The frontend becomes truly "logic-less" - just renders what we send.
 * 
 * Key concepts:
 * - Blocks: Structured UI components (tables, charts, calendars, etc.)
 * - Plans: Staged records awaiting user confirmation
 * - Panels: What to show in sidebar, main area, right panel
 * - Subscriptions: Real-time updates to push to frontend
 */

import type { EntityId, Timestamp } from '../shared/types';
import type { Event } from '../schema/ledger';

// ============================================================================
// BLOCKS - Structured UI Components
// ============================================================================

/**
 * All block types the Agent can include in responses.
 */
export type Block =
  | MarkdownBlock
  | TableBlock
  | ChartBlock
  | CalendarBlock
  | RecordGridBlock
  | ActionButtonsBlock
  | PlanBlock
  | AlertBlock
  | ProgressBlock
  | TimelineBlock
  | FormBlock
  ;

/**
 * Rich text content.
 */
export interface MarkdownBlock {
  type: 'markdown';
  content: string;
}

/**
 * Data table with sortable columns.
 */
export interface TableBlock {
  type: 'table';
  title?: string;
  columns: TableColumn[];
  rows: TableRow[];
  sortable?: boolean;
  onRowClick?: { action: string; params: Record<string, string> };
}

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'number' | 'currency' | 'date' | 'status';
}

export interface TableRow {
  id: string;
  cells: Record<string, unknown>;
  status?: string;
  onClick?: { action: string; params: Record<string, unknown> };
}

/**
 * Chart visualization.
 */
export interface ChartBlock {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'donut';
  title?: string;
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  colors?: string[];
}

export interface ChartDataPoint {
  [key: string]: string | number;
}

/**
 * Calendar with events.
 */
export interface CalendarBlock {
  type: 'calendar';
  title?: string;
  events: CalendarEvent[];
  view?: 'month' | 'week' | 'day';
  onDateClick?: { action: string };
  onEventClick?: { action: string; paramKey: string };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Timestamp;
  end?: Timestamp;
  color?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Grid of record cards.
 */
export interface RecordGridBlock {
  type: 'records';
  title?: string;
  records: RecordItem[];
  columns?: 1 | 2 | 3;
  compact?: boolean;
}

export interface RecordItem {
  id: string;
  name: string;
  recordType: RecordType;
  status: RecordStatus;
  data?: Record<string, unknown>;
  onClick?: { action: string; params: Record<string, unknown> };
}

export type RecordType = 
  | 'rule' 
  | 'person' 
  | 'object' 
  | 'workflow' 
  | 'flow' 
  | 'log' 
  | 'template' 
  | 'instance'
  | 'agreement'
  | 'entity'
  | 'asset'
  ;

export type RecordStatus = 
  | 'pending' 
  | 'ok' 
  | 'in_progress' 
  | 'done' 
  | 'draft' 
  | 'active' 
  | 'archived' 
  | 'doubt' 
  | 'not_ok'
  ;

/**
 * Action buttons.
 */
export interface ActionButtonsBlock {
  type: 'buttons';
  buttons: ActionButton[];
  layout?: 'horizontal' | 'vertical';
}

export interface ActionButton {
  label: string;
  action: string;
  params?: Record<string, unknown>;
  style?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
  confirm?: string; // Confirmation message
}

/**
 * Pending plan awaiting confirmation.
 * This is the key feature - records staged for user approval.
 */
export interface PlanBlock {
  type: 'plan';
  id: string;
  summary: string;
  records: PlannedRecord[];
  confirmed?: boolean;
  confirmedAt?: Timestamp;
}

export interface PlannedRecord {
  name: string;
  recordType: RecordType;
  data: Record<string, unknown>;
  /** Reference to create (e.g., which Agreement type) */
  template?: string;
}

/**
 * Alert/notification banner.
 */
export interface AlertBlock {
  type: 'alert';
  severity: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  dismissible?: boolean;
}

/**
 * Progress indicator.
 */
export interface ProgressBlock {
  type: 'progress';
  title?: string;
  current: number;
  total: number;
  label?: string;
  showPercentage?: boolean;
}

/**
 * Timeline of events.
 */
export interface TimelineBlock {
  type: 'timeline';
  title?: string;
  events: TimelineEvent[];
}

export interface TimelineEvent {
  id: string;
  timestamp: Timestamp;
  title: string;
  description?: string;
  actor?: string;
  status?: 'completed' | 'current' | 'pending';
}

/**
 * Dynamic form for user input.
 */
export interface FormBlock {
  type: 'form';
  id: string;
  title?: string;
  fields: FormField[];
  submitAction: string;
  submitLabel?: string;
  cancelAction?: string;
}

export interface FormField {
  name: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[]; // For select
  defaultValue?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

// ============================================================================
// AGENT RESPONSE - Complete Response Structure
// ============================================================================

/**
 * Complete agent response with all panels.
 */
export interface RichAgentResponse {
  /** Unique response ID */
  id: string;
  
  /** Session ID for conversation continuity */
  sessionId: string;
  
  /** Main content area */
  main: {
    /** Markdown text (always present) */
    markdown: string;
    /** Structured blocks */
    blocks: Block[];
  };
  
  /** What user can do next */
  affordances: Affordance[];
  
  /** Tool calls made (for transparency) */
  toolCalls?: ToolCall[];
  
  /** Sidebar updates (optional) */
  sidebar?: SidebarUpdate;
  
  /** Right panel updates (optional) */
  ledgerPanel?: LedgerPanelUpdate;
  
  /** Real-time subscriptions to establish */
  subscriptions?: Subscription[];
  
  /** Conversation context */
  context: ConversationContext;
}

export interface Affordance {
  action: string;
  label: string;
  params?: Record<string, unknown>;
  style?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
  confirm?: string;
  /** Keyboard shortcut hint */
  shortcut?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  arguments?: Record<string, unknown>;
  results?: unknown;
  error?: string;
  duration?: number;
}

export interface SidebarUpdate {
  /** Recent conversations/projects */
  history?: ConversationSummary[];
  /** Active flows */
  flows?: FlowSummary[];
  /** Pinned items */
  pinned?: PinnedItem[];
  /** User info */
  user?: UserInfo;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage?: string;
  lastMessageAt: Timestamp;
  unreadCount?: number;
}

export interface FlowSummary {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed';
  progress?: number;
}

export interface PinnedItem {
  id: string;
  type: 'agreement' | 'entity' | 'flow';
  name: string;
  icon?: string;
}

export interface UserInfo {
  id: EntityId;
  name: string;
  email?: string;
  avatar?: string;
  roles?: string[];
}

export interface LedgerPanelUpdate {
  /** Records to display */
  records: LedgerRecord[];
  /** Available filters */
  filters: LedgerFilters;
  /** Active filter state */
  activeFilters: ActiveFilters;
  /** Summary counts */
  counts: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
}

export interface LedgerRecord {
  id: string;
  name: string;
  type: RecordType;
  status: RecordStatus;
  data: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  actor?: string;
  /** Can user take action on this? */
  actions?: Affordance[];
}

export interface LedgerFilters {
  statuses: { value: RecordStatus; label: string; count: number }[];
  types: { value: RecordType; label: string; count: number }[];
}

export interface ActiveFilters {
  statuses: RecordStatus[];
  types: RecordType[];
  search?: string;
  dateRange?: { from: Timestamp; to: Timestamp };
}

export interface Subscription {
  channel: string;
  filters?: Record<string, unknown>;
  /** What to do when event arrives */
  onEvent: 'append' | 'replace' | 'notify';
}

export interface ConversationContext {
  /** Current project/realm */
  projectId?: string;
  projectTitle?: string;
  /** Entity context */
  entityId?: EntityId;
  /** Pending plan awaiting confirmation */
  pendingPlan?: PlanBlock;
  /** Variables for follow-up */
  variables?: Record<string, unknown>;
}

// ============================================================================
// PLAN MANAGEMENT - Staged Records
// ============================================================================

/**
 * Plan manager - handles staged records awaiting confirmation.
 */
export interface PlanManager {
  /** Create a new plan */
  createPlan(sessionId: string, records: PlannedRecord[], summary: string): Promise<PlanBlock>;
  
  /** Get pending plan for session */
  getPendingPlan(sessionId: string): Promise<PlanBlock | null>;
  
  /** Confirm a plan - create all records */
  confirmPlan(planId: string, confirmedBy: EntityId): Promise<ConfirmPlanResult>;
  
  /** Reject/cancel a plan */
  rejectPlan(planId: string, rejectedBy: EntityId, reason?: string): Promise<void>;
  
  /** Modify a planned record before confirmation */
  modifyPlannedRecord(planId: string, recordIndex: number, changes: Partial<PlannedRecord>): Promise<PlanBlock>;
}

export interface ConfirmPlanResult {
  success: boolean;
  createdRecords: { id: string; name: string; type: RecordType }[];
  errors?: { record: string; error: string }[];
  events: Event[];
}

/**
 * Create plan manager.
 */
export function createPlanManager(): PlanManager {
  const plans = new Map<string, PlanBlock>();
  const sessionPlans = new Map<string, string>(); // sessionId -> planId
  
  return {
    async createPlan(sessionId, records, summary) {
      const plan: PlanBlock = {
        type: 'plan',
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        summary,
        records,
        confirmed: false,
      };
      
      plans.set(plan.id, plan);
      sessionPlans.set(sessionId, plan.id);
      
      return plan;
    },
    
    async getPendingPlan(sessionId) {
      const planId = sessionPlans.get(sessionId);
      if (!planId) return null;
      
      const plan = plans.get(planId);
      if (!plan || plan.confirmed) return null;
      
      return plan;
    },
    
    async confirmPlan(planId, confirmedBy) {
      const plan = plans.get(planId);
      if (!plan) {
        return { success: false, createdRecords: [], errors: [{ record: 'plan', error: 'Plan not found' }], events: [] };
      }
      
      const createdRecords: { id: string; name: string; type: RecordType }[] = [];
      const events: Event[] = [];
      const errors: { record: string; error: string }[] = [];
      
      for (const record of plan.records) {
        try {
          // In real implementation: create events and append to store
          const recordId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          createdRecords.push({
            id: recordId,
            name: record.name,
            type: record.recordType,
          });
          
          // Would create event here
          // events.push(createEvent({ type: 'RecordCreated', ... }));
          
        } catch (error) {
          errors.push({ record: record.name, error: String(error) });
        }
      }
      
      // Mark plan as confirmed
      plans.set(planId, {
        ...plan,
        confirmed: true,
        confirmedAt: Date.now() as Timestamp,
      });
      
      return {
        success: errors.length === 0,
        createdRecords,
        errors: errors.length > 0 ? errors : undefined,
        events,
      };
    },
    
    async rejectPlan(planId, rejectedBy, reason) {
      const plan = plans.get(planId);
      if (plan) {
        // Remove the plan
        plans.delete(planId);
        
        // Clear session reference
        for (const [sessionId, pId] of sessionPlans) {
          if (pId === planId) {
            sessionPlans.delete(sessionId);
          }
        }
      }
    },
    
    async modifyPlannedRecord(planId, recordIndex, changes) {
      const plan = plans.get(planId);
      if (!plan) throw new Error('Plan not found');
      if (plan.confirmed) throw new Error('Cannot modify confirmed plan');
      
      const updatedRecords = [...plan.records];
      updatedRecords[recordIndex] = { ...updatedRecords[recordIndex], ...changes };
      
      const updatedPlan = { ...plan, records: updatedRecords };
      plans.set(planId, updatedPlan);
      
      return updatedPlan;
    },
  };
}

// ============================================================================
// RESPONSE BUILDER - Fluent API for Agents
// ============================================================================

/**
 * Builder for constructing rich responses.
 */
export class ResponseBuilder {
  private response: Partial<RichAgentResponse> = {
    main: { markdown: '', blocks: [] },
    affordances: [],
    context: {},
  };
  
  constructor(sessionId: string) {
    this.response.id = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.response.sessionId = sessionId;
  }
  
  /** Add markdown text */
  markdown(content: string): this {
    this.response.main!.markdown += content;
    return this;
  }
  
  /** Add a block */
  block(block: Block): this {
    this.response.main!.blocks!.push(block);
    return this;
  }
  
  /** Add a table */
  table(columns: TableColumn[], rows: TableRow[], title?: string): this {
    return this.block({ type: 'table', columns, rows, title });
  }
  
  /** Add a chart */
  chart(chartType: ChartBlock['chartType'], data: ChartDataPoint[], xKey: string, yKey: string, title?: string): this {
    return this.block({ type: 'chart', chartType, data, xKey, yKey, title });
  }
  
  /** Add a calendar */
  calendar(events: CalendarEvent[], title?: string): this {
    return this.block({ type: 'calendar', events, title });
  }
  
  /** Add record grid */
  records(records: RecordItem[], title?: string): this {
    return this.block({ type: 'records', records, title });
  }
  
  /** Add action buttons */
  buttons(buttons: ActionButton[]): this {
    return this.block({ type: 'buttons', buttons });
  }
  
  /** Add a pending plan */
  plan(records: PlannedRecord[], summary: string): this {
    const planBlock: PlanBlock = {
      type: 'plan',
      id: `plan-${Date.now()}`,
      summary,
      records,
      confirmed: false,
    };
    this.response.context!.pendingPlan = planBlock;
    return this.block(planBlock);
  }
  
  /** Add an alert */
  alert(severity: AlertBlock['severity'], message: string, title?: string): this {
    return this.block({ type: 'alert', severity, message, title });
  }
  
  /** Add progress indicator */
  progress(current: number, total: number, title?: string): this {
    return this.block({ type: 'progress', current, total, title });
  }
  
  /** Add timeline */
  timeline(events: TimelineEvent[], title?: string): this {
    return this.block({ type: 'timeline', events, title });
  }
  
  /** Add a form */
  form(id: string, fields: FormField[], submitAction: string, title?: string): this {
    return this.block({ type: 'form', id, fields, submitAction, title });
  }
  
  /** Add an affordance */
  affordance(action: string, label: string, options?: Partial<Affordance>): this {
    this.response.affordances!.push({ action, label, ...options });
    return this;
  }
  
  /** Add common affordances */
  confirmCancel(confirmAction: string, cancelAction: string = 'cancel'): this {
    return this
      .affordance(confirmAction, 'Confirm', { style: 'primary' })
      .affordance(cancelAction, 'Cancel', { style: 'ghost' });
  }
  
  /** Record tool call */
  toolCall(call: ToolCall): this {
    if (!this.response.toolCalls) this.response.toolCalls = [];
    this.response.toolCalls.push(call);
    return this;
  }
  
  /** Update sidebar */
  sidebar(update: SidebarUpdate): this {
    this.response.sidebar = update;
    return this;
  }
  
  /** Update ledger panel */
  ledgerPanel(update: LedgerPanelUpdate): this {
    this.response.ledgerPanel = update;
    return this;
  }
  
  /** Add subscription */
  subscribe(channel: string, onEvent: Subscription['onEvent'] = 'append', filters?: Record<string, unknown>): this {
    if (!this.response.subscriptions) this.response.subscriptions = [];
    this.response.subscriptions.push({ channel, onEvent, filters });
    return this;
  }
  
  /** Set context */
  context(ctx: Partial<ConversationContext>): this {
    this.response.context = { ...this.response.context, ...ctx };
    return this;
  }
  
  /** Build final response */
  build(): RichAgentResponse {
    return this.response as RichAgentResponse;
  }
}

/**
 * Create a new response builder.
 */
export function response(sessionId: string): ResponseBuilder {
  return new ResponseBuilder(sessionId);
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/**
 * Example: User asks "hire John as engineer at Acme"
 */
export function exampleHireResponse(sessionId: string): RichAgentResponse {
  return response(sessionId)
    .markdown(`## Create Employment Agreement

I'll create an employment agreement with these details:`)
    .plan([
      {
        name: 'Employment Agreement - John Smith',
        recordType: 'agreement',
        data: {
          type: 'Employment',
          employee: 'John Smith',
          employer: 'Acme Corporation',
          position: 'Software Engineer',
          startDate: '2024-03-01',
        },
      },
      {
        name: 'John Smith - Employee Role',
        recordType: 'instance',
        data: {
          role: 'Employee',
          scope: 'Acme Corporation',
          grantedBy: 'Employment Agreement',
        },
      },
    ], 'Create employment agreement and establish Employee role')
    .markdown(`

**Employee:** John Smith
**Employer:** Acme Corporation  
**Position:** Software Engineer
**Start Date:** March 1, 2024

This will create:
1. An Employment Agreement between the parties
2. The Employee role for John at Acme

Ready to proceed?`)
    .affordance('confirm_plan', 'Create Agreement', { style: 'primary', icon: 'check' })
    .affordance('edit_plan', 'Edit Details', { style: 'secondary', icon: 'edit' })
    .affordance('cancel', 'Cancel', { style: 'ghost' })
    .context({ projectId: 'acme-hr' })
    .build();
}

/**
 * Example: User asks "show active agreements"
 */
export function exampleListResponse(sessionId: string): RichAgentResponse {
  return response(sessionId)
    .markdown(`## Active Agreements

Found **3** active agreements in your organization:`)
    .table(
      [
        { key: 'name', label: 'Agreement', align: 'left' },
        { key: 'type', label: 'Type', align: 'left' },
        { key: 'parties', label: 'Parties', align: 'left' },
        { key: 'status', label: 'Status', align: 'center', format: 'status' },
      ],
      [
        { id: 'agr-1', cells: { name: 'Employment - John', type: 'Employment', parties: 'Acme ↔ John', status: 'active' } },
        { id: 'agr-2', cells: { name: 'Employment - Maria', type: 'Employment', parties: 'Acme ↔ Maria', status: 'active' } },
        { id: 'agr-3', cells: { name: 'Office Lease', type: 'Lease', parties: 'Acme ↔ BuildingCo', status: 'active' } },
      ]
    )
    .affordance('view_details', 'View Details', { params: { id: 'agr-1' } })
    .affordance('create_agreement', 'New Agreement', { style: 'primary' })
    .affordance('export_csv', 'Export', { style: 'ghost' })
    .ledgerPanel({
      records: [
        { id: 'agr-1', name: 'Employment - John', type: 'agreement', status: 'active', data: {}, createdAt: Date.now() as Timestamp },
        { id: 'agr-2', name: 'Employment - Maria', type: 'agreement', status: 'active', data: {}, createdAt: Date.now() as Timestamp },
      ],
      filters: {
        statuses: [
          { value: 'active', label: 'Active', count: 3 },
          { value: 'pending', label: 'Pending', count: 1 },
        ],
        types: [
          { value: 'agreement', label: 'Agreement', count: 3 },
          { value: 'entity', label: 'Entity', count: 5 },
        ],
      },
      activeFilters: { statuses: ['active'], types: [] },
      counts: { total: 4, pending: 1, inProgress: 0, completed: 3 },
    })
    .subscribe('agreements', 'append', { status: 'active' })
    .build();
}

