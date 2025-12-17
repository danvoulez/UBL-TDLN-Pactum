/**
 * TEMPLATES - Agreement & Workflow Templates
 * 
 * Templates make the system practical:
 * - Pre-defined agreement structures ("Standard Employment")
 * - Workflow templates ("Approval Process")
 * - Clause libraries
 * - Quick-start patterns
 * 
 * Templates are themselves Agreements - meta-agreements about
 * how to create other agreements.
 */

import type { EntityId, Timestamp, ActorReference, Duration, Validity } from '../shared/types';
import type { 
  Terms, 
  AgreementParticipant, 
  Obligation, 
  Right,
  Clause,
  Consideration,
} from '../universal/primitives';
import type { WorkflowDefinition } from '../schema/workflow';

// ============================================================================
// AGREEMENT TEMPLATES
// ============================================================================

/**
 * An Agreement Template is a reusable pattern for creating agreements.
 */
export interface AgreementTemplate {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  readonly category: TemplateCategory;
  
  /** Which agreement type this creates */
  readonly agreementType: string;
  
  /** Template version */
  readonly version: number;
  
  /** The template structure */
  readonly structure: TemplateStructure;
  
  /** Variables that must be filled in */
  readonly variables: readonly TemplateVariable[];
  
  /** Default values */
  readonly defaults: Record<string, unknown>;
  
  /** Validation rules */
  readonly validations: readonly TemplateValidation[];
  
  /** Associated workflow (if any) */
  readonly workflowId?: EntityId;
  
  /** Metadata */
  readonly createdAt: Timestamp;
  readonly createdBy: ActorReference;
  readonly publishedAt?: Timestamp;
  readonly deprecatedAt?: Timestamp;
  
  /** Visibility */
  readonly visibility: TemplateVisibility;
  
  /** Usage stats */
  readonly usageCount: number;
}

export type TemplateCategory =
  | 'Employment'
  | 'Sales'
  | 'Licensing'
  | 'Partnership'
  | 'Service'
  | 'Rental'
  | 'NDA'
  | 'Membership'
  | 'Custom';

export type TemplateVisibility =
  | { readonly type: 'System' } // Built-in, available to all
  | { readonly type: 'Realm'; readonly realmId: EntityId }
  | { readonly type: 'Public' } // Shared template
  | { readonly type: 'Private'; readonly ownerId: EntityId };

/**
 * The structure of the agreement this template creates.
 */
export interface TemplateStructure {
  /** Party role templates */
  readonly parties: readonly PartyRoleTemplate[];
  
  /** Terms template */
  readonly terms: TermsTemplate;
  
  /** Asset role templates (if agreement involves assets) */
  readonly assets?: readonly AssetRoleTemplate[];
  
  /** Default validity */
  readonly defaultValidity?: ValidityTemplate;
}

export interface PartyRoleTemplate {
  readonly role: string;
  readonly description?: string;
  readonly required: boolean;
  readonly minCount?: number;
  readonly maxCount?: number;
  
  /** Default obligations for this role */
  readonly defaultObligations: readonly ObligationTemplate[];
  
  /** Default rights for this role */
  readonly defaultRights: readonly RightTemplate[];
  
  /** Role granted when agreement is active */
  readonly grantsRole?: string;
  
  /** Variable mapping (which template variable fills this) */
  readonly variableMapping?: string;
}

export interface ObligationTemplate {
  readonly id: string;
  readonly description: string;
  readonly descriptionTemplate?: string; // With {{variables}}
  readonly deadline?: Duration | '{{variable}}';
  readonly conditions?: readonly string[];
}

export interface RightTemplate {
  readonly id: string;
  readonly description: string;
  readonly descriptionTemplate?: string;
  readonly conditions?: readonly string[];
}

export interface TermsTemplate {
  readonly descriptionTemplate: string;
  readonly clauses: readonly ClauseTemplate[];
  readonly consideration?: ConsiderationTemplate;
}

export interface ClauseTemplate {
  readonly id: string;
  readonly type: string;
  readonly title?: string;
  readonly contentTemplate: string;
  readonly required: boolean;
  readonly conditions?: readonly string[];
}

export interface ConsiderationTemplate {
  readonly descriptionTemplate: string;
  readonly valueVariable?: string;
  readonly currencyVariable?: string;
}

export interface AssetRoleTemplate {
  readonly role: string;
  readonly description?: string;
  readonly required: boolean;
  readonly assetTypes?: readonly string[];
  readonly variableMapping?: string;
}

export interface ValidityTemplate {
  readonly effectiveFromVariable?: string;
  readonly effectiveUntilVariable?: string;
  readonly defaultDuration?: Duration;
  readonly autoRenew?: boolean;
}

/**
 * Template variable definition.
 */
