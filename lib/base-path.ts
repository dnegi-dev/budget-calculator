/**
 * Der Unterpfad, unter dem die App läuft.
 *
 * `next/link` und die `_next/*`-Assets bekommen den Präfix von Next automatisch.
 * **Nicht** automatisch bekommen ihn Dateien aus `public/` und die URLs aus dem
 * Metadata-Export — in `node_modules/next/dist/lib/metadata/resolvers/` kommt
 * `basePath` nicht vor. Genau für diese Stellen ist dieses Modul da.
 *
 * `NEXT_PUBLIC_*` wird von Next zur Bauzeit in das Client-Bundle eingesetzt,
 * die Konstante ist also auch im Browser korrekt.
 */

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** `/icons/icon.svg` → `/budget-calculator/icons/icon.svg` */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}
