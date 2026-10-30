'use client';
import type { NativeRideAlertStatus } from '../../lib/biloo-native-ride-alerts';
import type { NativePushReadiness } from '../../lib/nexride-native-reliability';
import { Icon } from './ui';
import './driver-ride-alert-settings.css';

export function DriverRideAlertSettings({ alerts, push, batteryExempt, busy, am, onEnable, onSettings, onTest, onTestPush }: {
  alerts: NativeRideAlertStatus | null; push: NativePushReadiness | null; batteryExempt?: boolean; busy: boolean; am: boolean;
  onEnable: () => void; onSettings: () => void; onTest: () => void; onTestPush: () => void;
}) {
  const say = (en: string, translated: string) => am ? translated : en;
  const ready = !!alerts?.registered && alerts.notificationsEnabled && alerts.channelEnabled && alerts.headsUpEnabled;
  const connected = !!push?.registered;
  const status = alerts ? {
    permission: alerts.notificationsEnabled, headsUp: alerts.headsUpEnabled && alerts.channelEnabled,
    sound: alerts.soundEnabled, vibration: alerts.vibrationEnabled, registered: alerts.registered,
  } : {
    permission: push?.permissionGranted, headsUp: push?.headsUpEnabled,
    sound: push?.soundEnabled, vibration: push?.vibrationEnabled, registered: push?.registered,
  };
  const rows = [
    [say('Notification permission', 'የማሳወቂያ ፈቃድ'), status.permission],
    [say('Pop-up banners', 'ብቅ የሚሉ ማሳወቂያዎች'), status.headsUp],
    [say('Sound', 'ድምፅ'), status.sound],
    [say('Vibration', 'ንዝረት'), status.vibration],
    [say('Device connected', 'መሣሪያው ተገናኝቷል'), status.registered],
    [say('Background battery use', 'የበስተጀርባ ባትሪ አጠቃቀም'), batteryExempt],
  ] as const;
  return <section className="biloo-ride-alert-settings" aria-label={say('Ride alerts', 'የጉዞ ማንቂያዎች')}>
    <div className="biloo-ride-alert-settings-heading">
      <span aria-hidden="true"><Icon name="bell" size={23}/></span>
      <div><strong>{say('Ride alerts', 'የጉዞ ማንቂያዎች')}</strong><p>{say('Hear new requests while using other apps.', 'ሌሎች መተግበሪያዎችን ሲጠቀሙ አዲስ ጥያቄ ይስሙ።')}</p></div>
      <small data-ready={ready || connected}>{ready ? say('Ready', 'ዝግጁ') : connected ? say('Connected', 'ተገናኝቷል') : say('Check settings', 'ቅንብሮችን ያረጋግጡ')}</small>
    </div>
    {!alerts && <p className="biloo-ride-alert-update">{say('This app supports standard ride notifications. An updated Driver APK adds alarm-style ringing and Accept/Decline controls.', 'ይህ መተግበሪያ መደበኛ የጉዞ ማሳወቂያዎችን ይደግፋል። የዘመነ Driver APK ተደጋጋሚ ማንቂያ እና ተቀበል/አልቀበልም ቁጥጥሮችን ያክላል።')}</p>}
    <dl className="biloo-ride-alert-status-grid">{rows.map(([label, enabled]) => <div key={label}><dt>{label}</dt><dd data-enabled={enabled === true}>{enabled === undefined ? say('Check Android settings', 'የAndroid ቅንብርን ያረጋግጡ') : enabled ? say('On', 'በርቷል') : say('Off', 'ጠፍቷል')}</dd></div>)}</dl>
    <div className="biloo-ride-alert-settings-actions">
      <button type="button" disabled={busy} onClick={onEnable}>{busy ? say('Checking…', 'በማረጋገጥ ላይ…') : say('Enable alerts', 'ማንቂያዎችን አንቃ')}</button>
      <button type="button" onClick={onSettings}>{say('Android settings', 'የAndroid ቅንብሮች')}</button>
      <button type="button" className="biloo-ride-alert-test" onClick={onTestPush} disabled={busy || !push?.registered || !push.permissionGranted}><Icon name="bell" size={16}/>{say('Send test notification', 'የሙከራ ማሳወቂያ ላክ')}</button>
      {alerts && <button type="button" className="biloo-ride-alert-test" onClick={onTest} disabled={busy || !alerts.notificationsEnabled || !alerts.channelEnabled}>{say('5-second sound test', 'የ5 ሰከንድ ድምፅ ሙከራ')}</button>}
    </div>
    {push?.testStatus && <p className="biloo-ride-alert-settings-note" role="status">{push.testStatus === 'accepted_by_fcm'
      ? say('Test accepted by the notification service. Check this phone for the alert; acceptance does not confirm it was displayed.', 'የማሳወቂያ አገልግሎቱ ሙከራውን ተቀብሏል። ማንቂያውን በዚህ ስልክ ላይ ያረጋግጡ፤ መቀበሉ መታየቱን አያረጋግጥም።')
      : push.testStatus === 'not_sent' ? say('The last test was not sent. Enable alerts again and retry.', 'የመጨረሻው ሙከራ አልተላከም። ማንቂያዎችን እንደገና አንቁና ይድገሙ።')
      : say('Test queued. Switch apps or lock your screen to check background delivery.', 'ሙከራው ተመዝግቧል። የበስተጀርባ መድረሱን ለማረጋገጥ ወደ ሌላ መተግበሪያ ይቀይሩ ወይም ስክሪኑን ይቆልፉ።')}</p>}
    <p className="biloo-ride-alert-settings-note">{say('While you are Online, alerts use your Android sound, vibration and Do Not Disturb settings. Force-stopping BILOO prevents alerts until you reopen it.', 'መስመር ላይ ሲሆኑ ማንቂያዎች የAndroid ድምፅ፣ ንዝረት እና አትረብሽ ቅንብሮችን ይከተላሉ። BILOOን በግድ ካቆሙት እስኪከፍቱት ድረስ ማንቂያ አይደርስም።')}</p>
  </section>;
}
