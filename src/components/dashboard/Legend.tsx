import { t } from '../../i18n/i18n';
import { GROUPS, GROUP_ORDER } from '../../data/groups';
import { OBJECT_CLASS_META, OBJECT_CLASS_ORDER } from '../../data/objectClass';
import { CS } from '../../state/catalogStore';
import { useStore } from '../../state/store';

export function Legend() {
  // re-render whenever renderedCount changes (coarse but correct)
  useStore((s) => s.renderedCount);
  const viewMode = useStore((s) => s.viewMode);

  if (viewMode === 'operational') {
    return (
      <div className="legend glass" id="legend">
        <div className="legend-title">{t('legend')}</div>
        <div className="legend-items">
          {GROUP_ORDER.map((g) => {
            const m = GROUPS[g];
            let n = 0;
            for (let i = 0; i < CS.N; i++) if (CS.group[i] === g && CS.alt[i] >= 0) n++;
            return (
              <div key={g} className="legend-item" style={{ '--c': m.color } as React.CSSProperties}>
                <i />{m.label}<b>{n.toLocaleString()}</b>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded / debris — legend by normalized object class.
  return (
    <div className="legend glass" id="legend">
      <div className="legend-title">{t('legend_classes')}</div>
      <div className="legend-items">
        {OBJECT_CLASS_ORDER.map((cls) => {
          const meta = OBJECT_CLASS_META[cls];
          let n = 0;
          for (let i = 0; i < CS.N; i++) if (CS.objectClass[i] === cls && CS.alt[i] >= 0) n++;
          if (n === 0) return null;
          return (
            <div key={cls} className="legend-item" style={{ '--c': meta.color } as React.CSSProperties}>
              <i />{t(meta.labelKey)}<b>{n.toLocaleString()}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
