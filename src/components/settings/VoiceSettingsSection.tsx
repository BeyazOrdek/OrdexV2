import { BadgeCheck, Mic, Play, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  autoGainEnabled,
  customRingtoneUrl,
  echoCancellationEnabled,
  krispEnabled,
  pttKey,
  setAutoGainPref,
  setCustomRingtoneUrl,
  setEchoCancellationPref,
  setKrispPref,
  setPttKey,
  setPreferredMicId,
  setPreferredSpeakerId,
  setRingtoneChoice,
  setVoiceMode,
  voiceMode,
  type RingtoneId,
  type VoiceMode,
} from "@/lib/prefs";
import { startRingtone } from "@/lib/sounds";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

const RINGTONE_LABELS: { id: RingtoneId; label: string }[] = [
  { id: "ordex", label: "🔔 ÖRDEX (melodik)" },
  { id: "classic", label: "☎️ Klasik zil" },
  { id: "chime", label: "🔔 Çan" },
  { id: "pulse", label: "🫀 Nabız" },
];

function keyLabel(code: string) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = { Space: "Boşluk", ShiftLeft: "Sol Shift", ShiftRight: "Sağ Shift", ControlLeft: "Sol Ctrl", AltLeft: "Sol Alt" };
  return map[code] ?? code;
}

/**
 * Discord-style "Ses & Görüntü" settings: hardware device selection, Krisp
 * processing toggles, a live mic level bar, push-to-talk with key capture,
 * and call ringtone selection (built-in patterns + personal audio URL).
 */