export interface TemplateVariable {
  readonly name: string;
  readonly type: VariableType;
  readonly label: string;
  readonly description?: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly options?: readonly VariableOption[];
  readonly validation?: VariableValidation;
}

export type VariableType =
  | 'string'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'entity'       // Reference to an entity
  | 'asset'        // Reference to an asset
  | 'duration'
  | 'select'       // Single selection from options
  | 'multiselect'  // Multiple selection
  | 'text';        // Long text

export interface VariableOption {
  readonly value: string;
  readonly label: string;
}

export interface VariableValidation {
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly message?: string;
}

/**
 * Template validation rule.
 */
export interface TemplateValidation {
  readonly name: string;
  readonly expression: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

// ============================================================================
// TEMPLATE REGISTRY
// ============================================================================

/**
 * Registry of all available templates.
 */
export interface TemplateRegistry {
  /** Register a template */
  register(template: AgreementTemplate): void;
  
  /** Get template by ID */
  get(templateId: EntityId): Promise<AgreementTemplate | null>;
  
  /** Get templates by category */
  getByCategory(category: TemplateCategory): Promise<readonly AgreementTemplate[]>;
  
  /** Get templates available in a realm */
  getForRealm(realmId: EntityId): Promise<readonly AgreementTemplate[]>;
  
  /** Search templates */
  search(query: string): Promise<readonly AgreementTemplate[]>;
  
  /** Create agreement from template */
  instantiate(
    templateId: EntityId,
    variables: Record<string, unknown>,
    actor: ActorReference
  ): Promise<InstantiationResult>;
  
  /** Validate variables against template */
  validate(
    templateId: EntityId,
    variables: Record<string, unknown>
  ): Promise<ValidationResult>;
  
  /** Preview rendered template */
  preview(
    templateId: EntityId,
    variables: Record<string, unknown>
  ): Promise<PreviewResult>;
  
  /** Clone and customize a template */
  clone(
    templateId: EntityId,
    customizations: Partial<AgreementTemplate>,
    actor: ActorReference
  ): Promise<AgreementTemplate>;
}

export interface InstantiationResult {
  readonly success: boolean;
  readonly agreementId?: EntityId;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly { field: string; message: string }[];
  readonly warnings: readonly { field: string; message: string }[];
}

export interface PreviewResult {
  readonly parties: readonly AgreementParticipant[];
  readonly terms: Terms;
  readonly validity: Validity;
  readonly renderedClauses: readonly { title: string; content: string }[];
}

// ============================================================================
// CLAUSE LIBRARY
// ============================================================================

/**
 * A reusable clause that can be included in agreements.
 */
export interface ClauseLibraryEntry {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  readonly category: string;
  
  /** The clause content */
  readonly content: string;
  readonly contentTemplate?: string; // With variables
  
  /** Variables used in template */
  readonly variables?: readonly TemplateVariable[];
  
  /** Applicable agreement types */
  readonly applicableTo?: readonly string[];
  
  /** Version */
  readonly version: number;
  
  /** Legal review status */
  readonly legalReviewed: boolean;
  readonly reviewedAt?: Timestamp;
  readonly reviewedBy?: EntityId;
  
  /** Metadata */
  readonly createdAt: Timestamp;
  readonly visibility: TemplateVisibility;
}

/**
 * Clause library manages reusable clauses.
 */
export interface ClauseLibrary {
  /** Add a clause */
  add(clause: Omit<ClauseLibraryEntry, 'id' | 'createdAt'>): Promise<ClauseLibraryEntry>;
  
  /** Get clause by ID */
  get(clauseId: EntityId): Promise<ClauseLibraryEntry | null>;
  
  /** Get clauses by category */
  getByCategory(category: string): Promise<readonly ClauseLibraryEntry[]>;
  
  /** Search clauses */
  search(query: string): Promise<readonly ClauseLibraryEntry[]>;
  
  /** Get applicable clauses for agreement type */
  getForAgreementType(agreementType: string): Promise<readonly ClauseLibraryEntry[]>;
  
  /** Render a clause with variables */
  render(clauseId: EntityId, variables: Record<string, unknown>): Promise<string>;
}

// ============================================================================
// WORKFLOW TEMPLATES
// ============================================================================

/**
 * A workflow template defines a reusable workflow pattern.
 */
export interface WorkflowTemplate {
  readonly id: EntityId;
  readonly name: string;
  readonly description?: string;
  readonly category: string;
  
  /** The workflow definition */
  readonly definition: WorkflowDefinition;
  
  /** Configurable aspects */
  readonly configurableStates?: readonly string[];
  readonly configurableTransitions?: readonly string[];
  
  /** Default configuration */
  readonly defaultConfig: Record<string, unknown>;
  
  /** Visibility */
  readonly visibility: TemplateVisibility;
  
