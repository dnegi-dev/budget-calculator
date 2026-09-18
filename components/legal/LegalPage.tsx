import type { ReactNode } from 'react';

/**
 * Gemeinsames Gerüst für Impressum und Datenschutzerklärung.
 *
 * Bewusst ohne die App-Navigation: Diese Seiten sind auch dann erreichbar,
 * wenn noch kein Haushalt eingerichtet ist (siehe AppGate), und dann gäbe es
 * nichts, wohin die Navigation führen könnte.
 */
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  /** Datum der letzten Überarbeitung, als Text. */
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-6 pb-16">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">Stand: {updatedAt}</p>
      </header>
      {children}
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="flex flex-col gap-2 text-[0.9375rem] leading-relaxed text-ink">
        {children}
      </div>
    </section>
  );
}

/**
 * Sichtbarer Hinweis, solange Platzhalter im Text stehen.
 *
 * Ein veröffentlichtes Impressum mit „[PLZ Ort]" ist schlechter als gar keines:
 * Es sieht aus, als wäre die Pflicht erfüllt. Deshalb steht der Hinweis für
 * Besucher sichtbar auf der Seite und nicht nur als Kommentar im Code.
 */
export function PlaceholderWarning() {
  return (
    <div className="rounded-card border border-[var(--warning)] bg-subtle px-4 py-3 text-sm">
      <p className="font-medium">Diese Seite ist noch eine Vorlage.</p>
      <p className="mt-1 text-ink-muted">
        Die mit eckigen Klammern markierten Stellen müssen vor der Veröffentlichung durch echte
        Angaben ersetzt und rechtlich geprüft werden. Bis dahin erfüllt diese Seite keine
        gesetzliche Pflicht.
      </p>
    </div>
  );
}
