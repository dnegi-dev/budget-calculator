/**
 * Datenschutzerklärung — Gerüst.
 *
 * KEIN RECHTSRAT. Anders als beim Impressum lässt sich hier das meiste
 * tatsächlich ausformulieren, weil die Architektur die Antworten vorgibt:
 * Die App speichert ausschließlich lokal (IndexedDB), es gibt keinen Server,
 * kein Konto, keine Analyse, keine Cookies und keine externen Schriftarten
 * (siehe `app/globals.css`: nur Systemschriften).
 *
 * Offen bleiben nur die Angaben zum Verantwortlichen — und der Punkt, der
 * beim Hosting auf GitHub Pages ehrlich hingehört: GitHub liefert die Seite
 * aus und verarbeitet dabei Verbindungsdaten.
 *
 * Vor der Veröffentlichung zu tun:
 *
 *   1. [Platzhalter] durch echte Angaben ersetzen.
 *   2. `<PlaceholderWarning />` entfernen.
 *   3. Prüfen, ob die Beschreibung noch zum Stand der App passt — sobald es
 *      eine zentrale Datenbank oder SSO gibt (docs/roadmap-server.md), stimmt
 *      dieser Text nicht mehr.
 */

import type { Metadata } from 'next';
import { LegalPage, LegalSection, PlaceholderWarning } from '../../components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Datenschutz',
  description: 'Wie diese Anwendung mit Daten umgeht: alles bleibt auf dem Gerät.',
};

