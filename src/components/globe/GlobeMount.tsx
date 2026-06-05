// ============================================================
// OrbitIQ — GlobeMount
// React wrapper for the imperative Three.js globe.
// The globe lives outside React state entirely.
// ============================================================
import { useEffect, useRef } from 'react';
import { createGlobe } from './GlobeRenderer';
import type { GlobeApi } from '../../types';

interface Props {
  onReady: (globe: GlobeApi) => void;
}

export function GlobeMount({ onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<(GlobeApi & { destroy(): void }) | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const globe = createGlobe(el);
    globeRef.current = globe;
    onReady(globe);

    return () => {
      globeRef.current?.destroy();
      globeRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      id="globe"
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
