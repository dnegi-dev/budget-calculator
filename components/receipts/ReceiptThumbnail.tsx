'use client';

/**
 * Vorschau eines Belegs, per Tippen in der Vollansicht.
 *
 * Blob-URLs werden beim Aufräumen wieder freigegeben — ohne `revokeObjectURL`
 * hält der Browser jedes angesehene Belegbild bis zum Reload im Speicher.
 */

import { useEffect, useState } from 'react';
import { useData } from '../../lib/data/provider';
import { useCan } from '../../lib/auth/provider';
import type { ReceiptMeta } from '../../lib/domain/types';
import { ReceiptViewer } from './ReceiptViewer';

export function ReceiptThumbnail({
  receipt,
  deletable = false,
}: {
  receipt: ReceiptMeta;
  deletable?: boolean;
}) {
  const { repository } = useData();
  const can = useCan();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    void (async () => {
      const full = await repository.getReceipt(receipt.id);
      const source = full?.thumbnail ?? (full?.mime.startsWith('image/') ? full.blob : null);
      if (!source || cancelled) return;
      url = URL.createObjectURL(source);
      setPreviewUrl(url);
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [repository, receipt.id]);

  const isPdf = receipt.mime === 'application/pdf';

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="block h-20 w-20 overflow-hidden rounded-xl border border-line bg-subtle"
          aria-label={`Beleg ${receipt.filename} ansehen`}
        >
          {previewUrl ? (
            // Blob-URL aus IndexedDB — next/image kann damit nicht umgehen.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden className="grid h-full w-full place-items-center text-xl">
              {isPdf ? '📄' : '🧾'}
            </span>
          )}
        </button>

        {deletable && can('receipt.delete') && (
          <button
            type="button"
            onClick={() => void repository.deleteReceipt(receipt.id)}
            aria-label={`Beleg ${receipt.filename} löschen`}
            className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-xs shadow-[var(--shadow-card)]"
          >
            ×
          </button>
        )}
      </div>

      {viewerOpen && <ReceiptViewer receipt={receipt} onClose={() => setViewerOpen(false)} />}
    </>
  );
}
