import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useStore } from '../state/store';
import { CS } from '../state/catalogStore';
import type { GlobeApi } from '../types';

const ROTATE_STEP = 0.06; // radians per arrow key press
const ZOOM_IN = 0.85;
const ZOOM_OUT = 1 / 0.85;

interface Options {
  globeRef: RefObject<GlobeApi | null>;
  clearSelection: () => void;
  selectSat: (globe: GlobeApi, index: number, fly: boolean) => void;
}

export function useGlobeKeyboard({ globeRef, clearSelection, selectSat }: Options): void {
  const store = useStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const inputFocused = tag === 'input' || tag === 'textarea' || tag === 'select';

      if (e.key === 'Escape') {
        store.setShowBrief(false);
        store.setCinematicMode(false);
        store.setShowMissionPanel(false);
        store.setShowRiskLayer(false);
        clearSelection();
        return;
      }

      if (inputFocused) return;

      const globe = globeRef.current;
      switch (e.key) {
        case 'ArrowLeft':   e.preventDefault(); globe?.rotateBy(-ROTATE_STEP, 0); break;
        case 'ArrowRight':  e.preventDefault(); globe?.rotateBy(ROTATE_STEP, 0);  break;
        case 'ArrowUp':     e.preventDefault(); globe?.rotateBy(0, -ROTATE_STEP); break;
        case 'ArrowDown':   e.preventDefault(); globe?.rotateBy(0, ROTATE_STEP);  break;
        case '+': case '=': e.preventDefault(); globe?.zoomBy(ZOOM_IN);           break;
        case '-':           e.preventDefault(); globe?.zoomBy(ZOOM_OUT);          break;
        case 'Tab': {
          if (!CS.N) break;
          e.preventDefault();
          const cur = useStore.getState().selected;
          const dir = e.shiftKey ? -1 : 1;
          let next = cur < 0 ? 0 : (cur + dir + CS.N) % CS.N;
          for (let tries = 0; tries < CS.N; tries++) {
            if (CS.vis[next] >= 0.5 && CS.alt[next] >= 0) {
              if (globe) selectSat(globe, next, true);
              break;
            }
            next = (next + dir + CS.N) % CS.N;
          }
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [store, clearSelection, selectSat, globeRef]);
}
