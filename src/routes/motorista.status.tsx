import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MovviHeader } from "@/components/MovviHeader";
import { Clock, CheckCircle2, XCircle, ShieldAlert, Loader2, LogIn, UserX } from "lucide-react";

export const Route = createFileRoute("/motorista/status")({
  head: () => ({ meta: [{ title: "Status do Cadastro — MOVVI DRIVE" }] }),
  component: DriverStatusPage,
});

type Status = "em_analise" | "aprovado" | "reprovado" | "bloqueado";
type DisplayStatus = Status | "nao_encontrado";

const STATUS_META: Record<DisplayStatus, { label: string; icon: typeof Clock; tone: string; desc: string }> = {
  em_analise: {
    label: "Cadastro em análise",
    icon: Clock,
    tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    desc: "Recebemos seu cadastro. Nossa equipe analisará seus documentos em até 48h.",
  },
  aprovado: {
    label: "Cadastro aprovado",
    icon: CheckCircle2,
    tone: "bg-primary/15 text-primary border-primary/30",
    desc: "Você está aprovado! Acesse o app do motorista para começar a rodar.",
  },
  reprovado: {
    label: "Cadastro reprovado",
    icon: XCircle,
    tone: "bg-destructive/15 text-destructive border-destructive/30",
    desc: "Seu cadastro foi recusado. Entre em contato com o suporte para mais detalhes.",
  },
  bloqueado: {
    label: "Cadastro bloqueado",
    icon: ShieldAlert,
    tone: "bg-destructive/15 text-destructive border-destructive/30",
    desc: "Sua conta está bloqueada. Entre em contato com o suporte.",
  },
  nao_encontrado: {
    label: "Cadastro de motorista não encontrado",
    icon: UserX,
    tone: "bg-muted text-muted-foreground border-border",
    desc: "Cadastro de motorista não encontrado.",
  },
};

function DriverStatusPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DisplayStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchStatus() {
      const result = await loadDriverProfile();
      if (!mounted) return;
      if (!result.ok && result.reason === "no_session") {
        navigate({ to: "/motorista/login" });
        return;
      }
      if (result.ok) {
        setStatus(result.profile.approval_status as Status);
        setRejectionReason(result.profile.motivo_reprovacao ?? null);
      } else {
        setStatus("nao_encontrado");
        setRejectionReason(null);
      }
      setLoading(false);
    }

    fetchStatus();
    const ch = supabase
      .channel("driver-status-self")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "drivers" }, () =>
        fetchStatus(),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [navigate]);


  const meta = status ? STATUS_META[status] : null;
  const Icon = meta?.icon ?? Clock;

  async function switchAccount() {
    await supabase.auth.signOut();
    navigate({ to: "/motorista/login" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />

      <main className="flex-1 px-4 py-8">
        <div className="container mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Status do cadastro</CardTitle>
              <CardDescription>Acompanhe a análise do seu cadastro de motorista.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading || !meta ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    <div className={`rounded-full border p-4 ${meta.tone}`}>
                      <Icon className="h-10 w-10" />
                    </div>
                    <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                    <p className="max-w-md text-sm text-muted-foreground">{meta.desc}</p>
                    {status === "reprovado" && rejectionReason && (
                      <div className="w-full rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left text-sm text-destructive">
                        <strong className="block text-xs uppercase tracking-wide">Motivo</strong>
                        {rejectionReason}
                      </div>
                    )}
                  </div>


                  <div className="flex flex-col gap-2">
                    {status === "aprovado" && (
                      <Button asChild className="w-full">
                        <Link to="/motorista/app">Abrir app do motorista</Link>
                      </Button>
                    )}
                    <Button asChild variant="secondary" className="w-full">
                      <Link to="/">Voltar ao início</Link>
                    </Button>
                    <Button onClick={switchAccount} variant="outline" className="w-full">
                      <LogIn className="mr-2 h-4 w-4" />
                      Entrar com outra conta
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
