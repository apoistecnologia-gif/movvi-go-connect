import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverProfile } from "@/lib/driverProfile";
import { MovviHeader } from "@/components/MovviHeader";
import { Clock, CheckCircle2, XCircle, ShieldAlert, Loader2, LogIn, UserX, FileCheck2, AlertTriangle } from "lucide-react";
import { DSButton, DSCard, DSCardContent, DSCardHeader, DSCardTitle, DSCardDescription } from "@/design-system";

export const Route = createFileRoute("/motorista/status")({
  head: () => ({ meta: [{ title: "Status do Cadastro — MOVVI DRIVE" }] }),
  component: DriverStatusPage,
});

type Status = "em_analise" | "aprovado" | "reprovado" | "bloqueado";
type DisplayStatus = Status | "nao_encontrado";

const STATUS_META: Record<DisplayStatus, { label: string; icon: typeof Clock; tone: string; desc: string }> = {
  em_analise: { label: "Em análise", icon: Clock, tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", desc: "Recebemos seu cadastro. Análise em até 48h." },
  aprovado: { label: "Aprovado", icon: CheckCircle2, tone: "bg-primary/15 text-primary border-primary/30", desc: "Você está aprovado!" },
  reprovado: { label: "Reprovado", icon: XCircle, tone: "bg-destructive/15 text-destructive border-destructive/30", desc: "Cadastro recusado." },
  bloqueado: { label: "Bloqueado", icon: ShieldAlert, tone: "bg-destructive/15 text-destructive border-destructive/30", desc: "Conta bloqueada — contate o suporte." },
  nao_encontrado: { label: "Não encontrado", icon: UserX, tone: "bg-muted text-muted-foreground border-border", desc: "Cadastro de motorista não encontrado." },
};

type DocRow = { id: string; type: string; status: string; expires_at: string | null; rejected_reason: string | null };

const DOC_LABELS: Record<string, string> = {
  cnh: "CNH",
  crlv: "CRLV (Documento do veículo)",
  selfie: "Selfie de validação",
  vehicle_photo: "Foto do veículo",
  insurance: "Apólice de seguro",
};

const DOC_STATUS_TONE: Record<string, string> = {
  approved: "bg-primary/15 text-primary border-primary/30",
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
};

type DocsSummary = {
  status: "pending_upload" | "pending_review" | "approved" | "rejected";
  uploaded: number;
};

function DriverStatusPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DisplayStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docsSummary, setDocsSummary] = useState<DocsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchAll() {
      const result = await loadDriverProfile();
      if (!mounted) return;
      if (!result.ok && result.reason === "no_session") { navigate({ to: "/motorista/login" }); return; }
      if (result.ok) {
        setStatus(result.profile.approval_status as Status);
        setRejectionReason(result.profile.motivo_reprovacao ?? null);
        const { data } = await supabase
          .from("driver_documents")
          .select("id,type,status,expires_at,rejected_reason")
          .eq("driver_id", result.profile.id);
        setDocs((data ?? []) as DocRow[]);

        const { data: docFields } = await supabase
          .from("drivers")
          .select("selfie_url,cnh_url,cnh_back_url,vehicle_document_url,documents_status")
          .eq("id", result.profile.id)
          .maybeSingle();
        if (docFields) {
          const uploaded =
            (docFields.selfie_url ? 1 : 0) +
            (docFields.cnh_url ? 1 : 0) +
            (docFields.cnh_back_url ? 1 : 0) +
            (docFields.vehicle_document_url ? 1 : 0);
          setDocsSummary({
            status: (docFields.documents_status as DocsSummary["status"]) ?? "pending_upload",
            uploaded,
          });
        }
      } else {
        setStatus("nao_encontrado");
      }
      setLoading(false);
    }
    fetchAll();
    const ch = supabase
      .channel("driver-status-self")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_documents" }, fetchAll)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [navigate]);

  const meta = status ? STATUS_META[status] : null;
  const Icon = meta?.icon ?? Clock;

  async function switchAccount() { await supabase.auth.signOut(); navigate({ to: "/motorista/login" }); }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-8">
        <div className="container mx-auto max-w-xl space-y-4">
          <DSCard>
            <DSCardHeader>
              <DSCardTitle className="text-2xl">Status do cadastro</DSCardTitle>
              <DSCardDescription>Acompanhe a análise do seu cadastro.</DSCardDescription>
            </DSCardHeader>
            <DSCardContent className="space-y-6">
              {loading || !meta ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <div className={`rounded-full border p-4 ${meta.tone}`}>
                      <Icon className="h-10 w-10" />
                    </div>
                    <DSBadge className={meta.tone}>{meta.label}</DSBadge>
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
                      <DSButton asChild className="w-full"><Link to="/motorista/app">Abrir app do motorista</Link></DSButton>
                    )}
                    <DSButton asChild variant="secondary" className="w-full"><Link to="/">Voltar ao início</Link></DSButton>
                    <DSButton onClick={switchAccount} variant="outline" className="w-full">
                      <LogIn className="mr-2 h-4 w-4" /> Entrar com outra conta
                    </DSButton>
                  </div>
                </>
              )}
            </DSCardContent>
          </DSCard>

          {!loading && docsSummary && docsSummary.status !== "approved" && (
            <DSCard className={docsSummary.uploaded < 4 ? "border-yellow-500/40 bg-yellow-500/5" : "border-primary/40 bg-primary/5"}>
              <DSCardContent className="flex items-start gap-3 py-4">
                <div className={`rounded-full p-2 ${docsSummary.uploaded < 4 ? "bg-yellow-500/15 text-yellow-400" : "bg-primary/15 text-primary"}`}>
                  {docsSummary.uploaded < 4 ? <AlertTriangle className="h-5 w-5" /> : <FileCheck2 className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {docsSummary.uploaded < 4
                      ? `Faltam ${4 - docsSummary.uploaded} de 4 documentos`
                      : docsSummary.status === "rejected"
                      ? "Documentos reprovados — reenvie"
                      : "Documentos em análise"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {docsSummary.uploaded < 4
                      ? "Complete o envio para liberar a análise da sua conta."
                      : "Assim que forem revisados, você será notificado."}
                  </p>
                  <div className="mt-3">
                    <DSButton asChild size="sm" variant={docsSummary.uploaded < 4 ? "default" : "secondary"}>
                      <Link to="/motorista/documentos">
                        {docsSummary.uploaded < 4 ? "Completar envio" : "Ver meus documentos"}
                      </Link>
                    </DSButton>
                  </div>
                </div>
              </DSCardContent>
            </DSCard>
          )}

          {!loading && status && status !== "nao_encontrado" && (
            <DSCard>
              <DSCardHeader>
                <DSCardTitle className="flex items-center gap-2 text-base">
                  <FileCheck2 className="h-4 w-4 text-primary" /> Meus documentos
                </DSCardTitle>
                <DSCardDescription>Validade e situação dos documentos cadastrados.</DSCardDescription>
              </DSCardHeader>
              <DSCardContent>
                {docs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum documento adicional registrado. A análise inicial usa os documentos enviados no cadastro.</p>
                ) : (
                  <ul className="space-y-2">
                    {docs.map((d) => {
                      const exp = d.expires_at ? new Date(d.expires_at) : null;
                      const daysLeft = exp ? Math.ceil((exp.getTime() - Date.now()) / 86400000) : null;
                      const expiringSoon = daysLeft != null && daysLeft <= 30 && daysLeft >= 0 && d.status !== "expired";
                      return (
                        <li key={d.id} className="rounded-lg border border-border bg-card/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{DOC_LABELS[d.type] ?? d.type}</p>
                            <DSBadge className={DOC_STATUS_TONE[d.status] ?? ""}>
                              {d.status}
                            </DSBadge>
                          </div>
                          {exp && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Vence em {exp.toLocaleDateString("pt-BR")}
                              {daysLeft != null && daysLeft >= 0 ? ` (${daysLeft} dia${daysLeft === 1 ? "" : "s"})` : ""}
                            </p>
                          )}
                          {expiringSoon && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-yellow-400">
                              <AlertTriangle className="h-3 w-3" /> Atualize antes do vencimento.
                            </p>
                          )}
                          {d.rejected_reason && (
                            <p className="mt-1 text-xs text-destructive">Motivo: {d.rejected_reason}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </DSCardContent>
            </DSCard>
          )}
        </div>
      </main>
    </div>
  );
}
