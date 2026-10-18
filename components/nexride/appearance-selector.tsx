'use client';
import { Icon, useTranslation } from './ui';

/** NexRide's retired dark theme is intentionally not a selectable state. */
export function AppearanceSelector({ role }: { role: 'rider' | 'driver' }) {
  const t = useTranslation();
  return <div className="nr-appearance-control" data-role={role}>
    <div className="nr-segmented" role="group" aria-label={t('appearance')}>
      <span className="nr-light-appearance-label"><Icon name="sun" size={17}/>{t('appearanceLight')}</span>
    </div>
  </div>;
}
