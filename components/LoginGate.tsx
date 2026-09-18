'use client';

/**
 * Das Anmeldefenster vor der App.
 *
 * **Kein Zugriffsschutz** — warum nicht, steht in `lib/auth/local-credentials.ts`.
 * Der Hinweis dazu steht auch für Besucher sichtbar auf dieser Seite, damit
 * sich niemand auf etwas verlässt, das die Bauart nicht hergibt.
 *
 * Bewusst keine eigene Route: Ein `/login` müsste in den Offline-Cache, in die
 * Navigation und in die Rücksprungbehandlung — für eine Tür, die kein Schloss
 * hat, wäre das zu viel Apparat. Als Komponente vor dem Inhalt tut sie
 * dasselbe.
 */

import { useState, type FormEvent } from 'react';
import { checkCredentials, setUnlocked } from '../lib/auth/local-credentials';
import { Button } from '../lib/ui/Button';
import { Field, inputClass } from '../lib/ui/Field';
import { LegalLinks } from './AppShell';

export function LoginGate() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (checkCredentials(user, password)) {
      setUnlocked(true);
      return;
    }
    setFailed(true);
    setPassword('');
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-medium">Haushalt</h1>
        <p className="mt-1 text-sm text-ink-muted">Bitte anmelden.</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Benutzername">
          {(props) => (
            <input
              {...props}
              className={inputClass}
              value={user}
              onChange={(event) => {
                setUser(event.target.value);
                setFailed(false);
              }}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>

        <Field
          label="Passwort"
          error={failed ? 'Benutzername oder Passwort stimmt nicht.' : undefined}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFailed(false);
              }}
              autoComplete="current-password"
            />
          )}
        </Field>

        <Button type="submit" variant="primary" size="lg" block>
          Anmelden
        </Button>
      </form>

      {/*
        Der Satz steht hier, nicht im Kleingedruckten: Wer diese Seite baut oder
        betreibt, soll beim Hinsehen wissen, woran er ist.
      */}
      <p className="mt-8 text-xs leading-relaxed text-ink-muted">
        Diese Anmeldung hält Gelegenheitsbesucher ab. Sie ist <strong>kein</strong> Zugriffsschutz:
        Die Seite wird öffentlich ausgeliefert, und die Zugangsdaten stehen im Quelltext. Deine
        Haushaltsdaten sind davon nicht berührt — die liegen nur in diesem Browser.
      </p>

      <div className="mt-4 text-xs text-ink-muted">
        <LegalLinks />
      </div>
    </div>
  );
}
