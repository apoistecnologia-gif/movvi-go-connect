import { Link } from "@tanstack/react-router";
import { MovviLogo } from "@/components/MovviLogo";
import { ArrowLeft } from "lucide-react";

interface ComingSoonRouteProps {
  title: string;
  description: string;
  phase: string;
}

/**
 * Placeholder usado nas rotas em construção das próximas fases da plataforma.
 * Garante navegação funcional desde o dia 1 sem dados fictícios na rota final.
 */
export function ComingSoonRoute({ title, description, phase }: ComingSoonRouteProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <Link
        to="/"
        className="absolute left-6 top-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Início
      </Link>

      <MovviLogo size={80} />

      <span className="mt-8 inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
        {phase}
      </span>
      <h1 className="mt-4 max-w-xl font-display text-3xl font-bold">{title}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{description}</p>

      <Link
        to="/"
        className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-glow transition-colors"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