export function VoiceSettingsSection() {
  // ---- Device lists (populate after mic permission via enumerateDevices) ----
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [spkId, setSpkId] = useState("");
  const [sinkSupported, setSinkSupported] = useState(false);

  // ---- Processing toggles ----
  const [krisp, setKrisp] = useState(krispEnabled());
  const [ec, setEc] = useState(echoCancellationEnabled());
  const [agc, setAgc] = useState(autoGainEnabled());

  // ---- Mic test visualizer ----
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const testStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);

  // ---- Push-to-talk ----
  const [mode, setMode] = useState<VoiceMode>(voiceMode());
  const [capturing, setCapturing] = useState(false);
  const [key, setKey] = useState(pttKey());

  // ---- Ringtone ----
  const [ring, setRing] = useState<RingtoneId>(localStorageRing());
  const [customUrl, setCustomUrl] = useState(customRingtoneUrl());
  const stopRingRef = useRef<(() => void) | null>(null);

  function localStorageRing(): RingtoneId {
    try {
      const v = localStorage.getItem("ordex:ringtone");
      return v === "classic" || v === "chime" || v === "pulse" ? v : "ordex";
    } catch {
      return "ordex";
    }
  }

  // Detect output-device switching support (Chrome/Edge: setSinkId).
  useEffect(() => {
    const probe = document.createElement("audio");
    setSinkSupported(typeof (probe as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === "function");
    return () => {
      // Cleanup on unmount: stop test + ring preview.
      stopMicTest();
      stopRingRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(
        devices
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Mikrofon ${i + 1}` })),
      );
      setSpeakers(
        devices
          .filter((d) => d.kind === "audiooutput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Hoparlör ${i + 1}` })),
      );
    } catch {
      /* enumeration unavailable */
    }
  }, []);

  // Populate with labels we already have; full labels arrive after permission
  // (the mic test requests it).
  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const stopMicTest = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setTesting(false);
    setLevel(0);
  }, []);

  const startMicTest = useCallback(async () => {
    if (testing) {
      stopMicTest();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Test uses the *saved* prefs so the bar reflects the real setup.
        audio: {
          deviceId: micId ? { exact: micId } : undefined,
          echoCancellation: krisp && ec,
          noiseSuppression: krisp,
          autoGainControl: krisp && agc,
        },
      });
      testStreamRef.current = stream;
      setTesting(true);
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(100, Math.round((rms / 40) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      await refreshDevices(); // permission granted → real device labels
    } catch {
      toast.error("Mikrofon testi başlatılamadı — izin verilmedi.");
      stopMicTest();
    }
  }, [testing, micId, krisp, ec, agc, refreshDevices, stopMicTest]);

  const testRingtone = () => {
    stopRingRef.current?.();
    stopRingRef.current = startRingtone();
    window.setTimeout(() => {
      stopRingRef.current?.();
      stopRingRef.current = null;
    }, 3000);
  };

  // ---- Push-to-talk key capture (modal-local; never global while typing here) ----
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code === "Escape" ? "Space" : e.code;
      setKey(code);
      setPttKey(code);
      setCapturing(false);
      toast.success(`Bas-Konuş tuşu: ${keyLabel(code)}`);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as never);
  }, [capturing]);

  return (
    <div className="space-y-5">
      {/* 🎙️ Input device */}
      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Mic className="size-3.5 text-[var(--ordex-accent)]" /> Giriş cihazı (Mikrofon)
        </p>
        <Select
          value={micId || "default"}
          onValueChange={(v) => {
            const id = v === "default" ? "" : v;
            setMicId(id);
            setPreferredMicId(id);
            if (id && testing) {
              stopMicTest();
              toast.info("Cihaz değişti — testi tekrar başlat.");
            }
          }}
        >
          <SelectTrigger className="ordex-inset h-9 w-full border-white/10 text-sm">
            <SelectValue placeholder="Varsayılan mikrofon" />
          </SelectTrigger>
          <SelectContent className="ordex-panel-2 border-white/10">
            <SelectItem value="default">Varsayılan sistem mikrofonu</SelectItem>
            {mics.map((d) => (
              <SelectItem key={d.deviceId} value={d.deviceId}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 📊 Live mic test bar */}
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            variant={testing ? "destructive" : "secondary"}
            className="h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
            onClick={() => void startMicTest()}
          >
            {testing ? <Square className="size-3" /> : <Play className="size-3" />}
            {testing ? "Durdur" : "Mikrofon testi"}
          </Button>
          <div className="ordex-inset h-2.5 flex-1 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-75",
                level > 85 ? "bg-red-400" : level > 60 ? "bg-amber-400" : "bg-emerald-500",
              )}
              style={{ width: `${level}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-[10px] text-zinc-500">{level}</span>
        </div>
        {testing && (
          <p className="mt-1 text-[10px] text-zinc-500">
            Konuş — yeşil bar ses seviyeni gösterir. Kırmızıya vuruyorsan mikrofonu uzaklaştır.
          </p>
        )}
      </section>

      {/* 🎧 Output device */}
      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Volume2 className="size-3.5 text-[var(--ordex-accent)]" /> Çıkış cihazı (Hoparlör/Kulaklık)
        </p>
        <Select
          value={spkId || "default"}
          disabled={!sinkSupported}
          onValueChange={(v) => {
            const id = v === "default" ? "" : v;
            setSpkId(id);
            setPreferredSpeakerId(id);
          }}
        >
          <SelectTrigger className="ordex-inset h-9 w-full border-white/10 text-sm">
            <SelectValue placeholder={sinkSupported ? "Varsayılan hoparlör" : "Tarayıcı desteklemiyor"} />
          </SelectTrigger>
          <SelectContent className="ordex-panel-2 border-white/10">
            <SelectItem value="default">Varsayılan sistem hoparlörü</SelectItem>
            {speakers.map((d) => (
              <SelectItem key={d.deviceId} value={d.deviceId}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!sinkSupported && (
          <p className="mt-1 text-[10px] text-zinc-600">
            Çıkış cihazı seçimi bu tarayıcıda desteklenmiyor (Chrome/Edge gerekir).
          </p>
        )}
      </section>

      {/* 🎛️ Krisp processing */}
      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <BadgeCheck className="size-3.5 text-[var(--ordex-accent)]" /> Ses işleme
        </p>
        <div className="space-y-1.5">
          <ToggleRow
            label="Krisp Gürültü Engelleme"
            desc="Yankı + ortam gürültüsü + otomatik kazanç ana anahtarı"
            checked={krisp}
            onChange={(v) => {
              setKrisp(v);
              setKrispPref(v);
            }}
          />
          <ToggleRow
            label="Yankı Engelleme (Echo Cancellation)"
            desc="Kulaklık kullanmıyorsan açık kalsın"
            checked={ec}
            disabled={!krisp}
            onChange={(v) => {
              setEc(v);
              setEchoCancellationPref(v);
            }}
          />
          <ToggleRow
            label="Otomatik Kazanç (Auto Gain)"
            desc="Mikrofon seviyeni otomatik dengeler"
            checked={agc}
            disabled={!krisp}
            onChange={(v) => {
              setAgc(v);
              setAutoGainPref(v);
            }}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-600">
          Değişiklikler bir sonraki sesli kanala katılışında uygulanır; kanaldayken Krisp düğmesi canlı yeniler.
        </p>
      </section>

      {/* 🗣️ Push-to-talk */}
      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          🗣️ Mikrofon modu
        </p>
        <RadioGroup
          value={mode}
          onValueChange={(v) => {
            setMode(v as VoiceMode);
            setVoiceMode(v as VoiceMode);
          }}
          className="gap-1.5"
        >
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
              mode === "voice" ? "border-[var(--ordex-accent)]/60 bg-[var(--ordex-accent-soft)]" : "ordex-inset border-white/10 hover:bg-white/5",
            )}
          >
            <RadioGroupItem value="voice" className="size-3.5" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-xs font-medium text-zinc-100">Açık Mikrofon</span>
              <span className="block text-[10px] text-zinc-500">Kanala girdiğin an mikrofonun açıktır</span>
            </span>
          </label>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
              mode === "ptt" ? "border-[var(--ordex-accent)]/60 bg-[var(--ordex-accent-soft)]" : "ordex-inset border-white/10 hover:bg-white/5",
            )}
          >
            <RadioGroupItem value="ptt" className="size-3.5" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-xs font-medium text-zinc-100">Bas-Konuş (Push-to-Talk)</span>
              <span className="block text-[10px] text-zinc-500">Sadece tuşa bastığın sürece konuşursun</span>
            </span>
            {mode === "ptt" && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setCapturing(true);
                }}
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors",
                  capturing
                    ? "animate-pulse border-[var(--ordex-accent)] bg-[var(--ordex-accent)]/20 text-white"
                    : "ordex-inset border-white/15 text-zinc-300 hover:bg-white/10",
                )}
              >
                {capturing ? "Tuşa bas…" : `⌨️ ${keyLabel(key)}`}
              </button>
            )}
          </label>
        </RadioGroup>
      </section>

      {/* 🔔 Ringtones */}
      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          🔔 Arama sesleri
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {RINGTONE_LABELS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!!customUrl.trim()}
              onClick={() => {
                setRing(r.id);
                setRingtoneChoice(r.id);
                testRingtone();
              }}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors disabled:opacity-40",
                !customUrl.trim() && ring === r.id
                  ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)] text-white"
                  : "ordex-inset border-white/10 text-zinc-300 hover:bg-white/5",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {/* Kişisel arama sesi: direkt ses URL'i */}
        <div className="mt-2 flex gap-2">
          <Input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="Kişisel arama sesi (mp3/ogg linki)…"
            className="ordex-inset h-8 min-w-0 flex-1 border-white/10 text-[11px]"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 px-2.5 text-[11px]"
            onClick={() => {
              const url = customUrl.trim();
              setCustomRingtoneUrl(url);
              if (url) {
                testRingtone();
                toast.success("Kişisel arama sesi kaydedildi.");
              } else {
                toast.info("Kişisel ses temizlendi — hazır zil geri geldi.");
              }
            }}
          >
            Kaydet & Test
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-zinc-600">
          Link girersen kişisel sesin çalar; silip Kaydet'e basarsan hazır ziller geri döner. (Not: tarayıcı
          güvenliği nedeniyle yalnızca doğrudan ses dosyası linkleri çalışır — YouTube sayfa linkleri değil.)
        </p>
        <Button size="sm" variant="ghost" className="mt-1 h-7 gap-1.5 px-2 text-[11px] text-zinc-400 hover:text-zinc-200" onClick={testRingtone}>
          <Play className="size-3" /> Seçili zili dinle (3 sn)
        </Button>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
        checked ? "border-emerald-500/30 bg-emerald-500/10" : "ordex-inset border-white/10",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("block text-xs font-medium", checked ? "text-emerald-300" : "text-zinc-200")}>{label}</span>
        <span className="block text-[10px] text-zinc-500">{desc}</span>
      </span>
      <span
        className={cn(
          "flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-emerald-500" : "bg-zinc-600",
        )}
      >
        <span className={cn("size-3 rounded-full bg-white transition-transform", checked && "translate-x-3")} />
      </span>
    </button>
  );
}
