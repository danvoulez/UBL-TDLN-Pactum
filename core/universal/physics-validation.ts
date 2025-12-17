/**
 * PHYSICS VALIDATION
 * 
 * Validates container physics combinations and operations.
 * Prevents invalid physics configurations and physics confusion attacks.
 * 
 * Problem: 3×4×4×3 = 144 combinations, not all meaningful
 * Solution: Predefine valid combinations and validate on ALL operations
 */

import type { ContainerPhysics } from './container';

// =============================================================================
// VALID PHYSICS COMBINATIONS
// =============================================================================

/**
 * Valid physics combinations by container type.
 * Only these combinations are allowed.
 */
export const VALID_PHYSICS: Record<string, ContainerPhysics> = {
  // Wallets - strict conservation of value
  WALLET: {
    fungibility: 'Strict',
    topology: 'Values',
    permeability: 'Sealed',
    execution: 'Disabled',
  },
  
  WALLET_GATED: {
    fungibility: 'Strict',
    topology: 'Values',
    permeability: 'Gated',
    execution: 'Disabled',
  },
  
  // Workspaces - versioned files
  WORKSPACE: {
    fungibility: 'Versioned',
    topology: 'Objects',
    permeability: 'Collaborative',
    execution: 'Sandboxed',
  },
  
  WORKSPACE_PRIVATE: {
    fungibility: 'Versioned',
    topology: 'Objects',
    permeability: 'Gated',
    execution: 'Sandboxed',
  },
  
  // Realms - governance domains
  REALM: {
    fungibility: 'Strict',
    topology: 'Subjects',
    permeability: 'Gated',
    execution: 'Full',
  },
  
  REALM_OPEN: {
    fungibility: 'Strict',
    topology: 'Subjects',
    permeability: 'Open',
    execution: 'Full',
  },
  
  // Networks - transient routing
  NETWORK: {
    fungibility: 'Transient',
    topology: 'Links',
    permeability: 'Open',
    execution: 'Disabled',
  },
  
  NETWORK_PRIVATE: {
    fungibility: 'Transient',
    topology: 'Links',
    permeability: 'Gated',
    execution: 'Disabled',
  },
  
  // Archives - sealed storage
  ARCHIVE: {
    fungibility: 'Versioned',
    topology: 'Objects',
    permeability: 'Sealed',
    execution: 'Disabled',
  },
  
  // Escrow - locked value
  ESCROW: {
    fungibility: 'Strict',
    topology: 'Values',
    permeability: 'Sealed',
    execution: 'Disabled',
  },
};

// =============================================================================
// PHYSICS VALIDATION
// =============================================================================

export interface PhysicsValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  matchedPreset?: string;
}

/**
 * Validate a physics configuration
 */
