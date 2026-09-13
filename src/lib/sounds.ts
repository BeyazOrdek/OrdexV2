import { useEffect, useRef } from "react";
import { customRingtoneUrl, preferredSpeakerId, ringtoneChoice, type RingtoneId } from "@/lib/prefs";

// ---------- ÖRDEX notification & call sounds (Web Audio API + custom URL) ----------

type SoundName = "ringtone" | "dialtone" | "bip" | "ringback" | "hangup";

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** One soft two-tone chirp used for the DM/mention notification bip. */
function playBip() {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  gain.connect(ac.destination);
  for (const [freq, start] of [
    [880, 0],
    [1174.66, 0.12],
  ] as const) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(t + start);
    osc.stop(t + start + 0.18);
  }
}

/** Short busy tone when a call ends without connecting. */
function playHangup() {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.1, t + 0.03);
  gain.gain.setValueAtTime(0.1, t + 0.25);
  gain.gain.linearRampToValueAtTime(0.0001, t + 0.3);
  gain.connect(ac.destination);
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 425;
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + 0.32);
}

// ---------- Ring pattern presets (built-in ringtones) ----------

type Note = [freq: number, offsetSec: number];

const RING_PATTERNS: Record<RingtoneId, { notes: Note[]; cycle: number; noteLen: number; wave: OscillatorType }> = {
  // ÖRDEX melodik çift ıslık (varsayılan)
  ordex: {
    notes: [
      [659.25, 0],
      [987.77, 0.18],
      [659.25, 0.72],
      [987.77, 0.9],
    ],
    cycle: 2.4,
    noteLen: 0.55,
    wave: "triangle",
  },
  // Klasik zil: 440+480 Hz çift ton
  classic: {
    notes: [
      [440, 0],
      [480, 0],
    ],
    cycle: 3,
    noteLen: 1.4,
    wave: "sine",
  },
  // Çan: yükselen üçlü
  chime: {
    notes: [
      [523.25, 0],
      [659.25, 0.22],
      [783.99, 0.44],
    ],
    cycle: 2.6,
    noteLen: 0.8,
    wave: "triangle",
  },
  // Nabız: tek kısa vuruş
  pulse: {
    notes: [[660, 0]],
    cycle: 1.4,
    noteLen: 0.28,
    wave: "square",
  },
};

const DIAL_PATTERN = { notes: [[425, 0]] as Note[], cycle: 2, noteLen: 0.95, wave: "sine" as OscillatorType };

/**
 * Personal ringtone via a direct audio URL (mp3/ogg CDN link). Loops through
 * an <audio loop> element so `setSinkId` (output device) works — Web Audio
 * oscillators always play on the default output.
 */
function playUrlLoop(url: string): (() => void) | null {
  if (typeof window === "undefined" || !url) return null;
  try {
    const el = new Audio(url);
    el.loop = true;
    el.volume = 0.7;
    const sink = preferredSpeakerId();
    const applySink = async () => {
      if (!sink) return;
      const elWithSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      try {
        await elWithSink.setSinkId?.(sink);
      } catch {
        /* device gone / unsupported */
      }
    };
    void applySink();
    el.play().catch(() => {
      // Autoplay guard: retry on the next user gesture.
      const resume = () => {
        void el.play().catch(() => undefined);
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      };
      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
    });
    return () => {
      el.pause();
      el.src = "";
    };
  } catch {
    return null;
  }
}

/** Discord/Skype style loopable ring patterns via oscillator scheduling. */
function loopPattern(
  name: "ringtone" | "dialtone" | "ringback" | RingtoneId,
): (() => void) | null {
  const ac = audioCtx();
  if (!ac) return null;
  const master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);

  // Dial/back tones keep the plain DTMF-ish 425 Hz pulse; ringtones use the
  // user's selected preset. Custom URL loops take precedence in useCallSound.
  const preset =
    name === "dialtone" || name === "ringback"
      ? DIAL_PATTERN
      : name === "ringtone"
        ? RING_PATTERNS[ringtoneChoice()]
        : RING_PATTERNS[name];

  let stopped = false;
  let timer = 0;
  const schedule = () => {
    if (stopped) return;
    const t0 = ac.currentTime + 0.05;
    for (const [freq, offset] of preset.notes) {
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + preset.noteLen);
      gain.connect(master);
      const osc = ac.createOscillator();
      osc.type = preset.wave;
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + preset.noteLen + 0.05);
    }
    timer = window.setTimeout(schedule, preset.cycle * 1000);
  };
  schedule();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    try {
      master.disconnect();
    } catch {
      /* noop */
    }
  };
}

// ---------- Global sound event bus ----------

type Listener = (sound: SoundName) => void;
const listeners = new Set<Listener>();

/** Fire a UI sound from anywhere in the app. */
export function playSound(name: SoundName) {
  for (const l of listeners) l(name);
}

/** Start the user's chosen ringtone (custom URL wins; preset otherwise). */
export function startRingtone(): () => void {
  const custom = customRingtoneUrl();
  if (custom) {
    const stop = playUrlLoop(custom);
    if (stop) return stop;
  }
  return loopPattern("ringtone") ?? (() => undefined);
}

// ---------- React hooks ----------

/**
 * Looping call sounds driven by call state. `which` switches the pattern:
 * - "incoming": remote is ringing us (until accept/reject) — uses the user's
 *   selected ringtone (built-in preset or personal custom URL)
 * - "outgoing": we are ringing someone (until they accept)
 * - null: in-call or idle — everything stops
 */
export function useCallSound(which: "incoming" | "outgoing" | null) {
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stopRef.current?.();
    stopRef.current = null;
    if (!which) return;
    // Browsers gate audio until a user gesture; calls always start from a
    // click (Ara / Kabul Et), which unlocks the AudioContext.
    stopRef.current = which === "incoming" ? startRingtone() : (loopPattern("dialtone") ?? (() => undefined));
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [which]);
}

/** Non-looping UI sounds wired to the global bus (notification bip etc.). */
export function useSoundBus() {
  useEffect(() => {
    const listener: Listener = (sound) => {
      if (sound === "bip") playBip();
      else if (sound === "hangup") playHangup();
      else if (sound === "ringback") {
        const stop = loopPattern("ringback");
        if (stop) window.setTimeout(stop, 2500);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

export type { SoundName };
