import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Loader2,
  Search,
  Eye,
  Ban,
  ShieldOff,
  Trash2,
  RefreshCw,
  Download,
  Star,
  StickyNote,
  MapPin,
  PlayCircle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatBRL, formatDate } from "@/lib/formatters";
import { logAdminAction } from "@/lib/adminAudit";
import { downloadCsv } from "@/lib/csvExport";

export const Route = createFileRoute("/admin/passageiros")({
  head: () => ({ meta: [{ title: "Passageiros — Admin MOVVI" }] }),
  component: AdminPassageirosPage,
});

type Passenger = {
  id: string;
  auth_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string | null;
  suspended_at: string | null;
  blocked_at: string | null;
  block_reason: string | null;
  average_rating: number | null;
  total_ratings: number | null;
  completed_rides: number | null;
};

type Filter =
  | "todos"
  | "ativos"
  | "suspensos"
  | "bloqueados"
  | "com_corridas"
  | "sem_corridas"
  | "alta_avaliacao"
  | "baixa_avaliacao";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "ativos", label: "Ativos" },
  { key: "suspensos", label: "Suspensos" },
  { key: "bloqueados", label: "Bloqueados" },
  { key: "com_corridas", label: "Com corridas" },
  { key: "sem_corridas", label: "Sem corridas" },
  { key: "alta_avaliacao", label: "Alta avaliação" },
  { key: "baixa_avaliacao", label: "Baixa avaliação" },
];

const PAGE = 25;

