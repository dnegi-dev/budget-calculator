'use client';

/**
 * Die Charts der Auswertungsseite.
 *
 * Eigene Datei, weil sie nur hier dynamisch geladen wird — Recharts ist das
 * schwerste Paket im Projekt, und auf der Startseite hat es nichts zu suchen.
 *
 * Farbgebung: Kategoriale Serien nehmen die Topf-Farbe, damit dasselbe Thema
 * in Liste und Diagramm gleich aussieht. Achsen und Gitter bleiben sehr leise;
 * die Daten sollen den Kontrast tragen, nicht das Raster.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PeriodTotals } from '../../lib/domain/ledger';

const AXIS_COLOR = 'var(--text-muted)';
const GRID_COLOR = 'var(--border)';

const AXIS_STYLE = { fontSize: 11, fill: AXIS_COLOR } as const;

/**
 * Recharts übergibt Tooltip-Werte als `ValueType | undefined`. Statt überall
 * zu casten, geht jeder Formatter durch diesen Helfer.
 */
function asCents(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function tooltipStyle() {
  return {
    background: 'var(--bg-elevated)',
    border: `1px solid ${GRID_COLOR}`,
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--text)',
  };
}

export interface PotDatum {
  name: string;
  value: number;
  color: string;
}

/** Ausgaben pro Topf. Waagerechte Balken: Topf-Namen sind lang, Platz ist knapp. */
export function PotBarChart({
  data,
  formatMoney,
}: {
  data: readonly PotDatum[];
  formatMoney: (cents: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={[...data]} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
        <XAxis
          type="number"
          tickFormatter={(value: number) => formatMoney(value)}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle()}
          formatter={(value) => [formatMoney(asCents(value)), 'Ausgaben']}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {data.map((datum) => (
            <Cell key={datum.name} fill={datum.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Anteil pro Topf. Donut statt Torte: die Mitte trägt keine Information. */
export function PotShareChart({
  data,
  formatMoney,
}: {
  data: readonly PotDatum[];
  formatMoney: (cents: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={[...data]}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={1}
          isAnimationActive={false}
        >
          {data.map((datum) => (
            <Cell key={datum.name} fill={datum.color} stroke="var(--bg-elevated)" strokeWidth={2} />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => <span style={{ color: 'var(--text)', fontSize: 12 }}>{value}</span>}
        />
        <Tooltip contentStyle={tooltipStyle()} formatter={(value) => formatMoney(asCents(value))} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Verlauf über mehrere Perioden. */
export function TrendChart({
  data,
  formatMoney,
  formatPeriod,
}: {
  data: readonly PeriodTotals[];
  formatMoney: (cents: number) => string;
  formatPeriod: (periodKey: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={[...data]} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="periodKey"
          tickFormatter={formatPeriod}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(value: number) => formatMoney(value)}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={tooltipStyle()}
          labelFormatter={(label) => formatPeriod(String(label ?? ''))}
          formatter={(value, name) => [formatMoney(asCents(value)), name]}
        />
        <Legend
          iconType="plainline"
          iconSize={16}
          formatter={(value: string) => <span style={{ color: 'var(--text)', fontSize: 12 }}>{value}</span>}
        />
        <Line
          type="monotone"
          dataKey="expenseCents"
          name="Ausgaben"
          stroke="var(--negative)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="incomeCents"
          name="Einnahmen"
          stroke="var(--positive)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
