import { createFileRoute, Link } from "@tanstack/react-router";
import { MovviHeader } from "@/components/MovviHeader";
import { ShieldCheck, Users, Car, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard Admin — MOVVI DRIVE" }] }),
  component: AdminDashboard,
});

const TILES = [
  { icon: Users, label: "Motoristas", desc: "Aprovação e gestão de motoristas." },
  { icon: Car, label: "Corridas", desc: "Monitoramento de corridas em tempo real." },
  { icon: BarChart3, label: "Métricas", desc: "Receita, conversão e performance." },
  { icon: ShieldCheck, label: "Configurações", desc: "Tarifas, comissões e regras." },
];

function AdminDashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-8">
        <div className="container mx-auto max-w-5xl">
          <header className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Painel Administrativo
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold">Visão Geral</h1>
            <p className="text-sm text-muted-foreground">
              Operação MOVVI DRIVE — dashboard em construção.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TILES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-display text-lg font-semibold">{label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
            Os módulos completos do painel chegam na próxima fase. Use o botão{" "}
            <Link to="/" className="text-primary hover:underline">
              Home
            </Link>{" "}
            ou Sair (no topo) para navegar a qualquer momento.
          </div>
        </div>
      </main>
    </div>
  );
}
