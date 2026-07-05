import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  MapPin,
  ShieldAlert,
  Tag,
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
import {
  Body,
  BodySmall,
  Caption,
  DSButton,
  DSCard,
  EmptyState,
  HeadingM,
  HeadingXL,
  Icon,
  Label,
  Loading,
  Metric,
  StatusPill,
} from "@/design-system";
import { cn } from "@/lib/utils";
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

function formatPayment(method: string | null): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m.includes("pix")) return "Pix";
  if (m.includes("credit") || m.includes("credito")) return "Crédito";
  if (m.includes("debit") || m.includes("debito")) return "Débito";
  if (m.includes("cash") || m.includes("dinheiro")) return "Dinheiro";
  return method;
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
    <div className="flex min-h-dvh flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 pt-4 pb-28 sm:px-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {/* HEADER */}
          <header className="animate-in fade-in slide-in-from-top-2 duration-500">
            <HeadingXL>Financeiro</HeadingXL>
            <Body className="mt-1 text-muted-foreground">Gerencie seus ganhos</Body>
          </header>

          {/* MAIN BALANCE */}
          <DSCard className="relative overflow-hidden p-5 sm:p-6 animate-in fade-in zoom-in-[0.98] duration-500">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-2xl"
            />
            <div className="relative flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/12 text-primary">
                  <Icon as={Wallet} size="md" />
                </span>
                <Caption>Saldo disponível</Caption>
              </div>

              <Metric className="text-[clamp(28px,9vw,36px)] leading-none">
                {brl(displayedBalance)}
              </Metric>

              <div>
                <StatusPill status="online" label="Disponível para saque" />
              </div>

              <DSButton
                size="lg"
                className="w-full"
                onClick={() => toast.info("Saque em breve — em desenvolvimento")}
              >
                <Icon as={ArrowUpRight} size="md" />
                Solicitar saque
              </DSButton>
            </div>
          </DSCard>

          {/* KPI ROW */}
          <section className="grid grid-cols-3 gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <KpiCard icon={CalendarDays} label="Hoje"   value={brl(totals.today)} />
            <KpiCard icon={TrendingUp}   label="Semana" value={brl(totals.week)} />
            <KpiCard icon={TrendingUp}   label="Mês"    value={brl(totals.month)} />
          </section>

          {/* SUBSCRIPTION */}
          <DSCard
            as-button
            role="button"
            tabIndex={0}
            onClick={() => navigate({ to: "/motorista/assinatura" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate({ to: "/motorista/assinatura" });
              }
            }}
            className="press-scale flex cursor-pointer items-center gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <span
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                subActive ? "bg-primary/12 text-primary" : "bg-destructive/10 text-destructive",
              )}
            >
              <Icon as={subActive ? CheckCircle2 : ShieldAlert} size="lg" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Body className="font-semibold">MOVVI Premium</Body>
                <StatusPill
                  status={subActive ? "accepted" : "cancelled"}
                  label={subLabel}
                  pulse={subActive}
                />
              </div>
              <Caption className="mt-0.5 block">
                {subExpires ? `Expira em ${subExpires}` : "Toque para ver detalhes"}
              </Caption>
            </div>
            <Icon as={ArrowUpRight} size="md" className="rotate-45 text-muted-foreground" />
          </DSCard>

          {/* HISTORY */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <HeadingM>Histórico</HeadingM>
              <div className="flex gap-1.5">
                <DSButton
                  variant="ghost"
                  size="icon"
                  onClick={exportCsv}
                  aria-label="Exportar CSV"
                  disabled={rides.length === 0}
                >
                  <Icon as={Download} size="md" />
                </DSButton>
                <DSButton
                  variant="ghost"
                  size="icon"
                  onClick={exportPdf}
                  aria-label="Exportar PDF"
                  disabled={rides.length === 0}
                >
                  <Icon as={FileText} size="md" />
                </DSButton>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={filter === "today"}  onClick={() => setFilter("today")}>Hoje</FilterPill>
              <FilterPill active={filter === "week"}   onClick={() => setFilter("week")}>Semana</FilterPill>
              <FilterPill active={filter === "month"}  onClick={() => setFilter("month")}>Mês</FilterPill>
              <FilterPill active={filter === "custom"} onClick={() => setFilter("custom")}>Personalizado</FilterPill>
            </div>

            {filter === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-11 rounded-[14px] border border-border/60 bg-card px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-11 rounded-[14px] border border-border/60 bg-card px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </section>

          {/* LIST */}
          {loading ? (
            <Loading label="Carregando ganhos…" />
          ) : rides.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nenhum ganho ainda"
              description="Suas corridas finalizadas aparecerão aqui assim que forem concluídas."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {rides.map((r, i) => (
                <li
                  key={r.id}
                  className="animate-in fade-in slide-in-from-bottom-1"
                  style={{
                    animationDelay: `${Math.min(i, 8) * 40}ms`,
                    animationDuration: "300ms",
                    animationFillMode: "backwards",
                  }}
                >
                  <RideCard ride={r} />
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

/* ---------------- Sub-components (thin wrappers over DS) ---------------- */

function KpiCard({
  icon: IconCmp,
  label,
  value,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
}) {
  return (
    <DSCard className="flex flex-col gap-2 p-3 sm:p-4">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 text-primary">
        <Icon as={IconCmp} size="md" />
      </span>
      <Metric className="text-[clamp(15px,4.6vw,18px)] leading-none">{value}</Metric>
      <Label>{label}</Label>
    </DSCard>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <DSButton
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(
        "rounded-full px-4",
        !active && "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </DSButton>
  );
}

function RideCard({ ride: r }: { ride: Ride }) {
  const when = new Date(r.completed_at ?? r.created_at);
  const dateStr = when.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const timeStr = when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const value = Number(r.final_price ?? r.estimated_price ?? 0);

  return (
    <DSCard className="flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon as={MapPin} size="md" />
        </span>

        <div className="min-w-0 flex-1">
          <Body className="truncate font-semibold text-foreground">
            {r.destination_name || r.origin_name}
          </Body>
          {r.origin_name && r.destination_name && (
            <BodySmall className="truncate text-muted-foreground">
              de {r.origin_name}
            </BodySmall>
          )}
        </div>

        <div className="shrink-0 text-right">
          <Metric className="text-[clamp(14px,4.4vw,16px)] leading-none text-primary">
            {brl(value)}
          </Metric>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Icon as={Clock} size="sm" />
          <Caption>{dateStr} · {timeStr}</Caption>
        </span>
        {r.distance_km != null && (
          <Caption>{Number(r.distance_km).toFixed(1)} km</Caption>
        )}
        {r.category && (
          <span className="inline-flex items-center gap-1">
            <Icon as={Tag} size="sm" />
            <Caption className="capitalize">{r.category}</Caption>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Icon as={CreditCard} size="sm" />
          <Caption>{formatPayment(r.payment_method)}</Caption>
        </span>
        <span className="ml-auto">
          <StatusPill status="finished" label="Concluída" pulse={false} />
        </span>
      </div>
    </DSCard>
  );
}
