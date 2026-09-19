'use client';

/**
 * Knopf plus verstecktes Dateifeld.
 *
 * Eigene Komponente, weil die Referenz auf das `<input>` dann dort bleibt, wo
 * sie hingehört. Gäbe sie der Lese-Hook zurück, läse jede Karte während des
 * Renderns aus einem Objekt, das eine Referenz enthält — die Regel
 * `react-hooks/refs` hält das zu Recht an, und sie hätte recht: Aus einer
 * Referenz zu lesen, während gerendert wird, ist genau der Fehler, der später
 * nicht neu rendert.
 */

import { useRef } from 'react';
import { Button } from '../../lib/ui/Button';

export function BackupFilePicker({
  label,
  disabled = false,
  onFile,
}: {
  label: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Zurücksetzen, sonst löst dieselbe Datei beim zweiten Mal kein
          // `change` aus.
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      <Button variant="secondary" disabled={disabled} onClick={() => fileRef.current?.click()}>
        {label}
      </Button>
    </>
  );
}
