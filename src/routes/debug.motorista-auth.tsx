import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { diagnosticarAuthMotorista } from "@/lib/driverAuth.functions";
import { isDevelopmentEnvironment } from "@/lib/environment";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DSButton,
  DSCard,
  DSCardContent,
  DSCardDescription,
  DSCardHeader,
  DSCardTitle,
  DSInput,
  DSLabel,
} from "@/design-system";

import { DevOrAdminGuard } from "@/components/DevOrAdminGuard";

export const Route = createFileRoute("/debug/motorista-auth")({
  head: () => ({
    meta: [
      { title: "Diagnóstico Auth Motorista — MOVVI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <DevOrAdminGuard>
      <DriverAuthDebugPage />
    </DevOrAdminGuard>
  ),
});

type DiagnosticResult = {
  auth_exists: boolean;
  driver_exists: boolean;
  auth_user_id: string | null;
  status: string | null;
  table: string;
  auth_link_field: string;
  related_profile_exists: boolean;
  related_profile_table: string;
  error: string | null;
};

function yesNo(value: boolean) {
  return value ? "Sim" : "Não";
}

function DriverAuthDebugPage() {
  const navigate = useNavigate();
  const runDiagnostic = useServerFn(diagnosticarAuthMotorista);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDevelopmentEnvironment()) void navigate({ to: "/" });
  }, [navigate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const form = new FormData(e.currentTarget);
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      const data = await runDiagnostic({ data: { email } });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao executar diagnóstico.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <DSCard>
          <DSCardHeader>
            <DSCardTitle>Diagnóstico temporário — Auth do motorista</DSCardTitle>
            <DSCardDescription>
              Verifica se o e-mail existe na autenticação e na tabela oficial de motoristas.
            </DSCardDescription>
          </DSCardHeader>
          <DSCardContent className="space-y-4">
            <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <DSLabel htmlFor="email">E-mail do motorista</DSLabel>
                <DSInput id="email" name="email" type="email" required placeholder="motorista@email.com" />
              </div>
              <DSButton type="submit" disabled={loading}>
                <Search className="mr-2 h-4 w-4" />
                {loading ? "Verificando..." : "Verificar"}
              </DSButton>
            </form>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result?.error && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>{result.error}</AlertDescription>
              </Alert>
            )}

            {result && !result.error && (
              <div className="overflow-hidden rounded-lg border border-border">
                <DiagnosticRow label="Existe no Auth?" value={yesNo(result.auth_exists)} />
                <DiagnosticRow label="Existe na tabela de motoristas?" value={yesNo(result.driver_exists)} />
                <DiagnosticRow label="auth_user_id" value={result.auth_user_id ?? "—"} />
                <DiagnosticRow label="Status" value={result.status ?? "—"} />
                <DiagnosticRow label="Tabela usada" value={result.table} />
                <DiagnosticRow label="Campo de ligação Auth → motorista" value={result.auth_link_field} />
                <DiagnosticRow label="Existe perfil relacionado?" value={yesNo(result.related_profile_exists)} />
                <DiagnosticRow label="Tabela de perfil relacionada" value={result.related_profile_table} />
              </div>
            )}
          </DSCardContent>
        </DSCard>
      </div>
    </div>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[220px_1fr]">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <span className="break-all text-sm text-foreground">{value}</span>
    </div>
  );
}