import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MovviLogo } from "@/components/MovviLogo";
import { Clock, CheckCircle2, XCircle, ShieldAlert, Loader2 } from "lucide-react";

export const Route = createFileRoute("/motorista/status")({
  head: () => ({ meta: [{ title: "Status do Cadastro — MOVVI DRIVE" }] }),
  component: DriverStatusPage,
});

type Status = "pending_approval" | "approved" | "rejected" | "blocked";

const STATUS_META: Record<Status, { label: string; icon: typeof Clock; tone: string; desc: string }> = {
  pending_approval: {
    label: "Em análise",
    icon: Clock,
    tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    desc: "Recebemos seu cadastro. Nossa equipe analisará seus documentos em até 48h.",
  },
  approved: {
    label: "Aprovado",
    icon: CheckCircle2,
    tone: "bg-primary/15 text-primary border-primary/30",
    desc: "Você está aprovado! Acesse o app do motorista para começar a rodar.",
  },
  rejected: {
    label: "Recusado",
    icon: XCircle,
    tone: "bg-destructive/15 text-destructive border-destructive/30",
    desc: "Seu cadastro foi recusado. Entre em contato com o suporte para mais detalhes.",
  },
  blocked: {
    label: "Bloqueado",
    icon: ShieldAlert,
    tone: "bg-destructive/15 text-destructive border-destructive/30",
    desc: "Sua conta está bloqueada. Entre em contato com o suporte.",
  },
};

function DriverStatusPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        navigate({ to: "/motorista/login" });
        return;
      }
      const { data } = await supabase
        .from("drivers")
        .select("approval_status")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!mounted) return;
      setStatus((data?.approval_status as Status) ?? "pending_approval");
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const meta = status ? STATUS_META[status] : null;
  const Icon = meta?.icon ?? Clock;

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="container mx-auto max-w-xl px-4">
        <Link to="/" className="mb-6 inline-flex items-center gap-2">
          <MovviLogo className="h-8 w-auto" />
        </Link>

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
                  <Badge variant="outline" className={meta.tone}>
                    {meta.label}
                  </Badge>
                  <p className="max-w-md text-sm text-muted-foreground">{meta.desc}</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {status === "approved" ? (
                    <Button asChild className="flex-1">
                      <Link to="/motorista/app">Abrir app do motorista</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" className="flex-1">
                      <Link to="/">Voltar ao início</Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      navigate({ to: "/motorista/login" });
                    }}
                  >
                    Sair
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
