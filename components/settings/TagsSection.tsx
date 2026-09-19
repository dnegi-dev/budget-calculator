'use client';

/**
 * Tags an- und ausschalten, umbenennen, löschen.
 *
 * Diese Liste ist die Bedingung dafür, dass Tags als Freitext vertretbar sind
 * — genau wie bei den gelernten Zuordnungen: Ein Tippfehler darf nicht
 * dauerhaft als zweite Kategorie mitlaufen. Ohne „umbenennen" wären „Urlaub"
 * und „Urlab" für immer zwei Dinge.
 *
 * Die Zahlen daneben sind Anzahl Buchungen, nicht Beträge. Wer aufräumt, will
 * wissen, was viel benutzt wird; Beträge stehen in der Auswertung.
 *
 * Die Arbeit selbst macht das Repository (`renameTag`, `deleteTag`): in einer
 * Transaktion, mit Outbox-Zeile je berührter Buchung. Eine Schleife hier wäre
 * beim Abbruch halb fertig.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { collectTags } from '../../lib/domain/tags';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { inputClass } from '../../lib/ui/Field';
import { Icon } from '../../lib/ui/Icon';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';

export function TagsSection() {
  const { repository, snapshot } = useData();
  const can = useCan();

  const [umbenennen, setUmbenennen] = useState<string | null>(null);
  const [neuerName, setNeuerName] = useState('');
  const [loeschen, setLoeschen] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const household = snapshot.household;
  if (!household) return null;

  const darfSchalten = can('settings.manage');
  const darfAendern = can('entry.edit.any');
  const tags = collectTags(snapshot.entries);

  async function fuehreAus(arbeit: () => Promise<unknown>) {
    setFehler(null);
    setLaeuft(true);
    try {
      await arbeit();
      setUmbenennen(null);
      setLoeschen(null);
      setNeuerName('');
    } catch (caught) {
      setFehler(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Tags" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <SegmentedControl
            label="Tags benutzen"
            value={household.tagsEnabled ? 'on' : 'off'}
            onChange={(next) =>
              void fuehreAus(() => repository.updateHousehold({ tagsEnabled: next === 'on' }))
            }
            disabled={!darfSchalten}
            options={[
              { value: 'off', label: 'Aus' },
              { value: 'on', label: 'An' },
            ]}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Tags sind eine zweite Achse neben den Töpfen: „Urlaub“, „Umzug“, „Auto“. Eine Buchung
            kann mehrere tragen — die Summen je Tag addieren sich deshalb nicht zur Gesamtsumme.
            Ausschalten verbirgt die Felder; erfasste Tags bleiben erhalten.
          </p>
        </div>

        {fehler && <p className="text-sm text-negative">{fehler}</p>}
      </div>

      {tags.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-ink-muted">
          Noch keine Tags benutzt. Sie entstehen beim Erfassen — dort tippen, mit Komma trennen.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]">
            {tags.map(({ tag, count }) => (
              <li key={tag} className="flex flex-col gap-2 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{tag}</span>
                    <span className="block text-xs text-ink-muted">
                      {count === 1 ? 'Eine Buchung' : `${count} Buchungen`}
                    </span>
                  </span>
                  {darfAendern && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUmbenennen(umbenennen === tag ? null : tag);
                          setNeuerName(tag);
                          setLoeschen(null);
                        }}
                      >
                        Umbenennen
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Tag „${tag}“ löschen`}
                        onClick={() => {
                          setLoeschen(loeschen === tag ? null : tag);
                          setUmbenennen(null);
                        }}
                      >
                        <Icon icon={X} size={18} />
                      </Button>
                    </>
                  )}
                </div>

                {umbenennen === tag && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${inputClass} flex-1`}
                      value={neuerName}
                      autoFocus
                      aria-label={`Neuer Name für „${tag}“`}
                      onChange={(event) => setNeuerName(event.target.value)}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={laeuft || neuerName.trim() === ''}
                      onClick={() => void fuehreAus(() => repository.renameTag(tag, neuerName))}
                    >
                      Speichern
                    </Button>
                  </div>
                )}

                {loeschen === tag && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-xs text-ink-muted">
                      Nimmt den Tag aus {count === 1 ? 'einer Buchung' : `${count} Buchungen`}. Die
                      Buchungen selbst bleiben.
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={laeuft}
                      onClick={() => void fuehreAus(() => repository.deleteTag(tag))}
                    >
                      Entfernen
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-xs text-ink-muted">
            {tags.length === 1 ? 'Ein Tag' : `${tags.length} Tags`} — stehen an den Buchungen und
            damit in der Sicherung.
          </p>
        </>
      )}
    </Card>
  );
}
