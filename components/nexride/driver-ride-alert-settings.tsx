'use client';
import type { NativeRideAlertStatus } from '../../lib/biloo-native-ride-alerts';
import { Icon } from './ui';
import './driver-ride-alert-settings.css';

export function DriverRideAlertSettings({ alerts, batteryExempt, busy, am, onEnable, onSettings, onTest }: {
  alerts: NativeRideAlertStatus | null; batteryExempt?: boolean; busy: boolean; am: boolean;
  onEnable: () => void; onSettings: () => void; onTest: () => void;
}) {
  const say = (en: string, translated: string) => am ? translated : en;
  const ready = !!alerts?.registered && alerts.notificationsEnabled && alerts.channelEnabled && alerts.headsUpEnabled;
  const rows = [
    [say('Notifications', 'ማሳወቂያዎች'), !!alerts?.notificationsEnabled],
    [say('Pop-up banners', 'ብቅ የሚሉ ማሳወቂያዎች'), !!alerts?.headsUpEnabled && !!alerts.channelEnabled],
    [say('Sound', 'ድምፅ'), !!alerts?.soundEnabled],
    [say('Vibration', 'ንዝረት'), !!alerts?.vibrationEnabled],
    [say('Device connected', 'መሣሪያው ተገናኝቷል'), !!alerts?.registered],
    [say('Background battery use', 'የበስተጀርባ ባትሪ አጠቃቀም'), batteryExempt],
  ] as const;
  return <section className="biloo-ride-alert-settings" aria-label={say('Ride alerts', 'የጉዞ ማንቂያዎች')}>
    <div className="biloo-ride-alert-settings-heading">
      <span aria-hidden="true"><Icon name="bell" size={23}/></span>
      <div><strong>{say('Ride alerts', 'የጉዞ ማንቂያዎች')}</strong><p>{say('Hear new requests while using other apps.', 'ሌሎች መተግበሪያዎችን ሲጠቀሙ አዲስ ጥያቄ ይስሙ።')}</p></div>
      <small data-ready={ready}>{ready ? say('Ready', 'ዝግጁ') : say('Check settings', 'ቅንብሮችን ያረጋግጡ')}</small>
    </div>
    {!alerts && <p className="biloo-ride-alert-update">{say('Update BILOO Driver to enable alarm-style ride alerts.', 'የጉዞ ማንቂያዎችን ለማግኘት BILOO Driverን ያዘምኑ።')}</p>}
    {alerts && <dl className="biloo-ride-alert-status-grid">{rows.map(([label, enabled]) => <div key={label}><dt>{label}</dt><dd data-enabled={enabled === true}>{enabled === undefined ? say('Check Android settings', 'የAndroid ቅንብርን ያረጋግጡ') : enabled ? say('On', 'በርቷል') : say('Off', 'ጠፍቷል')}</dd></div>)}</dl>}
    <div className="biloo-ride-alert-settings-actions">
      <button type="button" disabled={busy} onClick={onEnable}>{busy ? say('Checking…', 'በማረጋገጥ ላይ…') : say('Enable alerts', 'ማንቂያዎችን አንቃ')}</button>
      <button type="button" onClick={onSettings}>{say('Android settings', 'የAndroid ቅንብሮች')}</button>
      <button type="button" onClick={onTest} disabled={busy || !alerts?.notificationsEnabled || !alerts.channelEnabled}><Icon name="bell" size={16}/>{say('5-second device test', 'የ5 ሰከንድ ሙከራ')}</button>
    </div>
    <p className="biloo-ride-alert-settings-note">{say('While you are Online, alerts use your Android sound, vibration and Do Not Disturb settings. Force-stopping BILOO prevents alerts until you reopen it.', 'መስመር ላይ ሲሆኑ ማንቂያዎች የAndroid ድምፅ፣ ንዝረት እና አትረብሽ ቅንብሮችን ይከተላሉ። BILOOን በግድ ካቆሙት እስኪከፍቱት ድረስ ማንቂያ አይደርስም።')}</p>
  </section>;
}
