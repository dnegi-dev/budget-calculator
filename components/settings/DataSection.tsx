'use client';

/**
 * Export und das zusammenführende Einlesen.
 *
 * Solange die Daten nur auf dem Gerät liegen, ist der Export die einzige
 * Sicherung — deshalb steht er oben und nicht hinter „Erweitert“.
 *
 * Das **ersetzende** Einlesen steht nicht hier, sondern in der Gefahrenzone.
 * Vorher lagen „Zusammenführen“ und „Ersetzen“ als zwei Knöpfe im selben
 * Bestätigungsblock; wer den falschen traf, hatte alles auf diesem Gerät
 * verworfen. Den Ablauf teilen beide Seiten über `useBackupImport`.
 */

import { useState } from 'react';
import { CircleCheck, Save, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { downloadFile, entriesToCsv } from '../../lib/data/csv';
import { formatByteSize } from '../../lib/data/blobs';
import { todayIso } from '../../lib/domain/dates';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { Icon } from '../../lib/ui/Icon';
import { useFormat } from '../../lib/ui/useFormat';
import { BackupFilePicker } from './BackupFilePicker';
import { describeImportResult, useBackupImport } from './useBackupImport';

export function DataSection() {
  const { repository, snapshot } = useData();
  const format = useFormat();
  const can = useCan();
  const einlesen = useBackupImport();

  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const receiptBytes = snapshot.receipts.reduce((total, receipt) => total + receipt.byteSize, 0);

  async function exportJson() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const file = await repository.exportAll({ includeReceipts });
      downloadFile(
        `haushalt-${todayIso()}.json`,
        // Ohne Einrückung: Bei einer Sicherung mit Tausenden Buchungen sind
        // die Leerzeichen ein spürbarer Teil der Datei — und des Speichers,
        // den `JSON.stringify` auf einmal braucht.
        new Blob([JSON.stringify(file)], { type: 'application/json' }),
      );
      setMessage('Sicherung heruntergeladen.');
    } catch (caught) {
      // `RangeError: Invalid string length` — die Sicherung passt nicht mehr
      // in einen einzigen Text. Belege sind fast immer der Grund.
      if (caught instanceof RangeError) {
        setError(
          'Die Sicherung ist zu groß für eine Datei. Exportiere ohne Belege — die Buchungen sind dann vollständig gesichert.',
        );
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Export fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    setError(null);
    const csv = entriesToCsv(snapshot.entries, snapshot.pots, snapshot.receipts, {
      locale: format.locale,
    });
    downloadFile(
      `buchungen-${todayIso()}.csv`,
      // BOM, damit Excel die Datei als UTF-8 erkennt und Umlaute stimmen.
      new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }),
    );
    setMessage(`${snapshot.entries.length} Buchungen als CSV heruntergeladen.`);
  }

  return (
    <Card>
      <CardHeader title="Sicherung" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Banner icon={<Icon icon={Save} size={18} />}>
          Die Daten liegen ausschließlich auf diesem Gerät. Ohne Sicherung sind sie verloren, wenn
          du den Browser-Speicher leerst oder das Gerät wechselst.
        </Banner>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={includeReceipts}
              onChange={(event) => setIncludeReceipts(event.target.checked)}
              className="accent-[var(--accent)]"
            />
            Belege mitsichern
            <span className="text-ink-muted">
              ({snapshot.receipts.length} · {formatByteSize(receiptBytes, format.locale)})
            </span>
          </label>
          <p className="text-xs text-ink-muted">
            Belege werden als Base64 in die JSON-Datei geschrieben. Das macht die Datei etwa ein
            Drittel größer als die Bilder selbst.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={busy || !can('data.export')}
            onClick={() => void exportJson()}
          >
            Als JSON sichern
          </Button>
          <Button variant="secondary" disabled={busy || !can('data.export')} onClick={exportCsv}>
            Buchungen als CSV
          </Button>
        </div>

        {can('data.import') && (
          <div className="border-t border-line pt-4">
            <p className="font-medium">Sicherung zusammenführen</p>
            <p className="mt-1 mb-3 text-sm text-ink-muted">
              Bei gleicher ID gewinnt der neuere Stand — richtig beim Abgleich zweier Geräte. Nur
              JSON-Dateien aus dieser App; CSV kann nicht eingelesen werden, dort fehlen IDs und
              Beleg-Zuordnungen.
            </p>
            <BackupFilePicker
              label="Datei wählen"
              disabled={einlesen.busy}
              onFile={(file) => void einlesen.lesen(file)}
            />
            <p className="mt-3 text-xs text-ink-muted">
              Eine Sicherung stattdessen <em>ersetzend</em> einzulesen verwirft alles auf diesem
              Gerät — das steht in der{' '}
              <Link href="/einstellungen/gefahrenzone" className="text-accent hover:underline">
                Gefahrenzone
              </Link>
              .
            </p>
          </div>
        )}

        {einlesen.pending !== null && (
          <div className="rounded-card border border-[var(--warning)] px-4 py-3">
            <p className="font-medium">
              {einlesen.foreignHousehold === null
                ? 'Zusammenführen?'
                : `Aus „${einlesen.foreignHousehold}" übernehmen?`}
            </p>
            {einlesen.truncated > 0 && (
              <p className="mt-1 text-sm text-ink-muted">
                {einlesen.truncated === 1
                  ? 'Ein zu langer Text wurde auf die zulässige Länge gekürzt.'
                  : `${einlesen.truncated} zu lange Texte wurden auf die zulässige Länge gekürzt.`}
              </p>
            )}
            {einlesen.foreignHousehold === null ? (
              <p className="mt-1 text-sm text-ink-muted">
                Vorhandene Datensätze bleiben; bei gleicher ID gewinnt der neuere Stand.
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">
                Die Sicherung stammt aus einem anderen Haushalt. Ihre Töpfe, Buchungen und Regeln
                werden in diesen Haushalt übernommen; die Einstellungen dieses Haushalts bleiben.
                Töpfe mit gleichem Namen stehen danach doppelt da.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="primary"
                disabled={einlesen.busy}
                onClick={() => void einlesen.ausfuehren('merge')}
              >
                {einlesen.foreignHousehold === null ? 'Zusammenführen' : 'Übernehmen'}
              </Button>
              <Button variant="ghost" onClick={einlesen.abbrechen}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {einlesen.result && (
          <Banner icon={<Icon icon={CircleCheck} size={18} />}>
            {describeImportResult(einlesen.result)}
          </Banner>
        )}

        {message && <p className="text-sm text-positive">{message}</p>}
        {(error ?? einlesen.error) && (
          <Banner tone="negative" icon={<Icon icon={TriangleAlert} size={18} />}>
            <span className="whitespace-pre-line">{error ?? einlesen.error}</span>
          </Banner>
        )}
      </div>
    </Card>
  );
}
