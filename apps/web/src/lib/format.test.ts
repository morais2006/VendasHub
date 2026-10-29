import { describe, expect, it } from 'vitest';
import {
  formatDayLabel,
  formatMoney,
  formatMs,
  moneyToInput,
  parseMoneyInput,
  percentChange,
} from './format';

describe('formatação', () => {
  it('formata moeda em reais e trata vazio', () => {
    expect(formatMoney(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(formatMoney(null)).toBe('—');
  });

  it('variação percentual sem base devolve null (não mostra infinito)', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
  });

  it('interpreta valores digitados no formato brasileiro', () => {
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('12,9')).toBe(12.9);
    expect(parseMoneyInput('R$ 7.25')).toBe(7.25);
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('')).toBeNull();
    expect(moneyToInput(12.9)).toBe('12,90');
  });

  it('latência com precisão adequada à escala', () => {
    expect(formatMs(1.234)).toBe('1,23 ms');
    expect(formatMs(87.6)).toBe('88 ms');
    expect(formatMs(1500)).toBe('1,50 s');
  });

  it('rótulo do dia não sofre deslocamento de fuso', () => {
    expect(formatDayLabel('2026-10-01')).toMatch(/^01 de out/);
  });
});
