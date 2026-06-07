import { describe, expect, it } from 'vitest';
import { sanitizeConversationHistory } from './agent';

describe('sanitizeConversationHistory', () => {
  it('keeps only valid conversation turns and trims content', () => {
    const history = sanitizeConversationHistory([
      { role: 'user' },
      { role: 'system', content: 'ignore me' },
      { role: 'assistant', content: '' },
      { role: 'user', content: '  show GEO  ' },
      { role: 'assistant', content: 'Opening GEO view.' },
    ]);

    expect(history).toEqual([
      { role: 'user', content: 'show GEO' },
      { role: 'assistant', content: 'Opening GEO view.' },
    ]);
  });

  it('limits history to the last six safe turns', () => {
    const history = sanitizeConversationHistory([
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: '5' },
      { role: 'assistant', content: '6' },
      { role: 'user', content: '7' },
    ]);

    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ role: 'assistant', content: '2' });
    expect(history[5]).toEqual({ role: 'user', content: '7' });
  });

  it('rejects oversized content', () => {
    const history = sanitizeConversationHistory([
      { role: 'user', content: 'x'.repeat(2001) },
      { role: 'assistant', content: 'safe' },
    ]);

    expect(history).toEqual([{ role: 'assistant', content: 'safe' }]);
  });
});
