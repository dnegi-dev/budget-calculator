'use client';

/**
 * Tags und gelernte Zuordnungen — beides Listen, die mit der Zeit wachsen und
 * gepflegt werden wollen. Der Link auf die Topf-Verwaltung steht dazu, weil
 * „ordnen“ dort weitergeht.
 */

import Link from 'next/link';
import { useState } from 'react';
import { ItemRulesSection } from '../../../components/settings/ItemRulesSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { TagsSection } from '../../../components/settings/TagsSection';
import { Card, CardHeader } from '../../../lib/ui/Card';

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
      <Card>
        <CardHeader title="Töpfe" />
        <div className="px-4 pb-4">
          <Link href="/toepfe" className="text-sm text-accent hover:underline">
            Töpfe verwalten und archivieren →
          </Link>
        </div>
      </Card>
    </SettingsPage>
  );
}
