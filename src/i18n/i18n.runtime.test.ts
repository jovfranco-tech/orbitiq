import { describe, it, expect, afterEach } from 'vitest';
import { t, setLang, getLang } from './i18n';

afterEach(() => {
  // Reset to English after each test to avoid bleed
  setLang('en');
});

describe('i18n runtime', () => {
  it('defaults to English', () => {
    expect(getLang()).toBe('en');
    expect(t('tab_globe')).toBe('Globe');
  });

  it('switches to Spanish', () => {
    setLang('es');
    expect(getLang()).toBe('es');
    expect(t('tab_globe')).toBe('Globo');
  });

  it('falls back to English key when ES key is missing', () => {
    setLang('es');
    expect(t('tab_agent')).toBe('Agente IA');
  });

  it('returns the key itself when unknown', () => {
    expect(t('nonexistent_key_xyz')).toBe('nonexistent_key_xyz');
  });

  it('ignores invalid language codes', () => {
    // @ts-expect-error — testing invalid input
    setLang('fr');
    expect(getLang()).toBe('en');
  });
});
