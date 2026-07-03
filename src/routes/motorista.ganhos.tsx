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
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: "#F7F9F7" }}>
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-5 py-6 pb-28">
        <div className="container mx-auto max-w-2xl space-y-6">
          {/* ===== HEADER ===== */}
          <header className="animate-in fade-in slide-in-from-top-2 duration-500">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight" style={{ color: "#1B1B1B" }}>
              Financeiro
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "#707070" }}>
              Gerencie seus ganhos
            </p>
          </header>

          {/* ===== MAIN BALANCE CARD ===== */}
          <section
            className="relative overflow-hidden rounded-[28px] bg-white p-7 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.22)] animate-in fade-in zoom-in-[0.98] duration-500"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-[0.10]"
              style={{ background: "radial-gradient(circle, #76C139 0%, transparent 70%)" }}
            />
            <div className="relative">
              <div className="flex items-center gap-2">
                <div
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{ backgroundColor: "rgba(118,193,57,0.12)", color: "#76C139" }}
                >
                  <Wallet className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <span className="text-[13px] font-medium" style={{ color: "#707070" }}>
                  Saldo disponível
                </span>
              </div>
              <div
                className="mt-4 text-[36px] font-bold tabular-nums leading-none tracking-tight"
                style={{ color: "#1B1B1B" }}
              >
                {brl(displayedBalance)}
              </div>
              <div
                className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ backgroundColor: "rgba(118,193,57,0.12)", color: "#5A9A2A" }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ backgroundColor: "#76C139" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#76C139" }} />
                </span>
                Disponível para saque
              </div>

              <button
                onClick={() => toast.info("Saque em breve — em desenvolvimento")}
                className="press-scale mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-bold tracking-[0.02em] text-white shadow-[0_18px_36px_-16px_rgba(118,193,57,0.6)] transition active:scale-[0.985]"
                style={{ background: "#76C139" }}
              >
                <ArrowUpRight className="h-5 w-5" strokeWidth={2} />
                Solicitar saque
              </button>
            </div>
          </section>

          {/* ===== SECONDARY KPI CARDS ===== */}
          <section className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <MiniCard icon={<CalendarDays className="h-4 w-4" strokeWidth={1.75} />} label="Hoje"   value={brl(totals.today)} />
            <MiniCard icon={<TrendingUp   className="h-4 w-4" strokeWidth={1.75} />} label="Semana" value={brl(totals.week)} />
            <MiniCard icon={<TrendingUp   className="h-4 w-4" strokeWidth={1.75} />} label="Mês"    value={brl(totals.month)} />
          </section>

          {/* ===== SUBSCRIPTION STATUS ===== */}
          <button
            type="button"
            onClick={() => navigate({ to: "/motorista/assinatura" })}
            className="press-scale flex w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-[0_12px_30px_-24px_rgba(15,23,42,0.28)] transition hover:bg-[#FAFBF8] animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div
              className="grid h-11 w-11 place-items-center rounded-full"
              style={
                subActive
                  ? { backgroundColor: "rgba(118,193,57,0.12)", color: "#5A9A2A" }
                  : { backgroundColor: "rgba(220,38,38,0.10)", color: "#DC2626" }
              }
            >
              {subActive ? <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} /> : <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold" style={{ color: "#1B1B1B" }}>MOVVI Premium</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider"
                  style={
                    subActive
                      ? { backgroundColor: "rgba(118,193,57,0.14)", color: "#5A9A2A" }
                      : { backgroundColor: "rgba(220,38,38,0.10)", color: "#DC2626" }
                  }
                >
                  {subLabel}
                </span>
              </div>
              <div className="mt-0.5 text-[12px]" style={{ color: "#707070" }}>
                {subExpires ? `Expira em ${subExpires}` : "Toque para ver detalhes"}
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 rotate-45" style={{ color: "#B8BEC5" }} />
          </button>

          {/* ===== FILTERS ===== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: "#1B1B1B" }}>
                Histórico
              </h2>
              <div className="flex gap-1.5">
                <button onClick={exportCsv} className="press-scale flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#707070] shadow-[0_6px_18px_-14px_rgba(15,23,42,0.28)] hover:text-[#1B1B1B]" aria-label="Exportar CSV">
                  <Download className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button onClick={exportPdf} className="press-scale flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#707070] shadow-[0_6px_18px_-14px_rgba(15,23,42,0.28)] hover:text-[#1B1B1B]" aria-label="Exportar PDF">
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
                  className="h-11 rounded-[14px] bg-white px-3 text-[13px] shadow-[0_6px_18px_-14px_rgba(15,23,42,0.2)] focus:outline-none focus:ring-2 focus:ring-[#76C139]/40" />
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="h-11 rounded-[14px] bg-white px-3 text-[13px] shadow-[0_6px_18px_-14px_rgba(15,23,42,0.2)] focus:outline-none focus:ring-2 focus:ring-[#76C139]/40" />
              </div>
            )}
          </section>

          {/* ===== TRANSACTION LIST ===== */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12" style={{ color: "#707070" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-[13px]">Carregando…</span>
            </div>
          ) : rides.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] bg-white p-10 text-center shadow-[0_14px_36px_-24px_rgba(15,23,42,0.22)] animate-in fade-in duration-500">
              <div
                className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "rgba(118,193,57,0.10)", color: "#76C139" }}
              >
                <Wallet className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-semibold" style={{ color: "#1B1B1B" }}>
                Nenhum ganho ainda
              </p>
              <p className="mt-1 max-w-[260px] text-[12.5px]" style={{ color: "#707070" }}>
                Suas corridas finalizadas aparecerão aqui.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {rides.map((r, i) => (
                <li
                  key={r.id}
                  className="animate-in fade-in slide-in-from-bottom-1"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationDuration: "300ms", animationFillMode: "backwards" }}
                >
                  <div className="flex items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.25)]">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: "rgba(118,193,57,0.10)", color: "#5A9A2A" }}
                    >
                      <MapPin className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold" style={{ color: "#1B1B1B" }}>
                        {r.destination_name || r.origin_name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: "#707070" }}>
                        <Clock className="h-3 w-3" strokeWidth={1.75} />
                        {new Date(r.completed_at ?? r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {r.distance_km != null && <span>· {Number(r.distance_km).toFixed(1)} km</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[15px] font-bold tabular-nums" style={{ color: "#5A9A2A" }}>
                        {brl(Number(r.final_price ?? r.estimated_price ?? 0))}
                      </div>
                      <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: "#707070" }}>
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
    <div className="rounded-[22px] bg-white p-4 shadow-[0_10px_26px_-20px_rgba(15,23,42,0.25)]">
      <div
        className="inline-flex h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(118,193,57,0.12)", color: "#5A9A2A" }}
      >
        {icon}
      </div>
      <div className="mt-3 text-[18px] font-bold tabular-nums leading-none tracking-tight" style={{ color: "#1B1B1B" }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "#707070" }}>
        {label}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`press-scale h-9 rounded-full px-4 text-[13px] font-semibold transition ${
        active ? "text-white shadow-[0_10px_24px_-14px_rgba(118,193,57,0.7)]" : "bg-white text-[#707070] hover:text-[#1B1B1B]"
      }`}
      style={active ? { backgroundColor: "#76C139" } : undefined}
    >
      {children}
    </button>
  );
}
