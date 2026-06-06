// ============================================================
// OrbitIQ — GlobeMount
// React wrapper for the imperative Three.js globe.
// The globe lives outside React state entirely.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { createGlobe } from './GlobeRenderer';
import { t } from '../../i18n/i18n';
import type { GlobeApi } from '../../types';

interface Props {
  onReady: (globe: GlobeApi) => void;
  onError?: () => void;
}

export function GlobeMount({ onReady, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<(GlobeApi & { destroy(): void }) | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const globe = createGlobe(el);
      globeRef.current = globe;
      onReady(globe);
    } catch (err) {
      console.error('WebGL initialization failed:', err instanceof Error ? err.message : 'unknown error');
      setWebglFailed(true);
      onError?.();
    }

    return () => {
      globeRef.current?.destroy();
      globeRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="globe"
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      aria-hidden={webglFailed ? undefined : 'true'}
    >
      {webglFailed && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: '#05070d',
            color: '#e8eefb',
            textAlign: 'center',
            fontFamily: 'Manrope, system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>{t('webgl_unavailable_title')}</h1>
            <p style={{ margin: 0, color: '#9ba7bd', lineHeight: 1.6 }}>{t('webgl_unavailable_body')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
