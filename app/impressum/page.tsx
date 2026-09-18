/**
 * Impressum — Gerüst mit Platzhaltern.
 *
 * KEIN RECHTSRAT. Die Angabepflichten für Telemedien stehen in § 5 DDG
 * (bis 2024: § 5 TMG). Was hier steht, ist die übliche Struktur für eine
 * private, nicht-kommerzielle Seite; was im Einzelfall nötig ist, hängt davon
 * ab, wer die Seite betreibt und wozu.
 *
 * Vor der Veröffentlichung zu tun:
 *
 *   1. Alle [Platzhalter] durch echte Angaben ersetzen.
 *      Eine ladungsfähige Anschrift ist Pflicht — ein Postfach genügt nicht.
 *   2. `<PlaceholderWarning />` entfernen.
 *   3. Prüfen lassen, ob Angaben fehlen (z. B. Umsatzsteuer-Identifikations-
 *      nummer, Registereintrag, Aufsichtsbehörde, Berufsbezeichnung) — die
 *      auskommentierten Abschnitte unten nennen die häufigsten Fälle.
 */

import type { Metadata } from 'next';
import { LegalPage, LegalSection, PlaceholderWarning } from '../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Impressum',
  description: 'Anbieterkennzeichnung nach § 5 DDG.',
};

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum" updatedAt="[Datum eintragen]">
      <PlaceholderWarning />

      <LegalSection title="Angaben gemäß § 5 DDG">
        <p>
          [Vor- und Nachname]
          <br />
          [Straße und Hausnummer]
          <br />
          [PLZ und Ort]
          <br />
          [Land, falls nicht Deutschland]
        </p>
      </LegalSection>

      <LegalSection title="Kontakt">
        <p>
          E-Mail: [E-Mail-Adresse]
          <br />
          Telefon: [Telefonnummer — nur nötig, wenn eine schnelle elektronische Kontaktaufnahme
          nicht anders sichergestellt ist]
        </p>
      </LegalSection>

      <LegalSection title="Verantwortlich für den Inhalt">
        <p>
          [Vor- und Nachname]
          <br />
          [Anschrift, falls abweichend]
        </p>
      </LegalSection>

      {/*
        Je nach Betreiber zusätzlich nötig — bei Bedarf einkommentieren:

        <LegalSection title="Umsatzsteuer-Identifikationsnummer">
          <p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG: [USt-IdNr.]</p>
        </LegalSection>

        <LegalSection title="Registereintrag">
          <p>
            Eintragung im [Handels-/Vereins-/Genossenschafts-]register
            <br />
            Registergericht: [Gericht]
            <br />
            Registernummer: [Nummer]
          </p>
        </LegalSection>

        <LegalSection title="Aufsichtsbehörde">
          <p>[Name und Anschrift der Aufsichtsbehörde]</p>
        </LegalSection>
      */}

      <LegalSection title="Streitschlichtung">
        <p>
          [Sofern zutreffend: Angabe, ob eine Teilnahme an einem Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle erfolgt. Für eine rein private, nicht-kommerzielle Seite ist
          dieser Abschnitt in der Regel entbehrlich.]
        </p>
      </LegalSection>

      <LegalSection title="Haftung für Inhalte und Links">
        <p>
          Die Inhalte dieser Seite wurden mit Sorgfalt erstellt. Für die Richtigkeit,
          Vollständigkeit und Aktualität wird keine Gewähr übernommen. Für Inhalte externer Links
          ist der jeweilige Anbieter verantwortlich.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
