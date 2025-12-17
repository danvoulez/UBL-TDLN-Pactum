/**
 * UNIVERSAL MODULE - The Generalized Model
 * 
 * This module contains the universal primitives that can model any business domain.
 * 
 * Core Insight: Everything is an Agreement.
 * - Entities don't have intrinsic roles; they hold roles via Agreements
 * - Assets exist within realms and move between entities via Agreements
 * - Realms themselves are established by Agreements (tenant licenses)
 * 
 * Fractal Insight: Everything is a Container.
 * - Wallets, Workspaces, Realms, Networks are all Containers
 * - The difference is not in the code; it's in the Agreement
 * - A Container is an Asset that holds other Assets, governed by an Agreement
 */

// Primitives
export type {
  Entity,
  Role,
  RoleScope,
  Permission,
  Realm,
  RealmConfig,
} from './primitives';

// PRIMORDIAL_REALM_ID now exported from ./bootstrap

// Agreement Types
export type {
  AgreementTypeDefinition,
  ParticipantRequirement,
  RoleGrant,
  AgreementTypeRegistry,
} from './agreement-types';

export {
  createAgreementTypeRegistry,
  BUILT_IN_AGREEMENT_TYPES,
  PLATFORM_ACCESS_TYPE,
  SESSION_TYPE,
  MEMBERSHIP_TYPE,
} from './agreement-types';

// Realm Management - Now handled by ContainerManager with Realm physics
// Use: containers.createRealm(name, owner, parentRealmId)

// Container - The Fractal Primitive
export type {
  Container,
  ContainerItem,
  ContainerPhysics,
  ContainerType,
  ContainerEvent,
  ContainerCreated,
  ContainerItemDeposited,
  ContainerItemWithdrawn,
  ContainerPhysicsUpdated,
  Quantity,
} from './container';

export {
  CONTAINER_PHYSICS,
  containerRehydrator,
  validateDeposit,
  validateTransfer,
} from './container';

// Container Manager - The Unified Service
export { ContainerManager, createContainerManager } from './container-manager';

// Bootstrap - System Initialization
export {
  bootstrap,
  isBootstrapped,
  PRIMORDIAL_REALM_ID,
  PRIMORDIAL_SYSTEM_ID,
  GENESIS_AGREEMENT_ID,
  type BootstrapResult,
} from './bootstrap';
