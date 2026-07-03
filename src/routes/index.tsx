import { createFileRoute, Link } from "@tanstack/react-router";
import { MovviLogo } from "@/components/MovviLogo";
import { ArrowRight, Car, ShieldCheck, Star, MapPin, Download } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MOVVI — Mobilidade que move você" },
      {
        name: "description",
        content:
          "Plataforma brasileira de mobilidade. Segurança, preço justo e 100% da tarifa para quem dirige.",
      },
      { property: "og:title", content: "MOVVI — Mobilidade que move você" },
      {
        property: "og:description",
        content: "Carros, motos, fretes e envios em todo o Brasil.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-white text-[#111827] selection:bg-[#22C55E]/20">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#22C55E]/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/3 translate-y-1/3 rounded-full bg-[#22C55E]/8 blur-[100px]" />
      </div>

      {/* ===================== NAV ===================== */}
      <header className="relative z-10">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-5">
          <div className="flex min-w-0 items-center gap-2">
            <MovviLogo size={36} />
            <span className="truncate text-lg font-extrabold tracking-tight text-[#0F172A]">MOVVI</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/passageiro/login"
              className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-[#111827] transition hover:text-[#22C55E] sm:inline-flex"
            >
              Entrar
            </Link>
            <Link
              to="/motorista/login"
              className="rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#111827]"
            >
              Sou motorista
            </Link>
          </nav>
        </div>
      </header>

      {/* ===================== HERO ===================== */}
      <section className="relative z-10">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 px-6 py-16 lg:grid-cols-2 lg:py-24">
          {/* ---------------- LEFT ---------------- */}
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Brazil badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1">
              <div className="flex h-3 w-4 flex-col overflow-hidden rounded-[2px]">
                <div className="h-1/3 bg-[#009739]" />
                <div className="h-1/3 bg-[#FEDD00]" />
                <div className="h-1/3 bg-[#012169]" />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111827]">
                Disponível no Brasil
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-[#111827] sm:text-6xl lg:text-7xl">
              Mobilidade que <span className="text-[#22C55E]">move</span> você
            </h1>

            {/* Paragraph */}
            <p className="max-w-xl text-[17px] leading-relaxed text-[#475569]">
              A MOVVI conecta você aos melhores motoristas com segurança, preço justo e 100% da tarifa para quem dirige. O futuro da mobilidade urbana chegou.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/motorista/login"
                className="press-scale group inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-7 py-4 text-[15px] font-bold text-white shadow-[0_16px_36px_-14px_rgba(34,197,94,0.45)] transition hover:-translate-y-0.5 hover:brightness-[1.05]"
              >
                Seja motorista
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={2.2} />
              </Link>
              <Link
                to="/passageiro/login"
                className="press-scale inline-flex items-center gap-2 rounded-xl border-2 border-[#E5E7EB] bg-white px-7 py-4 text-[15px] font-bold text-[#111827] transition hover:border-[#111827]"
              >
                <Download className="h-4 w-4" strokeWidth={2} />
                Baixar o app
              </Link>
            </div>

            {/* Trust row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-[12.5px] text-[#475569]">
              <div className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-[#22C55E] text-[#22C55E]" />
                <span className="font-semibold text-[#111827]">4.9</span> · avaliação
              </div>
              <div className="h-3 w-px bg-[#E5E7EB]" />
              <div>
                <span className="font-semibold text-[#111827]">100%</span> da tarifa ao motorista
              </div>
              <div className="h-3 w-px bg-[#E5E7EB]" />
              <div>GPS em tempo real</div>
            </div>
          </div>

          {/* ---------------- RIGHT — device composition ---------------- */}
          <div className="relative flex items-center justify-center animate-in fade-in duration-1000">
            {/* Green ambient glow */}
            <div className="absolute h-[500px] w-[500px] rounded-full bg-[#22C55E]/10 blur-[100px]" />

            <div className="relative mx-auto aspect-[4/5] w-full max-w-[420px]">
              {/* --- Phone (back) : Driver dark UI --- */}
              <div className="absolute right-0 top-0 h-[460px] w-[230px] translate-x-2 overflow-hidden rounded-[40px] border-8 border-[#111827] bg-[#0F172A] shadow-[0_30px_60px_-20px_rgba(15,23,42,0.35)]">
                <div className="mx-auto mt-2 h-1.5 w-16 rounded-full bg-white/10" />
                <div className="flex flex-col gap-3 p-4 pt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-white/50">MOVVI Driver</div>
                  <div className="rounded-2xl bg-[#22C55E]/15 p-3 ring-1 ring-[#22C55E]/30">
                    <div className="text-[10px] font-medium text-white/60">Ganhos do dia</div>
                    <div className="mt-1 text-2xl font-extrabold tabular-nums text-[#22C55E]">R$ 348,90</div>
                  </div>
                  <div className="relative h-40 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
                    <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(#22C55E 1px, transparent 1px) 0 0/16px 16px" }} />
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#22C55E] shadow-[0_0_0_6px_rgba(34,197,94,0.25)]" />
                  </div>
                  <div className="mt-1 h-10 w-full rounded-xl bg-[#22C55E]" />
                </div>
              </div>

              {/* --- Phone (front) : Passenger light UI --- */}
              <div className="absolute bottom-0 left-0 z-10 h-[460px] w-[230px] -translate-x-2 translate-y-8 overflow-hidden rounded-[40px] border-8 border-[#111827] bg-[#0F172A] shadow-[0_40px_80px_-20px_rgba(15,23,42,0.45)]">
                <div className="mx-auto mt-2 h-1.5 w-16 rounded-full bg-black/20" />
                <div className="flex h-full flex-col gap-3 bg-white p-4 pt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#0F172A]/60">MOVVI</div>
                  <div className="relative h-56 overflow-hidden rounded-2xl bg-[#F1F5F9]">
                    <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(#0F172A 1px, transparent 1px) 0 0/14px 14px" }} />
                    {/* Route line */}
                    <div className="absolute left-4 right-4 top-1/2 h-[3px] -rotate-[10deg] rounded-full bg-[#22C55E] shadow-[0_0_16px_rgba(34,197,94,0.6)]" />
                    {/* Pins */}
                    <div className="absolute left-6 top-[46%] h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-[#111827] shadow" />
                    <div className="absolute right-6 top-[36%] h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-[#22C55E] shadow" />
                  </div>
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2 rounded-xl bg-[#F8FAFC] p-2.5 ring-1 ring-[#E5E7EB]">
                      <div className="h-2 w-2 rounded-full bg-[#111827]" />
                      <div className="h-2 w-24 rounded bg-[#E5E7EB]" />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-[#F8FAFC] p-2.5 ring-1 ring-[#E5E7EB]">
                      <div className="h-2 w-2 rounded-full bg-[#22C55E]" />
                      <div className="h-2 w-28 rounded bg-[#E5E7EB]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* --- Floating stat: rating --- */}
              <div className="absolute -left-8 top-16 z-20 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/85 p-3.5 shadow-[0_20px_40px_-16px_rgba(15,23,42,0.18)] backdrop-blur-xl float-slow">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#22C55E]">
                  <span className="text-[13px] font-extrabold text-white">4.9</span>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-medium text-[#475569]">Avaliação média</div>
                  <div className="text-[13px] font-bold text-[#111827]">Motoristas Premium</div>
                </div>
              </div>

              {/* --- Floating stat: 100% da tarifa (dark) --- */}
              <div className="absolute -right-8 bottom-40 z-20 rounded-2xl border border-white/10 bg-[#0F172A]/92 p-3.5 text-white shadow-[0_24px_48px_-16px_rgba(15,23,42,0.4)] backdrop-blur-xl float-slower">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/60">Ganhos</div>
                <div className="mt-1 text-lg font-extrabold text-[#22C55E]">100% da tarifa</div>
                <div className="mt-0.5 text-[10px] text-white/50">Exclusivo MOVVI Driver</div>
              </div>

              {/* --- Floating chip: GPS --- */}
              <div className="absolute -bottom-4 right-6 z-20 flex items-center gap-2 rounded-xl border border-white/60 bg-white/85 px-3 py-2 shadow-[0_16px_32px_-14px_rgba(15,23,42,0.2)] backdrop-blur-xl float-slow">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22C55E]" />
                </span>
                <span className="text-[11.5px] font-bold text-[#111827]">GPS em tempo real</span>
              </div>

              {/* --- Floating chip: city --- */}
              <div className="absolute -top-2 right-6 z-20 hidden items-center gap-1.5 rounded-full border border-white/60 bg-white/85 px-3 py-1.5 shadow backdrop-blur-xl float-slower sm:flex">
                <MapPin className="h-3 w-3 text-[#22C55E]" strokeWidth={2} />
                <span className="text-[11px] font-semibold text-[#111827]">Disponível na sua cidade</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== ACCESS CARDS ===================== */}
      <section className="relative z-10 border-t border-[#E5E7EB] bg-[#F8FAFC]">
        <div className="mx-auto w-full max-w-7xl px-6 py-14">
          <div className="flex flex-col items-start gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#22C55E]">Acessos</span>
            <h2 className="text-2xl font-extrabold tracking-tight text-[#0F172A] sm:text-3xl">Entre na plataforma</h2>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <HomeChoice
              to="/passageiro/login"
              title="Entrar como Passageiro"
              description="Solicite carros, motos e fretes."
              icon={<Car className="h-5 w-5" />}
              primary
            />
            <HomeChoice
              to="/motorista/login"
              title="Entrar como Motorista"
              description="Trabalhe com a MOVVI e aumente seus ganhos."
              icon={<DriverIcon />}
            />
            <HomeChoice
              to="/admin/login"
              title="Painel Administrativo"
              description="Acesso restrito à equipe MOVVI DRIVE."
              icon={<ShieldCheck className="h-5 w-5" />}
              subtle
            />
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#E5E7EB] bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 text-[12px] text-[#475569]">
          <span>© {new Date().getFullYear()} MOVVI DRIVE</span>
          <span className="hidden sm:inline">Mobilidade que move você</span>
        </div>
      </footer>

      {/* Local keyframes for slow float animation */}
      <style>{`
        @keyframes float-slow-kf { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-8px) } }
        @keyframes float-slower-kf { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-14px) } }
        .float-slow { animation: float-slow-kf 6s ease-in-out infinite; }
        .float-slower { animation: float-slower-kf 8s ease-in-out infinite; }
      `}</style>
    </main>
  );
}

function HomeChoice({
  to,
  title,
  description,
  icon,
  primary,
  subtle,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
  subtle?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group flex w-full items-center gap-4 rounded-2xl border bg-white p-5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-20px_rgba(15,23,42,0.25)] ${
        primary
          ? "border-[#22C55E]/30 ring-1 ring-[#22C55E]/10"
          : subtle
          ? "border-[#E5E7EB]"
          : "border-[#E5E7EB] hover:border-[#22C55E]/40"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          primary
            ? "bg-[#22C55E] text-white"
            : "bg-[#22C55E]/12 text-[#22C55E]"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-[#0F172A]">{title}</div>
        <div className="truncate text-[12.5px] text-[#475569]">{description}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#475569] transition group-hover:translate-x-1 group-hover:text-[#22C55E]" />
    </Link>
  );
}

function DriverIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 9.5V3.5" />
      <path d="M14.1 13.2l3.7 3.7" />
      <path d="M9.9 13.2l-3.7 3.7" />
    </svg>
  );
}
