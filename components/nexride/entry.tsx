'use client';
import Link from 'next/link';
import { useContext, type ReactNode } from 'react';
import { Brand, Icon, LanguageContext, useTranslation } from './ui';
import { announceLanguage } from './language-provider';
import { useAppearance } from '../../lib/nexride-appearance';
import '../../app/auth-experience.css';

export function EntryShell({ children, authMode, role = 'rider' }: {
  children: ReactNode; authMode?: 'signin' | 'signup' | 'forgot' | 'reset' | 'verify'; role?: 'rider' | 'driver';
}) {
  const language = useContext(LanguageContext), t = useTranslation();
  const appearance = useAppearance(role);
  return <main className="nr-app nr-identity-entry nr-entry-redesign" data-mode={role} data-theme={appearance.resolvedTheme} data-auth-mode={authMode || 'welcome'}>
    <div className="nr-entry-page"><section className="nr-entry-shell">
      <aside className="nr-entry-hero" aria-hidden="true">
        <div className="nr-entry-hero-wash"/>
        <div className="nr-entry-hero-top"><Brand/><span className="nr-entry-role-tab">{t(role === 'driver' ? 'driver' : 'rider')}</span></div>
        <div className="nr-entry-hero-copy"><span>{t('entryMadeInAddis')}</span><strong>{t(role === 'driver' ? 'entryDriveHeadline' : 'entryRideHeadline')}</strong><p>{t('brandTagline')}</p><div className="nr-entry-hero-points"><span>{t('entryOneAccount')}</span><span>{t('entryYourCity')}</span></div></div>
      </aside>
      <div className="nr-entry-content">
        <header className="nr-entry-tools">
          <div className="nr-entry-mobile-brand"><Brand/></div>
          {authMode && <Link href={role === 'driver' ? '/driver' : '/rider'} className="nr-auth-back"><Icon name="back" size={18}/>{t('back')}</Link>}
          <button type="button" className="nr-auth-language-toggle" onClick={() => announceLanguage(language === 'en' ? 'am' : 'en')} aria-label={t('language')}>{language === 'en' ? 'አማርኛ' : 'English'}</button>
        </header>
        <div className="nr-entry-form-content">{children}</div>
        <footer className="nr-entry-legal"><Link href="/explore/terms">{t('entryTerms')}</Link><span aria-hidden="true">·</span><Link href="/explore/privacy">{t('entryPrivacy')}</Link><span>{t('entryOneAccount')}</span></footer>
      </div>
    </section></div>
  </main>;
}

