import { createFileRoute, Link } from "@tanstack/react-router";
import { MovviLogo } from "@/components/MovviLogo";
import { ArrowRight, Car, ShieldCheck } from "lucide-react";

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
    <main className="relative min-h-screen w-full bg-[#F8FAFC] text-[#111827]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-10 pt-12">
        <div className="flex flex-col items-center gap-3">
          <MovviLogo size={56} />
          <div className="text-lg font-extrabold tracking-tight text-[#0F172A]">
            MOVVI
          </div>
          <div className="text-[12.5px] text-[#475569]">Selecione seu acesso</div>
        </div>

        <div className="mt-10 flex flex-col gap-3">
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
            description="Trabalhe com a MOVVI."
            icon={<DriverIcon />}
          />
          <HomeChoice
            to="/admin/login"
            title="Painel Administrativo"
            description="Acesso restrito à equipe MOVVI."
            icon={<ShieldCheck className="h-5 w-5" />}
            subtle
          />
        </div>

        <div className="mt-auto pt-10 text-center text-[11px] text-[#475569]">
          © {new Date().getFullYear()} MOVVI DRIVE
        </div>
      </div>
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
      className={`group flex w-full items-center gap-4 rounded-2xl border bg-white p-4 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.2)] transition-all active:scale-[0.99] ${
        primary
          ? "border-[#22C55E]/30 ring-1 ring-[#22C55E]/10"
          : subtle
          ? "border-[#E5E7EB]"
          : "border-[#E5E7EB]"
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
      <ArrowRight className="h-4 w-4 shrink-0 text-[#475569] transition group-hover:translate-x-1" />
    </Link>
  );
}

function DriverIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 9.5V3.5" />
      <path d="M14.1 13.2l3.7 3.7" />
      <path d="M9.9 13.2l-3.7 3.7" />
    </svg>
  );
}
