'use client';

/**
 * Tags und gelernte Zuordnungen — beides Listen, die mit der Zeit wachsen und
 * gepflegt werden wollen.
 *
 * Die Töpfe standen hier früher als Link mit dazu. Sie haben jetzt eine
 * eigene Unterseite: Ein Verweis auf die Alltagsansicht war keine
 * Verwaltung, und wer in den Einstellungen nach Töpfen sucht, will
 * umbenennen und archivieren.
 */

import { useState } from 'react';
import { ItemRulesSection } from '../../../components/settings/ItemRulesSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { TagsSection } from '../../../components/settings/TagsSection';

export default function OrganiseSettingsPage() {
  /**
   * Ein Suchbegriff für beide Listen. Getrennte Felder je Karte wären zwei
   * Eingaben für eine Frage — wer „lebensmittel" sucht, will sehen, was dazu
   * gelernt wurde **und** welcher Tag so heißt.
   */
  const [suche, setSuche] = useState('');

  return (
    <SettingsPage
      title="Ordnen"
      search={{ value: suche, onChange: setSuche, placeholder: 'In Tags und Zuordnungen suchen' }}
    >
      <TagsSection search={suche} />
      <ItemRulesSection search={suche} />
    </SettingsPage>
  );
}
