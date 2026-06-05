// ============================================================
// OrbitIQ v0.3.0 — Congestion Indicator
// Compact, reusable widget showing score + level + meter.
// ============================================================
import { t } from '../../i18n/i18n';
import type { CongestionLevel } from '../../types';

interface Props {
  score: number;
  level: CongestionLevel;
  compact?: boolean;
}

const LEVEL_KEYS: Record<CongestionLevel, string> = {
  low: 'cong_low',
  moderate: 'cong_moderate',
  elevated: 'cong_elevated',
  high: 'cong_high',
};

export function CongestionIndicator({ score, level, compact }: Props) {
  if (compact) {
    return (
      <div className="metric-cong">
        <span className={`cong-level ${level}`} style={{ margin: 0, padding: '2px 6px', fontSize: '9px' }}>
          <i />{t(LEVEL_KEYS[level])}
        </span>
      </div>
    );
  }

  return (
    <div className="cong">
      <div className="cong-head">
        <span className="cong-label">{t('cong_title')}</span>
        <span className="cong-score">{score}<small>/100</small></span>
      </div>
      <div className="cong-meter">
        <div className={`cong-meter-fill ${level}`} style={{ width: `${score}%` }} />
      </div>
      <div className={`cong-level ${level}`}>
        <i />{t(LEVEL_KEYS[level])}
      </div>
      <div className="cong-caveat">{t('cong_caveat')}</div>
    </div>
  );
}
