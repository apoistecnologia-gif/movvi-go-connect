import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { formatDate } from "@/lib/formatters";

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

  async function resolveRecipients(): Promise<string[]> {
    if (audience === "all") {
      const [d, p] = await Promise.all([
        supabase.from("drivers").select("user_id"),
        supabase.from("users").select("auth_user_id"),
      ]);
      const ids = new Set<string>();
      for (const r of (d.data ?? []) as { user_id: string }[]) r.user_id && ids.add(r.user_id);
      for (const r of (p.data ?? []) as { auth_user_id: string }[]) r.auth_user_id && ids.add(r.auth_user_id);
      return Array.from(ids);
    }
    if (audience === "drivers") {
      const { data } = await supabase.from("drivers").select("user_id");
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean);
    }
    if (audience === "passengers") {
      const { data } = await supabase.from("users").select("auth_user_id");
      return ((data ?? []) as { auth_user_id: string }[]).map((r) => r.auth_user_id).filter(Boolean);
    }
    if (audience === "city") {
      const [d, p] = await Promise.all([
        supabase.from("drivers").select("user_id").ilike("city", filter),
        supabase.from("users").select("auth_user_id").ilike("city", filter),
      ]);
      const ids = new Set<string>();
      for (const r of (d.data ?? []) as { user_id: string }[]) r.user_id && ids.add(r.user_id);
      for (const r of (p.data ?? []) as { auth_user_id: string }[]) r.auth_user_id && ids.add(r.auth_user_id);
      return Array.from(ids);
    }
    if (audience === "category") {
      const { data } = await supabase.from("drivers").select("user_id").eq("category", filter as never);
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean);
    }
    if (audience === "driver" || audience === "passenger") {
      return filter ? [filter] : [];
    }
    return [];
  }

  async function send() {
    if (!title.trim() || !body.trim()) return toast.error("Título e mensagem são obrigatórios");
    if ((audience === "city" || audience === "category" || audience === "driver" || audience === "passenger") && !filter.trim())
      return toast.error("Preencha o filtro");
    setSending(true);
    try {
      const recipients = await resolveRecipients();
      if (recipients.length === 0) {
        setSending(false);
        return toast.error("Nenhum destinatário encontrado");
      }
      // Apps (driver + passenger) leem de `notification_inbox`. Inserimos lá para que
      // o admin -> usuário chegue em tempo real nas duas pontas.
      const rows = recipients.map((user_id) => ({
        user_id,
        title,
        body,
        category: "admin",
        data: { audience, filter: filter || null },
      }));
      const { error } = await supabase.from("notification_inbox").insert(rows);
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("notifications_broadcast").insert({
        title,
        body,
        audience_type: audience,
        audience_filter: filter ? { value: filter } : null,
        sent_by: u?.user?.id ?? null,
        delivery_count: recipients.length,
      });
      await logAdminAction({ action: "notification.send", entity: "notifications_broadcast", after: { audience, recipients: recipients.length } });
      toast.success(`Enviado para ${recipients.length} usuários`);
      setTitle("");
      setBody("");
      setFilter("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminLayout title="Notificações" description="Envie comunicados a passageiros e motoristas">
      <Card className="border-border bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Novo broadcast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Mensagem" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
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
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} />
              </label>
            )}
          </div>
          <Button onClick={send} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </CardContent>
      </Card>

      <h3 className="mt-6 mb-2 text-sm font-semibold">Histórico</h3>
      <div className="space-y-2">
        {hist.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma notificação enviada ainda.</p>
        ) : (
          hist.map((h) => (
            <Card key={h.id} className="border-border bg-card/60">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{h.title}</p>
                  <Badge variant="outline">{h.audience_type} · {h.delivery_count}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{h.body}</p>
                <p className="text-[10px] text-muted-foreground/70">{formatDate(h.sent_at)}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
