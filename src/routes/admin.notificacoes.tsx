import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  DSBadge,
  DSButton,
  DSCard,
  DSCardContent,
  DSCardHeader,
  DSCardTitle,
  DSInput,
  DSTextarea,
  EmptyState,
  Loading,
} from "@/design-system";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import {
  getAdminNotificationHistory,
  sendAdminBroadcast,
} from "@/lib/adminNotifications.functions";

function mapAdminError(msg: string): string {
  const normalized = String(msg ?? "").trim();
  if (normalized === "forbidden") return "Ação não autorizada para esta função administrativa.";
  if (normalized === "no_recipients") return "Nenhum destinatário encontrado.";
  if (normalized === "too_many_recipients") return "Público muito grande para um único envio.";
  if (normalized === "missing_filter") return "Preencha o filtro.";
  if (/invalid_|^Required$|uuid/i.test(normalized)) return "Dados inválidos.";
  return "Não foi possível concluir a operação de notificações agora. Tente novamente.";
}

export const Route = createFileRoute("/admin/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Admin APOIS" }] }),
  component: AdminNotificacoesPage,
});

type Audience = "all" | "drivers" | "passengers" | "city" | "category" | "driver" | "passenger";
type HistoryRow = Awaited<ReturnType<typeof getAdminNotificationHistory>>[number];

