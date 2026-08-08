import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Eye, Inbox, RefreshCw, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, DSBadge, DSButton, DSCard, DSCardContent, DSInput, EmptyState, Loading } from "@/design-system";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { updateAdminSupportTicket } from "@/lib/adminControlPlane";

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
  passenger?: {
    name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

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

function AdminSupportPage() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const db = supabase as any;
      const { data: tickets, error } = await db
        .from("passenger_support_tickets")
        .select("id,protocol,passenger_id,ride_id,category,subject,message,status,priority,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const list = (tickets ?? []) as Ticket[];
      const passengerIds = [...new Set(list.map((ticket) => ticket.passenger_id))];
      const { data: passengers, error: passengerError } = passengerIds.length
        ? await db.from("users").select("id,name,email,phone,avatar_url").in("id", passengerIds)
        : { data: [], error: null };
      if (passengerError) throw passengerError;
      const passengerMap = new Map(
        (passengers ?? []).map((passenger: Record<string, unknown>) => [String(passenger.id), passenger]),
      );
      setRows(
        list.map((ticket) => ({
          ...ticket,
          passenger: (passengerMap.get(ticket.passenger_id) as Ticket["passenger"]) ?? null,
        })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar o suporte.");
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
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (!term) return true;
      return [
        ticket.protocol,
        ticket.subject,
        ticket.category,
        ticket.message,
        ticket.passenger?.name ?? "",
        ticket.passenger?.email ?? "",
        ticket.passenger?.phone ?? "",
      ].join(" ").toLowerCase().includes(term);
    });
  }, [rows, q, statusFilter]);

  async function update(ticket: Ticket, next: Partial<Pick<Ticket, "status" | "priority">>) {
    const status = next.status ?? ticket.status;
    const priority = next.priority ?? ticket.priority;
    setBusyId(ticket.id);
    try {
      await updateAdminSupportTicket(ticket.id, status, priority);
      setRows((current) => current.map((row) => row.id === ticket.id ? { ...row, status, priority } : row));
      setSelected((current) => current?.id === ticket.id ? { ...current, status, priority } : current);
      toast.success("Ticket atualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o ticket.");
    } finally {
      setBusyId(null);
    }
  }

  const openCount = rows.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length;
  const urgentCount = rows.filter((ticket) => ticket.priority === "urgent" && ticket.status !== "closed").length;

  return (
    <AdminLayout
      title="Suporte"
      description="Tickets reais criados pelo aplicativo Passageiro"
      actions={
        <DSButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </DSButton>
      }
    >
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        A fonte canônica atual é <strong>passenger_support_tickets</strong>. O schema consolidado ainda não contém uma entidade equivalente de ticket do Motorista; o painel não simula essa funcionalidade.
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi icon={Inbox} label="Total" value={rows.length} />
        <Kpi icon={Clock} label="Em aberto" value={openCount} />
        <Kpi icon={CheckCircle2} label="Urgentes" value={urgentCount} />
      </div>

      <DSCard className="mb-4">
        <DSCardContent className="space-y-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <DSInput
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Buscar protocolo, assunto, categoria ou passageiro"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "open", "in_progress", "resolved", "closed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3 py-1 text-xs ${statusFilter === status ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
              >
                {status === "all" ? "Todos" : STATUS_LABEL[status]}
              </button>
            ))}
          </div>
        </DSCardContent>
      </DSCard>

      {loading ? (
        <Loading label="Carregando tickets..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="Nenhum ticket encontrado" description="Ajuste os filtros ou aguarde novas solicitações." />
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => (
            <DSCard key={ticket.id} className="border-border bg-card/60">
              <DSCardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <Avatar src={ticket.passenger?.avatar_url ?? undefined} name={ticket.passenger?.name ?? "Passageiro"} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-primary">{ticket.protocol}</span>
                    <DSBadge>{STATUS_LABEL[ticket.status]}</DSBadge>
                    <DSBadge variant={ticket.priority === "urgent" ? "danger" : "secondary"}>{PRIORITY_LABEL[ticket.priority]}</DSBadge>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">{ticket.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">{ticket.passenger?.name ?? "Passageiro"} · {ticket.category} · {formatDate(ticket.created_at)}</p>
                </div>
                <DSButton size="sm" variant="outline" onClick={() => setSelected(ticket)} className="gap-1">
                  <Eye className="h-4 w-4" /> Abrir
                </DSButton>
              </DSCardContent>
            </DSCard>
          ))}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.subject}</DialogTitle>
                <DialogDescription>{selected.protocol} · {formatDate(selected.created_at)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm whitespace-pre-wrap">{selected.message}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <select
                      value={selected.status}
                      disabled={busyId === selected.id}
                      onChange={(event) => void update(selected, { status: event.target.value as TicketStatus })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3"
                    >
                      {(["open", "in_progress", "resolved", "closed"] as const).map((status) => (
                        <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-muted-foreground">Prioridade</span>
                    <select
                      value={selected.priority}
                      disabled={busyId === selected.id}
                      onChange={(event) => void update(selected, { priority: event.target.value as Priority })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3"
                    >
                      {(["low", "normal", "high", "urgent"] as const).map((priority) => (
                        <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {selected.ride_id && (
                  <DSButton asChild variant="outline" size="sm">
                    <Link to="/admin/corridas">Abrir módulo de corridas</Link>
                  </DSButton>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Inbox; label: string; value: number }) {
  return (
    <DSCard>
      <DSCardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </DSCardContent>
    </DSCard>
  );
}
