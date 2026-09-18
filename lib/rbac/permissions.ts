/**
 * Rechte-Modell.
 *
 * In v1 gibt es genau einen lokalen Nutzer, der Admin ist — sichtbar wird davon
 * fast nichts. Der Grund, es trotzdem jetzt zu bauen: Nach Einführung von SSO
 * müssen Rechte **serverseitig** geprüft werden. Wenn die Prüfungen bis dahin
 * über die UI verstreut sind, ist das eine Umbauarbeit. Liegen sie von Anfang an
 * in einer Matrix und werden im Repository erzwungen, wandert genau diese Datei
 * unverändert in den Server.
 */

import type { Role } from '../domain/types';

export const PERMISSIONS = [
  'pot.create',
  'pot.edit',
  'pot.delete',
  'entry.create',
  'entry.edit.own',
  'entry.edit.any',
  'receipt.upload',
  'receipt.delete',
  'recurring.manage',
  'settings.manage',
  'member.manage',
  'data.export',
  'data.import',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MEMBER_PERMISSIONS: readonly Permission[] = [
  'entry.create',
  'entry.edit.own',
  'receipt.upload',
  'data.export',
];

const VIEWER_PERMISSIONS: readonly Permission[] = ['data.export'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  member: 'Nutzer',
  viewer: 'Nur Lesen',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Darf alles: Töpfe, Einstellungen, Nutzer, Import.',
  member: 'Darf buchen, eigene Buchungen ändern und Belege hochladen.',
  viewer: 'Darf sehen und exportieren, aber nichts ändern.',
};

export const ROLES: readonly Role[] = ['admin', 'member', 'viewer'];

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
