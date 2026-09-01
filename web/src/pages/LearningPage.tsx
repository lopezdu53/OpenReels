import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, Coins, HelpCircle, Sparkles, Target, Youtube } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { formatCop, formatUsd } from "@/lib/job-cost-preview";
import { cn } from "@/lib/utils";

const USD_COP = 3900;

type Pad = { d: number; h: number; m: number; s: number };

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

function splitMs(ms: number): Pad {
  const t = Math.max(0, ms);
  return {
    d: Math.floor(t / 86_400_000),
    h: Math.floor((t % 86_400_000) / 3_600_000),
    m: Math.floor((t % 3_600_000) / 60_000),
    s: Math.floor((t % 60_000) / 1000),
  };
}

const TERMS = [
  {
    id: "cpm",
    title: "CPM",
    sub: "Cost per mille",
    body: "Lo que el anunciante paga por cada 1.000 impresiones de anuncio. En Analytic usamos un CPM de nicho (heurística) porque YouTube no publica el CPM real de cada canal. Un Short de finanzas en EE.UU. suele tener CPM más alto que un meme en LATAM.",
  },
  {
    id: "rpm",
    title: "RPM",
    sub: "Revenue per mille",
    body: "Lo que TÚ recibes por 1.000 vistas del video. RPM < CPM porque no todas las vistas ven anuncio, hay fill rate, y YouTube se queda con su parte. Si ves RPM en Studio, ese es el número que importa para tu bolsillo.",
  },
  {
    id: "share",
    title: "Split 55 / 45",
    sub: "Tu parte vs YouTube",
    body: "En anuncios de formato largo YouTube dice que el creador se queda con ~55%. En Shorts el pool de anuncios se reparte ~45% al creador. Premium (suscripciones de YouTube) va a un pozo distinto: 30% neto de Premium clásico y 60% de Premium Lite, y de ese pozo otra vez 55% largo / 45% Shorts.",
  },
  {
    id: "ypp",
    title: "YPP",
    sub: "YouTube Partner Program",
    body: "El programa que te deja monetizar. Hoy (hasta 31 ene 2027) para anuncios/Premium piden 1.000 suscriptores y 4.000 horas de watch o 10M de vistas Shorts calificadas. El 1 feb 2027 esas cifras de watch/Shorts se duplican para quienes apliquen de nuevo.",
  },
  {
    id: "shorts-pool",
    title: "Shorts Creator Pool",
    sub: "10 millones / 90 días",
    body: "Desde feb 2027, para cobrar anuncios y suscripciones de Shorts necesitas 10M de vistas calificadas de Shorts en 90 días. Si estás en YPP pero no llegas, sigues cobrando long-form; los Shorts se quedan fuera de ese pozo hasta que cruzas el umbral.",
  },
  {
    id: "fan",
    title: "Fan funding",
    sub: "500 subs, no cambia",
    body: "Super Thanks, Super Chat, members, Shopping: el umbral de 500 suscriptores (y 3.000 horas o 3M Shorts) NO sube en 2027. Puedes monetizar con fans antes de desbloquear anuncios.",
  },
];

const QUIZ = [
  {
    q: "Si un anunciante paga CPM $8, ¿cuánto llega aprox. al creador en long-form por 1.000 impresiones de anuncio?",
    options: ["$8.00", "$4.40", "$3.60"],
    answer: 1,
    why: "55% de $8 = $4.40. El RPM real suele ser menor porque no todas las vistas ven anuncio.",
  },
  {
    q: "¿Qué umbral de Shorts pide YPP para anuncios a quien aplique desde el 1 feb 2027?",
    options: ["10 millones / 90 días", "20 millones / 90 días", "1 millón / 30 días"],
    answer: 1,
    why: "El blog de YouTube (10 ago 2026) duplica 10M → 20M para entrar a ads/Premium. El pool de Shorts aparte pide 10M/90d para cobrar Shorts.",
  },
  {
    q: "¿Cuál es el método que usamos en el Dashboard para construir el hábito?",
    options: ["1 video al mes", "4 Shorts al día", "10 lives por semana"],
    answer: 1,
    why: "Cuatro piezas diarias: volumen constante vence al video “perfecto” que nunca sale.",
  },
];

