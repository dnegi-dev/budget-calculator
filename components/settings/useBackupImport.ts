'use client';

/**
 * Der Leseweg für eine Sicherung — geteilt von zwei Karten.
 *
 * „Zusammenführen“ steht unter „Sicherung“, „Ersetzen“ in der Gefahrenzone:
 * Das eine ist ein Abgleich, das andere verwirft alles auf diesem Gerät. Beide
 * brauchen denselben Ablauf — Datei wählen, JSON lesen, Freitexte kürzen,
 * Schema prüfen, bestätigen — und der soll nicht zweimal existieren.
 *
 * Warum überhaupt getrennt: Vorher lagen beide Knöpfe nebeneinander im selben
 * Bestätigungsblock. Wer den falschen traf, hatte seine Daten verworfen. Die
 * Trennung kostet einen Seitenwechsel und ist genau diesen wert.
 *
 * Das Dateifeld gehört bewusst **nicht** hierher, sondern in
 * `BackupFilePicker`: Eine Referenz, die eine Karte beim Rendern aus dem
 * Rückgabeobjekt liest, ist genau der Fehler, den `react-hooks/refs` meldet.
 */

import { useState } from 'react';
import { useData } from '../../lib/data/provider';
import type { ImportResult } from '../../lib/data/repository';
import { clampBackupText, describeImportError } from '../../lib/domain/backup';
import { exportFileSchema, type ExportFile } from '../../lib/domain/schemas';

export interface BackupImport {
  /** Geprüfte Datei, die auf die Bestätigung wartet. */
  pending: ExportFile | null;
  /** Anzahl der Texte, die beim Lesen gekürzt wurden. */
  truncated: number;
  result: ImportResult | null;
  error: string | null;
  busy: boolean;
  lesen: (file: File) => Promise<void>;
  abbrechen: () => void;
  ausfuehren: (mode: 'replace' | 'merge') => Promise<void>;
}

export function useBackupImport(): BackupImport {
  const { repository } = useData();

  const [pending, setPending] = useState<ExportFile | null>(null);
  const [truncated, setTruncated] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lesen(file: File): Promise<void> {
    setError(null);
    setResult(null);
    setTruncated(0);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      // Zu lange Freitexte kürzen, bevor das Schema urteilt: Eine Notiz soll
      // die einzige Kopie der Daten nicht unlesbar machen.
      const gekuerzt = clampBackupText(parsed);
      const validation = exportFileSchema.safeParse(parsed);
      if (!validation.success) {
        setError(describeImportError(validation.error));
        return;
      }
      setTruncated(gekuerzt);
      setPending(validation.data);
    } catch {
      setError('Die Datei ist kein gültiges JSON.');
    }
  }

  async function ausfuehren(mode: 'replace' | 'merge'): Promise<void> {
    if (pending === null) return;
    setBusy(true);
    setError(null);
    try {
      // Kein zweites `parse`: Die Daten sind schon geprüft, und bei einer
      // Sicherung mit Belegen wäre das ein Megabyte-Durchlauf für nichts.
      const imported = await repository.importAll(pending, mode);
      setResult(imported);
      setPending(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return {
    pending,
    truncated,
    result,
    error,
    busy,
    lesen,
    abbrechen: () => setPending(null),
    ausfuehren,
  };
}
