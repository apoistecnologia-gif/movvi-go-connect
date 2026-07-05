import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { DSBadge, DSButton, DSCard, DSCardContent, DSCardHeader, DSCardTitle, DSInput, DSTextarea, EmptyState } from "@/design-system";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { formatDate } from "@/lib/formatters";
import { sendAdminBroadcast } from "@/lib/adminNotifications.functions";
import { Bell } from "lucide-react";

function mapAdminError(msg: string): string {
  if (msg === "forbidden") return "Ação restrita a administradores.";
  if (msg === "no_recipients") return "Nenhum destinatário encontrado";
  if (msg === "too_many_recipients") return "Público muito grande para um único envio.";
  if (msg === "missing_filter") return "Preencha o filtro";
  if (/invalid_|^Required$|uuid/i.test(msg)) return "Dados inválidos.";
  return msg;
}

export const Route = createFileRoute("/admin/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Admin MOVVI" }] }),
  component: AdminNotificacoesPage,
});

type Audience = "all" | "drivers" | "passengers" | "city" | "category" | "driver" | "passenger";
type Broadcast = {
  id: string;
  title: string;
  body: string;
  audience_type: string;
  audience_filter: Record<string, unknown> | null;
  sent_at: string;
  delivery_count: number;
};

function AdminNotificacoesPage() {
  const sendFn = useServerFn(sendAdminBroadcast);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [hist, setHist] = useState<Broadcast[]>([]);

  async function refresh() {
    const { data, error } = await supabase
      .from("notifications_broadcast")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setHist((data ?? []) as Broadcast[]);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function send() {
    if (!title.trim() || !body.trim()) return toast.error("Título e mensagem são obrigatórios");
    if ((audience === "city" || audience === "category" || audience === "driver" || audience === "passenger") && !filter.trim())
      return toast.error("Preencha o filtro");
    setSending(true);
    try {
      const res = await sendFn({
        data: {
          title: title.trim(),
          body: body.trim(),
          audience,
          filter: filter.trim() || null,
        },
      });
      await logAdminAction({
        action: "notification.send",
        entity: "notifications_broadcast",
        after: { audience, recipients: res.delivered },
      });
      toast.success(`Enviado para ${res.delivered} usuários`);
      setTitle("");
      setBody("");
      setFilter("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminLayout title="Notificações" description="Envie comunicados a passageiros e motoristas">
      <DSCard className="border-border bg-card/60">
        <DSCardHeader>
          <DSCardTitle className="text-base">Novo broadcast</DSCardTitle>
        </DSCardHeader>
        <DSCardContent className="space-y-3">
          <DSInput placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <DSTextarea placeholder="Mensagem" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold uppercase tracking-widest text-muted-foreground">Público</span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="drivers">Todos os motoristas</option>
                <option value="passengers">Todos os passageiros</option>
                <option value="city">Por cidade</option>
                <option value="category">Por categoria (motorista)</option>
                <option value="driver">Motorista específico (auth_user_id)</option>
                <option value="passenger">Passageiro específico (auth_user_id)</option>
              </select>
            </label>
            {(audience === "city" || audience === "category" || audience === "driver" || audience === "passenger") && (
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                  {audience === "city" ? "Cidade" : audience === "category" ? "Categoria" : "ID do usuário"}
                </span>
                <DSInput value={filter} onChange={(e) => setFilter(e.target.value)} />
              </label>
            )}
          </div>
          <DSButton onClick={send} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </DSButton>
        </DSCardContent>
      </DSCard>

      <h3 className="mt-6 mb-2 text-sm font-semibold">Histórico</h3>
      <div className="space-y-2">
        {hist.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nenhuma notificação enviada"
            description="Envie o primeiro broadcast usando o formulário acima."
          />
        ) : (
          hist.map((h) => (
            <DSCard key={h.id} className="border-border bg-card/60">
              <DSCardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{h.title}</p>
                  <DSBadge variant="muted">
                    {h.audience_type} · {h.delivery_count}
                  </DSBadge>
                </div>
                <p className="text-xs text-muted-foreground">{h.body}</p>
                <p className="text-[10px] text-muted-foreground/70">{formatDate(h.sent_at)}</p>
              </DSCardContent>
            </DSCard>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
