import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentChart } from './AgentChart';

const SAMPLE_DATA = [
  { name: 'LEO', count: 4200 },
  { name: 'MEO', count: 180 },
  { name: 'GEO', count: 560 },
];

describe('AgentChart', () => {
  it('renders with role="img"', () => {
    render(<AgentChart data={SAMPLE_DATA} dataKey="count" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('aria-label includes dataKey and summarises data', () => {
    render(<AgentChart data={SAMPLE_DATA} dataKey="count" />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('count'));
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('LEO'));
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('GEO'));
  });

  it('handles empty data without crashing', () => {
    render(<AgentChart data={[]} dataKey="count" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('aria-label is empty summary for empty data', () => {
    render(<AgentChart data={[]} dataKey="count" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Bar chart — count: ');
  });
});
