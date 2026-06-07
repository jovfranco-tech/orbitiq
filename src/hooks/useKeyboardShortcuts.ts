import { useEffect } from 'react';
import { useStore } from '../state/store';

interface Options {
  onResetView: () => void;
  onClearSelection: () => void;
  onFocusAgent: () => void;
}

// Global shortcuts:
//   Esc   — close panels + deselect
//   b     — executive brief
//   r     — reset globe view
//   i     — toggle intelligence panel
//   m     — toggle mission panel
//   Space — pause / resume simulation
//   /     — focus agent input

export function useKeyboardShortcuts({ onResetView, onClearSelection, onFocusAgent }: Options) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput =
        tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      if (e.key === 'Escape') {
        const s = useStore.getState();
        s.setShowBrief(false);
        s.setCinematicMode(false);
        s.setShowMissionPanel(false);
        s.setShowRiskLayer(false);
        onClearSelection();
        return;
      }

      if (isInput) return;

      const s = useStore.getState();
      switch (e.key.toLowerCase()) {
        case 'b':
          s.setShowBrief(true);
          break;
        case 'r':
          onResetView();
          break;
        case 'i':
          s.setShowIntelligence(!s.showIntelligence);
          break;
        case 'm': {
          const next = !s.showMissionPanel;
          s.setShowMissionPanel(next);
          if (next) {
            s.setShowRiskLayer(true);
            s.setVisualQuality('presentation');
            onResetView();
          } else {
            s.setShowRiskLayer(false);
          }
          break;
        }
        case ' ':
          e.preventDefault();
          if (s.simMode === 'live') s.setSimMode('paused');
          else if (s.simMode === 'paused') s.resetTime();
          else s.resetTime();
          break;
        case '/':
          e.preventDefault();
          onFocusAgent();
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onResetView, onClearSelection, onFocusAgent]);
}