export function validatePhysics(physics: ContainerPhysics): PhysicsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for exact preset match
  for (const [name, preset] of Object.entries(VALID_PHYSICS)) {
    if (physicsEqual(physics, preset)) {
      return { valid: true, errors: [], warnings: [], matchedPreset: name };
    }
  }
  
  // No exact match - check for dangerous combinations
  
  // Rule 1: Strict fungibility requires Sealed or Gated permeability
  if (physics.fungibility === 'Strict' && 
      physics.permeability !== 'Sealed' && 
      physics.permeability !== 'Gated') {
    errors.push('Strict fungibility requires Sealed or Gated permeability to prevent value duplication');
  }
  
  // Rule 2: Full execution requires Gated permeability
  if (physics.execution === 'Full' && physics.permeability === 'Open') {
    warnings.push('Full execution with Open permeability is risky - consider Gated');
  }
  
  // Rule 3: Values topology should be Strict fungibility
  if (physics.topology === 'Values' && physics.fungibility !== 'Strict') {
    errors.push('Values topology requires Strict fungibility to ensure conservation');
  }
  
  // Rule 4: Subjects topology should not be Transient
  if (physics.topology === 'Subjects' && physics.fungibility === 'Transient') {
    errors.push('Subjects cannot be Transient - entities need persistent identity');
  }
  
  // Rule 5: Links topology should be Transient or Versioned
  if (physics.topology === 'Links' && physics.fungibility === 'Strict') {
    warnings.push('Links with Strict fungibility is unusual - consider Transient');
  }
  
  // Rule 6: Sealed permeability with Full execution is contradictory
  if (physics.permeability === 'Sealed' && physics.execution === 'Full') {
    errors.push('Sealed permeability with Full execution is contradictory');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if two physics configurations are equal
 */
export function physicsEqual(a: ContainerPhysics, b: ContainerPhysics): boolean {
  return a.fungibility === b.fungibility &&
         a.topology === b.topology &&
         a.permeability === b.permeability &&
         a.execution === b.execution;
}

// =============================================================================
// OPERATION VALIDATION
// =============================================================================

export type ContainerOperation = 
  | 'deposit'
  | 'withdraw'
  | 'transfer'
  | 'create'
  | 'delete'
  | 'copy'
  | 'move'
  | 'execute'
  | 'read'
  | 'write';

export interface OperationValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate if an operation is allowed given container physics
 */
export function validateOperation(
  physics: ContainerPhysics,
  operation: ContainerOperation
): OperationValidationResult {
  
  switch (operation) {
    case 'deposit':
    case 'withdraw':
      // Only allowed for Values topology
      if (physics.topology !== 'Values') {
        return { allowed: false, reason: 'Deposit/withdraw only for Values topology' };
      }
      // Check permeability
      if (physics.permeability === 'Sealed') {
        return { allowed: false, reason: 'Container is sealed' };
      }
      return { allowed: true };
      
    case 'transfer':
      // Only for Strict fungibility
      if (physics.fungibility !== 'Strict') {
        return { allowed: false, reason: 'Transfer only for Strict fungibility' };
      }
      if (physics.permeability === 'Sealed') {
        return { allowed: false, reason: 'Container is sealed' };
      }
      return { allowed: true };
      
    case 'copy':
      // Only for Versioned fungibility
      if (physics.fungibility !== 'Versioned') {
        return { allowed: false, reason: 'Copy only for Versioned fungibility' };
      }
      return { allowed: true };
      
    case 'move':
      // Allowed for Strict and Versioned
      if (physics.fungibility === 'Transient') {
        return { allowed: false, reason: 'Move not applicable for Transient' };
      }
      if (physics.permeability === 'Sealed') {
        return { allowed: false, reason: 'Container is sealed' };
      }
      return { allowed: true };
      
    case 'execute':
      // Only if execution is enabled
      if (physics.execution === 'Disabled') {
        return { allowed: false, reason: 'Execution is disabled' };
      }
      return { allowed: true };
      
    case 'read':
      // Always allowed (subject to ABAC)
      return { allowed: true };
      
    case 'write':
      // Check permeability
      if (physics.permeability === 'Sealed') {
        return { allowed: false, reason: 'Container is sealed' };
      }
      return { allowed: true };
      
    case 'create':
    case 'delete':
      // Check permeability
      if (physics.permeability === 'Sealed') {
        return { allowed: false, reason: 'Container is sealed' };
      }
      return { allowed: true };
      
    default:
      return { allowed: false, reason: `Unknown operation: ${operation}` };
  }
}

// =============================================================================
// PHYSICS CONFUSION ATTACK PREVENTION
// =============================================================================

/**
 * Detect physics confusion attacks.
 * These occur when an operation is attempted that doesn't match container physics.
 */
export function detectPhysicsConfusion(
  declaredPhysics: ContainerPhysics,
  attemptedOperation: ContainerOperation,
  operationDetails?: {
    sourcePhysics?: ContainerPhysics;
    targetPhysics?: ContainerPhysics;
  }
): { attack: boolean; description?: string } {
  
  // Check if operation is valid for declared physics
  const validation = validateOperation(declaredPhysics, attemptedOperation);
  if (!validation.allowed) {
    return {
      attack: true,
      description: `Attempted ${attemptedOperation} on container with incompatible physics: ${validation.reason}`,
    };
  }
  
  // Check for cross-physics attacks
  if (operationDetails?.sourcePhysics && operationDetails?.targetPhysics) {
    const source = operationDetails.sourcePhysics;
    const target = operationDetails.targetPhysics;
    
    // Strict → Versioned transfer could duplicate value
    if (source.fungibility === 'Strict' && target.fungibility === 'Versioned') {
      return {
        attack: true,
        description: 'Cannot transfer from Strict to Versioned - would duplicate value',
      };
    }
    
    // Transient → Strict could create value from nothing
    if (source.fungibility === 'Transient' && target.fungibility === 'Strict') {
      return {
        attack: true,
        description: 'Cannot transfer from Transient to Strict - would create value',
      };
    }
  }
  
  return { attack: false };
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Get a valid physics preset by name
 */
export function getPhysicsPreset(name: keyof typeof VALID_PHYSICS): ContainerPhysics {
  return { ...VALID_PHYSICS[name] };
}

/**
 * List all valid physics presets
 */
export function listPhysicsPresets(): string[] {
  return Object.keys(VALID_PHYSICS);
}
