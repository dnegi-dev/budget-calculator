'use client';

/**
 * Gelernte Zuordnungen vom Bon-Import.
 *
 * Diese Liste ist der Grund, warum das Lernen überhaupt vertretbar ist: Eine
 * Regel, die einmal falsch gelernt wurde, muss sichtbar und löschbar sein.
 * Ohne diese Seite würde ein Tippfehler dauerhaft Posten in den falschen Topf
 * schieben, ohne dass jemand sagen könnte, warum.
 */

import { useData } from '../../lib/data/provider';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';

export function ItemRulesSection() {
  const { repository, snapshot } = useData();

  const potsById = new Map(snapshot.pots.map((pot) => [pot.id, pot]));
  const rules = [...snapshot.itemRules].sort((a, b) => a.keyword.localeCompare(b.keyword, 'de'));

  return (
    <Card>
      <CardHeader title="Zuordnungen" />
      {rules.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-ink-muted">
          Noch keine. Beim Einlesen eines PDF-Bons merkt sich die App, welchen Topf du einem Posten
          gibst, und schlägt ihn beim nächsten Mal vor.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]">
            {rules.map((rule) => {
              const pot = potsById.get(rule.potId);
              return (
                <li key={rule.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{rule.keyword}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {pot ? `${pot.icon} ${pot.name}` : 'Topf gelöscht'}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Zuordnung „${rule.keyword}“ löschen`}
                    onClick={() => void repository.forgetItemRule(rule.id)}
                  >
                    <span aria-hidden>✕</span>
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="px-4 py-3 text-xs text-ink-muted">
            {rules.length === 1 ? 'Eine Zuordnung' : `${rules.length} Zuordnungen`} — gelernt beim
            Einlesen von Bons, in der Sicherung enthalten.
          </p>
        </>
      )}
    </Card>
  );
}
