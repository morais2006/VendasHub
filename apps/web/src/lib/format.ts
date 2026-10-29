const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat('pt-BR');
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const shortDayFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

export const formatMoney = (value: number | null | undefined) =>
  value == null ? '—' : brl.format(value);
export const formatMoneyCompact = (value: number) => brlCompact.format(value);
export const formatInt = (value: number | null | undefined) =>
  value == null ? '—' : integer.format(value);
export const formatDate = (iso: string | null | undefined) =>
  iso ? dateFmt.format(new Date(iso)) : '—';
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTimeFmt.format(new Date(iso)) : '—';
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

/** "2026-10-28" → "28 de out" (data de calendário, sem conversão de fuso). */
export const formatDayLabel = (day: string) =>
  shortDayFmt.format(new Date(`${day}T00:00:00Z`)).replace('.', '');

export function formatMs(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value < 10) return `${value.toFixed(2).replace('.', ',')} ms`;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2).replace('.', ',')} s`;
}

/**
 * Variação percentual entre dois períodos. Sem base de comparação (anterior
 * zero ou ausente) devolve null: a interface mostra "sem base" em vez de um
 * percentual infinito ou enganoso.
 */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatPercent(value: number | null, withSign = false): string {
  if (value == null) return '—';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1).replace('.', ',')}%`;
}

/** Converte texto digitado ("1.234,56", "12,9", "12.9") em número. */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.trim().replace(/[R$\s]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** Número → texto para campos de dinheiro ("12.9" → "12,90"). */
export const moneyToInput = (value: number | null | undefined) =>
  value == null ? '' : value.toFixed(2).replace('.', ',');

export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatInt(count)} ${count === 1 ? singular : plural}`;
}
