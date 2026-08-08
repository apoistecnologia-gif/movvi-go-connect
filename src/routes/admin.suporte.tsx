import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Inbox, RefreshCw, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { updateAdminSupportTicket } from "@/lib/adminControlPlane";
import { DSBadge, DSButton, DSCard, DSCardContent, DSInput, EmptyState, Loading } from "@/design-system";
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

  async function load() {
    setLoading(true);
    try {
      const db = supabase as any;
      const { data, error } = await db
        .from("passenger_support_tickets")
        .select("id,protocol,passenger_id,ride_id,category,subject,message,status,priority,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const nextTickets = (data ?? []) as Ticket[];
      setTickets(nextTickets);

      const ids = [...new Set(nextTickets.map((ticket) => ticket.passenger_id))];
      if (!ids.length) {
        setPassengers([]);
      } else {
        const result = await db.from("users").select("id,name,email,phone").in("id", ids);
        if (result.error) throw result.error;
        setPassengers((result.data ?? []) as Passenger[]);
      }
    } catch (error) {
      setTickets([]);
      setPassengers([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o suporte.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-passenger-support-canonical")
      .on("postgres_changes", { event: "*", schema: "public", table: "passenger_support_tickets" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const passengerById = useMemo(() => new Map(passengers.map((passenger) => [passenger.id, passenger])), [passengers]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (!needle) return true;
      const passenger = passengerById.get(ticket.passenger_id);
      return [ticket.protocol, ticket.subject, ticket.category, ticket.message, passenger?.name, passenger?.email, passenger?.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [passengerById, query, statusFilter, tickets]);

  async function update(ticket: Ticket, next: Partial<Pick<Ticket, "status" | "priority">>) {
    const status = next.status ?? ticket.status;
    const priority = next.priority ?? ticket.priority;
    setBusyId(ticket.id);
    try {
      await updateAdminSupportTicket(ticket.id, status, priority);
      setTickets((current) => current.map((row) => row.id === ticket.id ? { ...row, status, priority } : row));
      toast.success("Ticket atualizado e auditado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o ticket.");
    } finally {
      setBusyId(null);
    }
  }

  const openCount = tickets.filter((ticket) => ["open", "in_progress"].includes(ticket.status)).length;
  const urgentCount = tickets.filter((ticket) => ticket.priority === "urgent" && ticket.status !== "closed").length;

  return (
    <AdminLayout
      title="Suporte"
      description="Fila real de passenger_support_tickets com atualização server-side auditada"
      actions={
        <DSButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <DSCard className="mb-4 border-primary/20 bg-primary/5">
        <DSCardContent className="p-4 text-sm text-muted-foreground">
          A fonte canônica atual é <strong>passenger_support_tickets</strong>. O schema consolidado ainda não possui uma entidade equivalente de ticket do Motorista; o painel não simula essa funcionalidade.
        </DSCardContent>
      </DSCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric icon={Inbox} label="Total" value={tickets.length} />
        <Metric icon={Clock} label="Em aberto" value={openCount} />
        <Metric icon={CheckCircle2} label="Urgentes" value={urgentCount} />
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DSInput className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar protocolo, assunto, mensagem ou passageiro" />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | TicketStatus)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">Todos</option>
          <option value="open">Aberto</option>
          <option value="in_progress">Em atendimento</option>
          <option value="resolved">Resolvido</option>
          <option value="closed">Fechado</option>
        </select>
      </div>

      {loading ? (
        <Loading label="Carregando tickets..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="Nenhum ticket encontrado" description="Ajuste os filtros ou aguarde novas solicitações." />
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => {
            const passenger = passengerById.get(ticket.passenger_id);
            return (
              <DSCard key={ticket.id}>
                <DSCardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] text-primary">{ticket.protocol}</p>
                      <p className="mt-1 font-semibold">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground">{passenger?.name || ticket.passenger_id.slice(0, 8)} · {ticket.category} · {formatDate(ticket.created_at)}</p>
                    </div>
                    <DSBadge variant={ticket.status === "resolved" || ticket.status === "closed" ? "success" : "warning"}>{STATUS_LABEL[ticket.status]}</DSBadge>
                    <DSBadge variant={priorityVariant(ticket.priority)}>{PRIORITY_LABEL[ticket.priority]}</DSBadge>
                  </div>

                  <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-sm">{ticket.message}</p>
                  {ticket.ride_id && <p className="text-xs text-muted-foreground">Corrida relacionada: <span className="font-mono">{ticket.ride_id}</span></p>}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">Status</span>
                      <select value={ticket.status} disabled={busyId === ticket.id} onChange={(event) => void update(ticket, { status: event.target.value as TicketStatus })} className="h-9 w-full rounded-md border border-input bg-background px-3">
                        {(["open", "in_progress", "resolved", "closed"] as TicketStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-muted-foreground">Prioridade</span>
                      <select value={ticket.priority} disabled={busyId === ticket.id} onChange={(event) => void update(ticket, { priority: event.target.value as Priority })} className="h-9 w-full rounded-md border border-input bg-background px-3">
                        {(["low", "normal", "high", "urgent"] as Priority[]).map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
                      </select>
                    </label>
                  </div>
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
      <DSCardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
      </DSCardContent>
    </DSCard>
  );
}
