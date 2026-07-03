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
          "Acesse o app MOVVI como passageiro, motorista ou administrador.",
      },
      { property: "og:title", content: "MOVVI — Acesso" },
      {
        property: "og:description",
        content: "Plataforma de mobilidade MOVVI.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-white text-[#0F172A]">
      {/* Decorative MOVVI green shapes */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-[#22C55E]/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-[#22C55E]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#22C55E]/40"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-12 pt-16">
        {/* Hero */}
        <header className="flex flex-col items-center gap-5 text-center animate-in fade-in slide-in-from-bottom-2 duration-700">
          <div className="rounded-3xl bg-[#0F172A] p-5 shadow-[0_20px_50px_-20px_rgba(34,197,94,0.55)]">
            <MovviLogo size={64} />
          </div>
          <div className="space-y-2">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#0F172A]">
              Bem-vindo à <span className="text-[#22C55E]">MOVVI</span>
            </h1>
            <p className="mx-auto max-w-[280px] text-[13.5px] leading-relaxed text-[#475569]">
              Mobilidade que move você. Escolha como deseja continuar.
            </p>
          </div>
        </header>

        {/* Cards */}
        <section
          className="mt-12 flex flex-col gap-4"
          aria-label="Selecione seu tipo de acesso"
        >
          <AccessCard
            to="/passageiro/login"
            title="Passageiro"
            description="Solicite carros, motos e fretes com poucos toques."
            icon={<User strokeWidth={1.75} className="h-6 w-6" />}
            variant="primary"
            delay="delay-100"
          />
          <AccessCard
            to="/motorista/login"
            title="Motorista"
            description="Dirija com a MOVVI e maximize seus ganhos."
            icon={<SteeringIcon />}
            variant="default"
            delay="delay-200"
          />
          <AccessCard
            to="/admin/login"
            title="Administrador"
            description="Acesso restrito à equipe MOVVI."
            icon={<Shield strokeWidth={1.75} className="h-6 w-6" />}
            variant="subtle"
            delay="delay-300"
          />
        </section>

        <footer className="mt-auto pt-12 text-center">
          <div className="mx-auto mb-3 h-px w-12 bg-[#E5E7EB]" />
          <div className="text-[11px] font-medium tracking-wide text-[#94A3B8]">
            © {new Date().getFullYear()} MOVVI DRIVE · Brasil
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
  variant,
  delay,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  variant: "primary" | "default" | "subtle";
  delay: string;
}) {
  const iconWrap =
    variant === "primary"
      ? "bg-[#22C55E] text-white shadow-[0_10px_24px_-10px_rgba(34,197,94,0.7)]"
      : variant === "default"
      ? "bg-[#0F172A] text-white"
      : "bg-[#F1F5F9] text-[#0F172A]";

  const ring =
    variant === "primary"
      ? "border-[#22C55E]/25 ring-1 ring-[#22C55E]/10"
      : "border-[#E5E7EB]";

  return (
    <Link
      to={to}
      className={`group relative flex min-h-[88px] w-full items-center gap-4 rounded-[24px] border bg-white p-5 shadow-[0_12px_36px_-20px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-20px_rgba(15,23,42,0.22)] active:scale-[0.985] animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ${delay} ${ring}`}
    >
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconWrap}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold leading-tight text-[#0F172A]">
          {title}
        </div>
        <div className="mt-1 text-[12.5px] leading-snug text-[#64748B]">
          {description}
        </div>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F8FAFC] text-[#0F172A] transition-all duration-300 group-hover:bg-[#22C55E] group-hover:text-white">
        <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
      </div>
    </Link>
  );
}

function SteeringIcon() {
  return (
    <svg
      width="24"
      height="24"
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
