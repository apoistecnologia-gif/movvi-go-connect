import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Eye, Ban, ShieldOff, Trash2, RefreshCw, Download } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  created_at: string;
  last_login_at: string | null;
  suspended_at: string | null;
  blocked_at: string | null;
  block_reason: string | null;
};

type Status = "todos" | "ativos" | "suspensos" | "bloqueados";
const PAGE = 25;

function AdminPassageirosPage() {
  const [rows, setRows] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("todos");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<Passenger | null>(null);

  async function refresh() {
    setLoading(true);
    let query = supabase
      .from("users")
      .select(
        "id,auth_user_id,name,email,phone,city,created_at,last_login_at,suspended_at,blocked_at,block_reason",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (q.trim()) {
      const term = `%${q.trim()}%`;
      query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    }
    if (status === "ativos") query = query.is("suspended_at", null).is("blocked_at", null);
    if (status === "suspensos") query = query.not("suspended_at", "is", null);
    if (status === "bloqueados") query = query.not("blocked_at", "is", null);

    const { data, error, count: c } = await query;
    if (error) toast.error("Erro: " + error.message);
    setRows((data ?? []) as Passenger[]);
    setCount(c ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, page]);

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

  async function suspend(p: Passenger) {
    const reason = prompt("Motivo da suspensão (opcional):") ?? "";
    const { error } = await supabase
      .from("users")
      .update({ suspended_at: new Date().toISOString(), block_reason: reason || null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "passenger.suspend", entity: "users", entity_id: p.id, after: { reason } });
    toast.success("Passageiro suspenso");
  }
  async function unsuspend(p: Passenger) {
    const { error } = await supabase
      .from("users")
      .update({ suspended_at: null, block_reason: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "passenger.unsuspend", entity: "users", entity_id: p.id });
    toast.success("Suspensão removida");
  }
  async function block(p: Passenger) {
    const reason = prompt("Motivo do bloqueio:");
    if (!reason) return;
    const { error } = await supabase
      .from("users")
      .update({ blocked_at: new Date().toISOString(), block_reason: reason })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "passenger.block", entity: "users", entity_id: p.id, after: { reason } });
    toast.success("Passageiro bloqueado");
  }
  async function unblock(p: Passenger) {
    const { error } = await supabase
      .from("users")
      .update({ blocked_at: null, block_reason: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "passenger.unblock", entity: "users", entity_id: p.id });
    toast.success("Desbloqueado");
  }
  async function del(p: Passenger) {
    if (!confirm(`Excluir o passageiro "${p.name ?? p.email ?? p.id}"? Esta ação é irreversível.`)) return;
    const { error } = await supabase.from("users").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "passenger.delete", entity: "users", entity_id: p.id, before: { name: p.name } });
    toast.success("Passageiro excluído");
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
        status: r.blocked_at ? "bloqueado" : r.suspended_at ? "suspenso" : "ativo",
      })),
    );
  }

  const pages = Math.max(1, Math.ceil(count / PAGE));

  return (
    <AdminLayout
      title="Passageiros"
      description={`${count} cadastrados`}
      actions={
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
          <Download className="h-4 w-4" /> CSV
        </Button>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone"
            value={q}
            onChange={(e) => {
              setPage(0);
              setQ(e.target.value);
            }}
            className="pl-9"
          />
        </div>
        <Tabs value={status} onValueChange={(v) => { setPage(0); setStatus(v as Status); }}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="ativos">Ativos</TabsTrigger>
            <TabsTrigger value="suspensos">Suspensos</TabsTrigger>
            <TabsTrigger value="bloqueados">Bloqueados</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="icon" variant="ghost" onClick={refresh} title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
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
          {rows.map((p) => (
            <Card key={p.id} className="border-border bg-card/60">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{p.name ?? "Sem nome"}</p>
                    {p.blocked_at && <Badge variant="destructive">Bloqueado</Badge>}
                    {p.suspended_at && !p.blocked_at && <Badge>Suspenso</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email ?? "—"} · {p.phone ?? "—"} · {p.city ?? "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    Cadastro {formatDate(p.created_at)}
                    {p.last_login_at ? ` · Último login ${formatDate(p.last_login_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(p)} className="gap-1">
                    <Eye className="h-3 w-3" /> Detalhes
                  </Button>
                  {p.suspended_at ? (
                    <Button size="sm" variant="ghost" onClick={() => unsuspend(p)}>
                      Reativar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => suspend(p)} className="gap-1">
                      <Ban className="h-3 w-3" /> Suspender
                    </Button>
                  )}
                  {p.blocked_at ? (
                    <Button size="sm" variant="ghost" onClick={() => unblock(p)}>
                      Desbloquear
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => block(p)} className="gap-1 text-destructive">
                      <ShieldOff className="h-3 w-3" /> Bloquear
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => del(p)} className="text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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

      <PassengerDetail open={!!selected} onOpenChange={(o) => !o && setSelected(null)} passenger={selected} />
    </AdminLayout>
  );
}

function PassengerDetail({
  open,
  onOpenChange,
  passenger,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  passenger: Passenger | null;
}) {
  const [stats, setStats] = useState<{ total_rides: number; completed_rides: number; cancelled_rides: number; total_spent: number; avg_rating: number } | null>(null);
  const [rides, setRides] = useState<Array<{ id: string; created_at: string; status: string; final_price: number | null; origin_name: string | null; destination_name: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!passenger || !open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [statsRes, ridesRes] = await Promise.all([
        supabase.rpc("get_passenger_stats", { _user_id: passenger.auth_user_id }),
        supabase
          .from("rides")
          .select("id,created_at,status,final_price,origin_name,destination_name")
          .eq("passenger_id", passenger.auth_user_id)
          .order("created_at", { ascending: false })
          .limit(50),
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
      }
      setRides((ridesRes.data ?? []) as typeof rides);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [passenger, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{passenger?.name ?? "Passageiro"}</SheetTitle>
        </SheetHeader>
        {!passenger ? null : (
          <div className="mt-4 space-y-4 text-sm">
            <Card>
              <CardContent className="grid grid-cols-2 gap-2 p-4 text-xs">
                <Field label="E-mail" v={passenger.email} />
                <Field label="Telefone" v={passenger.phone} />
                <Field label="Cidade" v={passenger.city} />
                <Field label="Cadastro" v={formatDate(passenger.created_at)} />
                <Field label="Último login" v={passenger.last_login_at ? formatDate(passenger.last_login_at) : "—"} />
                <Field label="Status" v={passenger.blocked_at ? "Bloqueado" : passenger.suspended_at ? "Suspenso" : "Ativo"} />
              </CardContent>
            </Card>

            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : stats ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Kpi label="Corridas" v={String(stats.total_rides)} />
                <Kpi label="Concluídas" v={String(stats.completed_rides)} />
                <Kpi label="Canceladas" v={String(stats.cancelled_rides)} />
                <Kpi label="Total gasto" v={formatBRL(stats.total_spent)} />
                <Kpi label="Avaliação" v={stats.avg_rating ? stats.avg_rating.toFixed(2) : "—"} />
              </div>
            ) : null}

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Últimas corridas
              </h4>
              {rides.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem corridas.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {rides.map((r) => (
                    <li key={r.id} className="rounded border border-border bg-muted/30 p-2">
                      <div className="flex justify-between">
                        <span>{formatDate(r.created_at)}</span>
                        <span className="font-medium">{formatBRL(r.final_price ?? 0)}</span>
                      </div>
                      <p className="truncate text-muted-foreground">
                        {r.origin_name ?? "?"} → {r.destination_name ?? "?"}
                      </p>
                      <Badge variant="outline" className="mt-1 text-[10px]">{r.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, v }: { label: string; v: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p>{v ?? "—"}</p>
    </div>
  );
}
function Kpi({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-bold">{v}</p>
    </div>
  );
}

// silence unused import
void useMemo;
