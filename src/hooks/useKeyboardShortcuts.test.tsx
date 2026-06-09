import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

// Mutable store mock — the hook reads actions via useStore.getState().
const state = vi.hoisted(() => ({
  showIntelligence: false,
  showMissionPanel: false,
  simMode: 'live' as 'live' | 'paused' | 'simulating',
  setShowBrief: vi.fn(),
  setCinematicMode: vi.fn(),
  setShowMissionPanel: vi.fn(),
  setShowRiskLayer: vi.fn(),
  setShowIntelligence: vi.fn(),
  setVisualQuality: vi.fn(),
  setSimMode: vi.fn(),
  resetTime: vi.fn(),
}));

vi.mock('../state/store', () => ({
  useStore: { getState: () => state },
}));

function Harness(props: {
  onResetView: () => void;
  onClearSelection: () => void;
  onFocusAgent: () => void;
}) {
  useKeyboardShortcuts(props);
  return null;
}

describe('useKeyboardShortcuts', () => {
  let onResetView: ReturnType<typeof vi.fn>;
  let onClearSelection: ReturnType<typeof vi.fn>;
  let onFocusAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    state.showIntelligence = false;
    state.showMissionPanel = false;
    state.simMode = 'live';
    onResetView = vi.fn();
    onClearSelection = vi.fn();
    onFocusAgent = vi.fn();
    render(
      <Harness
        onResetView={onResetView as () => void}
        onClearSelection={onClearSelection as () => void}
        onFocusAgent={onFocusAgent as () => void}
      />
    );
  });

  it('Escape closes panels and clears selection', () => {
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(state.setShowBrief).toHaveBeenCalledWith(false);
    expect(state.setShowMissionPanel).toHaveBeenCalledWith(false);
    expect(state.setShowRiskLayer).toHaveBeenCalledWith(false);
    expect(onClearSelection).toHaveBeenCalled();
  });

  it('"b" opens the executive brief', () => {
    fireEvent.keyDown(document.body, { key: 'b' });
    expect(state.setShowBrief).toHaveBeenCalledWith(true);
  });

  it('"r" resets the globe view', () => {
    fireEvent.keyDown(document.body, { key: 'r' });
    expect(onResetView).toHaveBeenCalled();
  });

  it('"i" toggles the intelligence panel', () => {
    fireEvent.keyDown(document.body, { key: 'i' });
    expect(state.setShowIntelligence).toHaveBeenCalledWith(true);
  });

  it('"m" opens the mission panel and enables the risk layer', () => {
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(state.setShowMissionPanel).toHaveBeenCalledWith(true);
    expect(state.setShowRiskLayer).toHaveBeenCalledWith(true);
    expect(state.setVisualQuality).toHaveBeenCalledWith('presentation');
  });

  it('Space pauses a live simulation', () => {
    state.simMode = 'live';
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(state.setSimMode).toHaveBeenCalledWith('paused');
  });

  it('"/" focuses the agent input', () => {
    fireEvent.keyDown(document.body, { key: '/' });
    expect(onFocusAgent).toHaveBeenCalled();
  });

  it('ignores letter shortcuts when typing in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'b' });
    expect(state.setShowBrief).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('Escape still fires while an input is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClearSelection).toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
