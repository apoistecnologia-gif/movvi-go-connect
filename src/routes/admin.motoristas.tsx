import { createFileRoute } from "@tanstack/react-router";
import { Avatar } from "@/components/Avatar";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Loader2,
  ShieldAlert,
  XCircle,
  Eye,
  FileText,
  RefreshCw,
  CreditCard,
  Zap,
  Search,
  Star,
  MapPin,
  Wifi,
  WifiOff,
  Car,
  Trash2,
  StickyNote,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logAdminAction } from "@/lib/adminAudit";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getDriverDocumentUrls } from "@/lib/driverDocs.functions";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/motoristas")({
  head: () => ({ meta: [{ title: "Motoristas — Admin MOVVI" }] }),
  component: AdminMotoristas,
});

type Driver = Database["public"]["Tables"]["drivers"]["Row"] & {
  suspended_at?: string | null;
  cnh_back_url?: string | null;
  vehicle_photo_url?: string | null;
  insurance_url?: string | null;
  documents_status?: string | null;
  asaas_customer_id?: string | null;
};
type Status = Driver["approval_status"];
type SubStatus = "active" | "inactive" | "pending" | "overdue" | "suspended";
type FilterKey =
  | "all"
  | "em_analise"
  | "aprovado"
  | "reprovado"
  | "bloqueado"
  | "online"
  | "offline"
  | "sub_active"
  | "sub_overdue"
  | "docs_pending";

type AdminNote = {
  id: string;
  driver_id: string;
  admin_id: string;
  note: string;
  created_at: string;
};

