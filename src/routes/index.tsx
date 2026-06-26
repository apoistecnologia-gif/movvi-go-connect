import { createFileRoute, Link } from "@tanstack/react-router";
import { MovviLogo } from "@/components/MovviLogo";
import { Car, Bike, Truck, Wrench, Package, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MOVVI DRIVE — Mobilidade que move você" },
      { name: "description", content: "Solicite carros, motos, fretes, guincho e envios em todo o Brasil com a MOVVI DRIVE." },
      { property: "og:title", content: "MOVVI DRIVE — Mobilidade que move você" },
      { property: "og:description", content: "Plataforma profissional de mobilidade urbana brasileira." },
    ],
  }),
  component: Landing,
});

const CATEGORIES = [
  { icon: Car, label: "Carros" },
  { icon: Bike, label: "Motos" },
  { icon: Truck, label: "Fretes" },
  { icon: Wrench, label: "Guincho" },
  { icon: Package, label: "Envios" },
];

function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* glow de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% -10%, oklch(0.81 0.20 130 / 0.15), transparent 70%), radial-gradient(40% 40% at 80% 80%, oklch(0.66 0.20 130 / 0.10), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MovviLogoMark />
            <span className="font-display text-lg font-bold tracking-wide">
              MOVVI <span className="text-primary">DRIVE</span>
            </span>
          </div>
          <Link
            to="/map-test"
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary transition"
          >
            Diagnóstico do mapa
          </Link>
        </header>

        {/* Hero */}
        <section className="flex flex-1 flex-col items-center justify-center text-center py-16">
          <MovviLogo size={120} showTagline />

          <h1 className="mt-10 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            A mobilidade urbana do Brasil,{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              do seu jeito
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            Carros, motos, fretes, guincho e envios em uma única plataforma profissional —
            feita por brasileiros, para todo o Brasil.
          </p>

          {/* Categorias */}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {CATEGORIES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-full surface-card px-4 py-2 text-sm"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-12 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
            <ChoiceCard
              to="/passageiro/login"
              title="Sou Passageiro"
              description="Solicite uma corrida, frete ou envio em segundos."
              accent
            />
            <ChoiceCard
              to="/motorista/login"
              title="Sou Motorista"
              description="Trabalhe com a MOVVI e aumente seus ganhos."
            />
            <ChoiceCard
              to="/admin/login"
              title="Painel Administrativo"
              description="Acesso restrito à equipe MOVVI DRIVE."
              icon={<ShieldCheck className="h-4 w-4" />}
            />
          </div>
        </section>

        <footer className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} MOVVI DRIVE — Mobilidade que move você
        </footer>
      </div>
    </main>
  );
}

function ChoiceCard({
  to,
  title,
  description,
  accent,
  icon,
}: {
  to: string;
  title: string;
  description: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`group flex flex-col rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5 ${
        accent
          ? "border-primary/40 bg-gradient-to-br from-primary/15 to-secondary/5 hover:border-primary glow-primary"
          : "surface-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {icon ?? <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}

function MovviLogoMark() {
  return (
    <svg width={28} height={28} viewBox="0 0 120 120" aria-hidden>
      <path d="M18 100 L18 28 L40 28 L60 70 L60 100 Z" fill="white" />
      <path
        d="M60 28 Q100 28 100 64 Q100 100 60 100 L60 78 Q82 78 82 64 Q82 50 60 50 Z"
        fill="hsl(95 75% 51%)"
      />
    </svg>
  );
}
