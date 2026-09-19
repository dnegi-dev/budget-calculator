'use client';

/**
 * Tags und gelernte Zuordnungen — beides Listen, die mit der Zeit wachsen und
 * gepflegt werden wollen. Der Link auf die Topf-Verwaltung steht dazu, weil
 * „ordnen“ dort weitergeht.
 */

import Link from 'next/link';
import { ItemRulesSection } from '../../../components/settings/ItemRulesSection';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { TagsSection } from '../../../components/settings/TagsSection';
import { Card, CardHeader } from '../../../lib/ui/Card';

export default function OrganiseSettingsPage() {
  return (
    <SettingsPage title="Ordnen">
      <TagsSection />
      <ItemRulesSection />
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
