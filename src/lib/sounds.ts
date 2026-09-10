import { useEffect, useRef } from "react";

// ---------- ÖRDEX notification sounds (pure Web Audio API, no assets) ----------

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

/** Discord/Skype style loopable ring patterns via oscillator scheduling. */
function loopPattern(name: "ringtone" | "dialtone" | "ringback"): (() => void) | null {
  const ac = audioCtx();
  if (!ac) return null;
  const master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);

  // Melodic double-chirp ring for incoming calls…
  const notes =
    name === "ringtone"
      ? [
          [659.25, 0],
          [987.77, 0.18],
          [659.25, 0.72],
          [987.77, 0.9],
        ]
      : // …plain DTMF-ish 425 Hz pulse for dial/back tones.
        [[425, 0]];
  const cycle = name === "ringtone" ? 2.4 : 2;
  const noteLen = name === "ringtone" ? 0.55 : 0.95;

  let stopped = false;
  let timer = 0;
  const schedule = () => {
    if (stopped) return;
    const t0 = ac.currentTime + 0.05;
    for (const [freq, offset] of notes) {
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + noteLen);
      gain.connect(master);
      const osc = ac.createOscillator();
      osc.type = name === "ringtone" ? "triangle" : "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + noteLen + 0.05);
    }
    timer = window.setTimeout(schedule, cycle * 1000);
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

// ---------- React hooks ----------

/**
 * Looping call sounds driven by call state. `which` switches the pattern:
 * - "incoming": remote is ringing us (until accept/reject)
 * - "outgoing": we are ringing someone (until they accept)
 * - null: in-call or idle — everything stops
 */
export function useCallSound(which: "incoming" | "outgoing" | null) {
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stopRef.current?.();
    stopRef.current = null;
    if (!which) return;
    // Browsers gate audio until a user gesture; calling always starts from a
    // click (Ara / Kabul Et), which unlocks the AudioContext.
    stopRef.current = loopPattern(which === "incoming" ? "ringtone" : "dialtone");
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
