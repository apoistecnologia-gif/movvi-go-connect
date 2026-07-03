import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  MapPin,
  Navigation2,
  Search,
  Star,
  XCircle,
} from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";

type RideRow = {
  id: string;
  status: string;
  origin_name: string;
  destination_name: string;
  category: string | null;
  payment_method: string | null;
  passenger_photo_url: string | null;
  passenger_name?: string | null;
  final_price: number | null;
  estimated_price: number | null;
  distance_km: number | null;
  duration_min: number | null;
  completed_at: string | null;
  created_at: string;
  accepted_at: string | null;
  passenger_rating: number | null;
  passenger_rating_comment: string | null;
  driver_rated_at: string | null;
};

type Filter = "today" | "week" | "month" | "custom";

const GREEN = "#76C139";

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

function StarRow({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Avaliação: ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3 w-3 ${n <= value ? "fill-[#76C139] text-[#76C139]" : "text-[#CBD5E1]"}`}
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const completed = status === "finalizada";
  const canceled = status === "cancelada" || status === "cancelled" || status?.startsWith("cancel");
  if (completed) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider"
        style={{ backgroundColor: "rgba(118,193,57,0.12)", color: "#5A9A2A" }}
      >
        <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} />
        Concluída
      </span>
    );
  }
  if (canceled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
        <XCircle className="h-3 w-3" strokeWidth={2.25} />
        Cancelada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
      {status}
    </span>
  );
}

function RideCard({ ride, index }: { ride: RideRow; index: number }) {
  const price = ride.final_price ?? ride.estimated_price;
  const date = new Date(ride.completed_at ?? ride.created_at);
  const passengerName = ride.passenger_name || "Passageiro";

  return (
    <Link
      to="/motorista/corridas/$id"
      params={{ id: ride.id }}
      data-testid="ride-card"
      className="block rounded-[24px] bg-white p-4 shadow-[0_10px_28px_-22px_rgba(15,23,42,0.28)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_36px_-22px_rgba(15,23,42,0.30)] active:scale-[0.995] animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms`, animationDuration: "320ms" }}
    >
      <header className="flex items-start gap-3">
        <Avatar src={ride.passenger_photo_url} name={passengerName} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-[#1B1B1B]">{passengerName}</span>
            <StatusBadge status={ride.status} />
          </div>
          <p className="mt-0.5 text-[11.5px] text-[#707070]">
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            {" · "}
            {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {ride.category ? ` · ${ride.category}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {price !== null && (
            <p className="text-[18px] font-bold tabular-nums" style={{ color: "#5A9A2A" }}>
              {brl(Number(price))}
            </p>
          )}
          <ChevronRight className="ml-auto mt-0.5 h-4 w-4 text-[#CBD5E1]" />
        </div>
      </header>

      <div className="mt-3 space-y-1.5 rounded-[16px] bg-[#F7F9F7] p-3 text-[12.5px]">
        <p className="flex items-start gap-2 text-[#1B1B1B]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: GREEN }} strokeWidth={1.75} />
          <span className="truncate">{ride.origin_name}</span>
        </p>
        <p className="flex items-start gap-2 text-[#1B1B1B]">
          <Navigation2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: GREEN }} strokeWidth={1.75} />
          <span className="truncate">{ride.destination_name}</span>
        </p>
      </div>

      {ride.status === "finalizada" && ride.driver_rated_at && ride.passenger_rating && (
        <div data-testid="rating-info" className="mt-2.5 flex items-center gap-2 px-1">
          <StarRow value={ride.passenger_rating} />
          <span className="text-[11px] text-[#707070]">Sua avaliação · {ride.passenger_rating}/5</span>
        </div>
      )}
    </Link>
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
    <button
      onClick={onClick}
      className={`h-9 rounded-full px-4 text-[13px] font-semibold transition active:scale-[0.97] ${
        active ? "text-white shadow-[0_10px_22px_-14px_rgba(118,193,57,0.7)]" : "bg-white text-[#707070] hover:text-[#1B1B1B]"
      }`}
      style={active ? { backgroundColor: GREEN } : undefined}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "green" | "muted" }) {
  const color = tone === "green" ? "#5A9A2A" : tone === "muted" ? "#707070" : "#1B1B1B";
  return (
    <div className="rounded-[22px] bg-white p-4 shadow-[0_10px_26px_-20px_rgba(15,23,42,0.22)]">
      <div className="text-[20px] font-bold tabular-nums leading-none tracking-tight" style={{ color }}>
        {value}
      </div>
      <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#707070]">{label}</div>
    </div>
  );
}

function DriverRidesPage() {
  const [rides, setRides] = useState<RideRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        if (active) setRides([]);
        return;
      }
      const { data, error } = await supabase
        .from("rides")
        .select(
          "id,status,category,payment_method,passenger_photo_url,origin_name,destination_name,final_price,estimated_price,distance_km,duration_min,completed_at,created_at,accepted_at,passenger_rating,passenger_rating_comment,driver_rated_at",
        )
        .eq("driver_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (error) setError(error.message);
      else setRides((data ?? []) as RideRow[]);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rides) return null;
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (filter === "today") { from = startOf("day"); to = new Date(now); to.setHours(23, 59, 59, 999); }
    else if (filter === "week") { from = startOf("week"); to = new Date(now); to.setHours(23, 59, 59, 999); }
    else if (filter === "month") { from = startOf("month"); to = new Date(now); to.setHours(23, 59, 59, 999); }
    else if (filter === "custom") {
      from = customFrom ? new Date(customFrom + "T00:00:00") : null;
      to = customTo ? new Date(customTo + "T23:59:59") : null;
    }
    const q = query.trim().toLowerCase();
    return rides.filter((r) => {
      const at = new Date(r.completed_at ?? r.created_at);
      if (from && at < from) return false;
      if (to && at > to) return false;
      if (q) {
        const hay = `${r.origin_name ?? ""} ${r.destination_name ?? ""} ${r.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rides, filter, customFrom, customTo, query]);

  const summary = useMemo(() => {
    const todayStart = startOf("day");
    const list = rides ?? [];
    let today = 0, done = 0, canceled = 0;
    list.forEach((r) => {
      const at = new Date(r.completed_at ?? r.created_at);
      if (at >= todayStart) today++;
      if (r.status === "finalizada") done++;
      if (r.status?.startsWith("cancel")) canceled++;
    });
    return { today, done, canceled };
  }, [rides]);

  return (
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: "#F7F9F7" }}>
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-5 py-6 pb-28">
        <div className="container mx-auto max-w-2xl space-y-6">
          {/* HEADER */}
          <header className="animate-in fade-in slide-in-from-top-2 duration-500">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#1B1B1B]">
              Histórico de corridas
            </h1>
            <p className="mt-1 text-[13px] text-[#707070]">Revise suas viagens realizadas</p>
          </header>

          {/* SUMMARY */}
          <section className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <StatCard label="Hoje" value={summary.today} tone="default" />
            <StatCard label="Concluídas" value={summary.done} tone="green" />
            <StatCard label="Canceladas" value={summary.canceled} tone="muted" />
          </section>

          {/* SEARCH */}
          <div className="relative animate-in fade-in duration-500">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" strokeWidth={1.75} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por endereço ou categoria"
              className="h-12 w-full rounded-full bg-white pl-11 pr-4 text-[13.5px] text-[#1B1B1B] placeholder:text-[#94A3B8] shadow-[0_8px_22px_-18px_rgba(15,23,42,0.25)] focus:outline-none focus:ring-2 focus:ring-[#76C139]/40"
            />
          </div>

          {/* FILTERS */}
          <section className="space-y-3">
            <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-left-2 duration-500">
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

          {error && (
            <p className="rounded-2xl bg-white p-3 text-xs text-[#DC2626] shadow-[0_6px_18px_-14px_rgba(220,38,38,0.3)]">
              {error}
            </p>
          )}

          {/* LOADING */}
          {rides === null && (
            <div className="space-y-3" aria-busy="true" aria-label="Carregando corridas">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-[24px] bg-white p-4 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.2)]">
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[#EEF1F5]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-[#EEF1F5]" />
                      <div className="h-2.5 w-2/3 animate-pulse rounded bg-[#EEF1F5]" />
                    </div>
                    <div className="h-4 w-16 animate-pulse rounded bg-[#EEF1F5]" />
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-5/6 animate-pulse rounded bg-[#EEF1F5]" />
                    <div className="h-3 w-4/6 animate-pulse rounded bg-[#EEF1F5]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EMPTY */}
          {rides && filtered && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[24px] bg-white px-6 py-12 text-center shadow-[0_14px_36px_-24px_rgba(15,23,42,0.22)] animate-in fade-in duration-500">
              <div
                className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "rgba(118,193,57,0.10)", color: GREEN }}
              >
                <ClipboardList className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-semibold text-[#1B1B1B]">Nenhuma corrida encontrada</p>
              <p className="mt-1 max-w-[280px] text-[12.5px] text-[#707070]">
                Complete sua primeira viagem para construir seu histórico.
              </p>
            </div>
          )}

          {/* LIST */}
          {filtered && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((r, i) => (
                <RideCard key={r.id} ride={r} index={i} />
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}

export const Route = createFileRoute("/motorista/corridas")({
  head: () => ({ meta: [{ title: "Corridas — MOVVI DRIVE" }] }),
  component: DriverRidesPage,
});
