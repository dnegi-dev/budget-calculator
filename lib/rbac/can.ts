/**
 * Die Rechteprüfung selbst.
 *
 * `can()` wird an zwei Stellen aufgerufen:
 *
 * 1. In der UI, um Knöpfe auszublenden — reine Bequemlichkeit.
 * 2. In jeder mutierenden Repository-Methode als `assertCan()` — **das** ist
 *    die Regel. Nur diese Stelle zählt, und nur diese wandert später in den
 *    Server.
 */

import type { Role } from '../domain/types';
import type { Permission } from './permissions';
import { permissionsOf } from './permissions';

export interface Principal {
  userId: string;
  householdId: string;
  role: Role;
}

/** Zusatzkontext für Rechte, die von der Eigentümerschaft abhängen. */
export interface ResourceContext {
  /** Wer die betroffene Ressource angelegt hat. */
  ownerId?: string | null;
  /** Zu welchem Haushalt sie gehört. */
  householdId?: string | null;
}

export class PermissionDeniedError extends Error {
  readonly permission: Permission;
  readonly role: Role;

  constructor(permission: Permission, role: Role) {
    super(`Rolle "${role}" darf "${permission}" nicht.`);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
    this.role = role;
  }
}

export function can(
  principal: Principal | null,
  permission: Permission,
  resource: ResourceContext = {},
): boolean {
  if (principal === null) return false;
  if (resource.householdId != null && resource.householdId !== principal.householdId) return false;

  const granted = permissionsOf(principal.role);
  if (granted.includes(permission)) return true;

  // Wer fremde Buchungen ändern darf, darf auch die eigenen.
  if (permission === 'entry.edit.own' && granted.includes('entry.edit.any')) return true;

  // `entry.edit.any` wird nicht durch `entry.edit.own` ersetzt — aber wer nur
  // eigene ändern darf, darf das eben nur bei eigenen Buchungen.
  if (
    permission === 'entry.edit.any' &&
    granted.includes('entry.edit.own') &&
    resource.ownerId != null &&
    resource.ownerId === principal.userId
  ) {
    return true;
  }

  return false;
}

export function assertCan(
  principal: Principal | null,
  permission: Permission,
  resource: ResourceContext = {},
): void {
  if (!can(principal, permission, resource)) {
    throw new PermissionDeniedError(permission, principal?.role ?? 'viewer');
  }
}