  /** Version */
  readonly version: number;
  readonly createdAt: Timestamp;
}

// ============================================================================
// BUILT-IN TEMPLATES
// ============================================================================

export const BUILT_IN_TEMPLATES = {
  /** Standard employment agreement */
  employment: {
    name: 'Standard Employment Agreement',
    category: 'Employment' as TemplateCategory,
    agreementType: 'Employment',
    structure: {
      parties: [
        {
          role: 'Employer',
          required: true,
          defaultObligations: [
            { id: 'pay-salary', description: 'Pay agreed salary monthly' },
            { id: 'provide-workspace', description: 'Provide adequate workspace' },
          ],
          defaultRights: [
            { id: 'work-product', description: 'Ownership of work product' },
          ],
        },
        {
          role: 'Employee',
          required: true,
          grantsRole: 'Employee',
          defaultObligations: [
            { id: 'perform-duties', description: 'Perform assigned duties' },
            { id: 'confidentiality', description: 'Maintain confidentiality' },
          ],
          defaultRights: [
            { id: 'salary', description: 'Receive agreed salary' },
            { id: 'benefits', description: 'Receive agreed benefits' },
          ],
        },
      ],
      terms: {
        descriptionTemplate: 'Employment agreement for {{position}} position',
        clauses: [
          {
            id: 'compensation',
            type: 'Compensation',
            title: 'Compensation',
            contentTemplate: 'The Employee shall receive {{salary}} {{currency}} per {{payPeriod}}.',
            required: true,
          },
          {
            id: 'working-hours',
            type: 'WorkingHours',
            title: 'Working Hours',
            contentTemplate: 'Standard working hours are {{hoursPerWeek}} hours per week.',
            required: true,
          },
          {
            id: 'termination',
            type: 'Termination',
            title: 'Termination',
            contentTemplate: 'Either party may terminate with {{noticePeriod}} notice.',
            required: true,
          },
        ],
        consideration: {
          descriptionTemplate: 'Services in exchange for {{salary}} {{currency}}/{{payPeriod}}',
          valueVariable: 'salary',
          currencyVariable: 'currency',
        },
      },
      defaultValidity: {
        defaultDuration: { amount: 1, unit: 'years' },
        autoRenew: true,
      },
    },
    variables: [
      { name: 'position', type: 'string' as VariableType, label: 'Position/Title', required: true },
      { name: 'salary', type: 'number' as VariableType, label: 'Salary Amount', required: true },
      { name: 'currency', type: 'string' as VariableType, label: 'Currency', required: true, defaultValue: 'USD' },
      { name: 'payPeriod', type: 'select' as VariableType, label: 'Pay Period', required: true, 
        options: [{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }] },
      { name: 'hoursPerWeek', type: 'number' as VariableType, label: 'Hours per Week', required: true, defaultValue: 40 },
      { name: 'noticePeriod', type: 'string' as VariableType, label: 'Notice Period', required: true, defaultValue: '30 days' },
      { name: 'startDate', type: 'date' as VariableType, label: 'Start Date', required: true },
    ],
  },
  
  /** Simple NDA */
  nda: {
    name: 'Non-Disclosure Agreement (NDA)',
    category: 'NDA' as TemplateCategory,
    agreementType: 'NDA',
    structure: {
      parties: [
        {
          role: 'Disclosing Party',
          required: true,
          defaultObligations: [],
          defaultRights: [
            { id: 'confidentiality', description: 'Confidential information protected' },
          ],
        },
        {
          role: 'Receiving Party',
          required: true,
          defaultObligations: [
            { id: 'keep-confidential', description: 'Keep information confidential' },
            { id: 'limit-use', description: 'Use only for permitted purpose' },
            { id: 'return-destroy', description: 'Return or destroy upon request' },
          ],
          defaultRights: [],
        },
      ],
      terms: {
        descriptionTemplate: 'NDA for {{purpose}}',
        clauses: [
          {
            id: 'definition',
            type: 'Definition',
            title: 'Confidential Information',
            contentTemplate: 'Confidential Information includes {{confidentialScope}}.',
            required: true,
          },
          {
            id: 'obligations',
            type: 'Obligations',
            title: 'Obligations',
            contentTemplate: 'Receiving Party shall not disclose to third parties without written consent.',
            required: true,
          },
          {
            id: 'term',
            type: 'Term',
            title: 'Term',
            contentTemplate: 'This NDA shall remain in effect for {{termYears}} years from the Effective Date.',
            required: true,
          },
        ],
      },
      defaultValidity: {
        defaultDuration: { amount: 2, unit: 'years' },
      },
    },
    variables: [
      { name: 'purpose', type: 'text' as VariableType, label: 'Purpose of Disclosure', required: true },
      { name: 'confidentialScope', type: 'text' as VariableType, label: 'Scope of Confidential Information', required: true },
      { name: 'termYears', type: 'number' as VariableType, label: 'Term (years)', required: true, defaultValue: 2 },
    ],
  },
};