function statusOf(p: Passenger) {
  if (p.blocked_at) return { label: "Bloqueado", tone: "bg-destructive/15 text-destructive border-destructive/30" };
  if (p.suspended_at) return { label: "Suspenso", tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
  return { label: "Ativo", tone: "bg-primary/15 text-primary border-primary/30" };
}

function badgeForRating(r: number): string {
  if (r >= 4.8) return "Premium";
  if (r >= 4.5) return "Muito Educado";
  if (r >= 4.0) return "Bom";
  if (r > 0) return "Regular";
  return "—";
}

function AdminPassageirosPage() {
  const [rows, setRows] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [suspendFor, setSuspendFor] = useState<Passenger | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [blockFor, setBlockFor] = useState<Passenger | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [unsuspendFor, setUnsuspendFor] = useState<Passenger | null>(null);
  const [unblockFor, setUnblockFor] = useState<Passenger | null>(null);
  const [deleteFor, setDeleteFor] = useState<Passenger | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    let query = supabase
      .from("users")
      .select(
        "id,auth_user_id,name,email,phone,city,avatar_url,created_at,last_login_at,suspended_at,blocked_at,block_reason,average_rating,total_ratings,completed_rides",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (q.trim()) {
      const term = `%${q.trim()}%`;
      query = query.or(
        `name.ilike.${term},email.ilike.${term},phone.ilike.${term},city.ilike.${term}`,
      );
    }
    if (filter === "ativos") query = query.is("suspended_at", null).is("blocked_at", null);
    if (filter === "suspensos") query = query.not("suspended_at", "is", null);
    if (filter === "bloqueados") query = query.not("blocked_at", "is", null);
    if (filter === "com_corridas") query = query.gt("completed_rides", 0);
    if (filter === "sem_corridas") query = query.or("completed_rides.is.null,completed_rides.eq.0");
    if (filter === "alta_avaliacao") query = query.gte("average_rating", 4.5);
    if (filter === "baixa_avaliacao") query = query.lt("average_rating", 3.5).gt("average_rating", 0);

    const { data, error, count: c } = await query;
    if (error) toast.error("Erro: " + error.message);
    setRows((data ?? []) as Passenger[]);
    setCount(c ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, page]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-passengers")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSuspend() {
    if (!suspendFor) return;
    setBusyId(suspendFor.id);
    const { error } = await supabase
      .from("users")
      .update({ suspended_at: new Date().toISOString(), block_reason: suspendReason.trim() || null })
      .eq("id", suspendFor.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({
      action: "passenger.suspend",
      entity: "users",
      entity_id: suspendFor.id,
      after: { reason: suspendReason },
    });
    toast.success("Passageiro suspenso");
    setSuspendFor(null);
    setSuspendReason("");
    refresh();
  }
  async function doUnsuspend() {
    if (!unsuspendFor) return;
    setBusyId(unsuspendFor.id);
    const { error } = await supabase
      .from("users")
      .update({ suspended_at: null, block_reason: null })
      .eq("id", unsuspendFor.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "passenger.unsuspend", entity: "users", entity_id: unsuspendFor.id });
    toast.success("Suspensão removida");
    setUnsuspendFor(null);
    refresh();
  }
  async function doBlock() {
    if (!blockFor || !blockReason.trim()) return;
    setBusyId(blockFor.id);
    const { error } = await supabase
      .from("users")
      .update({ blocked_at: new Date().toISOString(), block_reason: blockReason.trim() })
      .eq("id", blockFor.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({
      action: "passenger.block",
      entity: "users",
      entity_id: blockFor.id,
      after: { reason: blockReason },
    });
    toast.success("Passageiro bloqueado");
    setBlockFor(null);
    setBlockReason("");
    refresh();
  }
  async function doUnblock() {
    if (!unblockFor) return;
    setBusyId(unblockFor.id);
    const { error } = await supabase
      .from("users")
      .update({ blocked_at: null, block_reason: null })
      .eq("id", unblockFor.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "passenger.unblock", entity: "users", entity_id: unblockFor.id });
    toast.success("Desbloqueado");
    setUnblockFor(null);
    refresh();
  }
  async function doDelete() {
    if (!deleteFor) return;
    setBusyId(deleteFor.id);
    const { error } = await supabase.from("users").delete().eq("id", deleteFor.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({
      action: "passenger.delete",
      entity: "users",
      entity_id: deleteFor.id,
      before: { name: deleteFor.name },
    });
    toast.success("Passageiro excluído");
    setDeleteFor(null);
    refresh();
  }

  function exportCsv() {
    downloadCsv(
      `passageiros-${new Date().toISOString().slice(0, 10)}`,
      rows.map((r) => ({
        nome: r.name ?? "",
        email: r.email ?? "",
        telefone: r.phone ?? "",
        cidade: r.city ?? "",
        cadastro: r.created_at,
        ultimo_login: r.last_login_at ?? "",
        avaliacao: r.average_rating ?? "",
        corridas: r.completed_rides ?? 0,
        status: r.blocked_at ? "bloqueado" : r.suspended_at ? "suspenso" : "ativo",
      })),
    );
  }

  const pages = Math.max(1, Math.ceil(count / PAGE));

  const counts = useMemo(() => {
    const list = rows;
    return {
      ativos: list.filter((p) => !p.suspended_at && !p.blocked_at).length,
      suspensos: list.filter((p) => p.suspended_at && !p.blocked_at).length,
      bloqueados: list.filter((p) => p.blocked_at).length,
    };
  }, [rows]);

  return (
    <AdminLayout
      title="Passageiros"
      description={`${count} cadastrados • ${counts.ativos} ativos na página`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      }
    >
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail, telefone ou cidade"
            value={q}
            onChange={(e) => {
              setPage(0);
              setQ(e.target.value);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setPage(0);
                  setFilter(f.key);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="grid place-items-center py-12 text-sm text-muted-foreground">
          Nenhum passageiro encontrado.
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((p) => {
            const st = statusOf(p);
            const rating = Number(p.average_rating ?? 0);
            return (
              <Card
                key={p.id}
                className="cursor-pointer border-border bg-card/60 transition hover:border-primary/50"
                onClick={() => setSelected(p)}
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <Avatar src={p.avatar_url} name={p.name ?? "?"} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{p.name ?? "Sem nome"}</p>
                      <Badge variant="outline" className={st.tone}>
                        {st.label}
                      </Badge>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        <Star className="mr-1 h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {rating > 0 ? rating.toFixed(2) : "—"} ({p.total_ratings ?? 0})
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.email ?? "—"} · {p.phone ?? "—"} · {p.city ?? "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {p.completed_rides ?? 0} corridas • Cadastro {formatDate(p.created_at)}
                      {p.last_login_at ? ` • Último login ${formatDate(p.last_login_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(p)} className="gap-1">
                      <Eye className="h-3 w-3" /> Detalhes
                    </Button>
                    {p.suspended_at ? (
                      <Button size="sm" variant="ghost" onClick={() => setUnsuspendFor(p)} className="gap-1">
                        <PlayCircle className="h-3 w-3" /> Reativar
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setSuspendFor(p)} className="gap-1">
                        <Ban className="h-3 w-3" /> Suspender
                      </Button>
                    )}
                    {p.blocked_at ? (
                      <Button size="sm" variant="ghost" onClick={() => setUnblockFor(p)}>
                        Desbloquear
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setBlockFor(p)}
                        className="gap-1 text-destructive"
                      >
                        <ShieldOff className="h-3 w-3" /> Bloquear
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteFor(p)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Página {page + 1} de {pages}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      </div>

      <PassengerDetail
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        passenger={selected}
        onSuspend={(p) => setSuspendFor(p)}
        onUnsuspend={(p) => setUnsuspendFor(p)}
        onBlock={(p) => setBlockFor(p)}
        onUnblock={(p) => setUnblockFor(p)}
        onDelete={(p) => setDeleteFor(p)}
      />

      {/* Suspend */}
      <Dialog open={!!suspendFor} onOpenChange={(o) => !o && setSuspendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender passageiro</DialogTitle>
            <DialogDescription>
              A suspensão bloqueia novas solicitações. Pode ser removida a qualquer momento.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Motivo (opcional)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendFor(null)}>
              Cancelar
            </Button>
            <Button onClick={doSuspend} disabled={busyId === suspendFor?.id}>
              {busyId === suspendFor?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar suspensão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block */}
      <Dialog open={!!blockFor} onOpenChange={(o) => !o && setBlockFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear passageiro</DialogTitle>
            <DialogDescription>
              O bloqueio impede o passageiro de usar o app. Informe o motivo (obrigatório).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="Motivo do bloqueio"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlockFor(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={doBlock}
              disabled={!blockReason.trim() || busyId === blockFor?.id}
            >
              {busyId === blockFor?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Bloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsuspend / Unblock / Delete confirms */}
      <AlertDialog open={!!unsuspendFor} onOpenChange={(o) => !o && setUnsuspendFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar {unsuspendFor?.name ?? "passageiro"}?</AlertDialogTitle>
            <AlertDialogDescription>A suspensão será removida imediatamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doUnsuspend}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unblockFor} onOpenChange={(o) => !o && setUnblockFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desbloquear {unblockFor?.name ?? "passageiro"}?</AlertDialogTitle>
            <AlertDialogDescription>O passageiro voltará a usar o app.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doUnblock}>Desbloquear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteFor?.name ?? "passageiro"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O cadastro e dados associados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doDelete}
            >
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

type Stats = {
  total_rides: number;
  completed_rides: number;
  cancelled_rides: number;
  total_spent: number;
  avg_rating: number;
};
type RideRow = {
  id: string;
  created_at: string;
  status: string;
  final_price: number | null;
  origin_name: string | null;
  destination_name: string | null;
  payment_method: string | null;
};
type AdminNote = { id: string; passenger_id: string; admin_id: string; note: string; created_at: string };
type RatingRow = { passenger_rating: number | null; passenger_comment: string | null; passenger_rated_at: string | null };
type TicketRow = { id: string; subject: string | null; status: string | null; created_at: string };
type IncidentRow = { id: string; category: string | null; description: string | null; created_at: string };
type SosRow = { id: string; resolved_at: string | null; created_at: string };

function PassengerDetail({
  open,
  onOpenChange,
  passenger,
  onSuspend,
  onUnsuspend,
  onBlock,
  onUnblock,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  passenger: Passenger | null;
  onSuspend: (p: Passenger) => void;
  onUnsuspend: (p: Passenger) => void;
  onBlock: (p: Passenger) => void;
  onUnblock: (p: Passenger) => void;
  onDelete: (p: Passenger) => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rides, setRides] = useState<RideRow[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [sos, setSos] = useState<SosRow[]>([]);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!passenger || !open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const uid = passenger.auth_user_id;
      const [statsRes, ridesRes, ratingsRes, ticketsRes, incRes, sosRes, notesRes] = await Promise.all([
        supabase.rpc("get_passenger_stats", { _user_id: uid }),
        supabase
          .from("rides")
          .select("id,created_at,status,final_price,origin_name,destination_name,payment_method")
          .eq("passenger_id", uid)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("ride_ratings")
          .select("passenger_rating,passenger_comment,passenger_rated_at")
          .eq("passenger_id", uid)
          .not("passenger_rating", "is", null)
          .order("passenger_rated_at", { ascending: false })
          .limit(10),
        supabase
          .from("support_tickets")
          .select("id,subject,status,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("incident_reports")
          .select("id,category,description,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("sos_alerts")
          .select("id,resolved_at,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("admin_passenger_notes")
          .select("*")
          .eq("passenger_id", passenger.id)
          .order("created_at", { ascending: false }),
      ]);
      if (!alive) return;
      if (statsRes.data && Array.isArray(statsRes.data) && statsRes.data[0]) {
        const s = statsRes.data[0] as Record<string, number | string>;
        setStats({
          total_rides: Number(s.total_rides) || 0,
          completed_rides: Number(s.completed_rides) || 0,
          cancelled_rides: Number(s.cancelled_rides) || 0,
          total_spent: Number(s.total_spent) || 0,
          avg_rating: Number(s.avg_rating) || 0,
        });
      } else setStats(null);
      setRides((ridesRes.data ?? []) as RideRow[]);
      setRatings((ratingsRes.data ?? []) as RatingRow[]);
      setTickets((ticketsRes.data ?? []) as TicketRow[]);
      setIncidents((incRes.data ?? []) as IncidentRow[]);
      setSos((sosRes.data ?? []) as SosRow[]);
      setNotes((notesRes.data ?? []) as AdminNote[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [passenger, open]);

  const paymentTop = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rides) {
      const k = r.payment_method ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    let best: string | null = null;
    let n = 0;
    for (const [k, v] of map) {
      if (v > n) {
        best = k;
        n = v;
      }
    }
    return best;
  }, [rides]);

  const favOrigins = useMemo(() => topN(rides.map((r) => r.origin_name ?? "").filter(Boolean), 3), [rides]);
  const favDestinations = useMemo(
    () => topN(rides.map((r) => r.destination_name ?? "").filter(Boolean), 3),
    [rides],
  );

  async function addNote() {
    if (!passenger || !noteDraft.trim()) return;
    setSavingNote(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSavingNote(false);
      toast.error("Sessão expirada.");
      return;
    }
    const { data, error } = await supabase
      .from("admin_passenger_notes")
      .insert({ passenger_id: passenger.id, admin_id: auth.user.id, note: noteDraft.trim() })
      .select("*")
      .single();
    setSavingNote(false);
    if (error) return toast.error("Erro ao salvar nota: " + error.message);
    setNotes((cur) => [data as AdminNote, ...cur]);
    setNoteDraft("");
    toast.success("Nota adicionada");
  }

  async function removeNote(id: string) {
    const { error } = await supabase.from("admin_passenger_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((cur) => cur.filter((n) => n.id !== id));
  }

  if (!passenger) return null;
  const st = statusOf(passenger);
  const rating = Number(passenger.average_rating ?? 0);
  const suspended = !!passenger.suspended_at;
  const blocked = !!passenger.blocked_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar src={passenger.avatar_url} name={passenger.name ?? "?"} size={64} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {passenger.name ?? "Sem nome"}
                <Badge variant="outline" className={st.tone}>
                  {st.label}
                </Badge>
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {badgeForRating(rating)}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {passenger.city ?? "—"} • Cadastro {formatDate(passenger.created_at)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-2 text-sm">
          <Section title="Identidade">
            <Row label="Nome" value={passenger.name} />
            <Row label="E-mail" value={passenger.email} />
            <Row label="Telefone" value={passenger.phone} />
            <Row label="Cidade" value={passenger.city} />
            <Row label="Cadastro" value={formatDate(passenger.created_at)} />
            <Row label="Último login" value={passenger.last_login_at ? formatDate(passenger.last_login_at) : "—"} />
            {passenger.block_reason && (
              <Row label="Motivo (bloqueio/suspensão)" value={passenger.block_reason} />
            )}
          </Section>

          <Section title="Atividade de corridas">
            {loading ? (
              <div className="grid place-items-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Kpi label="Total" v={String(stats?.total_rides ?? 0)} />
                  <Kpi label="Concluídas" v={String(stats?.completed_rides ?? 0)} />
                  <Kpi label="Canceladas" v={String(stats?.cancelled_rides ?? 0)} />
                  <Kpi label="Gasto total" v={formatBRL(stats?.total_spent ?? 0)} />
                </div>
                <div className="mt-3 grid gap-1 text-xs">
                  <Row label="Última corrida" value={rides[0] ? formatDate(rides[0].created_at) : "—"} />
                  <Row label="Pagamento mais usado" value={paymentTop} />
                  <Row label="Origens frequentes" value={favOrigins.join(" • ") || "—"} />
                  <Row label="Destinos frequentes" value={favDestinations.join(" • ") || "—"} />
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Ver últimas {rides.length} corridas
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {rides.map((r) => (
                      <li key={r.id} className="rounded border border-border bg-muted/30 p-2">
                        <div className="flex justify-between">
                          <span>{formatDate(r.created_at)}</span>
                          <span className="font-medium">{formatBRL(r.final_price ?? 0)}</span>
                        </div>
                        <p className="truncate text-muted-foreground">
                          <MapPin className="mr-1 inline h-3 w-3" />
                          {r.origin_name ?? "?"} → {r.destination_name ?? "?"}
                        </p>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {r.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </Section>

          <Section title="Reputação">
            <Row label="Avaliação média" value={rating > 0 ? rating.toFixed(2) : "—"} />
            <Row label="Total de avaliações" value={String(passenger.total_ratings ?? 0)} />
            <Row label="Badge" value={badgeForRating(rating)} />
            {ratings.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">Comentários recentes</p>
                {ratings.map((r, i) => (
                  <div key={i} className="rounded border border-border bg-muted/30 p-2 text-xs">
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{r.passenger_rating}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {r.passenger_rated_at ? formatDate(r.passenger_rated_at) : ""}
                      </span>
                    </div>
                    {r.passenger_comment && <p className="mt-1 text-muted-foreground">{r.passenger_comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Segurança e suporte">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniList
                title="Tickets de suporte"
                items={tickets.map((t) => ({
                  key: t.id,
                  label: t.subject ?? "(sem assunto)",
                  meta: `${t.status ?? "—"} • ${formatDate(t.created_at)}`,
                }))}
              />
              <MiniList
                title="Incidentes reportados"
                items={incidents.map((t) => ({
                  key: t.id,
                  label: t.category ?? "Incidente",
                  meta: formatDate(t.created_at),
                }))}
              />
              <MiniList
                title="Alertas SOS"
                items={sos.map((t) => ({
                  key: t.id,
                  label: t.status ?? "SOS",
                  meta: formatDate(t.created_at),
                }))}
              />
            </div>
          </Section>

          <Section title="Notas internas">
            <div className="flex gap-2">
              <Textarea
                rows={2}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Adicionar nota interna (visível apenas para administradores)..."
              />
              <Button onClick={addNote} disabled={!noteDraft.trim() || savingNote}>
                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {notes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma nota registrada.</p>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-2"
                  >
                    <StickyNote className="mt-0.5 h-4 w-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs whitespace-pre-wrap">{n.note}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatDate(n.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNote(n.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Section>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {suspended ? (
            <Button variant="outline" onClick={() => onUnsuspend(passenger)}>
              <PlayCircle className="mr-1 h-4 w-4" /> Reativar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onSuspend(passenger)}>
              <Ban className="mr-1 h-4 w-4" /> Suspender
            </Button>
          )}
          {blocked ? (
            <Button variant="outline" onClick={() => onUnblock(passenger)}>
              Desbloquear
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onBlock(passenger)}>
              <ShieldOff className="mr-1 h-4 w-4" /> Bloquear
            </Button>
          )}
          <Button variant="destructive" onClick={() => onDelete(passenger)}>
            <Trash2 className="mr-1 h-4 w-4" /> Excluir
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function topN(items: string[], n: number): string[] {
  const map = new Map<string, number>();
  for (const it of items) map.set(it, (map.get(it) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

function Kpi({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2 text-center">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-bold">{v}</p>
    </div>
  );
}

function MiniList({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; meta: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nenhum registro.</p>
      ) : (
        <ul className="space-y-1 text-[11px]">
          {items.map((i) => (
            <li key={i.key} className="rounded border border-border/40 bg-background/40 p-1.5">
              <p className="truncate font-medium">{i.label}</p>
              <p className="text-[10px] text-muted-foreground">{i.meta}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
