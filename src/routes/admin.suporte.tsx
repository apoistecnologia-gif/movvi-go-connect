/* eslint-disable @typescript-eslint/no-explicit-any -- Temporary Phase 8 bridge until generated Supabase types include canonical admin RPCs. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, Inbox, RefreshCw, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { updateAdminSupportTicket } from "@/lib/adminControlPlane";
import {
  DSBadge,
  DSButton,
  DSCard,
  DSCardContent,
  DSInput,
  EmptyState,
  Loading,
} from "@/design-system";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";

type Priority = "low" | "normal" | "high" | "urgent";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

type Ticket = {
  id: string;
  protocol: string;
  passenger_id: string;
  ride_id: string | null;
  category: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: Priority;
  created_at: string;
  updated_at: string;
};

type Passenger = { id: string; name: string | null; email: string | null; phone: string | null };

export const Route = createFileRoute("/admin/suporte")({
  head: () => ({ meta: [{ title: "Suporte — Admin APOIS" }] }),
  component: AdminSupportPage,
});

const STATUS_VALUES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const PRIORITY_VALUES: Priority[] = ["low", "normal", "high", "urgent"];

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  resolved: "Resolvido",
  closed: "Fechado",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function normalizeStatus(value: unknown): TicketStatus {
  const normalized = cleanText(value).toLowerCase();
  return STATUS_VALUES.includes(normalized as TicketStatus) ? (normalized as TicketStatus) : "open";
}

function normalizePriority(value: unknown): Priority {
  const normalized = cleanText(value).toLowerCase();
  return PRIORITY_VALUES.includes(normalized as Priority) ? (normalized as Priority) : "normal";
}

function safeDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function priorityVariant(priority: Priority): "danger" | "warning" | "muted" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  return "muted";
}

function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const db = supabase as any;
      const { data, error } = await db
        .from("passenger_support_tickets")
        .select(
          "id,protocol,passenger_id,ride_id,category,subject,message,status,priority,created_at,updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (requestId !== requestRef.current) return;
      if (error) throw error;

      const nextTickets = ((data ?? []) as Ticket[])
        .filter((ticket) => Boolean(cleanText(ticket.id)) && Boolean(cleanText(ticket.passenger_id)))
        .map((ticket) => ({
          ...ticket,
          id: cleanText(ticket.id),
          protocol: cleanText(ticket.protocol, "Sem protocolo").slice(0, 80),
          passenger_id: cleanText(ticket.passenger_id),
          ride_id: cleanText(ticket.ride_id) || null,
          category: cleanText(ticket.category, "Não informada").slice(0, 100),
          subject: cleanText(ticket.subject, "Sem assunto").slice(0, 200),
          message: cleanText(ticket.message, "Mensagem não informada").slice(0, 5000),
          status: normalizeStatus(ticket.status),
          priority: normalizePriority(ticket.priority),
          created_at: safeDate(ticket.created_at)?.toISOString() ?? "",
          updated_at: safeDate(ticket.updated_at)?.toISOString() ?? "",
        }));
      setTickets(nextTickets);

      const ids = [...new Set(nextTickets.map((ticket) => ticket.passenger_id).filter(Boolean))];
      if (!ids.length) {
        setPassengers([]);
      } else {
        const result = await db.from("users").select("id,name,email,phone").in("id", ids);
        if (requestId !== requestRef.current) return;
        if (result.error) throw result.error;
        setPassengers(
          ((result.data ?? []) as Passenger[])
            .filter((passenger) => Boolean(cleanText(passenger.id)))
            .map((passenger) => ({
              ...passenger,
              id: cleanText(passenger.id),
              name: cleanText(passenger.name) || null,
              email: cleanText(passenger.email) || null,
              phone: cleanText(passenger.phone) || null,
            })),
        );
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setTickets([]);
      setPassengers([]);
      setLoadError("Não foi possível carregar a fila de suporte agora. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao carregar suporte", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 250);
    };
    const channel = supabase
      .channel("admin-passenger-support-canonical")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "passenger_support_tickets" },
        scheduleRefresh,
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const passengerById = useMemo(
    () => new Map(passengers.map((passenger) => [passenger.id, passenger])),
    [passengers],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (!needle) return true;
      const passenger = passengerById.get(ticket.passenger_id);
      return [
        ticket.protocol,
        ticket.subject,
        ticket.category,
        ticket.message,
        passenger?.name,
        passenger?.email,
        passenger?.phone,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [passengerById, query, statusFilter, tickets]);

  async function update(ticket: Ticket, next: Partial<Pick<Ticket, "status" | "priority">>) {
    if (busyId) return;
    const status = normalizeStatus(next.status ?? ticket.status);
    const priority = normalizePriority(next.priority ?? ticket.priority);
    if (status === ticket.status && priority === ticket.priority) return;
    setBusyId(ticket.id);
    try {
      await updateAdminSupportTicket(ticket.id, status, priority);
      setTickets((current) =>
        current.map((row) => (row.id === ticket.id ? { ...row, status, priority } : row)),
      );
      toast.success("Ticket atualizado e auditado.");
    } catch (error) {
      toast.error("Não foi possível atualizar o ticket. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] falha ao atualizar ticket", error);
    } finally {
      setBusyId(null);
    }
  }

  const openCount = tickets.filter((ticket) => ["open", "in_progress"].includes(ticket.status)).length;
  const urgentCount = tickets.filter(
    (ticket) => ticket.priority === "urgent" && !["resolved", "closed"].includes(ticket.status),
  ).length;

  return (
    <AdminLayout
      title="Suporte"
      description="Fila real de passenger_support_tickets com atualização server-side auditada"
      actions={
        <DSButton
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || Boolean(busyId)}
          className="min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-busy={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          {loading ? "Atualizando…" : "Atualizar"}
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm leading-6 text-muted-foreground">
          A fonte canônica atual é <strong>passenger_support_tickets</strong>. O schema consolidado
          ainda não possui uma entidade equivalente de ticket do Motorista; o painel não simula essa
          funcionalidade.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric icon={Inbox} label="Total" value={tickets.length} />
        <Metric icon={Clock} label="Em aberto" value={openCount} />
        <Metric icon={CheckCircle2} label="Urgentes" value={urgentCount} />
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <DSInput
            className="min-h-11 pl-9 text-base"
            value={query}
            maxLength={160}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar protocolo, assunto, mensagem ou passageiro"
            aria-label="Buscar na fila de suporte"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | TicketStatus)}
          className="min-h-11 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Filtrar tickets por status"
        >
          <option value="all">Todos</option>
          <option value="open">Aberto</option>
          <option value="in_progress">Em atendimento</option>
          <option value="resolved">Resolvido</option>
          <option value="closed">Fechado</option>
        </select>
      </div>

      {loading ? (
        <div role="status" aria-live="polite">
          <Loading label="Carregando tickets..." />
        </div>
      ) : loadError ? (
        <DSCard className="border-destructive/30 bg-destructive/5">
          <DSCardContent className="space-y-3 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <DSButton variant="outline" className="min-h-11" onClick={() => void load()}>
              Tentar novamente
            </DSButton>
          </DSCardContent>
        </DSCard>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nenhum ticket encontrado"
          description={query.trim() || statusFilter !== "all" ? "Ajuste os filtros ou a busca." : "Aguarde novas solicitações de suporte."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => {
            const passenger = passengerById.get(ticket.passenger_id);
            return (
              <DSCard key={ticket.id}>
                <DSCardContent className="space-y-3 p-4">
                  <div className="flex min-w-0 flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-mono text-xs text-primary">{ticket.protocol}</p>
                      <p className="mt-1 break-words font-semibold">{ticket.subject}</p>
                      <p className="break-words text-sm text-muted-foreground">
                        {passenger?.name || ticket.passenger_id.slice(0, 8)} · {ticket.category} ·{" "}
                        {ticket.created_at ? formatDate(ticket.created_at) : "Data não informada"}
                      </p>
                    </div>
                    <DSBadge
                      variant={ticket.status === "resolved" || ticket.status === "closed" ? "success" : "warning"}
                    >
                      {STATUS_LABEL[ticket.status]}
                    </DSBadge>
                    <DSBadge variant={priorityVariant(ticket.priority)}>{PRIORITY_LABEL[ticket.priority]}</DSBadge>
                  </div>

                  <p className="break-words whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-sm leading-6">
                    {ticket.message}
                  </p>
                  {ticket.ride_id && (
                    <p className="break-all text-sm text-muted-foreground">
                      Corrida relacionada: <span className="font-mono">{ticket.ride_id}</span>
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-muted-foreground">Status</span>
                      <select
                        value={ticket.status}
                        disabled={Boolean(busyId)}
                        aria-busy={busyId === ticket.id}
                        onChange={(event) => void update(ticket, { status: event.target.value as TicketStatus })}
                        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {STATUS_VALUES.map((status) => (
                          <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-muted-foreground">Prioridade</span>
                      <select
                        value={ticket.priority}
                        disabled={Boolean(busyId)}
                        aria-busy={busyId === ticket.id}
                        onChange={(event) => void update(ticket, { priority: event.target.value as Priority })}
                        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {PRIORITY_VALUES.map((priority) => (
                          <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {busyId === ticket.id ? (
                    <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                      Salvando alteração…
                    </p>
                  ) : null}
                </DSCardContent>
              </DSCard>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Inbox; label: string; value: number }) {
  return (
    <DSCard>
      <DSCardContent className="flex min-w-0 items-center gap-3 p-4">
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="break-words text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{Math.max(0, Number.isFinite(value) ? value : 0)}</p>
        </div>
      </DSCardContent>
    </DSCard>
  );
}
