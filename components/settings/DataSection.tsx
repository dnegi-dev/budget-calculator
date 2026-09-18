'use client';

/**
 * Export und Import.
 *
 * Solange die Daten nur auf dem Gerät liegen, ist der Export die einzige
 * Sicherung — deshalb steht er oben und nicht hinter „Erweitert“.
 *
 * Beim Import wird bewusst gefragt statt geraten: „Ersetzen“ ist richtig beim
 * Gerätewechsel, „Zusammenführen“ beim Abgleich zweier Geräte. Wer das falsch
 * wählt, verliert Daten.
 */

import { useRef, useState } from 'react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { downloadFile, entriesToCsv } from '../../lib/data/csv';
import { formatByteSize } from '../../lib/data/blobs';
import { exportFileSchema } from '../../lib/domain/schemas';
import { todayIso } from '../../lib/domain/dates';
import type { ImportResult } from '../../lib/data/repository';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { useFormat } from '../../lib/ui/useFormat';

export function DataSection() {
  const { repository, snapshot } = useData();
  const format = useFormat();
  const can = useCan();
  const fileRef = useRef<HTMLInputElement>(null);

  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const receiptBytes = snapshot.receipts.reduce((total, receipt) => total + receipt.byteSize, 0);

  async function exportJson() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const file = await repository.exportAll({ includeReceipts });
      downloadFile(
        `haushalt-${todayIso()}.json`,
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      setMessage('Sicherung heruntergeladen.');
    } catch (caught) {
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

  async function readFile(file: File) {
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const validation = exportFileSchema.safeParse(parsed);
      if (!validation.success) {
        const first = validation.error.issues[0];
        setError(
          `Die Datei passt nicht zum erwarteten Format${first ? `: ${first.path.join('.')} — ${first.message}` : ''}.`,
        );
        return;
      }
      setPendingImport(validation.data);
    } catch {
      setError('Die Datei ist kein gültiges JSON.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function runImport(mode: 'replace' | 'merge') {
    if (pendingImport === null) return;
    setBusy(true);
    setError(null);
    try {
      const imported = await repository.importAll(exportFileSchema.parse(pendingImport), mode);
      setResult(imported);
      setPendingImport(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Sicherung" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Banner icon="💾">
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
            <p className="font-medium">Sicherung einlesen</p>
            <p className="mt-1 mb-3 text-sm text-ink-muted">
              Nur JSON-Dateien aus dieser App. CSV kann nicht eingelesen werden — dort fehlen IDs
              und Beleg-Zuordnungen.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
            <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              Datei wählen
            </Button>
          </div>
        )}

        {pendingImport !== null && (
          <div className="rounded-card border border-[var(--warning)] px-4 py-3">
            <p className="font-medium">Wie soll eingelesen werden?</p>
            <ul className="mt-2 flex flex-col gap-2 text-sm text-ink-muted">
              <li>
                <strong className="text-ink">Ersetzen</strong> — alles auf diesem Gerät wird
                verworfen und durch die Datei ersetzt. Richtig beim Gerätewechsel.
              </li>
              <li>
                <strong className="text-ink">Zusammenführen</strong> — bei gleicher ID gewinnt der
                neuere Stand. Richtig beim Abgleich zweier Geräte.
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="primary" disabled={busy} onClick={() => void runImport('merge')}>
                Zusammenführen
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void runImport('replace')}>
                Ersetzen
              </Button>
              <Button variant="ghost" onClick={() => setPendingImport(null)}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {result && (
          <Banner icon="✓">
            Eingelesen: {result.pots} Töpfe, {result.entries} Buchungen, {result.recurringRules}{' '}
            Regeln, {result.receipts} Belege
            {result.skipped > 0 ? ` — ${result.skipped} übersprungen (lokal neuer)` : ''}.
          </Banner>
        )}

        {message && <p className="text-sm text-positive">{message}</p>}
        {error && (
          <Banner tone="negative" icon="⚠">
            {error}
          </Banner>
        )}
      </div>
    </Card>
  );
}
