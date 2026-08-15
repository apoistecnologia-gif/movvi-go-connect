import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  RefreshCw,
  Eye,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Clock,
  StickyNote,
  Copy,
  Trash2,
  Car,
  User as UserIcon,
  Inbox,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, DSBadge, DSButton, DSCard, DSCardContent, DSInput, DSTextarea, EmptyState, Loading } from "@/design-system";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { logAdminAction } from "@/lib/adminAudit";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";


export const Route = createFileRoute("/admin/suporte")({
  head: () => ({ meta: [{ title: "Suporte — Admin APOIS" }] }),
  component: AdminSuportePage,
});

type Priority = "low" | "normal" | "high" | "urgent";
type UserType = "passenger" | "driver";

type Ticket = {
  id: string;
  user_id: string;
  user_type: UserType | string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: Priority | string;
  ride_id: string | null;
  admin_status_note: string | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  auth_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  average_rating: number | null;
};

type DriverRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  average_rating: number | null;
  rating: number | null;
  approval_status: string | null;
};

type RideRow = {
  id: string;
  status: string;
  origin_name: string | null;
  destination_name: string | null;
  payment_method: string | null;
  created_at: string;
  passenger_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
};

type NoteRow = {
  id: string;
  ticket_id: string;
  admin_id: string;
  note: string;
  created_at: string;
};

type Enriched = Ticket & {
  _user: {
    name: string | null;
    email: string | null;
    phone: string | null;
    photo: string | null;
    rating: number | null;
    status: string | null;
  };
};

type FilterKey =
  | "all"
  | "open"
  | "in_review"
  | "answered"
  | "resolved"
  | "urgent"
  | "safety"
  | "payment"
  | "ride"
  | "account"
  | "driver"
  | "passenger";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "open", label: "Abertos" },
  { key: "in_review", label: "Em análise" },
  { key: "answered", label: "Respondidos" },
  { key: "resolved", label: "Resolvidos" },
  { key: "urgent", label: "Urgentes" },
  { key: "safety", label: "Segurança/SOS" },
  { key: "payment", label: "Pagamento" },
  { key: "ride", label: "Corrida" },
  { key: "account", label: "Conta" },
  { key: "driver", label: "Motorista" },
  { key: "passenger", label: "Passageiro" },
];

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    open: "Aberto",
    aberto: "Aberto",
    in_review: "Em análise",
    em_analise: "Em análise",
    answered: "Respondido",
    respondido: "Respondido",
    resolved: "Resolvido",
    resolvido: "Resolvido",
    closed: "Fechado",
  };
  return map[s] ?? s;
}

function statusTone(s: string) {
  if (["resolved", "resolvido", "closed"].includes(s))
    return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (["in_review", "em_analise"].includes(s))
    return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  if (["answered", "respondido"].includes(s))
    return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
  return "bg-primary/15 text-primary border border-primary/30";
}

function priorityTone(p: string) {
  if (p === "urgent") return "bg-red-500/15 text-red-300 border border-red-500/30";
  if (p === "high") return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
  if (p === "low") return "bg-muted text-muted-foreground border border-border";
  return "bg-primary/10 text-primary border border-primary/25";
}

function priorityLabel(p: string) {
  return { urgent: "Urgente", high: "Alta", normal: "Normal", low: "Baixa" }[p as Priority] ?? p;
}

function categoryLabel(c: string) {
  const map: Record<string, string> = {
    ride_issue: "Problema com corrida",
    driver_issue: "Problema com motorista",
    passenger_issue: "Problema com passageiro",
    payment: "Pagamento",
    safety: "Segurança",
    app_bug: "Erro no app",
    account: "Conta",
    subscription: "Assinatura",
    documents: "Documentos",
    other: "Outro",
  };
  return map[c] ?? c;
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function copy(text: string, msg = "Copiado") {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(msg),
    () => toast.error("Não foi possível copiar"),
  );
}

function AdminSuportePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Enriched[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: tickets, error } = await supabase
        .from("support_tickets")
        .select(
          "id, user_id, user_type, subject, description, category, status, priority, ride_id, admin_status_note, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (tickets ?? []) as Ticket[];

      const passengerIds = list.filter((t) => t.user_type === "passenger").map((t) => t.user_id);
      const driverIds = list.filter((t) => t.user_type === "driver").map((t) => t.user_id);

      const [usersRes, driversRes] = await Promise.all([
        passengerIds.length
          ? supabase
              .from("users")
              .select("auth_user_id, name, email, phone, avatar_url, average_rating")
              .in("auth_user_id", passengerIds)
          : Promise.resolve({ data: [] as UserRow[], error: null }),
        driverIds.length
          ? supabase
              .from("drivers")
              .select("user_id, name, email, phone, photo_url, average_rating, rating, approval_status")
              .in("user_id", driverIds)
          : Promise.resolve({ data: [] as DriverRow[], error: null }),
      ]);

      const uMap = new Map<string, UserRow>();
      (usersRes.data ?? []).forEach((u) => uMap.set(u.auth_user_id, u as UserRow));
      const dMap = new Map<string, DriverRow>();
      (driversRes.data ?? []).forEach((d) => dMap.set(d.user_id, d as DriverRow));

      const enriched: Enriched[] = list.map((t) => {
        if (t.user_type === "driver") {
          const d = dMap.get(t.user_id);
          return {
            ...t,
            _user: {
              name: d?.name ?? null,
              email: d?.email ?? null,
              phone: d?.phone ?? null,
              photo: d?.photo_url ?? null,
              rating: d?.average_rating ?? d?.rating ?? null,
              status: d?.approval_status ?? null,
            },
          };
        }
        const u = uMap.get(t.user_id);
        return {
          ...t,
          _user: {
            name: u?.name ?? null,
            email: u?.email ?? null,
            phone: u?.phone ?? null,
            photo: u?.avatar_url ?? null,
            rating: u?.average_rating ?? null,
            status: null,
          },
        };
      });
      setRows(enriched);
    } catch (err) {
      console.error("[admin.suporte] load failed", err);
      toast.error("Falha ao carregar tickets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin_support_tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((t) => {
      // filter chip
      switch (filter) {
        case "open":
          if (!["open", "aberto"].includes(t.status)) return false;
          break;
        case "in_review":
          if (!["in_review", "em_analise"].includes(t.status)) return false;
          break;
        case "answered":
          if (!["answered", "respondido"].includes(t.status)) return false;
          break;
        case "resolved":
          if (!["resolved", "resolvido", "closed"].includes(t.status)) return false;
          break;
        case "urgent":
          if (t.priority !== "urgent") return false;
          break;
        case "safety":
          if (t.category !== "safety") return false;
          break;
        case "payment":
          if (t.category !== "payment") return false;
          break;
        case "ride":
          if (!["ride_issue", "driver_issue", "passenger_issue"].includes(t.category)) return false;
          break;
        case "account":
          if (t.category !== "account") return false;
          break;
        case "driver":
          if (t.user_type !== "driver") return false;
          break;
        case "passenger":
          if (t.user_type !== "passenger") return false;
          break;
      }
      if (!term) return true;
      const hay = [
        t.id,
        t.ride_id ?? "",
        t.subject,
        t.category,
        t._user.name ?? "",
        t._user.email ?? "",
        t._user.phone ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, filter, q]);

  const counts = useMemo(() => {
    const open = rows.filter((r) => ["open", "aberto"].includes(r.status)).length;
    const urgent = rows.filter((r) => r.priority === "urgent").length;
    const inReview = rows.filter((r) => ["in_review", "em_analise"].includes(r.status)).length;
    const resolved = rows.filter((r) => ["resolved", "resolvido", "closed"].includes(r.status)).length;
    return { open, urgent, inReview, resolved, total: rows.length };
  }, [rows]);

  return (
    <AdminLayout
      title="Suporte / Tickets"
      description="Gestão profissional de solicitações de passageiros e motoristas"
      actions={
        <DSButton variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </DSButton>
      }
    >
      <div className="grid gap-3 md:grid-cols-5">
        <Kpi label="Total" value={counts.total} tone="default" />
        <Kpi label="Abertos" value={counts.open} tone="primary" icon={Clock} />
        <Kpi label="Em análise" value={counts.inReview} tone="warn" icon={AlertTriangle} />
        <Kpi label="Urgentes" value={counts.urgent} tone="danger" icon={Flame} />
        <Kpi label="Resolvidos" value={counts.resolved} tone="ok" icon={CheckCircle2} />
      </div>

      <DSCard className="mt-4 border-border bg-card">
        <DSCardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <DSInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, e-mail, telefone, ID do ticket, ID da corrida, assunto…"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {rows.length} tickets
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  filter === f.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </DSCardContent>
      </DSCard>

      <div className="mt-4 space-y-2">
        {loading ? (
          <Loading label="Carregando tickets..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nenhum ticket encontrado"
            description="Ajuste os filtros ou aguarde novas solicitações."
          />

        ) : (
          filtered.map((t) => (
            <TicketRow key={t.id} t={t} onOpen={() => setOpenId(t.id)} />
          ))
        )}
      </div>

      <TicketDetailDialog
        ticketId={openId}
        onClose={() => setOpenId(null)}
        rowsRef={rows}
        onChanged={load}
      />
    </AdminLayout>
  );
}

