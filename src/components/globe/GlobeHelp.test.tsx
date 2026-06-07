import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobeHelp } from './GlobeHelp';

// vi.hoisted ensures the fn is created before the module mock factory runs
const mockUseStore = vi.hoisted(() =>
  vi.fn((selector: (s: { lang: 'en' | 'es' }) => unknown) => selector({ lang: 'en' }))
);

vi.mock('../../state/store', () => ({ useStore: mockUseStore }));

const STORAGE_KEY = 'orbitiq-globe-help-seen';

beforeEach(() => {
  sessionStorage.clear();
  mockUseStore.mockImplementation(
    (selector: (s: { lang: 'en' | 'es' }) => unknown) => selector({ lang: 'en' })
  );
});

describe('GlobeHelp', () => {
  it('renders the dialog after mount when sessionStorage key is absent', async () => {
    render(<GlobeHelp />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when sessionStorage key is already set', () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    render(<GlobeHelp />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismiss button hides the dialog and persists the key', async () => {
    render(<GlobeHelp />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByLabelText('Dismiss globe help'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('lists 7 keyboard controls', async () => {
    render(<GlobeHelp />);
    await screen.findByRole('dialog');
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
  });

  it('shows English heading', async () => {
    render(<GlobeHelp />);
    await screen.findByRole('dialog');
    expect(screen.getByText('Controls')).toBeInTheDocument();
  });

  it('shows Spanish heading when lang is es', async () => {
    mockUseStore.mockImplementation(
      (selector: (s: { lang: 'en' | 'es' }) => unknown) => selector({ lang: 'es' })
    );
    render(<GlobeHelp />);
    await screen.findByRole('dialog');
    expect(screen.getByText('Controles')).toBeInTheDocument();
  });
});
