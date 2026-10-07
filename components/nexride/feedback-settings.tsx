"use client";

import { useEffect, useState } from "react";
import type { Language } from "../../lib/nexride-i18n";
import {
  emitNexRideFeedback,
  getNexRideNotificationPermission,
  readNexRideFeedbackPreferences,
  requestNexRideNotificationPermission,
  saveNexRideFeedbackPreferences,
  type NexRideFeedbackPreferences,
} from "../../lib/nexride-feedback";
import { Icon } from "./ui";

export function NexRideFeedbackSettings({
  role,
  language,
}: {
  role: "rider" | "driver";
  language: Language;
}) {
  const [preferences, setPreferences] = useState<NexRideFeedbackPreferences>(() => readNexRideFeedbackPreferences());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [feedback, setFeedback] = useState("");
  const say = (en: string, am: string) => language === "am" ? am : en;

  useEffect(() => {
    setPreferences(readNexRideFeedbackPreferences());
    setPermission(getNexRideNotificationPermission());
  }, []);

  const change = <K extends keyof NexRideFeedbackPreferences>(key: K, value: NexRideFeedbackPreferences[K]) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    saveNexRideFeedbackPreferences(next);
    setFeedback(say("Saved on this device.", "በዚህ መሣሪያ ተቀምጧል።"));
  };

  const permissionLabel =
    permission === "granted" ? say("Notifications enabled", "ማሳወቂያዎች በርተዋል")
    : permission === "denied" ? say("Notifications blocked in device settings", "ማሳወቂያዎች በመሣሪያ ቅንብር ታግደዋል")
    : permission === "unsupported" ? say("System notifications unavailable here", "የስርዓት ማሳወቂያ እዚህ አይገኝም")
    : say("Enable system notifications", "የስርዓት ማሳወቂያዎችን አብራ");

  return (
    <section className="nr-feedback-settings" aria-label={say("Sounds and haptics", "ድምፅ እና ንዝረት")}>
      <header className="nr-feedback-heading">
        <span><Icon name="volume" size={19} /></span>
        <div>
          <strong>{say("Sounds & haptics", "ድምፅ እና ንዝረት")}</strong>
          <small>{say("Clear feedback for important NexRide events.", "ለአስፈላጊ የNexRide ሁኔታዎች ግልጽ ምላሽ።")}</small>
        </div>
        <button
          type="button"
          className="nr-feedback-test"
          onClick={() => emitNexRideFeedback({ event: "success" })}
        >
          {say("Test", "ሞክር")}
        </button>
      </header>

      <FeedbackToggle
        icon="volume"
        title={say("Notification sounds", "የማሳወቂያ ድምፆች")}
        detail={say("Play NexRide tones for important events.", "ለአስፈላጊ ሁኔታዎች የNexRide ድምፅ አጫውት።")}
        checked={preferences.sounds}
        onChange={(value) => change("sounds", value)}
      />

      {role === "driver" && (
        <FeedbackToggle
          icon="bell"
          title={say("Incoming ride request alert", "የአዲስ ጉዞ ጥያቄ ማንቂያ")}
          detail={say("Distinct repeating alert while a real request is actionable.", "እውነተኛ ጥያቄ ንቁ ሲሆን የሚደገም ልዩ ማንቂያ።")}
          checked={preferences.rideRequests}
          onChange={(value) => change("rideRequests", value)}
          emphasis
        />
      )}

      <FeedbackToggle
        icon="chat"
        title={say("Message sounds", "የመልዕክት ድምፆች")}
        detail={say("Short tone for a new trip message.", "ለአዲስ የጉዞ መልዕክት አጭር ድምፅ።")}
        checked={preferences.messages}
        onChange={(value) => change("messages", value)}
      />

      <FeedbackToggle
        icon="navigation"
        title={say("Trip update sounds", "የጉዞ ሁኔታ ድምፆች")}
        detail={say("Driver assigned, arrival, trip start, completion and payment confirmation.", "አሽከርካሪ ሲመደብ፣ ሲደርስ፣ ጉዞ ሲጀምርና ሲጠናቀቅ።")}
        checked={preferences.tripUpdates}
        onChange={(value) => change("tripUpdates", value)}
      />

      <FeedbackToggle
        icon="vibrate"
        title={say("Haptic feedback", "የንዝረት ምላሽ")}
        detail={say("Use supported device vibration for important state changes.", "ለአስፈላጊ ሁኔታ ለውጦች የመሣሪያ ንዝረት ተጠቀም።")}
        checked={preferences.haptics}
        onChange={(value) => change("haptics", value)}
      />

      {role === "driver" && (
        <div className="nr-feedback-voice">
          <FeedbackToggle
            icon="speaker"
            title={say("Navigation voice", "የአሰሳ ድምፅ")}
            detail={say("Hands-free route guidance when NexRide has a current instruction.", "NexRide የአሁኑን መመሪያ ሲኖረው የድምፅ አሰሳ።")}
            checked={preferences.navigationVoice}
            onChange={(value) => change("navigationVoice", value)}
          />
          {preferences.navigationVoice && (
            <div className="nr-feedback-language" role="group" aria-label={say("Navigation voice language", "የአሰሳ ድምፅ ቋንቋ")}>
              <button aria-pressed={preferences.navigationLanguage === "en"} onClick={() => change("navigationLanguage", "en")}>English</button>
              <button aria-pressed={preferences.navigationLanguage === "am"} onClick={() => change("navigationLanguage", "am")}>አማርኛ</button>
            </div>
          )}
        </div>
      )}

      <div className="nr-feedback-notifications">
        <span><Icon name="bell" size={18} /></span>
        <div>
          <strong>{permissionLabel}</strong>
          <small>{role === "driver"
            ? say("Recommended so ride requests remain visible when NexRide is in the background.", "NexRide ከበስተጀርባ ሲሆን የጉዞ ጥያቄዎች እንዲታዩ ይመከራል።")
            : say("Useful for driver assignment, arrival and important trip changes.", "ለአሽከርካሪ ምደባ፣ መድረስ እና አስፈላጊ የጉዞ ለውጦች ይጠቅማል።")}</small>
        </div>
        {permission === "default" && (
          <button type="button" onClick={async () => {
            const next = await requestNexRideNotificationPermission();
            setPermission(next);
            setFeedback(next === "granted" ? say("System notifications enabled.", "የስርዓት ማሳወቂያዎች በርተዋል።") : say("Notification preference was not enabled.", "የማሳወቂያ ምርጫ አልበራም።"));
          }}>{say("Enable", "አብራ")}</button>
        )}
      </div>

      {feedback && <p className="nr-feedback-saved" role="status">{feedback}</p>}
      <p className="nr-feedback-note">
        {say("Audio never replaces the on-screen trip state. Device silent mode, browser policy and system notification settings remain in control.", "ድምፅ የማያ ገጽ የጉዞ ሁኔታን አይተካም። የመሣሪያ እና የአሳሽ ቅንብሮች ይከበራሉ።")}
      </p>
    </section>
  );
}

function FeedbackToggle({
  icon,
  title,
  detail,
  checked,
  onChange,
  emphasis = false,
}: {
  icon: "volume" | "bell" | "chat" | "navigation" | "vibrate" | "speaker";
  title: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  emphasis?: boolean;
}) {
  return (
    <label className={"nr-feedback-row" + (emphasis ? " emphasis" : "")}>
      <span className="nr-feedback-icon"><Icon name={icon} size={18} /></span>
      <span className="nr-feedback-copy"><strong>{title}</strong><small>{detail}</small></span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