const SUB_STATUSES: { value: SubStatus; label: string; tone: string }[] = [
  { value: "active", label: "Ativa", tone: "bg-primary/15 text-primary border-primary/30" },
  { value: "pending", label: "Pendente", tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  { value: "overdue", label: "Em atraso", tone: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "inactive", label: "Inativa", tone: "bg-muted text-muted-foreground border-border" },
  { value: "suspended", label: "Suspensa", tone: "bg-destructive/15 text-destructive border-destructive/30" },
];

function subMeta(s: string | null | undefined) {
  return (
    SUB_STATUSES.find((x) => x.value === s) ?? {
      value: "inactive" as SubStatus,
      label: "—",
      tone: "bg-muted text-muted-foreground border-border",
    }
  );
}

const STATUS_META: Record<Status, { label: string; tone: string }> = {
  em_analise: { label: "Em análise", tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  aprovado: { label: "Aprovado", tone: "bg-primary/15 text-primary border-primary/30" },
  reprovado: { label: "Reprovado", tone: "bg-destructive/15 text-destructive border-destructive/30" },
  bloqueado: { label: "Bloqueado", tone: "bg-destructive/15 text-destructive border-destructive/30" },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "em_analise", label: "Em análise" },
  { key: "aprovado", label: "Aprovados" },
  { key: "reprovado", label: "Reprovados" },
  { key: "bloqueado", label: "Bloqueados" },
  { key: "online", label: "Online" },
  { key: "offline", label: "Offline" },
  { key: "sub_active", label: "Assinatura ativa" },
  { key: "sub_overdue", label: "Assinatura vencida" },
  { key: "docs_pending", label: "Docs pendentes" },
];

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtRelative(d: string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d2 = Math.floor(h / 24);
  return `${d2}d atrás`;
}

function docsPending(d: Driver) {
  if (d.documents_status && d.documents_status !== "approved" && d.documents_status !== "aprovado") return true;
  return !d.selfie_url || !d.cnh_url || !d.vehicle_document_url;
}

function AdminMotoristas() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [activeRides, setActiveRides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Driver | null>(null);
  const [rejectFor, setRejectFor] = useState<Driver | null>(null);
  const [blockFor, setBlockFor] = useState<Driver | null>(null);
  const [unblockFor, setUnblockFor] = useState<Driver | null>(null);
  const [suspendFor, setSuspendFor] = useState<Driver | null>(null);
  const [subFor, setSubFor] = useState<Driver | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data, error }, rides] = await Promise.all([
      supabase.from("drivers").select("*").order("created_at", { ascending: false }),
      supabase
        .from("rides")
        .select("driver_id,status")
        .not("driver_id", "is", null)
        .in("status", ["aceita", "em_andamento", "a_caminho", "chegou_no_local"] as never[]),
    ]);
    if (error) {
      toast.error("Erro ao carregar motoristas: " + error.message);
      setDrivers([]);
    } else {
      setDrivers((data ?? []) as Driver[]);
    }
    const map: Record<string, string> = {};
    for (const r of (rides.data ?? []) as { driver_id: string; status: string }[]) {
      if (r.driver_id) map[r.driver_id] = r.status;
    }
    setActiveRides(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-drivers")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const list = drivers ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((d) => {
      if (filter === "em_analise" || filter === "aprovado" || filter === "reprovado" || filter === "bloqueado") {
        if (d.approval_status !== filter) return false;
      } else if (filter === "online") {
        if (!d.is_online) return false;
      } else if (filter === "offline") {
        if (d.is_online) return false;
      } else if (filter === "sub_active") {
        if (d.subscription_status !== "active") return false;
      } else if (filter === "sub_overdue") {
        if (d.subscription_status !== "overdue") return false;
      } else if (filter === "docs_pending") {
        if (!docsPending(d)) return false;
      }
      if (!q) return true;
      const hay = [d.name, d.phone, d.email, d.vehicle_plate, d.city]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [drivers, filter, search]);

  const counts = useMemo(() => {
    const list = drivers ?? [];
    return {
      all: list.length,
      em_analise: list.filter((d) => d.approval_status === "em_analise").length,
      aprovado: list.filter((d) => d.approval_status === "aprovado").length,
      reprovado: list.filter((d) => d.approval_status === "reprovado").length,
      bloqueado: list.filter((d) => d.approval_status === "bloqueado").length,
      online: list.filter((d) => d.is_online).length,
      offline: list.filter((d) => !d.is_online).length,
      sub_active: list.filter((d) => d.subscription_status === "active").length,
      sub_overdue: list.filter((d) => d.subscription_status === "overdue").length,
      docs_pending: list.filter(docsPending).length,
    } as Record<FilterKey, number>;
  }, [drivers]);

  async function updateStatus(d: Driver, status: Status, reason?: string | null) {
    setBusyId(d.id);
    const patch: Database["public"]["Tables"]["drivers"]["Update"] = {
      approval_status: status,
      motivo_reprovacao: status === "reprovado" ? reason ?? null : null,
      approved_at: status === "aprovado" ? new Date().toISOString() : null,
      blocked_at: status === "bloqueado" ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from("drivers").update(patch).eq("id", d.id);
    setBusyId(null);
    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
      return;
    }
    await logAdminAction({
      action: `driver.${status}`,
      entity: "drivers",
      entity_id: d.id,
      before: { approval_status: d.approval_status },
      after: patch,
    });
    if (status === "aprovado") toast.success("Motorista aprovado com sucesso");
    if (status === "reprovado") toast.success("Motorista reprovado");
    if (status === "bloqueado") toast.success("Motorista bloqueado");
    if (status === "em_analise") toast.success("Cadastro reenviado para análise");
    setRejectFor(null);
    setBlockFor(null);
    setUnblockFor(null);
    setRejectReason("");
    if (detail?.id === d.id) setDetail({ ...d, ...patch } as Driver);
    load();
  }

  async function toggleSuspend(d: Driver, suspend: boolean) {
    setBusyId(d.id);
    const patch = { suspended_at: suspend ? new Date().toISOString() : null } as never;
    const { error } = await supabase.from("drivers").update(patch).eq("id", d.id);
    setBusyId(null);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    await logAdminAction({
      action: suspend ? "driver.suspend" : "driver.unsuspend",
      entity: "drivers",
      entity_id: d.id,
      before: { suspended_at: d.suspended_at ?? null },
      after: { suspended_at: suspend ? "now" : null },
    });
    toast.success(suspend ? "Motorista suspenso" : "Suspensão removida");
    setSuspendFor(null);
    if (detail?.id === d.id) setDetail({ ...d, suspended_at: suspend ? new Date().toISOString() : null });
    load();
  }

  return (
    <AdminLayout
      title="Gestão de Motoristas"
      description={`${counts.all} motoristas cadastrados • ${counts.online} online agora`}
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      }
    >
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, e-mail, placa ou cidade..."
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
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                }`}
              >
                {f.label}
                <span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {counts[f.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading && !drivers ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          Nenhum motorista encontrado com os filtros atuais.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((d) => (
            <DriverCard
              key={d.id}
              driver={d}
              activeRideStatus={activeRides[d.user_id] ?? null}
              busy={busyId === d.id}
              onDetails={() => setDetail(d)}
              onApprove={() => updateStatus(d, "aprovado")}
              onReject={() => {
                setRejectFor(d);
                setRejectReason(d.motivo_reprovacao ?? "");
              }}
              onBlock={() => setBlockFor(d)}
              onUnblock={() => setUnblockFor(d)}
              onSuspendToggle={() => setSuspendFor(d)}
              onSubscription={() => setSubFor(d)}
            />
          ))}
        </div>
      )}

      <DetailsDialog
        driver={detail}
        activeRideStatus={detail ? activeRides[detail.user_id] ?? null : null}
        onClose={() => setDetail(null)}
        onApprove={(d) => updateStatus(d, "aprovado")}
        onReject={(d) => {
          setRejectFor(d);
          setRejectReason(d.motivo_reprovacao ?? "");
        }}
        onBlock={(d) => setBlockFor(d)}
        onUnblock={(d) => setUnblockFor(d)}
        onSuspendToggle={(d) => setSuspendFor(d)}
        onSubscription={(d) => setSubFor(d)}
        busy={!!busyId}
      />

      <SubscriptionDialog
        driver={subFor}
        onClose={() => setSubFor(null)}
        onSaved={(updated) => {
          setSubFor(null);
          if (detail?.id === updated.id) setDetail(updated);
          load();
        }}
      />

      {/* Reject reason */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar motorista</DialogTitle>
            <DialogDescription>
              Informe o motivo da reprovação. Será exibido ao motorista.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ex.: CNH ilegível, documento do veículo vencido..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectFor(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || busyId === rejectFor?.id}
              onClick={() => rejectFor && updateStatus(rejectFor, "reprovado", rejectReason.trim())}
            >
              {busyId === rejectFor?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar reprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block confirm */}
      <AlertDialog open={!!blockFor} onOpenChange={(o) => !o && setBlockFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear {blockFor?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O motorista deixará de aparecer para passageiros. Você pode desbloquear depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => blockFor && updateStatus(blockFor, "bloqueado")}
            >
              Bloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unblock confirm */}
      <AlertDialog open={!!unblockFor} onOpenChange={(o) => !o && setUnblockFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desbloquear {unblockFor?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro voltará para análise para nova aprovação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => unblockFor && updateStatus(unblockFor, "em_analise")}>
              Desbloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend / Unsuspend confirm */}
      <AlertDialog open={!!suspendFor} onOpenChange={(o) => !o && setSuspendFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendFor?.suspended_at ? "Reativar" : "Suspender"} {suspendFor?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendFor?.suspended_at
                ? "A suspensão será removida imediatamente."
                : "Suspensão temporária do motorista. Pode ser desfeita a qualquer momento."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => suspendFor && toggleSuspend(suspendFor, !suspendFor.suspended_at)}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function DriverCard({
  driver,
  activeRideStatus,
  busy,
  onDetails,
  onApprove,
  onReject,
  onBlock,
  onUnblock,
  onSuspendToggle,
  onSubscription,
}: {
  driver: Driver;
  activeRideStatus: string | null;
  busy: boolean;
  onDetails: () => void;
  onApprove: () => void;
  onReject: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onSuspendToggle: () => void;
  onSubscription: () => void;
}) {
  const meta = STATUS_META[driver.approval_status];
  const sm = subMeta(driver.subscription_status);
  const online = !!driver.is_online;
  const rating = Number(driver.average_rating ?? driver.rating ?? 0);
  const suspended = !!driver.suspended_at;

  return (
    <div
      className="group cursor-pointer rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50"
      onClick={onDetails}
    >
      <div className="flex flex-wrap items-start gap-4">
        <Avatar src={driver.photo_url ?? driver.selfie_url ?? null} name={driver.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{driver.name}</h3>
            <Badge variant="outline" className={meta.tone}>
              {meta.label}
            </Badge>
            <Badge variant="outline" className={sm.tone}>
              <CreditCard className="mr-1 h-3 w-3" />
              {sm.label}
            </Badge>
            <Badge
              variant="outline"
              className={
                online
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }
            >
              {online ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
              {online ? "Online" : "Offline"}
            </Badge>
            {activeRideStatus && (
              <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-400">
                <Car className="mr-1 h-3 w-3" /> Em corrida ({activeRideStatus})
              </Badge>
            )}
            {suspended && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                Suspenso
              </Badge>
            )}
            {docsPending(driver) && (
              <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
                Docs pendentes
              </Badge>
            )}
            <Badge variant="secondary" className="capitalize">
              {driver.category}
            </Badge>
          </div>
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>📞 {driver.phone ?? "—"}</span>
            <span>✉️ {driver.email ?? "—"}</span>
            <span>📍 {driver.city}/{driver.state}</span>
            <span>
              🚗 {driver.vehicle_model} • {driver.vehicle_color} • {driver.vehicle_year} • {driver.vehicle_plate}
            </span>
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {rating.toFixed(2)} ({driver.total_ratings ?? 0}) • {driver.completed_rides ?? 0} corridas
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> GPS: {fmtRelative(driver.last_location_at)}
            </span>
            <span>Cadastro: {fmtDate(driver.created_at)}</span>
          </div>
          {driver.approval_status === "reprovado" && driver.motivo_reprovacao && (
            <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Motivo: {driver.motivo_reprovacao}
            </p>
          )}
        </div>
        <div
          className="flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="outline" onClick={onDetails}>
            <Eye className="mr-1 h-4 w-4" /> Detalhes
          </Button>
          <Button size="sm" variant="outline" onClick={onSubscription}>
            <CreditCard className="mr-1 h-4 w-4" /> Assinatura
          </Button>
          {driver.approval_status !== "aprovado" && (
            <Button size="sm" onClick={onApprove} disabled={busy}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar
            </Button>
          )}
          {driver.approval_status !== "reprovado" && (
            <Button size="sm" variant="destructive" onClick={onReject} disabled={busy}>
              <XCircle className="mr-1 h-4 w-4" /> Reprovar
            </Button>
          )}
          {driver.approval_status !== "bloqueado" ? (
            <Button size="sm" variant="outline" onClick={onBlock} disabled={busy}>
              <ShieldAlert className="mr-1 h-4 w-4" /> Bloquear
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onUnblock} disabled={busy}>
              Desbloquear
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onSuspendToggle} disabled={busy}>
            {suspended ? (
              <>
                <PlayCircle className="mr-1 h-4 w-4" /> Reativar
              </>
            ) : (
              <>
                <PauseCircle className="mr-1 h-4 w-4" /> Suspender
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailsDialog({
  driver,
  activeRideStatus,
  onClose,
  onApprove,
  onReject,
  onBlock,
  onUnblock,
  onSuspendToggle,
  onSubscription,
  busy,
}: {
  driver: Driver | null;
  activeRideStatus: string | null;
  onClose: () => void;
  onApprove: (d: Driver) => void;
  onReject: (d: Driver) => void;
  onBlock: (d: Driver) => void;
  onUnblock: (d: Driver) => void;
  onSuspendToggle: (d: Driver) => void;
  onSubscription: (d: Driver) => void;
  busy: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [urlError, setUrlError] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [subscription, setSubscription] = useState<{
    plan_name?: string | null;
    period_end?: string | null;
    monthly_fee?: number | null;
    last_payment_at?: string | null;
    last_payment_asaas_id?: string | null;
  } | null>(null);
  const fetchUrls = useServerFn(getDriverDocumentUrls);

  useEffect(() => {
    if (!driver) return;
    let cancelled = false;
    setUrls({});
    setUrlError(null);
    setDocsLoading(true);
    (async () => {
      try {
        const result = await fetchUrls({ data: { driverId: driver.id } });
        if (cancelled) return;
        setUrls(result);
      } catch (err) {
        if (cancelled) return;
        setUrlError(err instanceof Error ? err.message : "Falha ao gerar URLs.");
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();

    (async () => {
      const { data } = await supabase
        .from("admin_driver_notes")
        .select("*")
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: false });
      if (!cancelled) setNotes((data ?? []) as AdminNote[]);
    })();

    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        const s = data as Record<string, unknown> | null;
        if (s) {
          setSubscription({
            plan_name: (s.plan_name as string) ?? null,
            period_end: (s.period_end as string) ?? null,
            monthly_fee: (s.amount as number) ?? (s.monthly_fee as number) ?? null,
            last_payment_at: (s.last_payment_at as string) ?? null,
            last_payment_asaas_id: (s.last_payment_asaas_id as string) ?? (s.asaas_payment_id as string) ?? null,
          });
        } else {
          setSubscription(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.id]);

  if (!driver) return null;
  const meta = STATUS_META[driver.approval_status];
  const suspended = !!driver.suspended_at;

  async function addNote() {
    if (!driver || !noteDraft.trim()) return;
    setSavingNote(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSavingNote(false);
      toast.error("Sessão expirada.");
      return;
    }
    const { data, error } = await supabase
      .from("admin_driver_notes")
      .insert({ driver_id: driver.id, admin_id: auth.user.id, note: noteDraft.trim() })
      .select("*")
      .single();
    setSavingNote(false);
    if (error) {
      toast.error("Erro ao salvar nota: " + error.message);
      return;
    }
    setNotes((cur) => [data as AdminNote, ...cur]);
    setNoteDraft("");
    toast.success("Nota adicionada");
  }

  async function removeNote(id: string) {
    const { error } = await supabase.from("admin_driver_notes").delete().eq("id", id);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    setNotes((cur) => cur.filter((n) => n.id !== id));
    toast.success("Nota removida");
  }

  const hasLocation = driver.current_lat != null && driver.current_lng != null;
  const mapUrl = hasLocation
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${driver.current_lat},${driver.current_lng}&zoom=15&size=560x220&markers=${driver.current_lat},${driver.current_lng},red-pushpin`
    : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar src={driver.photo_url ?? driver.selfie_url ?? null} name={driver.name} size={64} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {driver.name}
                <Badge variant="outline" className={meta.tone}>
                  {meta.label}
                </Badge>
                {suspended && (
                  <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                    Suspenso
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {driver.city}/{driver.state} • Cadastro {fmtDate(driver.created_at)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-2 text-sm">
          <Section title="Identidade">
            <Row label="Nome" value={driver.name} />
            <Row label="E-mail" value={driver.email} />
            <Row label="Telefone" value={driver.phone} />
            <Row label="Cidade/UF" value={`${driver.city}/${driver.state}`} />
            <Row label="Cadastro em" value={fmtDate(driver.created_at)} />
          </Section>

          <Section title="Veículo">
            <Row label="Categoria" value={driver.category} />
            <Row label="Modelo" value={driver.vehicle_model} />
            <Row label="Cor" value={driver.vehicle_color} />
            <Row label="Ano" value={String(driver.vehicle_year)} />
            <Row label="Placa" value={driver.vehicle_plate} />
          </Section>

          <Section title="Documentos">
            {urlError && (
              <p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {urlError}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DocCard label="Selfie" url={urls.selfie_url} rawPath={driver.selfie_url} loading={docsLoading} failed={!!urlError} />
              <DocCard label="CNH" url={urls.cnh_url} rawPath={driver.cnh_url} loading={docsLoading} failed={!!urlError} />
              <DocCard
                label="Doc. Veículo"
                url={urls.vehicle_document_url}
                rawPath={driver.vehicle_document_url}
                loading={docsLoading}
                failed={!!urlError}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Status dos documentos: {driver.documents_status ?? "não informado"}
            </p>
          </Section>

          <Section title="Operacional">
            <Row
              label="Status"
              value={driver.is_online ? "Online" : "Offline"}
            />
            <Row label="Em corrida" value={activeRideStatus ?? "Não"} />
            <Row
              label="Última localização"
              value={
                hasLocation
                  ? `${driver.current_lat?.toFixed(5)}, ${driver.current_lng?.toFixed(5)}`
                  : "—"
              }
            />
            <Row label="Atualização GPS" value={fmtDate(driver.last_location_at) + " (" + fmtRelative(driver.last_location_at) + ")"} />
            {mapUrl && (
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <img src={mapUrl} alt="Localização" className="h-[220px] w-full object-cover" />
              </div>
            )}
          </Section>

          <Section title="Reputação">
            <Row label="Avaliação média" value={(Number(driver.average_rating ?? driver.rating ?? 0)).toFixed(2)} />
            <Row label="Total de avaliações" value={String(driver.total_ratings ?? 0)} />
            <Row label="Corridas concluídas" value={String(driver.completed_rides ?? 0)} />
            <Row
              label="Badge"
              value={badgeForRating(Number(driver.average_rating ?? driver.rating ?? 0))}
            />
          </Section>

          <Section title="Assinatura">
            <Row label="Status" value={subMeta(driver.subscription_status).label} />
            <Row label="Plano" value={subscription?.plan_name ?? "—"} />
            <Row
              label="Mensalidade"
              value={
                subscription?.monthly_fee != null
                  ? `R$ ${Number(subscription.monthly_fee).toFixed(2)}`
                  : "—"
              }
            />
            <Row label="Próxima renovação" value={fmtDate(subscription?.period_end ?? driver.subscription_expires_at)} />
            <Row label="Último pagamento" value={fmtDate(subscription?.last_payment_at)} />
            <Row label="Asaas ID" value={subscription?.last_payment_asaas_id ?? driver.asaas_customer_id ?? "—"} />
            <Button variant="outline" size="sm" className="mt-2" onClick={() => onSubscription(driver)}>
              <CreditCard className="mr-1 h-4 w-4" /> Gerenciar assinatura
            </Button>
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
                  <div key={n.id} className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-2">
                    <StickyNote className="mt-0.5 h-4 w-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs whitespace-pre-wrap">{n.note}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</p>
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
          {driver.approval_status !== "aprovado" && (
            <Button onClick={() => onApprove(driver)} disabled={busy}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar
            </Button>
          )}
          {driver.approval_status !== "reprovado" && (
            <Button variant="destructive" onClick={() => onReject(driver)} disabled={busy}>
              <XCircle className="mr-1 h-4 w-4" /> Reprovar
            </Button>
          )}
          {driver.approval_status !== "bloqueado" ? (
            <Button variant="outline" onClick={() => onBlock(driver)} disabled={busy}>
              <ShieldAlert className="mr-1 h-4 w-4" /> Bloquear
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onUnblock(driver)} disabled={busy}>
              Desbloquear
            </Button>
          )}
          <Button variant="outline" onClick={() => onSuspendToggle(driver)} disabled={busy}>
            {suspended ? (
              <>
                <PlayCircle className="mr-1 h-4 w-4" /> Reativar
              </>
            ) : (
              <>
                <PauseCircle className="mr-1 h-4 w-4" /> Suspender
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function badgeForRating(r: number): string {
  if (r >= 4.8) return "Ouro";
  if (r >= 4.5) return "Excelente";
  if (r >= 4.0) return "Muito Bom";
  return "—";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

function DocCard({
  label,
  url,
  rawPath,
  loading,
  failed,
}: {
  label: string;
  url: string | null;
  rawPath?: string | null;
  loading?: boolean;
  failed?: boolean;
}) {
  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
        {label}
        <div className="mt-2">
          {!rawPath ? "Não enviado" : failed ? "Falha ao carregar" : loading ? "Carregando..." : "Arquivo indisponível"}
        </div>
      </div>
    );
  }
  const isImg = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-border bg-card p-2 transition hover:border-primary"
    >
      <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
      {isImg ? (
        <img src={url} alt={label} className="h-32 w-full rounded-md object-cover" />
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
          <FileText className="h-6 w-6" />
          Abrir arquivo
        </div>
      )}
    </a>
  );
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function SubscriptionDialog({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver | null;
  onClose: () => void;
  onSaved: (d: Driver) => void;
}) {
  const [status, setStatus] = useState<SubStatus>("inactive");
  const [paymentStatus, setPaymentStatus] = useState<string>("unpaid");
  const [expires, setExpires] = useState<string>("");
  const [graceDays, setGraceDays] = useState<number>(0);
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    if (!driver) return;
    setStatus(((driver.subscription_status as SubStatus) ?? "inactive") || "inactive");
    setPaymentStatus((driver as { payment_status?: string }).payment_status ?? "unpaid");
    setExpires(toDateInput(driver.subscription_expires_at));
    setGraceDays(Number(driver.subscription_grace_days ?? 0));
    setNote(driver.subscription_admin_note ?? "");
  }, [driver?.id]);

  if (!driver) return null;

  async function save() {
    if (!driver) return;
    setSaving(true);
    const patch = {
      subscription_status: status,
      payment_status: paymentStatus,
      subscription_expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      subscription_grace_days: Number.isFinite(graceDays) ? graceDays : 0,
      subscription_admin_note: note.trim() || null,
    };
    const { data, error } = await supabase
      .from("drivers")
      .update(patch as never)
      .eq("id", driver.id)
      .select("*")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar assinatura: " + error.message);
      return;
    }
    await logAdminAction({
      action: "driver.subscription.update",
      entity: "drivers",
      entity_id: driver.id,
      after: patch,
    });
    toast.success("Assinatura atualizada");
    onSaved((data ?? { ...driver, ...patch }) as Driver);
  }

  async function releaseForTesting() {
    if (!driver) return;
    setReleasing(true);
    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    const patch = {
      approval_status: "aprovado" as Status,
      approved_at: new Date().toISOString(),
      blocked_at: null,
      motivo_reprovacao: null,
      subscription_status: "active" as SubStatus,
      payment_status: "paid",
      subscription_expires_at: exp.toISOString(),
      subscription_grace_days: 0,
      subscription_admin_note: note.trim() || "Liberado para teste pelo administrador",
    };
    const { data, error } = await supabase
      .from("drivers")
      .update(patch as never)
      .eq("id", driver.id)
      .select("*")
      .maybeSingle();
    setReleasing(false);
    if (error) {
      toast.error("Falha ao liberar para teste: " + error.message);
      return;
    }
    await logAdminAction({
      action: "driver.release_for_testing",
      entity: "drivers",
      entity_id: driver.id,
      after: patch,
    });
    toast.success("Motorista liberado para teste por 30 dias");
    onSaved((data ?? { ...driver, ...patch }) as Driver);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Assinatura — {driver.name}
          </DialogTitle>
          <DialogDescription>
            Controle manual do status de pagamento/assinatura do motorista.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={releaseForTesting}
          disabled={releasing || saving}
          className="flex w-full items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-left transition hover:bg-primary/15 disabled:opacity-60"
        >
          <div>
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Zap className="h-4 w-4" /> Liberar motorista para teste
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aprova o cadastro, ativa a assinatura por 30 dias e marca pagamento como pago.
            </p>
          </div>
          {releasing ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
        </button>

        <div className="grid gap-3 pt-2">
          <div className="grid gap-1.5">
            <Label>Status da assinatura</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SUB_STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={`rounded-xl border px-3 py-2 text-xs transition ${
                    status === s.value
                      ? `${s.tone} border-current`
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="payment_status">Status de pagamento</Label>
              <select
                id="payment_status"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="h-10 rounded-md border border-border bg-card px-3 text-sm"
              >
                <option value="paid">Pago</option>
                <option value="unpaid">Não pago</option>
                <option value="pending">Pendente</option>
                <option value="refunded">Reembolsado</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="grace">Carência (dias)</Label>
              <Input
                id="grace"
                type="number"
                min={0}
                value={graceDays}
                onChange={(e) => setGraceDays(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expires">Validade da assinatura</Label>
            <Input
              id="expires"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="note">Observação do administrador</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: liberação manual para teste interno"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving || releasing}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || releasing}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