export default function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutzerklärung" updatedAt="[Datum eintragen]">
      <PlaceholderWarning />

      <LegalSection title="Kurzfassung">
        <p>
          Diese Anwendung speichert alle Eingaben — Haushalt, Töpfe, Buchungen und hochgeladene
          Kassenzettel — ausschließlich im Speicher deines Browsers auf deinem Gerät. Sie werden
          nicht übertragen, nicht ausgewertet und nicht an Dritte weitergegeben. Es gibt kein
          Benutzerkonto, keine Cookies und keine Reichweitenmessung.
        </p>
      </LegalSection>

      <LegalSection title="Verantwortlicher">
        <p>
          [Vor- und Nachname]
          <br />
          [Straße und Hausnummer]
          <br />
          [PLZ und Ort]
          <br />
          E-Mail: [E-Mail-Adresse]
        </p>
      </LegalSection>

      <LegalSection title="Daten, die auf deinem Gerät bleiben">
        <p>
          Die App legt deine Eingaben in der Datenbank <code>haushaltsplanung</code> im
          IndexedDB-Speicher des Browsers ab. Das umfasst Name des Haushalts, Währung, Töpfe mit
          ihren Limits, alle Buchungen mit Betrag, Datum, Ort und Notiz, wiederkehrende Regeln, die
          gelernten Zuordnungen von Artikelbezeichnungen zu Töpfen, die{' '}
          <strong>Einzelposten eingelesener PDF-Bons</strong> mit Bezeichnung, Betrag und Menge
          sowie die hochgeladenen Belege selbst.
        </p>
        <p>
          Diese Daten erreichen keinen Server. Es gibt keine Schnittstelle, über die sie abgerufen
          werden könnten.
        </p>
        <p>
          Du löschst diese Daten jederzeit selbst: in den Einstellungen der App über „Alles
          löschen“, oder indem du die Website-Daten in deinem Browser entfernst. Beides wirkt sofort
          und vollständig. Da es keine Kopie gibt, ist ein Export über die Sicherungsfunktion die
          einzige Möglichkeit, die Daten zu erhalten.
        </p>
      </LegalSection>

      <LegalSection title="Was mit einem hochgeladenen Beleg passiert">
        <p>
          <strong>Fotos werden nicht ausgelesen.</strong> Ein fotografierter Kassenzettel wird
          gespeichert und angezeigt, mehr nicht — keine Texterkennung, keine Auswertung des Inhalts.
        </p>
        <p>
          <strong>PDF-Bons werden gelesen</strong>, wenn du das ausdrücklich anstößt („Aus PDF-Bon
          einlesen“). Die App entnimmt der Datei die Einzelposten, die Endsumme, das Datum und den
          Händler, um daraus Buchungen zu rechnen; aus den Bezeichnungen der Posten merkt sie sich
          auf Wunsch, welchem Topf du sie zugeordnet hast.
        </p>
        <p>
          <strong>Die Einzelposten bleiben dabei gespeichert</strong>, nicht nur ihre Summe: Sie
          stehen als Liste am Einkauf, damit du einen Posten nachträglich einem anderen Topf
          zuordnen kannst. Das ist seit der Einführung dieser Ansicht so — vorher wurden die Zeilen
          nach dem Buchen verworfen. Löschst du den Einkauf, sind sie weg; dasselbe gilt für „Alles
          löschen“.
        </p>
        <p>
          Das geschieht vollständig <strong>auf deinem Gerät</strong>, im Browser. Die Datei wird
          nicht übertragen, das Ergebnis nicht gemeldet. Der dafür nötige Programmteil (die
          Bibliothek pdf.js) wird von demselben Server geladen wie diese Seite; es ist kein Dienst
          eines Dritten beteiligt.
        </p>
      </LegalSection>

      <LegalSection title="Anmeldung und Einstellungen auf dem Gerät">
        <p>
          Vor der App steht ein Anmeldefenster. Es ist <strong>kein Zugriffsschutz</strong>: Die
          Seite ist ein statisches Bundle, jede Datei wird an jeden ausgeliefert, der sie anfragt,
          und die Zugangsdaten stehen im ausgelieferten JavaScript. Es hält Gelegenheitsbesucher ab,
          mehr nicht. Ein Benutzerkonto entsteht dadurch nicht: Es wird nichts angelegt, nichts
          übertragen und nichts protokolliert.
        </p>
        <p>
          Dafür und für zwei Anzeigeeinstellungen legt die App drei Werte im lokalen Speicher des
          Browsers ab:
        </p>
        <ul className="ml-4 flex list-disc flex-col gap-1">
          <li>
            <code>haushalt.unlocked</code> — der Merker, dass das Anmeldefenster passiert wurde.
          </li>
          <li>
            <code>haushalt.theme</code> — die gewählte Darstellung (automatisch, hell oder dunkel).
          </li>
          <li>
            <code>haushalt.amountMode</code> — die gewählte Art der Betragseingabe.
          </li>
        </ul>
        <p>
          Alle drei bleiben auf dem Gerät, enthalten keine Kennung, werden nicht übertragen und
          lassen sich mit den Website-Daten des Browsers löschen.
        </p>
      </LegalSection>

      <LegalSection title="Daten, die beim Aufruf der Seite anfallen">
        <p>
          Die Seite wird über GitHub Pages ausgeliefert, einen Dienst der GitHub B.V. bzw. GitHub,
          Inc. Beim Abruf überträgt dein Browser technisch notwendige Verbindungsdaten an diesen
          Dienst — darunter deine IP-Adresse, Zeitpunkt der Anfrage, die angeforderte Datei sowie
          Browser- und Betriebssystemangaben. Diese Verarbeitung liegt außerhalb meines Einflusses
          und ist für den Betrieb einer im Internet abrufbaren Seite unvermeidbar.
        </p>
        <p>
          Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO, das berechtigte Interesse am technisch
          fehlerfreien Bereitstellen der Seite. Einzelheiten dazu, wie GitHub diese Daten
          verarbeitet, stehen in der{' '}
          <a
            className="text-accent underline"
            href="https://docs.github.com/privacy"
            target="_blank"
            rel="noreferrer noopener"
          >
            Datenschutzerklärung von GitHub
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Was nicht stattfindet">
        <p>
          Keine Cookies, keine Analysedienste, keine Werbenetzwerke, keine Einbindung externer
          Schriftarten oder Skripte von fremden Servern. Auch der lokale Speicher wird nicht zur
          Wiedererkennung benutzt — er enthält die drei oben genannten Werte und nichts sonst. Alle
          Dateien, die die Seite lädt, liegen auf demselben Server wie die Seite selbst.
        </p>
        <p>
          Die App kann für den Offline-Betrieb einen Service Worker installieren. Dieser legt nur
          die Programmdateien im Browser-Cache ab, keine Eingaben, und sendet nichts.
        </p>
        <p>
          Um zu erkennen, ob eine neuere Version veröffentlicht wurde, ruft die App gelegentlich die
          Datei <code>version.json</code> ab. Sie liegt auf demselben Server, enthält nur eine
          Versionskennung und überträgt nichts über dich.
        </p>
      </LegalSection>

      <LegalSection title="Deine Rechte">
        <p>
          Dir stehen gegenüber dem Verantwortlichen die Rechte aus Art. 15 bis 21 DSGVO zu:
          Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren.
        </p>
        <p>
          Zu den Daten in dieser App ist eine Auskunft naturgemäß nicht möglich und auch nicht
          nötig: Sie liegen ausschließlich bei dir, und niemand sonst hat Zugriff darauf.
        </p>
      </LegalSection>

      <LegalSection title="Änderungen">
        <p>
          Ändert sich die Funktionsweise der App — etwa durch eine zentrale Datenspeicherung oder
          eine Anmeldung —, wird diese Erklärung vorher angepasst.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
