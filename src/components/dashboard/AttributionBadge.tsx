import { ALORIA_URL } from '../../config/links';
import { t } from '../../i18n/i18n';

export function AttributionBadge() {
  return (
    <div className="attribution-badge" aria-label={t('aloria_footer_aria')}>
      <span>{t('aloria_footer_prefix')}</span>
      <a
        href={ALORIA_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('aloria_link_aria')}
      >
        Aloria Labs ↗
      </a>
    </div>
  );
}