function Kpi({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "default" | "primary" | "warn" | "danger" | "ok";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const map = {
    default: "text-foreground",
    primary: "text-primary",
    warn: "text-amber-300",
    danger: "text-red-300",
    ok: "text-emerald-300",
  } as const;
  return (
    <DSCard className="border-border bg-card">
      <DSCardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {Icon && <Icon className={`h-4 w-4 ${map[tone]}`} />}
        </div>
        <p className={`mt-1 font-display text-2xl font-bold ${map[tone]}`}>{value}</p>
      </DSCardContent>
    </DSCard>
  );
}

function TicketRow({ t, onOpen }: { t: Enriched; onOpen: () => void }) {
  return (
    <DSCard className="border-border bg-card transition hover:border-primary/40">
      <DSCardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar src={t._user.photo ?? undefined} name={t._user.name ?? "?"} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">#{shortId(t.id)}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${priorityTone(t.priority)}`}>{priorityLabel(t.priority)}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusTone(t.status)}`}>{statusLabel(t.status)}</span>
              <DSBadge className="text-muted-foreground">
                {t.user_type === "driver" ? "Motorista" : "Passageiro"}
              </DSBadge>
              <DSBadge className="text-muted-foreground">
                {categoryLabel(t.category)}
              </DSBadge>
              {t.ride_id && (
                <DSBadge variant="primary">
                  <Car className="mr-1 h-3 w-3" /> Corrida
                </DSBadge>
              )}
            </div>
            <p className="mt-1 truncate font-semibold text-foreground">{t.subject}</p>
            <p className="text-xs text-muted-foreground">
              {t._user.name ?? "Usuário"} •{" "}
              {t._user.email ?? t._user.phone ?? "sem contato"} • criado {formatDate(t.created_at)}
            </p>
          </div>
          <DSButton variant="secondary" size="sm" onClick={onOpen} className="shrink-0">
            <Eye className="mr-2 h-4 w-4" /> Abrir
          </DSButton>
        </div>
      </DSCardContent>
    </DSCard>
  );
}

function TicketDetailDialog({
  ticketId,
  onClose,
  rowsRef,
  onChanged,
}: {
  ticketId: string | null;
  onClose: () => void;
  rowsRef: Enriched[];
  onChanged: () => void;
}) {
  const t = rowsRef.find((r) => r.id === ticketId) ?? null;
  const [ride, setRide] = useState<RideRow | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<
    | { patch: Partial<Ticket>; action: string; title: string; description: string; confirmLabel: string; destructive?: boolean }
    | null
  >(null);
  const [noteToDelete, setNoteToDelete] = useState<NoteRow | null>(null);

  useEffect(() => {
    setRide(null);
    setNotes([]);
    setNoteText("");
    if (!t) return;
    (async () => {
      const [rideRes, notesRes] = await Promise.all([
        t.ride_id
          ? supabase
              .from("rides")
              .select(
                "id, status, origin_name, destination_name, payment_method, created_at, passenger_id, driver_id, driver_name",
              )
              .eq("id", t.ride_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("support_ticket_notes")
          .select("id, ticket_id, admin_id, note, created_at")
          .eq("ticket_id", t.id)
          .order("created_at", { ascending: false }),
      ]);
      if (rideRes.data) setRide(rideRes.data as RideRow);
      if (notesRes.data) setNotes(notesRes.data as NoteRow[]);
    })();
  }, [t?.id]);

  if (!t) {
    return (
      <Dialog open={false} onOpenChange={onClose}>
        <DialogContent />
      </Dialog>
    );
  }

  async function updateTicket(patch: Partial<Ticket>, action: string) {
    setBusy(action);
    try {
      const { error } = await supabase.from("support_tickets").update(patch).eq("id", t!.id);
      if (error) throw error;
      await logAdminAction({
        action,
        entity: "support_ticket",
        entity_id: t!.id,
        before: {
          status: t!.status,
          priority: t!.priority,
        },
        after: patch,
      });
      toast.success("Ticket atualizado");
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível atualizar o ticket");
    } finally {
      setBusy(null);
    }
  }

  async function addNote() {
    const txt = noteText.trim();
    if (!txt) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("no session");
      const { data, error } = await supabase
        .from("support_ticket_notes")
        .insert({ ticket_id: t!.id, admin_id: auth.user.id, note: txt })
        .select()
        .single();
      if (error) throw error;
      setNotes((n) => [data as NoteRow, ...n]);
      setNoteText("");
      await logAdminAction({
        action: "support_note_add",
        entity: "support_ticket",
        entity_id: t!.id,
      });
      toast.success("Nota interna adicionada");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao adicionar nota");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    try {
      const { error } = await supabase.from("support_ticket_notes").delete().eq("id", id);
      if (error) throw error;
      setNotes((n) => n.filter((x) => x.id !== id));
    } catch {
      toast.error("Falha ao excluir nota");
    }
  }

  const profileHref =
    t.user_type === "driver"
      ? `/admin/motoristas?focus=${t.user_id}`
      : `/admin/passageiros?focus=${t.user_id}`;

  return (
    <Dialog open={!!t} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">#{shortId(t.id)}</span>
            <span className="truncate">{t.subject}</span>
          </DialogTitle>
          <DialogDescription>
            Detalhes completos do ticket e ferramentas administrativas.
          </DialogDescription>
        </DialogHeader>

        {/* User */}
        <Section title="Usuário">
          <div className="flex items-center gap-3">
            <Avatar src={t._user.photo ?? undefined} name={t._user.name ?? "?"} size={56} />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{t._user.name ?? "Sem nome"}</p>
              <p className="text-xs text-muted-foreground">
                {t.user_type === "driver" ? "Motorista" : "Passageiro"} •{" "}
                {t._user.email ?? "Não informado"} • {t._user.phone ?? "Não informado"}
              </p>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                {t._user.rating != null && (
                  <DSBadge className="text-muted-foreground">
                    ⭐ {Number(t._user.rating).toFixed(2)}
                  </DSBadge>
                )}
                {t._user.status && (
                  <DSBadge className="text-muted-foreground">
                    {t._user.status}
                  </DSBadge>
                )}
              </div>
            </div>
            <Link
              to={profileHref}
              className="ml-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <UserIcon className="h-3.5 w-3.5" /> Ver perfil
            </Link>
          </div>
        </Section>

        {/* Ticket */}
        <Section title="Ticket">
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Categoria" value={categoryLabel(t.category)} />
            <Field label="Status" value={statusLabel(t.status)} />
            <Field label="Prioridade" value={priorityLabel(t.priority)} />
            <Field label="Criado em" value={formatDate(t.created_at)} />
            <Field label="Atualizado em" value={formatDate(t.updated_at)} />
          </div>
          <div className="mt-3 rounded-md border border-border bg-background/50 p-3 text-sm text-foreground whitespace-pre-wrap">
            {t.description}
          </div>
          {t.admin_status_note && (
            <p className="mt-2 text-xs text-muted-foreground">
              <strong className="text-foreground">Nota de status:</strong> {t.admin_status_note}
            </p>
          )}
        </Section>

        {/* Related ride */}
        {t.ride_id && (
          <Section title="Corrida relacionada">
            {ride ? (
              <div className="rounded-md border border-border bg-background/50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-primary/15 text-primary border border-primary/30">
                    {ride.status}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    #{shortId(ride.id)}
                  </span>
                  <DSButton
                    variant="ghost"
                    size="sm"
                    onClick={() => copy(ride.id, "ID da corrida copiado")}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copiar ID
                  </DSButton>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Origem: <span className="text-foreground">{ride.origin_name ?? "—"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Destino: <span className="text-foreground">{ride.destination_name ?? "—"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Pagamento:{" "}
                  <span className="text-foreground">{ride.payment_method ?? "—"}</span> •{" "}
                  Motorista: <span className="text-foreground">{ride.driver_name ?? "—"}</span>
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Criada em {formatDate(ride.created_at)}
                </p>
                <div className="mt-3">
                  <Link
                    to="/admin/corridas"
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Car className="h-3.5 w-3.5" /> Abrir em Corridas
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Carregando corrida…</p>
            )}
          </Section>
        )}

        {/* Notes */}
        <Section title="Notas internas">
          <div className="flex gap-2">
            <DSTextarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Adicionar nota interna (somente admins)"
              className="min-h-[70px]"
            />
            <DSButton onClick={addNote} disabled={saving || !noteText.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
            </DSButton>
          </div>
          <div className="mt-3 space-y-2">
            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma nota interna.</p>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border bg-background/50 p-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-foreground">{n.note}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(n.created_at)}
                    </p>
                  </div>
                  <DSButton variant="ghost" size="icon" aria-label="Remover nota" onClick={() => setNoteToDelete(n)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </DSButton>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* Actions */}
        <Section title="Ações">
          <div className="flex flex-wrap gap-2">
            <DSButton
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                setPendingUpdate({
                  patch: { status: "in_review" },
                  action: "support_status_in_review",
                  title: "Marcar ticket em análise?",
                  description: "O ticket será movido para o fluxo de análise pela equipe de suporte.",
                  confirmLabel: "Marcar em análise",
                })
              }
            >
              <Clock className="mr-2 h-4 w-4" /> Marcar em análise
            </DSButton>
            <DSButton
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                setPendingUpdate({
                  patch: { status: "resolved" },
                  action: "support_status_resolved",
                  title: "Marcar ticket como resolvido?",
                  description: "O ticket será encerrado. Você pode reabrir editando o status depois.",
                  confirmLabel: "Marcar resolvido",
                })
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar resolvido
            </DSButton>
            <DSButton
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                setPendingUpdate({
                  patch: { priority: "urgent" },
                  action: "support_priority_urgent",
                  title: "Elevar prioridade para urgente?",
                  description: "O ticket será destacado como urgente para toda a equipe de suporte.",
                  confirmLabel: "Marcar urgente",
                  destructive: true,
                })
              }
            >
              <Flame className="mr-2 h-4 w-4" /> Marcar urgente
            </DSButton>
            <DSButton
              variant="ghost"
              size="sm"
              onClick={() => copy(t.id, "ID do ticket copiado")}
            >
              <Copy className="mr-2 h-4 w-4" /> Copiar ID
            </DSButton>
            <DSButton
              variant="ghost"
              size="sm"
              onClick={() =>
                copy(
                  `Ticket #${shortId(t.id)}\nUsuário: ${t._user.name ?? "-"}\nAssunto: ${t.subject}\nCategoria: ${categoryLabel(
                    t.category,
                  )}\nStatus: ${statusLabel(t.status)}\nPrioridade: ${priorityLabel(t.priority)}`,
                  "Resumo copiado",
                )
              }
            >
              <Copy className="mr-2 h-4 w-4" /> Copiar resumo
            </DSButton>
          </div>
        </Section>
      </DialogContent>

      <ConfirmDialog
        open={!!pendingUpdate}
        onOpenChange={(o) => !o && setPendingUpdate(null)}
        title={pendingUpdate?.title ?? ""}
        description={pendingUpdate?.description}
        confirmLabel={pendingUpdate?.confirmLabel ?? "Confirmar"}
        destructive={pendingUpdate?.destructive}
        onConfirm={async () => {
          if (pendingUpdate) await updateTicket(pendingUpdate.patch, pendingUpdate.action);
        }}
      />

      <ConfirmDialog
        open={!!noteToDelete}
        onOpenChange={(o) => !o && setNoteToDelete(null)}
        title="Excluir nota interna?"
        description="A nota será removida permanentemente do histórico deste ticket."
        confirmLabel="Excluir nota"
        destructive
        onConfirm={async () => {
          if (noteToDelete) await deleteNote(noteToDelete.id);
        }}
      />
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
