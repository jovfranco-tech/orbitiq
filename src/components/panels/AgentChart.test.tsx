import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentChart } from './AgentChart';

const DATA = [
  { name: 'LEO', count: 120 },
  { name: 'MEO', count: 30 },
  { name: 'GEO', count: 18 },
];

describe('AgentChart', () => {
  it('renders an accessible image role with a descriptive label', () => {
    render(<AgentChart data={DATA} dataKey="count" />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('count'));
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('3 categories'));
  });

  it('renders without crashing for empty data', () => {
    render(<AgentChart data={[]} dataKey="count" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('0 categories'));
  });
});
