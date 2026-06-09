import { describe, it, expect } from 'vitest';
import { DICT } from './i18n';

// Enforces EN/ES dictionary key parity so a missing translation fails CI.
describe('i18n dictionary parity', () => {
  const enKeys = Object.keys(DICT.en).sort();
  const esKeys = Object.keys(DICT.es).sort();

  it('has the same number of keys in EN and ES', () => {
    expect(esKeys.length).toBe(enKeys.length);
  });

  it('has no ES keys missing from EN', () => {
    const missing = esKeys.filter((k) => !(k in DICT.en));
    expect(missing).toEqual([]);
  });

  it('has no EN keys missing from ES', () => {
    const missing = enKeys.filter((k) => !(k in DICT.es));
    expect(missing).toEqual([]);
  });

  it('has no empty string values in either dictionary', () => {
    const emptyEn = enKeys.filter((k) => DICT.en[k].trim() === '');
    const emptyEs = esKeys.filter((k) => DICT.es[k].trim() === '');
    expect({ emptyEn, emptyEs }).toEqual({ emptyEn: [], emptyEs: [] });
  });
});
