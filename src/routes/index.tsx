import { createFileRoute, Link } from "@tanstack/react-router";
import { MovviLogo } from "@/components/MovviLogo";
import { ArrowRight, Car, ShieldCheck, Steering } from "lucide-react";

// Steering icon may not exist in lucide-react; fallback handled below.

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MOVVI DRIVE — Mobilidade que move você" },
      {
        name: "description",
        content:
          "Plataforma profissional brasileira de mobilidade urbana. Entre como passageiro, motorista ou admin.",
      },
      { property: "og:title", content: "MOVVI DRIVE — Mobilidade que move você" },
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
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-background px-6 py-10">
      {/* glow de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.81 0.20 130 / 0.18), transparent 70%), radial-gradient(45% 45% at 80% 100%, oklch(0.66 0.20 130 / 0.10), transparent 70%)",
        }}
      />

      <div className="relative flex w-full max-w-md flex-1 flex-col items-center justify-center gap-10 py-6">
        {/* Logo + Slogan */}
        <div className="flex flex-col items-center text-center">
          <MovviLogo size={120} />
          <p className="mt-5 text-sm uppercase tracking-[0.3em] text-primary">
            Mobilidade que move você
          </p>
        </div>

        {/* Menu principal */}
        <div className="w-full space-y-3">
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

      <footer className="relative w-full max-w-md pt-6 text-center text-[11px] text-muted-foreground">
        <Link
          to="/map-test"
          className="mb-3 inline-block uppercase tracking-widest hover:text-primary"
        >
          Diagnóstico do mapa
        </Link>
        <div>© {new Date().getFullYear()} MOVVI DRIVE</div>
      </footer>
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
      className={`group flex w-full items-center gap-4 rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${
        primary
          ? "border-primary/40 bg-gradient-to-br from-primary/20 to-secondary/10 hover:border-primary glow-primary"
          : subtle
          ? "border-border/60 bg-card/50 hover:border-primary/40"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          primary
            ? "bg-primary text-primary-foreground"
            : "bg-primary/15 text-primary"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-base font-semibold text-foreground">
          {title}
        </div>
        <div className="truncate text-xs text-muted-foreground">{description}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}

function DriverIcon() {
  // Ícone simples de volante (svg inline para evitar dependência exata do lucide)
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

// Aviso ao TS para o import opcional de Steering (caso não exista no runtime atual)
void Steering;
