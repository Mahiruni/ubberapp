"use client";

export type NexRideSoundId =
  | "online"
  | "offline"
  | "success"
  | "message"
  | "request"
  | "rideAccepted"
  | "driverAssigned"
  | "driverArrived"
  | "tripStarted"
  | "tripCompleted"
  | "paymentSuccess"
  | "cancelled"
  | "warning"
  | "safety";

export type NexRideFeedbackEvent =
  | "driver_online"
  | "driver_offline"
  | "success"
  | "message"
  | "ride_request"
  | "ride_request_stop"
  | "ride_accepted"
  | "driver_assigned"
  | "driver_arrived"
  | "trip_started"
  | "trip_completed"
  | "payment_success"
  | "cancelled"
  | "warning"
  | "safety";

export type NexRideFeedbackPreferences = {
  sounds: boolean;
  rideRequests: boolean;
  messages: boolean;
  tripUpdates: boolean;
  haptics: boolean;
  navigationVoice: boolean;
  navigationLanguage: "en" | "am";
};

export const NEXRIDE_FEEDBACK_KEY = "nexride:feedback:v1";
export const NEXRIDE_FEEDBACK_CHANGED = "nexride:feedback-changed";

const defaults: NexRideFeedbackPreferences = {
  sounds: true,
  rideRequests: true,
  messages: true,
  tripUpdates: true,
  haptics: true,
  navigationVoice: false,
  navigationLanguage: "en",
};

type Note = readonly [frequency: number, duration: number, gain: number, delay?: number];
type Pattern = { notes: readonly Note[]; wave?: OscillatorType };

const patterns: Record<NexRideSoundId, Pattern> = {
  online: { notes: [[392, .08, .035], [523.25, .14, .05, .07]] },
  offline: { notes: [[523.25, .08, .03], [349.23, .15, .045, .07]] },
  success: { notes: [[440, .08, .035], [587.33, .18, .055, .07]] },
  message: { notes: [[659.25, .08, .03], [783.99, .1, .035, .055]], wave: "sine" },
  request: {
    // Incoming ride request: a recognisable ringtone-style phrase rather than
    // a few notification beeps. One phrase is ~3.35s and is repeated with a
    // short breathing gap while the offer remains actionable.
    notes: [
      [196, 3.12, .018, 0],
      [392, .34, .048, 0],
      [523.25, .38, .058, .34],
      [659.25, .56, .068, .72],
      [523.25, .30, .046, 1.42],
      [659.25, .34, .056, 1.72],
      [783.99, .58, .066, 2.06],
      [659.25, .28, .050, 2.72],
      [523.25, .42, .056, 2.98],
    ],
    wave: "triangle",
  },
  rideAccepted: { notes: [[392, .08, .04], [523.25, .11, .05, .07], [659.25, .19, .06, .16]] },
  driverAssigned: { notes: [[329.63, .1, .04], [440, .12, .05, .09], [659.25, .24, .06, .19]] },
  driverArrived: { notes: [[523.25, .15, .055], [659.25, .17, .06, .19], [523.25, .24, .05, .38]] },
  tripStarted: { notes: [[392, .09, .035], [493.88, .11, .045, .08], [587.33, .21, .055, .17]] },
  tripCompleted: { notes: [[392, .1, .035], [523.25, .12, .045, .09], [659.25, .27, .06, .2]] },
  paymentSuccess: { notes: [[523.25, .07, .035], [659.25, .09, .045, .065], [783.99, .2, .055, .14]] },
  cancelled: { notes: [[392, .09, .03], [293.66, .17, .04, .08]] },
  warning: { notes: [[220, .14, .045], [196, .24, .05, .17]], wave: "triangle" },
  safety: { notes: [[329.63, .11, .07], [329.63, .11, .07, .16], [220, .3, .08, .34]], wave: "square" },
};

let context: AudioContext | null = null;
let requestTimer: number | null = null;
let requestStopTimer: number | null = null;
const requestNodes = new Set<OscillatorNode>();
const seen = new Map<string, number>();
let spokenKey = "";

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!context) context = new AudioCtor();
  return context;
}

