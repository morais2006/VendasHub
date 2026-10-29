export type PeriodPreset = '7d' | '30d' | '90d' | 'month' | 'custom';

export const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
];

/** Data local (YYYY-MM-DD) sem conversão para UTC. */
export function localDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return localDate(new Date(y, m - 1, d + days));
}

/** Intervalo de datas (inclusivo) de cada atalho de período. */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today = localDate()) {
  switch (preset) {
    case '7d':
      return { from: shiftDays(today, -6), to: today };
    case '30d':
      return { from: shiftDays(today, -29), to: today };
    case '90d':
      return { from: shiftDays(today, -89), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}
