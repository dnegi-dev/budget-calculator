'use client';

/**
 * Kassenzettel zu einer Buchung hochladen.
 *
 * `capture="environment"` öffnet auf dem Telefon direkt die Kamera — der
 * häufigste Fall: man steht an der Kasse und fotografiert den Zettel.
 *
 * Mit dem Beleg passiert bewusst nichts weiter: kein Auslesen von Beträgen,
 * keine Zuordnung. Er belegt eine konkrete Änderung im Topf, nicht mehr.
 */

import { useRef, useState } from 'react';
import { useData } from '../../lib/data/provider';
import { useCan } from '../../lib/auth/provider';
import { formatByteSize } from '../../lib/data/blobs';
import { Button } from '../../lib/ui/Button';
import { createThumbnail } from '../../lib/ui/thumbnail';
import { ReceiptThumbnail } from './ReceiptThumbnail';

const MAX_BYTES = 12 * 1024 * 1024;

export function ReceiptPicker({ entryId }: { entryId: string }) {
  const { repository, snapshot } = useData();
  const can = useCan();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receipts = snapshot.receipts.filter((receipt) => receipt.entryId === entryId);
  const allowed = can('receipt.upload');

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          setError(
            `„${file.name}“ ist größer als ${formatByteSize(MAX_BYTES)} und wurde übersprungen.`,
          );
          continue;
        }
        await repository.addReceipt(entryId, {
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          blob: file,
          thumbnail: await createThumbnail(file),
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload fehlgeschlagen');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
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
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            multiple
            className="hidden"
            onChange={(event) => void upload(event.target.files)}
          />
          <Button
            variant="secondary"
            block
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy
              ? 'Wird gespeichert …'
              : receipts.length > 0
                ? 'Weiteren Beleg hinzufügen'
                : 'Beleg fotografieren oder wählen'}
          </Button>
          <p className="mt-1.5 text-xs text-ink-muted">
            Bleibt auf dem Gerät. Wird nicht ausgelesen — dient nur als Nachweis.
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-muted">Deine Rolle darf keine Belege hochladen.</p>
      )}

      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
    </div>
  );
}
