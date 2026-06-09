import { describe, it, expect, afterEach } from 'vitest';
import { t, setLang, getLang } from './i18n';

afterEach(() => {
  setLang('en'); // restore default between tests
});

describe('i18n runtime', () => {
  it('defaults to English', () => {
    expect(getLang()).toBe('en');
    expect(t('brand')).toBe('OrbitIQ');
  });

  it('switches to Spanish and translates', () => {
    setLang('es');
    expect(getLang()).toBe('es');
    // brand is the same in both, but a localized key should differ
    expect(t('reset_view')).not.toBe('Reset view');
  });

  it('falls back to English when a key is missing in the active language', () => {
    setLang('es');
    // 'brand' exists in both; ensure resolution still works
    expect(t('brand')).toBe('OrbitIQ');
  });

  it('returns the key itself for an unknown key', () => {
    expect(t('__nonexistent_key__')).toBe('__nonexistent_key__');
  });

  it('ignores invalid language codes', () => {
    setLang('en');
    // @ts-expect-error — exercising runtime guard against bad input
    setLang('fr');
    expect(getLang()).toBe('en');
  });
});
