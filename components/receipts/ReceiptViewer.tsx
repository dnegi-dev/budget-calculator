'use client';

/** Beleg formatfüllend. Bei PDF ein Download-Link, weil eine Einbettung mobil unzuverlässig ist. */

import { useEffect, useState } from 'react';
import { useData } from '../../lib/data/provider';
import { formatByteSize } from '../../lib/data/blobs';
import type { ReceiptMeta } from '../../lib/domain/types';

export function ReceiptViewer({ receipt, onClose }: { receipt: ReceiptMeta; onClose: () => void }) {
  const { repository } = useData();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      const full = await repository.getReceipt(receipt.id);
      if (!full || cancelled) return;
      objectUrl = URL.createObjectURL(full.blob);
      setUrl(objectUrl);
    })();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [repository, receipt.id, onClose]);

  const isImage = receipt.mime.startsWith('image/');

  return (
    <div className="fixed inset-0 z-60 flex flex-col bg-black/90">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{receipt.filename}</p>
          <p className="text-xs text-white/60">{formatByteSize(receipt.byteSize)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="px-2 text-2xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        {url === null ? (
          <p className="text-sm text-white/70">Beleg wird geladen …</p>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Beleg ${receipt.filename}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <a
            href={url}
            download={receipt.filename}
            className="rounded-xl bg-white/10 px-5 py-3 text-sm text-white underline"
          >
            {receipt.filename} öffnen
          </a>
        )}
      </div>
    </div>
  );
}
