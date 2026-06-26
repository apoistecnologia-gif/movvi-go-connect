import { createFileRoute, Link } from "@tanstack/react-router";
import { MovviHeader } from "@/components/MovviHeader";
import { AdminGuard } from "@/components/AdminGuard";
import { ShieldCheck, Users, Car, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard Admin — MOVVI DRIVE" }] }),
  component: () => (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  ),
});

const TILES = [
  {
    icon: Users,
    label: "Motoristas",
    desc: "Aprovação e gestão de motoristas.",
    to: "/admin/motoristas" as const,
  },
  { icon: Car, label: "Corridas", desc: "Em breve.", to: null },
  { icon: BarChart3, label: "Métricas", desc: "Em breve.", to: null },
  { icon: ShieldCheck, label: "Configurações", desc: "Em breve.", to: null },
];

function AdminDashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/admin/login" />
      <main className="flex-1 px-4 py-8">
        <div className="container mx-auto max-w-5xl">
          <header className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Painel Administrativo
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold">Visão Geral</h1>
            <p className="text-sm text-muted-foreground">Operação MOVVI DRIVE.</p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TILES.map(({ icon: Icon, label, desc, to }) => {
              const inner = (
                <>
                  <Icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-display text-lg font-semibold">{label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                </>
              );
              const base =
                "rounded-2xl border border-border bg-card p-5 transition text-left block";
              if (to) {
                return (
                  <Link
                    key={label}
                    to={to}
                    className={`${base} hover:border-primary hover:bg-card/80`}
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <div key={label} className={`${base} opacity-60`}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
