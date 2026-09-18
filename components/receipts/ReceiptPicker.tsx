'use client';

/**
 * Kassenzettel zu einer Buchung hochladen.
 *
 * Zwei Wege, weil es zwei Situationen gibt: an der Kasse den Zettel
 * fotografieren, und am Schreibtisch eine PDF-Rechnung oder ein Foto aus der
 * Galerie wählen. Nur der Kamera-Knopf trägt `capture` — am Datei-Knopf würde
 * es die Auswahl des Telefons überspringen und ausschließlich die Kamera
 * öffnen; genau das war vorher der Fehler.
 *
 * Mit dem Beleg passiert bewusst nichts weiter: kein Auslesen von Beträgen,
 * keine Zuordnung. Er belegt eine konkrete Änderung im Topf, nicht mehr.
 */

import { useRef, useState } from 'react';
import { useData } from '../../lib/data/provider';
import { useCan } from '../../lib/auth/provider';
import { formatByteSize } from '../../lib/data/blobs';
import { classifyUpload, MAX_UPLOAD_BYTES, type UploadRejection } from '../../lib/domain/uploads';
import { Button } from '../../lib/ui/Button';
import { createThumbnail } from '../../lib/ui/thumbnail';
import { ReceiptThumbnail } from './ReceiptThumbnail';

const ACCEPT = 'image/*,application/pdf';

function rejectionText(filename: string, reason: UploadRejection): string {
  const name = filename.trim() === '' ? 'Die Datei' : `„${filename}“`;
  switch (reason) {
    case 'leer':
      return `${name} ist leer und wurde übersprungen.`;
    case 'zu-gross':
      return `${name} ist größer als ${formatByteSize(MAX_UPLOAD_BYTES)} und wurde übersprungen.`;
    case 'typ':
      return `${name} ist kein Bild und kein PDF und wurde übersprungen.`;
  }
}

export function ReceiptPicker({ entryId }: { entryId: string }) {
  const { repository, snapshot } = useData();
  const can = useCan();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const receipts = snapshot.receipts.filter((receipt) => receipt.entryId === entryId);
  const allowed = can('receipt.upload');

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setSkipped([]);
    setError(null);
    const abgelehnt: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const verdict = classifyUpload(file.name, file.type, file.size);
        if (!verdict.ok) {
          abgelehnt.push(rejectionText(file.name, verdict.reason));
          continue;
        }
        await repository.addReceipt(entryId, {
          filename: file.name,
          mime: verdict.mime,
          blob: file,
          thumbnail: await createThumbnail(file),
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload fehlgeschlagen');
    } finally {
      setSkipped(abgelehnt);
      setBusy(false);
      // Beide Felder leeren: Dieselbe Datei soll sich erneut wählen lassen.
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-muted">Kassenzettel</p>

      {receipts.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              <ReceiptThumbnail receipt={receipt} deletable />
            </li>
          ))}
        </ul>
      )}

      {allowed ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => void upload(event.target.files)}
          />
          {/* Eigenes Feld für die Kamera: `capture` darf nur hier stehen. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void upload(event.target.files)}
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              block
              disabled={busy}
              className="md:hidden"
              onClick={() => cameraInputRef.current?.click()}
            >
              {busy ? 'Wird gespeichert …' : 'Foto aufnehmen'}
            </Button>
            <Button
              variant="secondary"
              block
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? 'Wird gespeichert …' : 'Datei wählen'}
            </Button>
          </div>

          <p className="mt-1.5 text-xs text-ink-muted">
            Bild oder PDF. Bleibt auf dem Gerät, wird nicht ausgelesen — dient nur als Nachweis.
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-muted">Deine Rolle darf keine Belege hochladen.</p>
      )}

      {skipped.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-negative">
          {skipped.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
    </div>
  );
}
