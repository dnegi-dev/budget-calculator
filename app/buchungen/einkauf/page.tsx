'use client';

/**
 * Ein eingelesener Bon mit seinen Einzelposten.
 *
 * Bis hierher war ein Bon nach dem Buchen eine Zahl je Topf, und die
 * Artikelzeilen steckten verkettet in der Notiz — nicht wieder auftrennbar,
 * weil ein Artikelname selbst Kommas enthalten darf. Diese Seite ist die
 * Antwort darauf: Die Posten stehen einzeln da, und der Topf lässt sich je
 * Posten ändern.
 *
 * **Betrag und Bezeichnung sind nicht änderbar.** Sie stehen so auf dem
 * Beleg. Ließe man sie ändern, wäre die Summenprobe (`quality`) keine Aussage
 * mehr über den Bon, sondern über eine nachbearbeitete Liste — und genau das
 * ist der Unterschied zwischen „belegt" und „behauptet".
 *
 * Die ID steckt im Query-Parameter, nicht im Pfad: `output: 'export'` kennt
 * keine `[id]`-Route, dieselbe Begründung wie bei `app/toepfe/detail`.
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { CircleHelp, ReceiptText } from 'lucide-react';
import { ListToolbar } from '../../../components/lists/ListToolbar';
import { ReceiptViewer } from '../../../components/receipts/ReceiptViewer';
import { TagInput } from '../../../components/entries/TagInput';
import { useCan } from '../../../lib/auth/provider';
import { useData, useSnapshot } from '../../../lib/data/provider';
import { collectTags } from '../../../lib/domain/tags';
import { bookablePots } from '../../../lib/domain/pot-kinds';
import type { PurchaseItem } from '../../../lib/domain/types';
import { Banner } from '../../../lib/ui/Banner';
import { Button } from '../../../lib/ui/Button';
import { Card, CardHeader } from '../../../lib/ui/Card';
import { EmptyState } from '../../../lib/ui/EmptyState';
import { Icon } from '../../../lib/ui/Icon';
import { selectClass } from '../../../lib/ui/Field';
import { PotIcon } from '../../../components/pots/PotIcon';
import { useFormat } from '../../../lib/ui/useFormat';
import { PotOptions } from '../../../components/pots/PotOptions';
import { matchesQuery } from '../../../lib/domain/search';
import { signSymbol, sumCents } from '../../../lib/domain/money';

const HERKUNFT: Record<string, string> = {
  exakt: 'Aus dem Beleg selbst gelesen — vom Kassensystem geschrieben.',
  geprüft: 'Erkannt, und die Posten gehen auf die Endsumme auf.',
  unsicher: 'Die Posten gehen nicht auf die Endsumme auf.',
};

export default function PurchasePage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Wird geladen …</p>}>
      <PurchaseDetail />
    </Suspense>
  );
}

function PurchaseDetail() {
  const params = useSearchParams();
  const purchaseId = params.get('einkauf');
  const snapshot = useSnapshot();
  const { repository } = useData();
  const format = useFormat();
  const can = useCan();

  const [suche, setSuche] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [beleg, setBeleg] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);

  const purchase = snapshot.purchases.find((candidate) => candidate.id === purchaseId) ?? null;

  const items = useMemo(
    () => snapshot.purchaseItems.filter((item) => item.purchaseId === purchaseId),
    [snapshot.purchaseItems, purchaseId],
  );
  const entries = useMemo(
    () => snapshot.entries.filter((entry) => entry.purchaseId === purchaseId),
    [snapshot.entries, purchaseId],
  );
  const belege = useMemo(() => {
    const ids = new Set(entries.map((entry) => entry.id));
    return snapshot.receipts.filter((receipt) => ids.has(receipt.entryId));
  }, [snapshot.receipts, entries]);

  const vorschlaege = useMemo(
    () => collectTags(snapshot.entries).map((usage) => usage.tag),
    [snapshot.entries],
  );

  const gefunden = useMemo(() => {
    return items.filter((item) => matchesQuery(suche, item.label));
  }, [items, suche]);

  if (!purchase) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="warning" icon={<Icon icon={CircleHelp} size={18} />}>
          Diesen Einkauf gibt es nicht mehr.
        </Banner>
        <Link href="/buchungen" className="text-sm text-accent underline">
          Zurück zu den Buchungen
        </Link>
      </div>
    );
  }

  const potsById = new Map(snapshot.pots.map((pot) => [pot.id, pot]));
  const aktivePots = bookablePots(snapshot.pots);
  const summeDerPosten = sumCents(items.map((item) => item.amountCents));
  const darfAendern = can('entry.edit.any');

  async function aendere(item: PurchaseItem, patch: { potId?: string | null; tags?: string[] }) {
    setFehler(null);
    try {
      await repository.updatePurchaseItem(item.id, patch);
    } catch (caught) {
      setFehler(caught instanceof Error ? caught.message : 'Ändern fehlgeschlagen.');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        title={purchase.merchant ?? 'Einkauf'}
        back={{ href: '/buchungen', label: 'Buchungen' }}
        search={{ value: suche, onChange: setSuche, placeholder: 'Posten suchen' }}
      />

      <Card className="px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-muted">{format.day(purchase.date)}</span>
          <span className="tabular text-2xl font-semibold">
            {purchase.totalCents === null ? '—' : format.money(purchase.totalCents)}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {HERKUNFT[purchase.quality] ?? purchase.quality}
        </p>
        {/*
          Die Summe der Posten steht nur da, wenn sie von der Endsumme
          abweicht. Sie kann es: Ein Topf, dessen Posten sich zu null
          summieren, erzeugt keine Buchung — und wer den Beleg später prüft,
          soll die Differenz sehen statt sie zu suchen.
        */}
        {purchase.totalCents !== null && summeDerPosten !== purchase.totalCents && (
          <p className="mt-1 text-xs text-warning">
            Die Posten summieren sich auf {format.money(summeDerPosten)}.
          </p>
        )}
        {belege.length > 0 && (
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => setBeleg(belege[0]!.id)}>
              <Icon icon={ReceiptText} size={18} /> Beleg ansehen
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={`${items.length} Posten`} />
        {gefunden.length === 0 ? (
          <EmptyState
            icon={<Icon icon={ReceiptText} size={30} />}
            title={items.length === 0 ? 'Keine Posten' : 'Kein Posten gefunden'}
            hint={
              items.length === 0
                ? 'Zu diesem Einkauf sind keine Einzelposten gespeichert.'
                : 'Kein Posten enthält diesen Text.'
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {gefunden.map((item) => {
              const pot = item.potId ? potsById.get(item.potId) : null;
              return (
                <li key={item.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      {item.quantity !== null && (
                        <span className="block text-xs text-ink-muted">{item.quantity} ×</span>
                      )}
                    </span>
                    <span
                      className={`tabular shrink-0 text-sm font-semibold ${
                        item.amountCents < 0 ? 'text-positive' : ''
                      }`}
                    >
                      {format.money(item.amountCents)}
                    </span>
                  </div>

                  <select
                    className={selectClass}
                    value={item.potId ?? ''}
                    disabled={!darfAendern}
                    aria-label={`Topf für „${item.label}“`}
                    onChange={(event) => void aendere(item, { potId: event.target.value || null })}
                  >
                    <option value="">— ohne Topf —</option>
                    {/*
                      Archivierte und gesperrte Töpfe bleiben in der Liste,
                      solange dieser Posten auf ihnen liegt: Sonst stände das
                      Feld auf „ohne Topf", und ein Klick daneben hätte den
                      Topf stillschweigend entfernt.
                    */}
                    <PotOptions pots={bookablePots(snapshot.pots, item.potId)} />
                  </select>

                  {snapshot.household?.tagsEnabled && (
                    <TagInput
                      tags={item.tags}
                      onChange={(tags) => void aendere(item, { tags })}
                      suggestions={vorschlaege}
                      label={`Tags für „${item.label}“`}
                    />
                  )}

                  {pot === null && item.potId !== null && (
                    <p className="text-xs text-ink-muted">
                      Der zugeordnete Topf existiert nicht mehr.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {aktivePots.length === 0 && (
          <p className="px-4 pb-4 text-xs text-ink-muted">
            Es gibt keine aktiven Töpfe, denen sich ein Posten zuordnen ließe.
          </p>
        )}
      </Card>

      {/*
        Die entstandenen Buchungen, damit die Neuberechnung sichtbar ist.
        Ohne diese Karte änderte man einen Topf und müsste glauben, dass
        anderswo die richtigen Zahlen stehen.
      */}
      <Card>
        <CardHeader title={`${entries.length} Buchung${entries.length === 1 ? '' : 'en'}`} />
        {entries.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-ink-muted">
            Aus diesem Einkauf ist derzeit keine Buchung entstanden.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {entries.map((entry) => {
              const pot = entry.potId ? potsById.get(entry.potId) : null;
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                  <PotIcon pot={pot} className="h-8 w-8 rounded-lg text-sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {pot?.name ?? 'Ohne Topf'}
                  </span>
                  <span
                    className={`tabular shrink-0 text-sm font-semibold ${
                      entry.kind === 'income' ? 'text-positive' : ''
                    }`}
                  >
                    {signSymbol(entry.kind)}
                    {format.money(entry.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {fehler && <p className="text-sm text-negative">{fehler}</p>}

      {can('entry.edit.any') && (
        <Card className="border-[var(--negative)]">
          <CardHeader title="Einkauf löschen" />
          <div className="px-4 pb-4">
            <p className="text-sm text-ink-muted">
              Entfernt den Einkauf, seine {items.length} Posten, die daraus gerechneten Buchungen
              und den Beleg. Das lässt sich nicht rückgängig machen.
            </p>
            {loeschen ? (
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  onClick={() => {
                    void repository.deletePurchase(purchase.id);
                    setLoeschen(false);
                  }}
                >
                  Ja, alles entfernen
                </Button>
                <Button variant="ghost" onClick={() => setLoeschen(false)}>
                  Abbrechen
                </Button>
              </div>
            ) : (
              <div className="mt-3">
                <Button variant="danger" onClick={() => setLoeschen(true)}>
                  Einkauf löschen
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {beleg && (
        <ReceiptViewer
          receipt={belege.find((candidate) => candidate.id === beleg)!}
          onClose={() => setBeleg(null)}
        />
      )}
    </div>
  );
}
