import { describe, it, expect } from 'vitest';
import { DICT } from './i18n';

describe('i18n completeness', () => {
  it('Spanish dictionary has every English key', () => {
    const enKeys = Object.keys(DICT.en);
    const esKeys = new Set(Object.keys(DICT.es));
    const missing = enKeys.filter((k) => !esKeys.has(k));
    expect(missing, `Missing ES keys: ${missing.join(', ')}`).toEqual([]);
  });

  it('English dictionary has every Spanish key', () => {
    const esKeys = Object.keys(DICT.es);
    const enKeys = new Set(Object.keys(DICT.en));
    const extra = esKeys.filter((k) => !enKeys.has(k));
    expect(extra, `Extra ES-only keys: ${extra.join(', ')}`).toEqual([]);
  });

  it('no empty string values in English', () => {
    const empty = Object.entries(DICT.en).filter(([, v]) => v.trim() === '');
    expect(empty.map(([k]) => k)).toEqual([]);
  });

  it('no empty string values in Spanish', () => {
    const empty = Object.entries(DICT.es).filter(([, v]) => v.trim() === '');
    expect(empty.map(([k]) => k)).toEqual([]);
  });
});
