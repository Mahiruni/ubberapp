'use client';
import { useAppearance } from '../../lib/nexride-appearance';
import { Icon, useTranslation } from './ui';

export function AppearanceSelector({ role }: { role: 'rider' | 'driver' }) {
  const t = useTranslation();
  const appearance = useAppearance(role);
  return <div className="nr-appearance-control">
    <div className="nr-segmented" role="group" aria-label={t('appearance')}>
      {(['light','dark','system'] as const).map(value => <button key={value} type="button" aria-pressed={appearance.preference === value} onClick={() => appearance.setPreference(value)}><Icon name={value === 'dark' ? 'moon' : value === 'light' ? 'sun' : 'settings'} size={17}/>{t(value === 'light' ? 'appearanceLight' : value === 'dark' ? 'appearanceDark' : 'appearanceSystem')}</button>)}
    </div>
    {appearance.error && <p role="alert" className="nr-auth-error">{t('preferenceFailure')}</p>}
  </div>;
}
