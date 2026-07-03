import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  MapPin,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csvExport";
import { getDriverWallet } from "@/lib/finance/wallet";
import { getDriverSubscriptionInfo } from "@/lib/payments/subscription.functions";
import { SUBSCRIPTION_STATUS_UI_LABELS, toUiStatus } from "@/lib/payments/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/motorista/ganhos")({
  head: () => ({ meta: [{ title: "Financeiro — MOVVI DRIVE" }] }),
  component: DriverEarningsPage,
});

type Filter = "today" | "week" | "month" | "custom";

type Ride = {
  id: string;
  created_at: string;
  completed_at: string | null;
  origin_name: string;
  destination_name: string;
  distance_km: number | null;
  duration_min: number | null;
  final_price: number | null;
  estimated_price: number | null;
  payment_method: string | null;
  category: string | null;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function startOf(kind: "day" | "week" | "month"): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (kind === "week") d.setDate(d.getDate() - 6);
  if (kind === "month") d.setDate(1);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function range(filter: Filter, customFrom: string, customTo: string): [Date, Date] {
  const end = endOfToday();
  if (filter === "today") return [startOf("day"), end];
  if (filter === "week") return [startOf("week"), end];
  if (filter === "month") return [startOf("month"), end];
  return [
    customFrom ? new Date(customFrom + "T00:00:00") : startOf("day"),
    customTo ? new Date(customTo + "T23:59:59") : end,
  ];
}

function DriverEarningsPage() {
  const navigate = useNavigate();
  const loadSubscription = useServerFn(getDriverSubscriptionInfo);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<number | null>(null);
  const [totals, setTotals] = useState({ today: 0, week: 0, month: 0 });
  const [sub, setSub] = useState<Awaited<ReturnType<typeof getDriverSubscriptionInfo>> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.auth.getUser();
      if (!a?.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(a.user.id);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const [wallet, subInfo] = await Promise.all([
          getDriverWallet(userId),
          loadSubscription({}).catch(() => null),
        ]);
        if (wallet) setAvailable(Number(wallet.available_balance ?? 0));
        if (subInfo) setSub(subInfo);
      } catch {
        /* silent */
      }
    })();
  }, [userId, loadSubscription]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      const [from, to] = range(filter, customFrom, customTo);
      const { data } = await supabase
        .from("rides")
        .select("id,created_at,completed_at,origin_name,destination_name,distance_km,duration_min,final_price,estimated_price,payment_method,category")
        .eq("driver_id", userId).eq("status", "finalizada")
        .gte("completed_at", from.toISOString())
        .lte("completed_at", to.toISOString())
        .order("completed_at", { ascending: false });
      setRides((data ?? []) as Ride[]);

      // KPI totals (independent of active filter)
      const todayStart = startOf("day");
      const weekStart = startOf("week");
      const monthStart = startOf("month");
      const { data: monthRows } = await supabase
        .from("rides")
        .select("final_price,estimated_price,completed_at")
        .eq("driver_id", userId).eq("status", "finalizada")
        .gte("completed_at", monthStart.toISOString());
      let t = 0, w = 0, m = 0;
      (monthRows ?? []).forEach((r) => {
        const v = Number(r.final_price ?? r.estimated_price ?? 0);
        const at = new Date(r.completed_at ?? new Date());
        m += v;
        if (at >= weekStart) w += v;
        if (at >= todayStart) t += v;
      });
      setTotals({ today: t, week: w, month: m });
      setLoading(false);
    })();
  }, [userId, filter, customFrom, customTo]);

  const periodStats = useMemo(() => {
    const earnings = rides.reduce((s, r) => s + Number(r.final_price ?? r.estimated_price ?? 0), 0);
    return { earnings, trips: rides.length };
  }, [rides]);

  const displayedBalance = available ?? totals.month;

  const subUi = sub ? toUiStatus(sub.subscriptionStatus) : "expired";
  const subLabel = SUBSCRIPTION_STATUS_UI_LABELS[subUi];
  const subActive = subUi === "active";
  const subExpires = sub?.nextDueAt
    ? new Date(sub.nextDueAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : null;

  function exportCsv() {
    downloadCsv(
      `movvi-ganhos-${filter}`,
      rides.map((r) => ({
        id: r.id,
        data: new Date(r.completed_at ?? r.created_at).toLocaleString("pt-BR"),
        origem: r.origin_name,
        destino: r.destination_name,
        categoria: r.category ?? "",
        pagamento: r.payment_method ?? "",
        km: Number(r.distance_km ?? 0).toFixed(2),
        min: Math.round(Number(r.duration_min ?? 0)),
        valor: Number(r.final_price ?? r.estimated_price ?? 0).toFixed(2),
      })),
    );
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("MOVVI DRIVE — Extrato de Ganhos", 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${filter} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 23);
    doc.text(`Total: ${brl(periodStats.earnings)} · ${periodStats.trips} corridas`, 14, 30);
    autoTable(doc, {
      startY: 36,
      head: [["Data", "Origem → Destino", "KM", "Min", "Pagto", "Valor"]],
      body: rides.map((r) => [
        new Date(r.completed_at ?? r.created_at).toLocaleString("pt-BR"),
        `${r.origin_name} → ${r.destination_name}`,
        Number(r.distance_km ?? 0).toFixed(1),
        String(Math.round(Number(r.duration_min ?? 0))),
        r.payment_method ?? "—",
        brl(Number(r.final_price ?? r.estimated_price ?? 0)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [18, 24, 38] },
    });
    doc.save(`movvi-extrato-${filter}.pdf`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="container mx-auto max-w-2xl space-y-5">
          {/* ===== HEADER ===== */}
          <header className="animate-in fade-in slide-in-from-top-2 duration-400">
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">Financeiro</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Gerencie seus ganhos.</p>
          </header>

          {/* ===== MAIN BALANCE CARD ===== */}
          <section
            className="relative overflow-hidden rounded-[28px] bg-card p-6 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.28)] ring-1 ring-border/70 animate-in fade-in zoom-in-95 duration-400"
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-[0.16]"
              style={{ background: "radial-gradient(circle, #76C139 0%, transparent 70%)" }}
            />
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/25">
                  <Wallet className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <span className="text-[13px] font-medium text-muted-foreground">Saldo disponível</span>
              </div>
              <div className="mt-3 text-[36px] font-bold tabular-nums leading-none tracking-tight text-foreground">
                {brl(displayedBalance)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary ring-1 ring-primary/25">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Disponível para saque
              </div>

              <button
                onClick={() => toast.info("Saque em breve — em desenvolvimento")}
                className="press-scale mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] text-[16px] font-bold uppercase tracking-[0.06em] text-primary-foreground shadow-[0_16px_36px_-16px_color-mix(in_oklab,var(--color-primary)_70%,transparent)] transition"
                style={{ background: "#76C139" }}
              >
                <ArrowUpRight className="h-5 w-5" strokeWidth={2} />
                Solicitar saque
              </button>
            </div>
          </section>

          {/* ===== SECONDARY KPI CARDS ===== */}
          <section className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <MiniCard icon={<CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />} label="Hoje"   value={brl(totals.today)} />
            <MiniCard icon={<TrendingUp   className="h-3.5 w-3.5" strokeWidth={1.75} />} label="Semana" value={brl(totals.week)} />
            <MiniCard icon={<TrendingUp   className="h-3.5 w-3.5" strokeWidth={1.75} />} label="Mês"    value={brl(totals.month)} />
          </section>

          {/* ===== SUBSCRIPTION STATUS ===== */}
          <button
            type="button"
            onClick={() => navigate({ to: "/motorista/assinatura" })}
            className="press-scale flex w-full items-center gap-3 rounded-[22px] bg-card p-4 text-left shadow-[0_10px_28px_-22px_rgba(0,0,0,0.3)] ring-1 ring-border/70 transition hover:bg-muted/20 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div className={`grid h-11 w-11 place-items-center rounded-full ${subActive ? "bg-primary/12 text-primary ring-1 ring-primary/25" : "bg-destructive/12 text-destructive ring-1 ring-destructive/25"}`}>
              {subActive ? <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} /> : <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-foreground">MOVVI Premium</span>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${subActive ? "bg-primary/12 text-primary" : "bg-destructive/12 text-destructive"}`}>
                  {subLabel}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {subExpires ? `Expira em ${subExpires}` : "Toque para ver detalhes"}
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 rotate-45 text-muted-foreground/60" />
          </button>

          {/* ===== FILTERS ===== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold tracking-tight">Histórico</h2>
              <div className="flex gap-1">
                <button onClick={exportCsv} className="press-scale flex h-9 w-9 items-center justify-center rounded-full bg-card ring-1 ring-border text-muted-foreground hover:text-foreground" aria-label="Exportar CSV">
                  <Download className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button onClick={exportPdf} className="press-scale flex h-9 w-9 items-center justify-center rounded-full bg-card ring-1 ring-border text-muted-foreground hover:text-foreground" aria-label="Exportar PDF">
                  <FileText className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterPill active={filter === "today"}  onClick={() => setFilter("today")}>Hoje</FilterPill>
              <FilterPill active={filter === "week"}   onClick={() => setFilter("week")}>Semana</FilterPill>
              <FilterPill active={filter === "month"}  onClick={() => setFilter("month")}>Mês</FilterPill>
              <FilterPill active={filter === "custom"} onClick={() => setFilter("custom")}>Personalizado</FilterPill>
            </div>

            {filter === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-11 rounded-[14px] bg-card px-3 text-[13px] ring-1 ring-border focus:outline-none focus:ring-primary/40" />
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="h-11 rounded-[14px] bg-card px-3 text-[13px] ring-1 ring-border focus:outline-none focus:ring-primary/40" />
              </div>
            )}
          </section>

          {/* ===== TRANSACTION LIST ===== */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-[13px]">Carregando…</span>
            </div>
          ) : rides.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] bg-card p-8 text-center ring-1 ring-border/70 animate-in fade-in duration-500">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/25">
                <Wallet className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-semibold text-foreground">Nenhum ganho ainda</p>
              <p className="mt-1 max-w-[240px] text-[12.5px] text-muted-foreground">
                Suas corridas finalizadas aparecerão aqui.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rides.map((r, i) => (
                <li
                  key={r.id}
                  className="animate-in fade-in slide-in-from-bottom-1"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationDuration: "300ms", animationFillMode: "backwards" }}
                >
                  <div className="flex items-center gap-3 rounded-[18px] bg-card p-3.5 ring-1 ring-border/60 shadow-[0_4px_14px_-10px_rgba(0,0,0,0.2)]">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <MapPin className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-foreground">
                        {r.destination_name || r.origin_name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                        <Clock className="h-3 w-3" strokeWidth={1.75} />
                        {new Date(r.completed_at ?? r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {r.distance_km != null && <span>· {Number(r.distance_km).toFixed(1)} km</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[15px] font-bold tabular-nums text-primary">
                        {brl(Number(r.final_price ?? r.estimated_price ?? 0))}
                      </div>
                      <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                        Concluída
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}

function MiniCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-card p-3.5 ring-1 ring-border/70 shadow-[0_6px_18px_-14px_rgba(0,0,0,0.25)]">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 text-[18px] font-bold tabular-nums leading-none tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`press-scale h-9 rounded-full px-4 text-[13px] font-semibold transition ${
        active
          ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-12px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
          : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
