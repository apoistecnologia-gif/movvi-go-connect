import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, KeyRound, ScrollText } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/seguranca")({
  head: () => ({ meta: [{ title: "Segurança — APOIS" }] }),
  component: AdminSecurityPage,
});

type MfaStatus = {
  assurance: string;
  factors: number;
  error: boolean;
};

function AdminSecurityPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [level, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (!mounted) return;
      setStatus({
        assurance: level.data?.currentLevel ?? "indisponível",
        factors: factors.data?.totp?.filter((factor) => factor.status === "verified").length ?? 0,
        error: Boolean(level.error || factors.error),
      });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const authenticated = status?.assurance === "aal2" && !status.error;

  return (
    <AdminLayout title="Segurança" description="Verificação real das proteções de acesso administrativo.">
      <div className="grid max-w-3xl gap-5">
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {authenticated ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
            Autenticação multifator
          </h2>
          <p className="text-sm text-muted-foreground">
            O painel administrativo requer um segundo fator TOTP. O acesso somente
            é liberado depois que o Supabase Auth confirma o nível de autenticação AAL2.
          </p>
          {status === null ? (
            <p role="status" className="text-sm">Carregando estado da autenticação...</p>
          ) : status.error ? (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível consultar a situação do autenticador.
            </p>
          ) : (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p>Nível desta sessão: <strong>{status.assurance.toUpperCase()}</strong></p>
              <p>Dispositivos TOTP verificados: <strong>{status.factors}</strong></p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Guarde um segundo dispositivo autenticador como recuperação. Não compartilhe
            os códigos de verificação nem a chave secreta de cadastro.
          </p>
        </section>
        <section className="space-y-2 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="h-5 w-5" />
            Contas administrativas
          </h2>
          <p className="text-sm text-muted-foreground">
            Cada administrador precisa cadastrar seu próprio segundo fator.
            Não usem uma única senha ou um único autenticador compartilhado.
          </p>
        </section>
        <section className="space-y-2 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ScrollText className="h-5 w-5" />
            Auditoria de operações
          </h2>
          <p className="text-sm text-muted-foreground">
            Consulte os registros administrativos no painel de logs.
          </p>
          <a href="/admin/logs" className="text-sm font-medium text-primary underline">
            Abrir registros de auditoria
          </a>
        </section>
      </div>
    </AdminLayout>
  );
}
