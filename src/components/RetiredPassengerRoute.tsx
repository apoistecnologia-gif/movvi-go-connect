import { Link } from "@tanstack/react-router";

export function RetiredPassengerRoute({ title }: { title: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">APOIS CORRIDAS</p>
        <h1 className="mt-3 text-xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Esta antiga superfície de Passageiro foi retirada do repositório Motorista/Admin.
          O aplicativo Passageiro canônico é mantido e homologado separadamente.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
