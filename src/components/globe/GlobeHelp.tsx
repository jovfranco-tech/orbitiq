import { useState, useEffect } from 'react';
import { useStore } from '../../state/store';

const STORAGE_KEY = 'orbitiq-globe-help-seen';

export function GlobeHelp() {
  const lang = useStore((s) => s.lang);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  const controls = lang === 'es'
    ? [
        { key: 'Arrastrar', action: 'Rotar el globo' },
        { key: 'Scroll / Pellizcar', action: 'Acercar / Alejar' },
        { key: '← → ↑ ↓', action: 'Rotar (teclado)' },
        { key: '+ / −', action: 'Zoom (teclado)' },
        { key: 'Tab / Shift+Tab', action: 'Ciclar satélites' },
        { key: 'Clic', action: 'Seleccionar satélite' },
        { key: 'Esc', action: 'Limpiar selección' },
      ]
    : [
        { key: 'Drag', action: 'Rotate globe' },
        { key: 'Scroll / Pinch', action: 'Zoom in / out' },
        { key: '← → ↑ ↓', action: 'Rotate (keyboard)' },
        { key: '+ / −', action: 'Zoom (keyboard)' },
        { key: 'Tab / Shift+Tab', action: 'Cycle satellites' },
        { key: 'Click', action: 'Select satellite' },
        { key: 'Esc', action: 'Clear selection' },
      ];

  return (
    <div
      className="globe-help glass"
      role="dialog"
      aria-modal="false"
      aria-label={lang === 'es' ? 'Controles del globo' : 'Globe controls'}
    >
      <div className="globe-help-head">
        <span>{lang === 'es' ? 'Controles' : 'Controls'}</span>
        <button
          onClick={dismiss}
          aria-label={lang === 'es' ? 'Cerrar ayuda del globo' : 'Dismiss globe help'}
        >×</button>
      </div>
      <ul className="globe-help-list" role="list">
        {controls.map(({ key, action }) => (
          <li key={key}>
            <kbd>{key}</kbd>
            <span>{action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