function categoryEnabled(event: NexRideFeedbackEvent, preferences: NexRideFeedbackPreferences) {
  if (event === "ride_request" || event === "ride_request_stop" || event === "ride_accepted") return preferences.rideRequests;
  if (event === "message") return preferences.messages;
  if (["driver_assigned","driver_arrived","trip_started","trip_completed","payment_success","cancelled"].includes(event)) return preferences.tripUpdates;
  return true;
}

export function readNexRideFeedbackPreferences(): NexRideFeedbackPreferences {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(NEXRIDE_FEEDBACK_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<NexRideFeedbackPreferences>;
    return {
      sounds: parsed.sounds !== false,
      rideRequests: parsed.rideRequests !== false,
      messages: parsed.messages !== false,
      tripUpdates: parsed.tripUpdates !== false,
      haptics: parsed.haptics !== false,
      navigationVoice: parsed.navigationVoice === true,
      navigationLanguage: parsed.navigationLanguage === "am" ? "am" : "en",
    };
  } catch {
    return defaults;
  }
}

export function saveNexRideFeedbackPreferences(next: NexRideFeedbackPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NEXRIDE_FEEDBACK_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(NEXRIDE_FEEDBACK_CHANGED, { detail: next }));
  } catch {}
}

export async function primeNexRideAudio() {
  const audio = getContext();
  if (!audio) return false;
  try {
    if (audio.state === "suspended") await audio.resume();
    return audio.state === "running";
  } catch {
    return false;
  }
}

function schedulePattern(id: NexRideSoundId, tracked?: Set<OscillatorNode>) {
  const audio = getContext();
  if (!audio || audio.state !== "running") return;
  const pattern = patterns[id];
  const start = audio.currentTime + .015;

  for (const [frequency, duration, gainValue, delay = 0] of pattern.notes) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = pattern.wave || "sine";
    oscillator.frequency.setValueAtTime(frequency, start + delay);
    gain.gain.setValueAtTime(.0001, start + delay);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, gainValue), start + delay + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, start + delay + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    if (tracked) tracked.add(oscillator);
    oscillator.onended = () => tracked?.delete(oscillator);
    oscillator.start(start + delay);
    oscillator.stop(start + delay + duration + .035);
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(pattern); } catch {}
}

function hapticFor(event: NexRideFeedbackEvent) {
  const prefs = readNexRideFeedbackPreferences();
  if (!prefs.haptics) return;
  if (event === "ride_request") vibrate([90, 70, 120, 80, 160]);
  else if (event === "safety") vibrate([160, 80, 160, 80, 240]);
  else if (event === "driver_arrived") vibrate([75, 90, 110]);
  else if (event === "driver_assigned") vibrate([55, 75, 75]);
  else if (event === "message") vibrate(35);
  else if (event !== "ride_request_stop") vibrate(28);
}

export function stopRideRequestAlert() {
  if (typeof window !== "undefined" && requestTimer !== null) window.clearInterval(requestTimer);
  if (typeof window !== "undefined" && requestStopTimer !== null) window.clearTimeout(requestStopTimer);
  requestTimer = null;
  requestStopTimer = null;
  for (const node of requestNodes) {
    try { node.stop(); } catch {}
  }
  requestNodes.clear();
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(0); } catch {}
  }
}

const RIDE_REQUEST_ALERT_MAX_MS = 30_000;
const RIDE_REQUEST_PHRASE_INTERVAL_MS = 3_750;

function startRideRequestAlert() {
  stopRideRequestAlert();
  let cycle = 0;

  const play = () => {
    schedulePattern("request", requestNodes);
    // Keep vibration useful without buzzing continuously for the whole window.
    if (cycle === 0 || cycle % 3 === 0) hapticFor("ride_request");
    cycle += 1;
  };

  play();

  if (typeof window !== "undefined") {
    requestTimer = window.setInterval(play, RIDE_REQUEST_PHRASE_INTERVAL_MS);
    requestStopTimer = window.setTimeout(stopRideRequestAlert, RIDE_REQUEST_ALERT_MAX_MS);
  }
}

