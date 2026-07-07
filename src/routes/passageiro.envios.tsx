import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, PackageCheck, Send } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";

export const Route = createFileRoute("/passageiro/envios")({
  head: () => ({
    meta: [
      { title: "MOVVI Envios — Escolha como usar" },
      {
        name: "description",
        content:
          "Envie ou receba itens com o MOVVI Envios. Rápido, seguro e com preço transparente.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EnviosLanding,
});

function EnviosLanding() {
  return (
    <div className="min-h-dvh bg-background pb-28">
      <MovviHeader />
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pt-4">
        <header className="space-y-1 px-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Envios MOVVI
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Escolha como deseja usar o serviço.
          </p>
        </header>

        <div className="space-y-3">
          <EnviosOption
            to="/passageiro/app"
            search={{ envios: "enviar" as const }}
            icon={Send}
            title="Enviar"
            description="Enviar um item para outra pessoa."
            hint="Retirada no seu endereço, entrega no destino escolhido."
          />
          <EnviosOption
            to="/passageiro/app"
            search={{ envios: "receber" as const }}
            icon={PackageCheck}
            title="Receber"
            description="Receber um item de outro endereço."
            hint="Coleta em outro endereço, entrega no seu."
          />
        </div>

        <p className="px-1 text-[11.5px] leading-snug text-muted-foreground/80">
          MOVVI Envios é indicado para documentos e pequenos volumes. Para
          cargas maiores, use{" "}
          <Link to="/passageiro/app" className="font-semibold text-primary">
            MOVVI Fretes
          </Link>
          .
        </p>
      </main>
      <BottomNav items={PASSENGER_NAV} theme="dark" />
    </div>
  );
}

function EnviosOption({
  to,
  search,
  icon: Icon,
  title,
  description,
  hint,
}: {
  to: "/passageiro/app";
  search: { envios: "enviar" | "receber" };
  icon: typeof Send;
  title: string;
  description: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      search={search}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-[0_10px_28px_-18px_rgba(0,0,0,0.55)] transition-transform duration-200 ease-out active:scale-[0.98]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-bold leading-tight text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground/80">
          {description}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
          {hint}
        </p>
      </div>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        strokeWidth={2}
      />
    </Link>
  );
}