const AUDIENCES = new Set<Audience>(["all", "drivers", "passengers", "city", "category", "driver", "passenger"]);
const FILTERED_AUDIENCES = new Set<Audience>(["city", "category", "driver", "passenger"]);

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function safeDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

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
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const historyRequestRef = useRef(0);

  async function refresh() {
    const requestId = ++historyRequestRef.current;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const next = await historyFn({});
      if (requestId !== historyRequestRef.current) return;
      setHistory(Array.isArray(next) ? next : []);
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      setHistory([]);
      setHistoryError("Não foi possível carregar os logs de entrega agora.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha no histórico de notificações", error);
    } finally {
      if (requestId === historyRequestRef.current) setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      historyRequestRef.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!FILTERED_AUDIENCES.has(audience)) setFilter("");
    setSendError(null);
  }, [audience]);

  async function send() {
    if (sending) return;
    const normalizedTitle = cleanText(title, 100);
    const normalizedBody = cleanText(body, 500);
    const normalizedFilter = cleanText(filter, 160);
    if (!AUDIENCES.has(audience)) {
      setSendError("Selecione um público válido.");
      return;
    }
    if (!normalizedTitle || !normalizedBody) {
      setSendError("Título e mensagem são obrigatórios.");
      return;
    }
    if (FILTERED_AUDIENCES.has(audience) && !normalizedFilter) {
      setSendError("Preencha o filtro do público selecionado.");
      return;
    }
    if (audience === "all" && typeof window !== "undefined") {
      const confirmed = window.confirm("Confirmar envio deste comunicado para todos os perfis ativos?");
      if (!confirmed) return;
    }

    setSending(true);
    setSendError(null);
    try {
      const res = await sendFn({
        data: {
          title: normalizedTitle,
          body: normalizedBody,
          audience,
          filter: normalizedFilter || null,
        },
      });
      const sent = Number.isFinite(Number(res.sent)) ? Math.max(0, Number(res.sent)) : 0;
      const noTokens = Number.isFinite(Number(res.noTokens)) ? Math.max(0, Number(res.noTokens)) : 0;
      const suppressed = Number.isFinite(Number(res.suppressed)) ? Math.max(0, Number(res.suppressed)) : 0;
      if (sent > 0) toast.success(`${sent} push(es) aceito(s) pelo Firebase.`);
      else if (noTokens > 0)
        toast.warning(`Nenhum push entregue: ${noTokens} destinatário(s) sem token ativo.`);
      else if (suppressed > 0)
        toast.info(`Envio suprimido pelas preferências de ${suppressed} usuário(s).`);
      else toast.info("O mecanismo não confirmou entrega para nenhum dispositivo.");
      setTitle("");
      setBody("");
      setFilter("");
      await refresh();
    } catch (error) {
      const friendly = mapAdminError(error instanceof Error ? error.message : "");
      setSendError(friendly);
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha no broadcast", error);
    } finally {
      setSending(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        title: string;
        body: string | null;
        at: string;
        sent: number;
        failed: number;
        noToken: number;
        suppressed: number;
      }
    >();
    for (const row of history) {
      const rowTitle = cleanText(row?.title, 100) || "Comunicado sem título";
      const rowBody = cleanText(row?.body, 500) || null;
      const date = safeDate(row?.created_at);
      if (!date) continue;
      const at = date.toISOString();
      const key = `${rowTitle}|${rowBody ?? ""}|${at.slice(0, 16)}`;
      const current = map.get(key) ?? {
        title: rowTitle,
        body: rowBody,
        at,
        sent: 0,
        failed: 0,
        noToken: 0,
        suppressed: 0,
      };
      if (row.status === "sent") current.sent += 1;
      else if (row.status === "failed") current.failed += 1;
      else if (row.status === "no_token") current.noToken += 1;
      else current.suppressed += 1;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [history]);

  return (
    <AdminLayout
      title="Notificações"
      description="Comunicados operacionais enviados pelo mecanismo FCM canônico"
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="flex min-w-0 gap-3 p-4 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              Entrega real, não apenas registro em tabela
            </p>
            <p className="mt-1 break-words">
              Esta tela delega o envio ao mecanismo FCM canônico e exibe o resultado registrado em
              notification_logs. “Enviado” significa push aceito pelo Firebase, não apenas uma linha
              criada no banco.
            </p>
          </div>
        </DSCardContent>
      </DSCard>

      <DSCard>
        <DSCardHeader>
          <DSCardTitle className="text-base">Novo comunicado operacional</DSCardTitle>
        </DSCardHeader>
        <DSCardContent className="space-y-3">
          <label className="block space-y-1 text-sm font-medium">
            <span>Título</span>
            <DSInput
              placeholder="Título"
              maxLength={100}
              value={title}
              disabled={sending}
              className="min-h-11 text-base"
              onChange={(e) => {
                setTitle(e.target.value);
                setSendError(null);
              }}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Mensagem</span>
            <DSTextarea
              placeholder="Mensagem"
              rows={4}
              maxLength={500}
              value={body}
              disabled={sending}
              className="text-base"
              onChange={(e) => {
                setBody(e.target.value);
                setSendError(null);
              }}
            />
            <span className="block text-right text-xs text-muted-foreground">{body.length}/500</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                Público
              </span>
              <select
                value={audience}
                disabled={sending}
                onChange={(e) => setAudience(e.target.value as Audience)}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              >
                <option value="all">Todos os perfis ativos</option>
                <option value="drivers">Motoristas</option>
                <option value="passengers">Passageiros</option>
                <option value="city">Por cidade</option>
                <option value="category">Motoristas por categoria</option>
                <option value="driver">Motorista específico</option>
                <option value="passenger">Passageiro específico</option>
              </select>
            </label>
            {FILTERED_AUDIENCES.has(audience) ? (
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="font-semibold uppercase tracking-widest text-muted-foreground">
                  {audience === "city"
                    ? "Cidade"
                    : audience === "category"
                      ? "Categoria"
                      : "ID canônico ou Auth ID"}
                </span>
                <DSInput
                  value={filter}
                  maxLength={160}
                  disabled={sending}
                  className="min-h-11 text-base"
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setSendError(null);
                  }}
                />
              </label>
            ) : null}
          </div>
          {sendError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {sendError}
            </p>
          ) : null}
          <DSButton
            onClick={() => void send()}
            disabled={sending}
            className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-busy={sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {sending ? "Enviando…" : "Enviar"}
          </DSButton>
          <p className="text-sm leading-5 text-muted-foreground">
            Este canal é operacional e respeita as preferências de atualizações aplicadas pelo
            mecanismo de push.
          </p>
        </DSCardContent>
      </DSCard>

      <div className="mb-2 mt-6 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Logs de entrega</h3>
        <DSButton
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
          disabled={loadingHistory}
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loadingHistory}
        >
          <RefreshCw className={`h-4 w-4 ${loadingHistory ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {loadingHistory ? "Atualizando…" : "Atualizar"}
        </DSButton>
      </div>
      {loadingHistory ? (
        <div aria-live="polite"><Loading label="Carregando logs de entrega…" /></div>
      ) : historyError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm text-destructive">{historyError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void refresh()}>
              Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhum broadcast registrado"
          description="Os resultados reais de envio aparecerão aqui após o primeiro comunicado."
        />
      ) : (
        <div className="space-y-2" aria-live="polite">
          {grouped.map((item, index) => (
            <DSCard key={`${item.at}-${index}`}>
              <DSCardContent className="min-w-0 space-y-2 p-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 break-words font-medium">{item.title}</p>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.at}>
                    {formatDate(item.at)}
                  </time>
                </div>
                {item.body ? <p className="break-words text-sm leading-5 text-muted-foreground">{item.body}</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  <DSBadge variant="success">Enviados {item.sent}</DSBadge>
                  <DSBadge variant="muted">Sem token {item.noToken}</DSBadge>
                  <DSBadge variant="muted">Suprimidos {item.suppressed}</DSBadge>
                  {item.failed > 0 ? <DSBadge variant="danger">Falhas {item.failed}</DSBadge> : null}
                </div>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
