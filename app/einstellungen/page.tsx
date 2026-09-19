'use client';

/**
 * Einstellungen als Übersicht.
 *
 * Vorher war das eine Seite mit zwölf Karten, in der „Alles löschen“ zwischen
 * „Speicher“ und „Anmeldung“ stand. Jetzt führt jeder Punkt auf eine eigene
 * Route: mobil ist jede Seite kurz genug, um sie ohne Scrollen zu überblicken,
 * und Gefährliches liegt hinter einem eigenen Weg statt zwischen Schaltern.
 *
 * Was hier bleibt, ist, was man im Vorbeigehen liest: wie viel gespeichert
 * ist, und der Abmelde-Knopf.
 */

import {
  Database,
  House,
  Palette,
  RefreshCw,
  SquarePen,
  Tags,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { setUnlocked } from '../../lib/auth/local-credentials';
import { useData, useSnapshot } from '../../lib/data/provider';
import { formatByteSize } from '../../lib/data/blobs';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { NavRow } from '../../lib/ui/NavRow';
import { useFormat } from '../../lib/ui/useFormat';

export default function SettingsPage() {
  const snapshot = useSnapshot();
  const { repository } = useData();
  const format = useFormat();

  const receiptBytes = useMemo(
    () => snapshot.receipts.reduce((total, receipt) => total + receipt.byteSize, 0),
    [snapshot.receipts],
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-medium">Einstellungen</h1>

      <Card>
        <div className="divide-y divide-[var(--border)]">
          <NavRow
            href="/einstellungen/haushalt"
            icon={House}
            title="Haushalt"
            hint="Name, Währung, Beginn der Periode"
          />
          <NavRow
            href="/einstellungen/toepfe"
            icon={Wallet}
            title="Töpfe"
            hint="Anlegen, umbenennen, archivieren, Limits"
          />
          {/*
            Der einzige Ort, an dem Regeln **ohne** Topf verwaltbar sind
            (Gehalt läuft auf den Haushalt). Das Symbol über der
            Buchungsliste ist dafür weggefallen; ohne diese Zeile liefen
            solche Regeln still weiter und wären nicht mehr erreichbar.
          */}
          <NavRow
            href="/buchungen/wiederkehrend"
            icon={RefreshCw}
            title="Wiederkehrende Buchungen"
            hint="Miete, Abos, Gehalt — auch ohne Topf"
          />
          <NavRow
            href="/einstellungen/erfassen"
            icon={SquarePen}
            title="Erfassen"
            hint="Standardtopf, Topf-Abfrage, Betragseingabe"
          />
          <NavRow
            href="/einstellungen/darstellung"
            icon={Palette}
            title="Darstellung"
            hint="Hell und dunkel, Themes, Akzentfarbe, Symbole"
          />
          <NavRow
            href="/einstellungen/organisieren"
            icon={Tags}
            title="Ordnen"
            hint="Tags und gelernte Zuordnungen aus dem Bon-Import"
          />
          <NavRow
            href="/einstellungen/daten"
            icon={Database}
            title="Sicherung"
            hint="Export als JSON und CSV, Sicherung zusammenführen"
          />
          <NavRow
            href="/einstellungen/rollen"
            icon={Users}
            title="Nutzer und Rollen"
            hint="Wer darf erfassen, ändern, löschen"
          />
          <NavRow
            href="/einstellungen/gefahrenzone"
            icon={TriangleAlert}
            tone="negative"
            title="Gefahrenzone"
            hint="Alles löschen, Sicherung ersetzend einlesen"
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Speicher" />
        <dl className="divide-y divide-[var(--border)]">
          <Row label="Töpfe" value={String(snapshot.pots.length)} />
          <Row label="Buchungen" value={String(snapshot.entries.length)} />
          <Row
            label="Belege"
            value={`${snapshot.receipts.length} · ${formatByteSize(receiptBytes, format.locale)}`}
          />
          <Row
            label="Datenquelle"
            value={repository.mode === 'local' ? 'Dieses Gerät (IndexedDB)' : 'Zentrale API'}
          />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Anmeldung" />
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-sm text-ink-muted">
            Die Anmeldung beim Öffnen hält Gelegenheitsbesucher ab. Sie ist kein Zugriffsschutz: Die
            Seite wird öffentlich ausgeliefert, und die Zugangsdaten stehen im Quelltext. Deine
            Daten liegen davon unberührt nur in diesem Browser.
          </p>
          <div>
            <Button variant="secondary" onClick={() => setUnlocked(false)}>
              Abmelden
            </Button>
          </div>
        </div>
      </Card>

      <Banner>
        Version 1 arbeitet ohne Konto und ohne Server. Zentrale Speicherung und Anmeldung über SSO
        sind vorbereitet, aber noch nicht eingeschaltet — siehe docs/roadmap-server.md im Projekt.
      </Banner>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
