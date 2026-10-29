import { describe, expect, it } from 'vitest';
import { presetRange, shiftDays } from './period';

describe('períodos do dashboard', () => {
  it('atalhos incluem o dia de hoje', () => {
    expect(presetRange('7d', '2026-10-28')).toEqual({ from: '2026-10-22', to: '2026-10-28' });
    expect(presetRange('30d', '2026-10-28')).toEqual({ from: '2026-09-29', to: '2026-10-28' });
    expect(presetRange('month', '2026-10-28')).toEqual({ from: '2026-10-01', to: '2026-10-28' });
  });

  it('desloca datas atravessando meses e anos', () => {
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
