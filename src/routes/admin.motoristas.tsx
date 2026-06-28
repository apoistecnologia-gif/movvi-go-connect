import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar } from "@/components/Avatar";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  XCircle,
  Eye,
  FileText,
  RefreshCw,
  CreditCard,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logAdminAction } from "@/lib/adminAudit";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getDriverDocumentUrls } from "@/lib/driverDocs.functions";
import { MovviHeader } from "@/components/MovviHeader";
import { AdminGuard } from "@/components/AdminGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/motoristas")({
  head: () => ({ meta: [{ title: "Motoristas — Admin MOVVI" }] }),
  component: () => (
    <AdminGuard>
      <AdminMotoristas />
    </AdminGuard>
  ),
});

type Driver = Database["public"]["Tables"]["drivers"]["Row"];
type Status = Driver["approval_status"];
type SubStatus = "active" | "inactive" | "pending" | "overdue" | "suspended";

const SUB_STATUSES: { value: SubStatus; label: string; tone: string }[] = [
  { value: "active", label: "Ativa", tone: "bg-primary/15 text-primary border-primary/30" },
  { value: "pending", label: "Pendente", tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  { value: "overdue", label: "Em atraso", tone: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "inactive", label: "Inativa", tone: "bg-muted text-muted-foreground border-border" },
  { value: "suspended", label: "Suspensa", tone: "bg-destructive/15 text-destructive border-destructive/30" },
];

function subMeta(s: string | null | undefined) {
  return SUB_STATUSES.find((x) => x.value === s) ?? { value: "inactive" as SubStatus, label: "—", tone: "bg-muted text-muted-foreground border-border" };
}

const TAB_META: Record<Status, { label: string; tone: string }> = {
  em_analise: { label: "Em análise", tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  aprovado: { label: "Aprovados", tone: "bg-primary/15 text-primary border-primary/30" },
  reprovado: { label: "Reprovados", tone: "bg-destructive/15 text-destructive border-destructive/30" },
  bloqueado: { label: "Bloqueados", tone: "bg-destructive/15 text-destructive border-destructive/30" },
};

const STATUS_ORDER: Status[] = ["em_analise", "aprovado", "reprovado", "bloqueado"];

const BUCKETS = {
  selfie_url: "driver-selfies",
  cnh_url: "driver-cnh",
  vehicle_document_url: "vehicle-documents",
} as const;

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AdminMotoristas() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status>("em_analise");
  const [detail, setDetail] = useState<Driver | null>(null);
  const [rejectFor, setRejectFor] = useState<Driver | null>(null);
  const [subFor, setSubFor] = useState<Driver | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>("—");
  const [dbError, setDbError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    setAdminEmail(auth.user?.email ?? "—");
    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setDbError(error.message);
      toast.error("Erro ao carregar motoristas: " + error.message);
      setDrivers([]);
    } else {
      setDbError(null);
      setDrivers(data ?? []);
    }
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
  }, []);

  const grouped = useMemo(() => {
    const g: Record<Status, Driver[]> = {
      em_analise: [],
      aprovado: [],
      reprovado: [],
      bloqueado: [],
    };
    (drivers ?? []).forEach((d) => g[d.approval_status]?.push(d));
    return g;
  }, [drivers]);

  const statusCounts = useMemo(
    () => Object.fromEntries(STATUS_ORDER.map((s) => [s, grouped[s].length])) as Record<Status, number>,
    [grouped],
  );

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
      setDbError(error.message);
      toast.error("Erro ao atualizar status: " + error.message);
      return;
    }
    setDbError(null);
    if (status === "aprovado") toast.success("Motorista aprovado com sucesso");
    if (status === "reprovado") toast.success("Motorista reprovado");
    if (status === "bloqueado") toast.success("Motorista bloqueado");
    setRejectFor(null);
    setRejectReason("");
    if (detail?.id === d.id) setDetail({ ...d, ...patch } as Driver);
    load();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/admin/login" />
      <main className="flex-1 px-4 py-6">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
                <Link to="/admin/dashboard">
                  <ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao dashboard
                </Link>
              </Button>
              <h1 className="font-display text-2xl font-bold">Gestão de Motoristas</h1>
              <p className="text-sm text-muted-foreground">
                Aprovação, reprovação e bloqueio de cadastros.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {loading && !drivers ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                {STATUS_ORDER.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {TAB_META[s].label}
                    <Badge variant="secondary" className="ml-2">
                      {grouped[s].length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {STATUS_ORDER.map((s) => (
                <TabsContent key={s} value={s} className="mt-4 space-y-3">
                  {grouped[s].length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
                      Nenhum motorista nesta lista.
                    </div>
                  ) : (
                    grouped[s].map((d) => (
                      <DriverCard
                        key={d.id}
                        driver={d}
                        busy={busyId === d.id}
                        onDetails={() => setDetail(d)}
                        onApprove={() => updateStatus(d, "aprovado")}
                        onReject={() => {
                          setRejectFor(d);
                          setRejectReason(d.motivo_reprovacao ?? "");
                        }}
                        onBlock={() => updateStatus(d, "bloqueado")}
                        onReinstate={() => updateStatus(d, "em_analise")}
                        onSubscription={() => setSubFor(d)}
                      />
                    ))
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}

          <DiagnosticsPanel
            drivers={drivers ?? []}
            counts={statusCounts}
            adminEmail={adminEmail}
            dbError={dbError}
          />
        </div>
      </main>

      <DetailsDialog driver={detail} onClose={() => setDetail(null)} />

      <SubscriptionDialog
        driver={subFor}
        onClose={() => setSubFor(null)}
        onSaved={(updated) => {
          setSubFor(null);
          if (detail?.id === updated.id) setDetail(updated);
          load();
        }}
      />


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
    </div>
  );
}

function DriverCard({
  driver,
  busy,
  onDetails,
  onApprove,
  onReject,
  onBlock,
  onReinstate,
  onSubscription,
}: {
  driver: Driver;
  busy: boolean;
  onDetails: () => void;
  onApprove: () => void;
  onReject: () => void;
  onBlock: () => void;
  onReinstate: () => void;
  onSubscription: () => void;
}) {
  const meta = TAB_META[driver.approval_status];
  const sm = subMeta(driver.subscription_status);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{driver.name}</h3>
            <Badge variant="outline" className={meta.tone}>
              {meta.label}
            </Badge>
            <Badge variant="outline" className={sm.tone}>
              Assinatura: {sm.label}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {driver.category}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {driver.phone} · {driver.city}/{driver.state} · Cadastro {fmtDate(driver.created_at)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Veículo: {driver.vehicle_model} · Placa {driver.vehicle_plate} · {driver.vehicle_color} ·{" "}
            {driver.vehicle_year}
          </p>
          {driver.approval_status === "reprovado" && driver.motivo_reprovacao && (
            <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Motivo: {driver.motivo_reprovacao}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
            <Button size="sm" variant="outline" onClick={onReinstate} disabled={busy}>
              Desbloquear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailsDialog({ driver, onClose }: { driver: Driver | null; onClose: () => void }) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [urlError, setUrlError] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const fetchUrls = useServerFn(getDriverDocumentUrls);

  useEffect(() => {
    if (!driver) return;
    let cancelled = false;
    setUrls({});
    setUrlError(null);
    setDocsLoading(true);
    console.log("[MOVVI DOCS] admin lendo documentos:", {
      driverId: driver.id,
      selfie_url: driver.selfie_url,
      cnh_url: driver.cnh_url,
      vehicle_document_url: driver.vehicle_document_url,
    });
    (async () => {
      try {
        const result = await fetchUrls({ data: { driverId: driver.id } });
        if (cancelled) return;
        console.log("[MOVVI DOCS] URLs assinadas:", result);
        setUrls(result);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Falha ao gerar URLs.";
        console.error("[MOVVI DOCS] erro ao buscar urls:", message);
        setUrlError(message);
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driver?.id]);

  if (!driver) return null;
  const meta = TAB_META[driver.approval_status];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar src={(driver as any).photo_url ?? null} name={driver.name} size={56} />
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                {driver.name}
                <Badge variant="outline" className={meta.tone}>
                  {meta.label}
                </Badge>
              </DialogTitle>
              <DialogDescription>Cadastro completo do motorista</DialogDescription>
            </div>
          </div>
        </DialogHeader>


        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-2 text-sm">
          <Section title="Dados pessoais">
            <Row label="E-mail" value={driver.email} />
            <Row label="Telefone" value={driver.phone} />
            <Row label="CPF" value={driver.cpf} />
            <Row label="Nascimento" value={driver.birth_date ?? "—"} />
            <Row label="Cidade/UF" value={`${driver.city}/${driver.state}`} />
          </Section>

          <Section title="Veículo">
            <Row label="Categoria" value={driver.category} />
            <Row label="Modelo" value={driver.vehicle_model} />
            <Row label="Placa" value={driver.vehicle_plate} />
            <Row label="Cor" value={driver.vehicle_color} />
            <Row label="Ano" value={String(driver.vehicle_year)} />
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
          </Section>

          <Section title="Assinatura / Pagamento">
            <Row label="Status assinatura" value={subMeta(driver.subscription_status).label} />
            <Row label="Status pagamento" value={(driver as { payment_status?: string }).payment_status ?? "—"} />
            <Row label="Validade" value={fmtDate((driver as { subscription_expires_at?: string | null }).subscription_expires_at ?? null)} />
            <Row label="Carência (dias)" value={String((driver as { subscription_grace_days?: number }).subscription_grace_days ?? 0)} />
            <Row label="Observação do admin" value={(driver as { subscription_admin_note?: string | null }).subscription_admin_note ?? null} />
          </Section>

          <Section title="Status">
            <Row label="Cadastro em" value={fmtDate(driver.created_at)} />
            <Row label="Aprovado em" value={fmtDate(driver.approved_at)} />
            <Row label="Bloqueado em" value={fmtDate(driver.blocked_at)} />
            {driver.motivo_reprovacao && (
              <Row label="Motivo reprovação" value={driver.motivo_reprovacao} />
            )}
          </Section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiagnosticsPanel({
  drivers,
  counts,
  adminEmail,
  dbError,
}: {
  drivers: Driver[];
  counts: Record<Status, number>;
  adminEmail: string;
  dbError: string | null;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-dashed border-primary/30 bg-card/50 p-4 text-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-primary">Diagnóstico temporário — Motoristas</h2>
          <p className="text-muted-foreground">Conexão real entre cadastro, app do motorista e admin.</p>
        </div>
        <Badge variant="outline">RLS ativo</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-border/60 bg-background/50 p-3">
          <DiagRow label="Tabela usada" value="public.drivers" />
          <DiagRow label="Campo de status" value="approval_status" />
          <DiagRow label="Campo motivo" value="motivo_reprovacao" />
          <DiagRow label="Total encontrado" value={String(drivers.length)} />
          <DiagRow label="Admin logado" value={adminEmail} />
          <DiagRow label="Erro do banco" value={dbError ?? "Nenhum erro retornado"} />
        </div>
        <div className="space-y-1 rounded-xl border border-border/60 bg-background/50 p-3">
          <DiagRow label="em_analise" value={String(counts.em_analise)} />
          <DiagRow label="aprovado" value={String(counts.aprovado)} />
          <DiagRow label="reprovado" value={String(counts.reprovado)} />
          <DiagRow label="bloqueado" value={String(counts.bloqueado)} />
          <DiagRow label="Permissões/RLS" value="Admin lê/atualiza via role admin; motorista lê/edita o próprio registro; passageiro só vê motorista aprovado e online." />
        </div>
      </div>
    </section>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/30 py-1 last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
    setExpires(toDateInput((driver as { subscription_expires_at?: string | null }).subscription_expires_at ?? null));
    setGraceDays(Number((driver as { subscription_grace_days?: number }).subscription_grace_days ?? 0));
    setNote((driver as { subscription_admin_note?: string | null }).subscription_admin_note ?? "");
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
    const before = {
      subscription_status: driver.subscription_status,
      payment_status: (driver as { payment_status?: string }).payment_status,
      subscription_expires_at: (driver as { subscription_expires_at?: string | null }).subscription_expires_at,
      subscription_grace_days: (driver as { subscription_grace_days?: number }).subscription_grace_days,
      subscription_admin_note: (driver as { subscription_admin_note?: string | null }).subscription_admin_note,
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
    const action =
      status === "active"
        ? "driver.subscription.activate"
        : status === "suspended"
          ? "driver.subscription.suspend"
          : "driver.subscription.update";
    await logAdminAction({
      action,
      entity: "drivers",
      entity_id: driver.id,
      before,
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
      before: {
        approval_status: driver.approval_status,
        subscription_status: driver.subscription_status,
      },
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
            Controle manual do status de pagamento/assinatura do motorista (modo teste, sem gateway).
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
