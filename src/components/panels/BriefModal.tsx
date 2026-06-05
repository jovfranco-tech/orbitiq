// ============================================================
// OrbitIQ — Executive Orbital Brief modal
// ============================================================
import { useEffect } from 'react';
import { t } from '../../i18n/i18n';
import { generateBrief } from '../../ai/agent';
import { GROUPS } from '../../data/groups';
import { useStore } from '../../state/store';
import { CS } from '../../state/catalogStore';
import type { GroupKey } from '../../types';

interface Props {
  onClose: () => void;
}

export function BriefModal({ onClose }: Props) {
  const { dataMode, renderedCount, totalCount } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groupCounts: Record<string, number> = {};
  const bandCounts = { LEO: 0, MEO: 0, GEO: 0 };
  for (let i = 0; i < CS.N; i++) {
    if (CS.alt[i] < 0) continue;
    groupCounts[CS.group[i]] = (groupCounts[CS.group[i]] ?? 0) + 1;
    if (CS.band[i] in bandCounts) bandCounts[CS.band[i] as keyof typeof bandCounts]++;
  }

  const brief = generateBrief({
    total: totalCount, rendered: renderedCount,
    groupCounts, bandCounts,
    groupLabel: (g: GroupKey) => (GROUPS[g] ?? GROUPS['other']).label,
  });

  const provKey = dataMode === 'live' ? 'prov_live_note'
    : dataMode === 'cached' ? 'prov_cached_note'
    : 'prov_demo_note';

  return (
    <div className="brief-overlay" onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="brief glass">
        <div className="brief-head">
          <div>
            <div className="brief-kicker">{t('brief_generated')}</div>
            <h2>{brief.headline}</h2>
          </div>
          <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="brief-body">
          <div className={`brief-prov m-${dataMode}`}>
            <i />{t(provKey)}
          </div>
          {brief.sections.map((s) => (
            <div key={s.title} className="brief-sec">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>

        <div className="brief-foot">{t('disclaimer')}</div>
      </div>
    </div>
  );
}
