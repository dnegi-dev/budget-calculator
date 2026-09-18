'use client';

/**
 * Auswertung.
 *
 * Der Ort, an dem der Desktop seinen Vorteil hat: drei Diagramme nebeneinander
 * statt untereinander. Mobil ist derselbe Inhalt gestapelt — nichts wird
 * weggelassen, denn sonst müsste man für eine Auswertung den Rechner
 * aufklappen.
 */

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { PeriodSwitcher } from '../../components/PeriodSwitcher';
import { useSnapshot } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { computeHouseholdSummary, periodTotals, spendingByPot } from '../../lib/domain/ledger';
import { formatPeriodLabel, lastPeriodKeys, periodForDate, periodFromKey } from '../../lib/domain/period';
import { Card, CardHeader } from '../../lib/ui/Card';
import { EmptyState } from '../../lib/ui/EmptyState';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { potColorVar } from '../../lib/ui/colors';
import { useFormat } from '../../lib/ui/useFormat';

// Recharts ist groß und wird nur hier gebraucht — daher erst beim Aufruf laden.
const ChartPlaceholder = () => <div className="h-64 animate-pulse rounded-card bg-subtle" />;
const PotBarChart = dynamic(() => import('../../components/analytics/Charts').then((m) => m.PotBarChart), {
  ssr: false,
  loading: ChartPlaceholder,
});
const PotShareChart = dynamic(() => import('../../components/analytics/Charts').then((m) => m.PotShareChart), {
  ssr: false,
  loading: ChartPlaceholder,
});
const TrendChart = dynamic(() => import('../../components/analytics/Charts').then((m) => m.TrendChart), {
  ssr: false,
  loading: ChartPlaceholder,
});

type Range = '6' | '12';

export default function AnalyticsPage() {
  const snapshot = useSnapshot();
  const format = useFormat();

  const currentKey = useMemo(
    () => periodForDate(todayIso(), format.periodStartDay).key,
    [format.periodStartDay],
  );
  const [periodKey, setPeriodKey] = useState(currentKey);
  const [range, setRange] = useState<Range>('6');

  const summary = useMemo(
    () => computeHouseholdSummary(snapshot.pots, snapshot.entries, periodKey, format.periodStartDay),
    [snapshot.pots, snapshot.entries, periodKey, format.periodStartDay],
  );

  const potsById = useMemo(() => new Map(snapshot.pots.map((pot) => [pot.id, pot])), [snapshot.pots]);

  const potData = useMemo(
    () =>
      spendingByPot(snapshot.entries, periodKey, format.periodStartDay).map((share) => {
        const pot = share.potId ? potsById.get(share.potId) : null;
        return {
          name: pot?.name ?? 'Ohne Topf',
          value: share.netCents,
          color: pot ? potColorVar(pot.color) : 'var(--pot-slate)',
        };
      }),
    [snapshot.entries, periodKey, format.periodStartDay, potsById],
  );

  const trend = useMemo(
    () => periodTotals(snapshot.entries, lastPeriodKeys(periodKey, Number(range)), format.periodStartDay),
    [snapshot.entries, periodKey, range, format.periodStartDay],
  );

  const shortPeriodLabel = (key: string) =>
    formatPeriodLabel(periodFromKey(key, format.periodStartDay), format.locale, 1).replace(
      / \d{4}$/,
      '',
    );

  const hasData = summary.entryCount > 0;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Auswertung</h1>

      <Card className="px-4 py-3">
        <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Einnahmen" value={format.moneyCompact(summary.incomeCents)} />
        <Metric label="Ausgaben" value={format.moneyCompact(summary.expenseCents)} />
        <Metric
          label="Saldo"
          value={format.moneyCompact(summary.balanceCents)}
          tone={summary.balanceCents < 0 ? 'negative' : 'positive'}
        />
      </div>

      {!hasData ? (
        <Card>
          <EmptyState
            icon="◔"
            title="Noch keine Zahlen"
            hint="In dieser Periode gibt es keine Buchungen. Erfasse eine Ausgabe, dann erscheinen hier die Diagramme."
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Verlauf"
              action={
                <div className="w-40">
                  <SegmentedControl
                    label="Zeitraum"
                    value={range}
                    onChange={setRange}
                    options={[
                      { value: '6', label: '6 Perioden' },
                      { value: '12', label: '12' },
                    ]}
                  />
                </div>
              }
            />
            <div className="px-2 py-4">
              <TrendChart data={trend} formatMoney={format.moneyCompact} formatPeriod={shortPeriodLabel} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Ausgaben pro Topf" />
            <div className="px-2 py-4">
              <PotBarChart data={potData} formatMoney={format.moneyCompact} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Anteil pro Topf" />
            <div className="px-2 py-4">
              <PotShareChart data={potData} formatMoney={format.moneyCompact} />
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Töpfe im Detail" />
            <ul className="divide-y divide-[var(--border)]">
              {potData.map((datum) => (
                <li key={datum.name} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: datum.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{datum.name}</span>
                  <span className="tabular shrink-0 text-sm font-medium">
                    {format.money(datum.value)}
                  </span>
                  <span className="tabular w-12 shrink-0 text-right text-xs text-ink-muted">
                    {summary.expenseCents > 0
                      ? `${Math.round((datum.value / summary.expenseCents) * 100)} %`
                      : '–'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={[
          'tabular mt-1 text-xl font-semibold',
          tone === 'negative' ? 'text-negative' : tone === 'positive' ? 'text-positive' : '',
        ].join(' ')}
      >
        {value}
      </p>
    </Card>
  );
}
