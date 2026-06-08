import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useGlobeKeyboard } from './useGlobeKeyboard';
import type { GlobeApi } from '../types';

const {
  mockSetShowBrief,
  mockSetCinematicMode,
  mockSetShowMissionPanel,
  mockSetShowRiskLayer,
  mockUseStore,
} = vi.hoisted(() => {
  const mockSetShowBrief      = vi.fn();
  const mockSetCinematicMode  = vi.fn();
  const mockSetShowMissionPanel = vi.fn();
  const mockSetShowRiskLayer  = vi.fn();
  const storeActions = {
    setShowBrief: mockSetShowBrief,
    setCinematicMode: mockSetCinematicMode,
    setShowMissionPanel: mockSetShowMissionPanel,
    setShowRiskLayer: mockSetShowRiskLayer,
  };
  const mockUseStore = vi.fn(() => storeActions) as unknown as typeof import('../state/store').useStore;
  (mockUseStore as unknown as { getState: () => { selected: number } }).getState
    = vi.fn(() => ({ selected: -1 }));
  return { mockSetShowBrief, mockSetCinematicMode, mockSetShowMissionPanel, mockSetShowRiskLayer, mockUseStore };
});

vi.mock('../state/store', () => ({ useStore: mockUseStore }));
vi.mock('../state/catalogStore', () => ({
  CS: { N: 0, vis: new Float32Array(10), alt: new Float32Array(10) },
}));

const ROTATE_STEP = 0.06;
const ZOOM_IN     = 0.85;
const ZOOM_OUT    = 1 / 0.85;

function Harness({
  globe,
  clearSelection,
  selectSat,
}: {
  globe: Partial<GlobeApi>;
  clearSelection: () => void;
  selectSat: (g: GlobeApi, i: number, fly: boolean) => void;
}) {
  const globeRef = useRef(globe as GlobeApi);
  useGlobeKeyboard({ globeRef, clearSelection, selectSat });
  return null;
}

describe('useGlobeKeyboard', () => {
  let rotateBy: ReturnType<typeof vi.fn>;
  let zoomBy: ReturnType<typeof vi.fn>;
  let clearSelection: ReturnType<typeof vi.fn>;
  let selectSat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rotateBy = vi.fn();
    zoomBy   = vi.fn();
    clearSelection = vi.fn();
    selectSat = vi.fn();
    vi.clearAllMocks();
  });

  function mount() {
    render(
      <Harness
        globe={{ rotateBy, zoomBy } as Partial<GlobeApi>}
        clearSelection={clearSelection}
        selectSat={selectSat}
      />
    );
  }

  it('ArrowLeft rotates left', () => {
    mount();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(rotateBy).toHaveBeenCalledWith(-ROTATE_STEP, 0);
  });

  it('ArrowRight rotates right', () => {
    mount();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(rotateBy).toHaveBeenCalledWith(ROTATE_STEP, 0);
  });

  it('ArrowUp tilts up', () => {
    mount();
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(rotateBy).toHaveBeenCalledWith(0, -ROTATE_STEP);
  });

  it('ArrowDown tilts down', () => {
    mount();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(rotateBy).toHaveBeenCalledWith(0, ROTATE_STEP);
  });

  it('+ zooms in', () => {
    mount();
    fireEvent.keyDown(document, { key: '+' });
    expect(zoomBy).toHaveBeenCalledWith(ZOOM_IN);
  });

  it('= also zooms in', () => {
    mount();
    fireEvent.keyDown(document, { key: '=' });
    expect(zoomBy).toHaveBeenCalledWith(ZOOM_IN);
  });

  it('- zooms out', () => {
    mount();
    fireEvent.keyDown(document, { key: '-' });
    expect(zoomBy).toHaveBeenCalledWith(ZOOM_OUT);
  });

  it('Escape closes all panels and clears selection', () => {
    mount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(clearSelection).toHaveBeenCalled();
    expect(mockSetShowBrief).toHaveBeenCalledWith(false);
    expect(mockSetCinematicMode).toHaveBeenCalledWith(false);
    expect(mockSetShowMissionPanel).toHaveBeenCalledWith(false);
    expect(mockSetShowRiskLayer).toHaveBeenCalledWith(false);
  });

  it('ignores rotation keys when an input is focused', () => {
    mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(rotateBy).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('Escape still fires when an input is focused', () => {
    mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(clearSelection).toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