function soundFor(event: NexRideFeedbackEvent): NexRideSoundId | null {
  const sounds: Record<NexRideFeedbackEvent, NexRideSoundId | null> = {
    driver_online: "online",
    driver_offline: "offline",
    success: "success",
    message: "message",
    ride_request: "request",
    ride_request_stop: null,
    ride_accepted: "rideAccepted",
    driver_assigned: "driverAssigned",
    driver_arrived: "driverArrived",
    trip_started: "tripStarted",
    trip_completed: "tripCompleted",
    payment_success: "paymentSuccess",
    cancelled: "cancelled",
    warning: "warning",
    safety: "safety",
  };
  return sounds[event];
}

function isDuplicate(key?: string) {
  if (!key) return false;
  const now = Date.now();
  for (const [entry, time] of seen) if (now - time > 5 * 60_000) seen.delete(entry);
  const previous = seen.get(key);
  if (previous && now - previous < 60_000) return true;
  seen.set(key, now);
  return false;
}

async function showSystemNotification(title: string, body: string, tag?: string, url?: string) {
  if (typeof window === "undefined" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/favicon-32x32.png",
        tag,
        silent: false,
        data: { url: url || window.location.href },
      });
    }
  } catch {}
}

export async function requestNexRideNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported" as const;
  if (Notification.permission !== "default") return Notification.permission;
  try { return await Notification.requestPermission(); }
  catch { return "denied" as const; }
}

export function getNexRideNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported" as const;
  return Notification.permission;
}

export function emitNexRideFeedback(input: {
  event: NexRideFeedbackEvent;
  id?: string;
  title?: string;
  body?: string;
  url?: string;
}) {
  const { event, id, title, body, url } = input;
  if (event === "ride_request_stop") {
    stopRideRequestAlert();
    return;
  }
  const dedupeKey = id ? event + ":" + id : undefined;
  if (isDuplicate(dedupeKey)) return;

  const preferences = readNexRideFeedbackPreferences();
  if (!categoryEnabled(event, preferences)) return;

  if (event === "safety") stopRideRequestAlert();

  void primeNexRideAudio().then(() => {
    if (!preferences.sounds) return;
    if (event === "ride_request") startRideRequestAlert();
    else {
      const sound = soundFor(event);
      if (sound) schedulePattern(sound);
    }
  });

  if (event !== "ride_request") hapticFor(event);
  if (title && body) void showSystemNotification(title, body, dedupeKey, url);
}

function amharicNavigationCue(text: string) {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  if (lower.includes("navigate to pickup")) return "ወደ መነሻ ቦታ ይሂዱ";
  if (lower.includes("navigate to destination")) return "ወደ መድረሻ ይሂዱ";
  if (lower.includes("arrived") || lower.includes("destination is on")) return "መድረሻዎ ላይ ደርሰዋል";
  if (lower.includes("u-turn") || lower.includes("u turn")) return "ዩ ተርን ያድርጉ";
  if (lower.includes("keep left")) return "ወደ ግራ ይቆዩ";
  if (lower.includes("keep right")) return "ወደ ቀኝ ይቆዩ";
  if (lower.includes("turn left")) return "ወደ ግራ ይታጠፉ";
  if (lower.includes("turn right")) return "ወደ ቀኝ ይታጠፉ";
  if (lower.includes("slight left")) return "ትንሽ ወደ ግራ ይዙ";
  if (lower.includes("slight right")) return "ትንሽ ወደ ቀኝ ይዙ";
  if (lower.includes("continue") || lower.includes("straight")) return "ቀጥታ ይቀጥሉ";
  if (lower.includes("roundabout")) return "ወደ ክብ መንገዱ ይግቡ እና የመንገድ ምልክቶችን ይከተሉ";
  return "የአሰሳ መመሪያ። " + clean;
}

export function speakNexRideNavigation(text: string, language?: "en" | "am") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const preferences = readNexRideFeedbackPreferences();
  if (!preferences.navigationVoice) return;
  const raw = text.trim();
  if (!raw) return;
  const lang = language || preferences.navigationLanguage;
  const clean = lang === "am" ? amharicNavigationCue(raw) : raw;
  const key = lang + ":" + clean;
  if (key === spokenKey) return;
  spokenKey = key;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang === "am" ? "am-ET" : "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = .9;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

export function stopNexRideNavigationVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); } catch {}
  spokenKey = "";
}
