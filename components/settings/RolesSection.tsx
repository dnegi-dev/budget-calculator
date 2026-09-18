'use client';

/**
 * Rollen.
 *
 * In v1 gibt es genau einen Nutzer, und die Rolle zu ändern bringt ihm keinen
 * Vorteil — der Abschnitt ist trotzdem sichtbar, weil das Rechtemodell real
 * wirkt: Wer sich hier auf „Nur Lesen“ setzt, kann anschließend nichts mehr
 * buchen. Das ist kein Schaufenster, sondern dieselbe Prüfung, die später
 * serverseitig läuft.
 */

import { useState } from 'react';
import { useCan, useSession } from '../../lib/auth/provider';
import { useData, useSnapshot } from '../../lib/data/provider';
import type { Role } from '../../lib/domain/types';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, permissionsOf } from '../../lib/rbac/permissions';
import { Banner } from '../../lib/ui/Banner';
import { Card, CardHeader } from '../../lib/ui/Card';
import { selectClass } from '../../lib/ui/Field';

export function RolesSection() {
  const snapshot = useSnapshot();
  const { repository } = useData();
  const session = useSession();
  const can = useCan();
  const [error, setError] = useState<string | null>(null);

  async function changeRole(userId: string, role: Role) {
    setError(null);
    try {
      await repository.setUserRole(userId, role);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    }
  }

  return (
    <Card>
      <CardHeader title="Nutzer und Rollen" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Banner icon="👤">
          Weitere Nutzer brauchen die zentrale Datenhaltung — auf einem Gerät gibt es nur diesen
          einen. Das Rechtemodell ist aber schon aktiv.
        </Banner>

        <ul className="flex flex-col gap-3">
          {snapshot.users.map((user) => (
            <li key={user.id} className="rounded-xl border border-line px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {user.displayName}
                    {user.id === session.principal?.userId && (
                      <span className="ml-2 text-xs text-ink-muted">(dieses Gerät)</span>
                    )}
                  </p>
                  <p className="text-sm text-ink-muted">{ROLE_DESCRIPTIONS[user.role]}</p>
                </div>
                <select
                  className={`${selectClass} h-10 w-44`}
                  value={user.role}
                  disabled={!can('member.manage')}
                  onChange={(event) => void changeRole(user.id, event.target.value as Role)}
                  aria-label={`Rolle von ${user.displayName}`}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                {permissionsOf(user.role).length} Rechte
              </p>
            </li>
          ))}
        </ul>

        {session.principal?.role !== 'admin' && (
          <Banner tone="warning" icon="⚠">
            <p>
              Deine Rolle ist „{ROLE_LABELS[session.principal?.role ?? 'viewer']}“. Damit fehlen dir
              Rechte, die du zum Zurücksetzen bräuchtest.
            </p>
            <button
              type="button"
              onClick={() => void repository.resetLocalDeviceRole()}
              className="mt-2 text-sm text-accent underline"
            >
              Auf diesem Gerät wieder Admin werden
            </button>
          </Banner>
        )}

        {error && (
          <Banner tone="negative" icon="⚠">
            {error}
          </Banner>
        )}
      </div>
    </Card>
  );
}
