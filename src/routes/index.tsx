import { createFileRoute, Link } from "@tanstack/react-router";
import { MovviLogo } from "@/components/MovviLogo";
import { ArrowUpRight, User, Shield } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MOVVI — Acesso" },
      {
        name: "description",
        content:
          "A plataforma brasileira de mobilidade que conecta passageiros, motoristas e serviços com rapidez, segurança e tecnologia.",
      },
      { property: "og:title", content: "MOVVI — Acesso" },
      {
        property: "og:description",
        content:
          "Plataforma brasileira de mobilidade. Acesse como passageiro, motorista ou administrador.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-white text-[#0F172A]">
      {/* Ultra-subtle decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-32 h-[420px] w-[420px] rounded-full bg-[#22C55E]/[0.06] blur-3xl" />
        <div className="absolute -bottom-48 -left-32 h-[460px] w-[460px] rounded-full bg-[#22C55E]/[0.05] blur-3xl" />
        {/* Ultra-light route line */}
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.05]"
          viewBox="0 0 400 800"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M-20 640 Q120 540 200 580 T440 480"
            stroke="#22C55E"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <path
            d="M-40 120 Q140 200 240 160 T460 240"
            stroke="#0F172A"
            strokeWidth="1"
            strokeDasharray="3 7"
            strokeLinecap="round"
          />
        </svg>
        {/* Faint location pins */}
        <div className="absolute top-[18%] right-[12%] h-1.5 w-1.5 rounded-full bg-[#22C55E]/25" />
        <div className="absolute top-[72%] left-[14%] h-1.5 w-1.5 rounded-full bg-[#0F172A]/15" />
        <div className="absolute top-[40%] left-[8%] h-1 w-1 rounded-full bg-[#22C55E]/20" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-14">
        {/* Hero */}
        <header className="flex flex-col items-center text-center">
          <div
            className="animate-in fade-in duration-500 fill-mode-both"
            style={{ animationDelay: "0ms" }}
          >
            <div className="rounded-3xl bg-[#0F172A] p-4 shadow-[0_18px_44px_-22px_rgba(34,197,94,0.55)]">
              <MovviLogo size={52} />
            </div>
          </div>

          <h1
            className="mt-10 text-[36px] font-bold leading-[1.05] tracking-tight text-[#0F172A] animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
            style={{ animationDelay: "80ms" }}
          >
            Bem-vindo à <span className="text-[#22C55E]">MOVVI</span>
          </h1>

          <p
            className="mt-4 max-w-[320px] text-[13.5px] leading-[1.55] text-[#64748B] animate-in fade-in duration-500 fill-mode-both"
            style={{ animationDelay: "160ms" }}
          >
            A plataforma brasileira de mobilidade feita para conectar
            passageiros, motoristas e serviços com rapidez, segurança e
            tecnologia.
          </p>
        </header>

        {/* Cards */}
        <section
          className="mt-12 flex flex-col gap-3.5"
          aria-label="Selecione seu tipo de acesso"
        >
          <AccessCard
            to="/passageiro/login"
            title="Passageiro"
            description="Solicite corridas com rapidez e segurança."
            icon={<User strokeWidth={1.75} className="h-5 w-5" />}
            primary
            delay={240}
          />
          <AccessCard
            to="/motorista/login"
            title="Motorista"
            description="Receba chamadas e amplie seus ganhos."
            icon={<SteeringIcon />}
            delay={320}
          />
          <AccessCard
            to="/admin/login"
            title="Administrador"
            description="Gestão e monitoramento da plataforma."
            icon={<Shield strokeWidth={1.75} className="h-5 w-5" />}
            delay={400}
          />
        </section>

        <footer
          className="mt-auto pt-14 text-center animate-in fade-in duration-500 fill-mode-both"
          style={{ animationDelay: "520ms" }}
        >
          <div className="mx-auto mb-3 h-px w-10 bg-[#E5E7EB]" />
          <div className="text-[11.5px] font-medium tracking-wide text-[#94A3B8]/80">
            Versão 1.0 · © {new Date().getFullYear()} MOVVI Tecnologia
          </div>
        </footer>
      </div>
    </main>
  );
}

function AccessCard({
  to,
  title,
  description,
  icon,
  primary = false,
  delay,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
  delay: number;
}) {
  const border = primary
    ? "border-[#22C55E]/40 ring-1 ring-[#22C55E]/10"
    : "border-[#EEF1F5]";
  const shadow = primary
    ? "shadow-[0_18px_44px_-22px_rgba(34,197,94,0.35)]"
    : "shadow-[0_10px_30px_-22px_rgba(15,23,42,0.18)]";

  return (
    <Link
      to={to}
      style={{ animationDelay: `${delay}ms` }}
      className={`group relative flex min-h-[72px] w-full items-center gap-4 rounded-[28px] border bg-white px-5 py-5 transition-all ease-out will-change-transform hover:-translate-y-[1px] hover:shadow-[0_20px_48px_-22px_rgba(15,23,42,0.22)] active:scale-[1.02] animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${border} ${shadow}`}
    >
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#22C55E]/10 text-[#16A34A]"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold leading-tight text-[#0F172A]">
          {title}
        </div>
        <div className="mt-1 text-[12.5px] leading-snug text-[#64748B]">
          {description}
        </div>
      </div>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-[#CBD5E1] transition-colors group-hover:text-[#22C55E]"
        strokeWidth={1.75}
      />

      <style>{`
        a { transition-duration: 220ms; }
      `}</style>
    </Link>
  );
}

function SteeringIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.25" />
      <path d="M12 9.75V3.25" />
      <path d="M14.05 13.2l4.7 4.7" />
      <path d="M9.95 13.2l-4.7 4.7" />
    </svg>
  );
}