export function LearningPage() {
  const api = useApi();
  const [changeAt, setChangeAt] = useState(() => Date.UTC(2027, 1, 1, 0, 0, 0));
  const [now, setNow] = useState(Date.now());
  const [openTerm, setOpenTerm] = useState("cpm");
  const [views, setViews] = useState(250_000);
  const [cpm, setCpm] = useState(4.5);
  const [quizI, setQuizI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .learningYpp()
      .then((d) => {
        const iso = d.countdown?.targetIso ?? d.changeDate;
        if (iso) setChangeAt(new Date(iso).getTime());
      })
      .catch(() => {});
  }, [api]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const left = splitMs(changeAt - now);
  const passed = now >= changeAt;
  const est = (views / 1000) * cpm * 0.55;
  const quiz = QUIZ[quizI];

  const daysTotal = useMemo(() => {
    const start = Date.UTC(2026, 7, 10);
    return Math.max(1, Math.round((changeAt - start) / 86_400_000));
  }, [changeAt]);
  const daysGone = Math.min(daysTotal, Math.max(0, Math.round((now - Date.UTC(2026, 7, 10)) / 86_400_000)));
  const pct = Math.round((daysGone / daysTotal) * 100);

  return (
    <div className="space-y-8 py-8 px-4 sm:px-10 max-w-[1100px]">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Learning</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Cómo te paga YouTube</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Nada de copy-paste. Toca, calcula y cuenta atrás hasta el 1 de febrero de 2027 — el día en que
          cambian las reglas del Partner Program.
        </p>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-background to-background p-6 md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <Clock className="h-4 w-4" />
          Cuenta regresiva · YPP 2027
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {passed
            ? "Las reglas nuevas ya están activas (1 feb 2027)."
            : "Queda esto para que entren en vigor los umbrales duplicados de ads / Premium."}
        </p>
        <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-4">
          {(
            [
              [left.d, "días"],
              [left.h, "horas"],
              [left.m, "min"],
              [left.s, "seg"],
            ] as const
          ).map(([n, label]) => (
            <div key={label} className="rounded-xl border border-border/60 bg-background/80 px-2 py-4 text-center">
              <p className="text-3xl font-bold tabular-nums sm:text-5xl">{pad(n)}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Anuncio YouTube · 10 ago 2026</span>
            <span>{Math.min(100, pct)}% del camino a feb 2027</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
        <a
          href="https://blog.youtube/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn/"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs text-primary underline-offset-2 hover:underline"
        >
          Fuente: blog oficial de YouTube →
        </a>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-4 w-4 text-primary" /> Hoy vs 1 feb 2027
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 font-medium">Regla</th>
                  <th className="pb-2 font-medium">Hasta 31 ene 2027</th>
                  <th className="pb-2 font-medium">Desde 1 feb 2027</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-2 pr-2">Subs (ads / Premium)</td>
                  <td>1.000</td>
                  <td>1.000 (igual)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Watch hours / 365d</td>
                  <td>4.000</td>
                  <td className="font-semibold text-amber-300">8.000</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Shorts views / 90d</td>
                  <td>10 millones</td>
                  <td className="font-semibold text-amber-300">20 millones</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Fan funding / Shopping</td>
                  <td>500 subs</td>
                  <td>500 (no cambia)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Shorts ads (ya en YPP)</td>
                  <td>con el programa</td>
                  <td className="font-semibold text-amber-300">10M Shorts / 90d</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Quien ya está en YPP no lo echan por el umbral nuevo. Tiene hasta el 31 ene 2027 para aceptar los
            términos. Quien aplique después, juega con las cifras altas.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Youtube className="h-4 w-4 text-primary" /> De dónde sale la plata
          </h2>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="rounded-lg bg-muted/40 p-3">
              <span className="font-semibold">1. Anuncios.</span> YouTube cobra al brand → se queda un corte → tú
              recibes ~55% (largo) o ~45% (Shorts del pozo).
            </li>
            <li className="rounded-lg bg-muted/40 p-3">
              <span className="font-semibold">2. Premium.</span> La cuota del suscriptor entra a un pozo (30% Premium
              / 60% Lite) y se reparte según watch time, otra vez 55/45.
            </li>
            <li className="rounded-lg bg-muted/40 p-3">
              <span className="font-semibold">3. Fans.</span> Super Thanks, members, Shopping. Umbral bajo (500). No
              depende del CPM.
            </li>
          </ol>
          <Link to="/dashboard" className="mt-4 inline-flex text-sm text-primary hover:underline">
            Tu meta: 4 videos al día en el Dashboard →
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <HelpCircle className="h-4 w-4 text-primary" /> Glosario — toca una ficha
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TERMS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenTerm(t.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                openTerm === t.id
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-card hover:border-primary/40",
              )}
            >
              <p className="text-lg font-bold">{t.title}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.sub}</p>
              {openTerm === t.id && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.body}</p>}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Coins className="h-4 w-4 text-primary" /> Calculadora CPM → tu bolsillo
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Misma fórmula que Analytic: (vistas / 1.000) × CPM × 55%. Es una cota alta: asume que cada vista “vale”
          una impresión de anuncio.
        </p>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Vistas del video · {views.toLocaleString()}</label>
            <input
              type="range"
              min={1000}
              max={5_000_000}
              step={1000}
              value={views}
              onChange={(e) => setViews(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
            <label className="mt-4 block text-xs text-muted-foreground">CPM de nicho · ${cpm.toFixed(2)}</label>
            <input
              type="range"
              min={0.5}
              max={18}
              step={0.1}
              value={cpm}
              onChange={(e) => setCpm(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </div>
          <div className="flex flex-col justify-center rounded-xl bg-muted/40 p-5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimado creador (55%)</p>
            <p className="mt-1 text-4xl font-bold">{formatUsd(est)}</p>
            <p className="text-sm text-muted-foreground">{formatCop(est * USD_COP)}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              YouTube se queda ≈ {formatUsd((views / 1000) * cpm * 0.45)} en este modelo de long-form.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Mini quiz
        </h2>
        {done ? (
          <div className="mt-4 text-center">
            <p className="text-3xl font-bold">
              {score} / {QUIZ.length}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {score === QUIZ.length
                ? "Listo. Ahora ve al Dashboard y cierra los 4 del día."
                : "Repasa el glosario y vuelve a intentarlo."}
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => {
                setQuizI(0);
                setPicked(null);
                setScore(0);
                setDone(false);
              }}
            >
              Otra ronda
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">
              Pregunta {quizI + 1} / {QUIZ.length}
            </p>
            <p className="mt-2 font-medium">{quiz.q}</p>
            <div className="mt-3 space-y-2">
              {quiz.options.map((opt, i) => {
                const show = picked !== null;
                const ok = i === quiz.answer;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={picked !== null}
                    onClick={() => {
                      setPicked(i);
                      if (i === quiz.answer) setScore((s) => s + 1);
                    }}
                    className={cn(
                      "block w-full rounded-lg border px-3 py-2 text-left text-sm",
                      !show && "border-border hover:border-primary/50",
                      show && ok && "border-emerald-500/50 bg-emerald-500/10",
                      show && picked === i && !ok && "border-destructive/50 bg-destructive/10",
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">{quiz.why}</p>
                <button
                  type="button"
                  className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  onClick={() => {
                    if (quizI + 1 >= QUIZ.length) setDone(true);
                    else {
                      setQuizI((n) => n + 1);
                      setPicked(null);
                    }
                  }}
                >
                  {quizI + 1 >= QUIZ.length ? "Ver puntaje" : "Siguiente"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        Cifras de umbrales: YouTube, 10 de agosto de 2026. CPM de Analytic es heurística de nicho, no un dato de Studio.
      </p>
    </div>
  );
}
