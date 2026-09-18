/**
 * Session-Abstraktion.
 *
 * In v1 gibt es nichts anzumelden: Wer das Gerät in der Hand hat, ist der
 * Nutzer. Trotzdem läuft aller Code über `useSession()` statt über „es gibt
 * genau einen Admin“. Nach Einführung von SSO wird nur der Provider getauscht;
 * keine Komponente und keine Rechteprüfung ändert sich.
 */

import type { Role, User } from '../domain/types';
import type { Principal } from '../rbac/can';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface Session {
  status: SessionStatus;
  principal: Principal | null;
  user: User | null;
}

export const ANONYMOUS_SESSION: Session = {
  status: 'anonymous',
  principal: null,
  user: null,
};

export const LOADING_SESSION: Session = {
  status: 'loading',
  principal: null,
  user: null,
};

export function sessionFromUser(user: User): Session {
  return {
    status: 'authenticated',
    principal: { userId: user.id, householdId: user.householdId, role: user.role },
    user,
  };
}

export function roleOf(session: Session): Role | null {
  return session.principal?.role ?? null;
}
