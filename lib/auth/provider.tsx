'use client';

/**
 * Der lokale Session-Provider.
 *
 * Er leitet die Session aus dem Nutzer ab, der auf diesem Gerät angelegt wurde
 * (`isLocalDevice`). Es gibt keinen Anmeldeschritt — nur eine Identität, damit
 * Buchungen einen Urheber haben und die Rechteprüfung etwas zu prüfen hat.
 *
 * Für SSO wird diese Datei ersetzt: Auth.js liefert dann `session.user`, aus
 * dessen `sub` der Nutzer-Record gesucht (oder mit der Standardrolle angelegt)
 * wird. `setPrincipalResolver` bleibt der Übergabepunkt an das Repository.
 */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useData } from '../data/provider';
import { ANONYMOUS_SESSION, LOADING_SESSION, sessionFromUser, type Session } from './session';
import type { Principal } from '../rbac/can';
import type { Permission } from '../rbac/permissions';
import { can as canCheck, type ResourceContext } from '../rbac/can';

export interface AuthContextValue {
  session: Session;
  can: (permission: Permission, resource?: ResourceContext) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { repository, snapshot, loading } = useData();

  const session = useMemo<Session>(() => {
    if (loading) return LOADING_SESSION;
    const localUser =
      snapshot.users.find((user) => user.isLocalDevice) ?? snapshot.users[0] ?? null;
    return localUser ? sessionFromUser(localUser) : ANONYMOUS_SESSION;
  }, [loading, snapshot.users]);

  /**
   * Das Repository fragt den Principal bei jeder Mutation neu ab. Über ein Ref
   * statt über eine Closure, damit ein Rollenwechsel sofort greift, ohne dass
   * der Resolver neu gesetzt werden muss.
   */
  const principalRef = useRef<Principal | null>(session.principal);

  useEffect(() => {
    principalRef.current = session.principal;
  }, [session.principal]);

  useEffect(() => {
    repository.setPrincipalResolver(() => principalRef.current);
  }, [repository]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      can: (permission, resource) => canCheck(session.principal, permission, resource),
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): Session {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useSession muss innerhalb von <AuthProvider> benutzt werden.');
  return context.session;
}

/** `can('pot.create')` — für das Ausblenden von Bedienelementen. Die Regel gilt im Repository. */
export function useCan(): (permission: Permission, resource?: ResourceContext) => boolean {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useCan muss innerhalb von <AuthProvider> benutzt werden.');
  return context.can;
}
