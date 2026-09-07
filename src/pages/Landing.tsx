import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import {
  Clapperboard,
  Headphones,
  ListVideo,
  Link2,
  MessageSquareText,
  MonitorPlay,
  Play,
  Radio,
  SmilePlus,
  Users,
} from "lucide-react";
import { Link } from "react-router";

const fadeIn = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const appHref = isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#0b0c0e] text-zinc-200"
    >
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0b0c0e]/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-red-600 text-white">
              <Clapperboard className="size-4" />
            </span>
            <span className="text-lg font-black tracking-tight text-white">Senkron</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
            <a href="#ozellikler" className="transition-colors hover:text-white">Özellikler</a>
            <a href="#nasil" className="transition-colors hover:text-white">Nasıl çalışır</a>
          </nav>
          <Link
            to={appHref}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            Odaya gir
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(600px 300px at 50% -50px, rgba(220,38,38,0.18), transparent 70%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-20 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
            <Radio className="size-3.5" /> Senkron izleme + WebRTC sesli kanal
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
            Aynı anda izle.
            <br />
            <span className="bg-gradient-to-r from-red-500 to-rose-400 bg-clip-text text-transparent">
              Aynı anda konuş.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400">
            YouTube videolarını saniye saniye senkron oynat, WebRTC sesli kanalda sohbet et,
            canlı chat'te tepki ver ve GIF gönder — hepsi tek odada.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to={appHref}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-6 text-sm font-bold text-white transition-colors hover:bg-red-500 sm:w-auto"
            >
              <Play className="size-4" /> Ücretsiz başla
            </Link>
            <a
              href="#nasil"
              className="flex h-11 w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 px-6 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/10 sm:w-auto"
            >
              Nasıl çalışır?
            </a>
          </div>

          {/* Mock room */}
          <motion.div
            {...fadeIn}
            className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-[#131518] text-left shadow-2xl shadow-red-950/20"
          >
            <div className="flex h-72 sm:h-80">
              {/* left rail mock */}
              <div className="hidden w-40 shrink-0 flex-col gap-2 border-r border-white/5 p-3 sm:flex">
                <div className="h-7 rounded bg-black/40" />
                {["Film Gecesi", "Dizi Kulübü", "Müzik Odası"].map((n, i) => (
                  <div
                    key={n}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-[10px] ${i === 0 ? "bg-white/10 text-white" : "text-zinc-500"}`}
                  >
                    <span className="size-2 rounded-full bg-red-500/70" /> {n}
                  </div>
                ))}
              </div>
              {/* player mock */}
              <div className="relative min-w-0 flex-1 bg-black">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-red-600/15 text-red-500">
                    <MonitorPlay className="size-6" />
                  </span>
                  <p className="text-xs text-zinc-500">video herkeste aynı karede</p>
                </div>
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                  <Radio className="size-2.5" /> senkron
                </span>
                <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-[#131518] p-2">
                  <div className="h-1 w-full rounded bg-white/10">
                    <div className="h-1 w-1/3 rounded bg-red-600" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded bg-red-600 text-white">
                      <Play className="size-2.5" />
                    </span>
                    <div className="h-1.5 flex-1 rounded bg-black/40" />
                  </div>
                </div>
              </div>
              {/* right rail mock */}
              <div className="hidden w-44 shrink-0 flex-col border-l border-white/5 p-3 md:flex">
                <p className="pb-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                  Sesli kanal
                </p>
                {["Ayşe", "Mert", "Zeynep"].map((n) => (
                  <div key={n} className="flex items-center gap-2 py-1 text-[10px] text-zinc-300">
                    <span className="flex size-5 items-center justify-center rounded-full bg-red-500/80 text-[8px] font-bold text-white">
                      {n[0]}
                    </span>
                    {n}
                  </div>
                ))}
                <p className="pb-1 pt-3 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                  Sohbet
                </p>
                <div className="ml-auto h-4 w-20 rounded-lg bg-red-600/70" />
                <div className="mt-1 h-4 w-16 rounded-lg bg-white/10" />
                <div className="ml-auto mt-1 h-4 w-24 rounded-lg bg-red-600/70" />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="ozellikler" className="mx-auto w-full max-w-6xl px-4 py-16">
        <motion.div {...fadeIn}>
          <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
            İzleme partisi için her şey
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-zinc-500">
            Version 1 tam olarak şunu yapar: birlikte izleme ve birlikte konuşma. Fazlası yok, eksiği yok.
          </p>
        </motion.div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Radio,
              title: "Saniyelik senkron",
              desc: "YouTube IFrame API ile oynatma/duraklatma/seek tüm odada anında uygulanır; kayan kişi otomatik yakalanır.",
            },
            {
              icon: Headphones,
              title: "WebRTC sesli kanal",
              desc: "Mikrofonun P2P bağlanır; mikrofonu kapatınca stream durmaz, sadece track kapatılır.",
            },
            {
              icon: MessageSquareText,
              title: "Canlı sohbet",
              desc: "Mesajlar, emoji tepkileri ve Tenor GIF araması ile sohbet her zaman sıcak kalır.",
            },
            {
              icon: ListVideo,
              title: "Video kuyruğu",
              desc: "Linki kuyruğa at; sıradaki video bitince kendiliğinden başlar.",
            },
            {
              icon: Link2,
              title: "Direkt link oynatma",
              desc: "watch, youtu.be ve shorts linklerini yapıştır — oda herkeste başlatır.",
            },
            {
              icon: Users,
              title: "Herkese açık odalar",
              desc: "6 haneli kodla davet et ya da keşfet listesinden herkese açık odalara katıl.",
            },
          ].map((f) => (
            <motion.div key={f.title} {...fadeIn} className="rounded-xl border border-white/10 bg-[#131518] p-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-red-600/15 text-red-500">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-3 text-sm font-bold text-white">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="nasil" className="border-y border-white/5 bg-[#101114] py-16">
        <div className="mx-auto w-full max-w-6xl px-4">
          <motion.h2 {...fadeIn} className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Üç adımda parti başlat
          </motion.h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { n: "1", icon: Users, title: "Oda kur", desc: "Bir isim ver; 6 haneli kodun anında hazır." },
              { n: "2", icon: Link2, title: "Link at", desc: "YouTube linkini yapıştır, herkeste senkron başlar." },
              { n: "3", icon: SmilePlus, title: "Sese katıl", desc: "Mikrofonu aç, sohbet et, tepki ver — parti senin." },
            ].map((s) => (
              <motion.div
                key={s.n}
                {...fadeIn}
                className="relative rounded-xl border border-white/10 bg-[#131518] p-6 text-center"
              >
                <span className="absolute -top-3 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white">
                  {s.n}
                </span>
                <span className="mx-auto mt-2 flex size-11 items-center justify-center rounded-lg bg-white/5 text-zinc-200">
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-white">{s.title}</h3>
                <p className="mt-1 text-xs text-zinc-400">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center">
        <motion.div {...fadeIn}>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            Kumandayı eline al.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
            Bugün izlenecek film oylaması yarın konuşulmaz — aynı anda izleyin, şimdi konuşun.
          </p>
          <Link
            to={appHref}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-red-600 px-8 text-sm font-bold text-white transition-colors hover:bg-red-500"
          >
            <Play className="size-4" /> Odaya gir
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-red-600 text-white">
              <Clapperboard className="size-3.5" />
            </span>
            <span className="text-xs font-bold text-zinc-300">Senkron</span>
          </div>
          <p className="text-xs text-zinc-600">Birlikte izleme · WebRTC · YouTube Senkron</p>
        </div>
      </footer>
    </motion.div>
  );
}
