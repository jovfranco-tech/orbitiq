import { t } from '../../i18n/i18n';
import { GROUPS, GROUP_ORDER } from '../../data/groups';
import { CS } from '../../state/catalogStore';
import { useStore } from '../../state/store';

export function Legend() {
  // re-render whenever renderedCount changes (coarse but correct)
  useStore((s) => s.renderedCount);

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
