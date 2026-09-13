// ---------- ÖRDEX persisted UI/voice preferences (localStorage-backed) ----------

const KRISP_KEY = "ordex:krisp";
const HD_KEY = "ordex:hdboost";
const MIC_KEY = "ordex:micId";
const SPK_KEY = "ordex:spkId";
const PTT_MODE_KEY = "ordex:pttMode";
const PTT_KEYCODE_KEY = "ordex:pttKey";
const EC_KEY = "ordex:echoCancel";
const AGC_KEY = "ordex:autogain";
const RING_KEY = "ordex:ringtone";
const RING_URL_KEY = "ordex:ringtoneUrl";

/** Krisp-style processing (EC/NS/AGC) — on by default. */
export function krispEnabled(): boolean {
  try {
    return localStorage.getItem(KRISP_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setKrispPref(on: boolean) {
  try {
    localStorage.setItem(KRISP_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

/** MP4 HD Boost (sharpen/color enhance) — off by default. */
export function hdBoostEnabled(): boolean {
  try {
    return localStorage.getItem(HD_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHdBoostPref(on: boolean) {
  try {
    localStorage.setItem(HD_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

// ---------- 🎙️ Audio hardware preferences ----------

export function preferredMicId(): string {
  try {
    return localStorage.getItem(MIC_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPreferredMicId(deviceId: string) {
  try {
    localStorage.setItem(MIC_KEY, deviceId);
  } catch {
    /* private mode */
  }
}

export function preferredSpeakerId(): string {
  try {
    return localStorage.getItem(SPK_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPreferredSpeakerId(deviceId: string) {
  try {
    localStorage.setItem(SPK_KEY, deviceId);
  } catch {
    /* private mode */
  }
}

/** Push-to-talk mode ("voice" = open mic, "ptt" = hold key to speak). */
export type VoiceMode = "voice" | "ptt";

export function voiceMode(): VoiceMode {
  try {
    return localStorage.getItem(PTT_MODE_KEY) === "ptt" ? "ptt" : "voice";
  } catch {
    return "voice";
  }
}

export function setVoiceMode(mode: VoiceMode) {
  try {
    localStorage.setItem(PTT_MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}

/** Push-to-talk activation key (KeyboardEvent.code, default Space). */
export function pttKey(): string {
  try {
    return localStorage.getItem(PTT_KEYCODE_KEY) ?? "Space";
  } catch {
    return "Space";
  }
}

export function setPttKey(code: string) {
  try {
    localStorage.setItem(PTT_KEYCODE_KEY, code);
  } catch {
    /* private mode */
  }
}

/** Individual processing toggles (independent of the Krisp master switch). */
export function echoCancellationEnabled(): boolean {
  try {
    return localStorage.getItem(EC_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setEchoCancellationPref(on: boolean) {
  try {
    localStorage.setItem(EC_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export function autoGainEnabled(): boolean {
  try {
    return localStorage.getItem(AGC_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAutoGainPref(on: boolean) {
  try {
    localStorage.setItem(AGC_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

// ---------- 🔔 Ringtone preferences ----------

/** Built-in ring patterns (matched to sounds.ts loopPattern presets). */
export type RingtoneId = "ordex" | "classic" | "chime" | "pulse";

export function ringtoneChoice(): RingtoneId {
  try {
    const v = localStorage.getItem(RING_KEY);
    return v === "classic" || v === "chime" || v === "pulse" ? v : "ordex";
  } catch {
    return "ordex";
  }
}

export function setRingtoneChoice(id: RingtoneId) {
  try {
    localStorage.setItem(RING_KEY, id);
  } catch {
    /* private mode */
  }
}

/** Personal ringtone: a direct audio URL (e.g. YouTube-ripped mp3 CDN link). */
export function customRingtoneUrl(): string {
  try {
    return localStorage.getItem(RING_URL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setCustomRingtoneUrl(url: string) {
  try {
    localStorage.setItem(RING_URL_KEY, url.trim());
  } catch {
    /* private mode */
  }
}

/** Combine the WebAudio mic constraints from the saved prefs. */
export function micAudioConstraints(): MediaTrackConstraints {
  return {
    deviceId: preferredMicId() ? { exact: preferredMicId() } : undefined,
    echoCancellation: krispEnabled() && echoCancellationEnabled(),
    noiseSuppression: krispEnabled(),
    autoGainControl: krispEnabled() && autoGainEnabled(),
  };
}
