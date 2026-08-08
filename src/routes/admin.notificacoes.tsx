import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DSBadge, DSButton, DSCard, DSCardContent, DSCardHeader, DSCardTitle, DSInput, DSTextarea, EmptyState } from "@/design-system";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { getAdminNotificationHistory, sendAdminBroadcast } from "@/lib/adminNotifications.functions";

function mapAdminError(msg: string): string {
  if (msg === "forbidden") return "Ação não autorizada para esta função administrativa.";
  if (msg === "no_recipients") return "Nenhum destinatário encontrado.";
  if (msg === "too_many_recipients") return "Público muito grande para um único envio.";
  if (msg === "missing_filter") return "Preencha o filtro.";
  if (/invalid_|^Required$|uuid/i.test(msg)) return "Dados inválidos.";
  return msg;
}

export const Route = createFileRoute("/admin/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Admin APOIS" }] }),
  component: AdminNotificacoesPage,
});

type Audience = "all" | "drivers" | "passengers" | "city" | "category" | "driver" | "passenger";
type HistoryRow = Awaited<ReturnType<typeof getAdminNotificationHistory>>[number];

function AdminNotificacoesPage() {
  const sendFn = useServerFn(sendAdminBroadcast);
  const historyFn = useServerFn(getAdminNotificationHistory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  async function refresh() {
    setLoadingHistory(true);
    try {
      setHistory(await historyFn({}));
    } catch (error) {
      setHistory([]);
      toast.error(error instanceof Error ? mapAdminError(error.message) : "Não foi possível carregar os logs de entrega.");
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function send() {
    if (!title.trim() || !body.trim()) return toast.error("Título e mensagem são obrigatórios.");
    if (["city", "category", "driver", "passenger"].includes(audience) && !filter.trim()) {
      return toast.error("Preencha o filtro.");
    }
    setSending(true);
    try {
      const res = await sendFn({
        data: { title: title.trim(), body: body.trim(), audience, filter: filter.trim() || null },
      });
      if (res.sent > 0) toast.success(`${res.sent} push(es) confirmado(s) pelo Firebase.`);
      else if (res.noTokens > 0) toast.warning(`Nenhum push entregue: ${res.noTokens} destinatário(s) sem token ativo.`);
      else if (res.suppressed > 0) toast.info(`Envio suprimido pelas preferências de ${res.suppressed} usuário(s).`);
      else toast.info("O mecanismo não confirmou entrega para nenhum dispositivo.");
      setTitle("");
      setBody("");
      setFilter("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? mapAdminError(e.message) : String(e));
    } finally {
      setSending(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; body: string | null; at: string; sent: number; failed: number; noToken: number; suppressed: number }>();
    for (const row of history) {
      const key = `${row.title}|${row.body ?? ""}|${row.created_at.slice(0, 16)}`;
      const current = map.get(key) ?? { title: row.title, body: row.body, at: row.created_at, sent: 0, failed: 0, noToken: 0, suppressed: 0 };
      if (row.status === "sent") current.sent += 1;
      else if (row.status === "failed") current.failed += 1;
      else if (row.status === "no_token") current.noToken += 1;
      else current.suppressed += 1;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [history]);

  return (
    <AdminLayout title="Notificações" description="Comunicados operacionais enviados pelo mecanismo FCM canônico">
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Entrega real, não apenas registro em tabela</p>
            <p className="mt-1">
              Esta tela delega o envio ao Edge Function FCM canônico e exibe o resultado registrado em notification_logs. O número mostrado como enviado representa push aceito pelo Firebase, não quantidade de linhas inseridas localmente.
            </p>
          </div>
        </DSCardContent>
      </DSCard>

      <DSCard>
        <DSCardHeader><DSCardTitle className="text-base">Novo comunicado operacional</DSCardTitle></DSCardHeader>
        <DSCardContent className="space-y-3">
          <DSInput placeholder="Título" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
          <DSTextarea placeholder="Mensagem" rows={4} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold uppercase tracking-widest text-muted-foreground">Público</span>
              <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="all">Todos os perfis ativos</option>
                <option value="drivers">Motoristas</option>
                <option value="passengers">Passageiros</option>
                <option value="city">Por cidade</option>
                <option value="category">Motoristas por categoria</option>
                <option value="driver">Motorista específico</option>
                <option value="passenger">Passageiro específico</option>
              </select>
            </label>
            {["city", "category", "driver", "passenger"].includes(audience) && (
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                  {audience === "city" ? "Cidade" : audience === "category" ? "Categoria" : "ID canônico ou Auth ID"}
                </span>
                <DSInput value={filter} onChange={(e) => setFilter(e.target.value)} />
              </label>
            )}
          </div>
          <DSButton onClick={() => void send()} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
          </DSButton>
          <p className="text-xs text-muted-foreground">Este canal é operacional e respeita as preferências de atualizações do usuário aplicadas pelo mecanismo de push.</p>
        </DSCardContent>
      </DSCard>

      <div className="mt-6 mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Logs de entrega</h3>
        <DSButton variant="ghost" size="sm" onClick={() => void refresh()} disabled={loadingHistory} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${loadingHistory ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      </div>
      {grouped.length === 0 ? (
        <EmptyState icon={Bell} title="Nenhum broadcast registrado" description="Os resultados reais de envio aparecerão aqui após o primeiro comunicado." />
      ) : (
        <div className="space-y-2">
          {grouped.map((item, index) => (
            <DSCard key={`${item.at}-${index}`}>
              <DSCardContent className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{item.title}</p>
                  <span className="ml-auto text-[10px] text-muted-foreground">{formatDate(item.at)}</span>
                </div>
                {item.body && <p className="text-xs text-muted-foreground">{item.body}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <DSBadge variant="success">Enviados {item.sent}</DSBadge>
                  <DSBadge variant="secondary">Sem token {item.noToken}</DSBadge>
                  <DSBadge variant="secondary">Suprimidos {item.suppressed}</DSBadge>
                  {item.failed > 0 && <DSBadge>Falhas {item.failed}</DSBadge>}
                </div>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
