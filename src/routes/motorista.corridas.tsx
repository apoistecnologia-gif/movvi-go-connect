import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, MapPin, Navigation2, Search, Star } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import {
  Avatar,
  Body,
  BodySmall,
  Caption,
  DSButton,
  DSCard,
  EmptyState,
  HeadingXL,
  Icon,
  Label,
  Loading,
  Metric,
  StatusPill,
} from "@/design-system";
import { cn } from "@/lib/utils";

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

type Filter = "today" | "d7" | "d30" | "custom";

const FILTER_LABEL: Record<Filter, string> = {
  today: "Hoje",
  d7: "Últimos 7 dias",
  d30: "Últimos 30 dias",
  custom: "Período personalizado",
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - (n - 1));
  return d;
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

function rideStatus(status: string): {
  key: "finished" | "cancelled" | "trip";
  label: string;
} {
  if (status === "finalizada") return { key: "finished", label: "Concluída" };
  if (status?.startsWith("cancel")) return { key: "cancelled", label: "Cancelada" };
  return { key: "trip", label: status || "Em andamento" };
}

function StarRow({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Avaliação: ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn(
            "h-3 w-3",
            n <= value ? "fill-primary text-primary" : "text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

function RideCard({ ride, index }: { ride: RideRow; index: number }) {
  const price = ride.final_price ?? ride.estimated_price;
  const date = new Date(ride.completed_at ?? ride.created_at);
  const passengerName = ride.passenger_name || "Passageiro";
  const status = rideStatus(ride.status);

  const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <Link
      to="/motorista/corridas/$id"
      params={{ id: ride.id }}
      data-testid="ride-card"
      className="block animate-in fade-in slide-in-from-bottom-1 fill-mode-both focus:outline-none"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms`, animationDuration: "320ms" }}
    >
      <DSCard className="press-scale flex flex-col gap-3 p-3 transition hover:-translate-y-[1px] sm:p-4">
        {/* header row: passenger + status + price */}
        <div className="flex items-start gap-3">
          <Avatar src={ride.passenger_photo_url} name={passengerName} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Body className="truncate font-semibold">{passengerName}</Body>
              <StatusPill status={status.key} label={status.label} pulse={false} />
            </div>
            <Caption className="mt-0.5 block">
              {dateStr} · {timeStr}
              {ride.category ? ` · ${ride.category}` : ""}
            </Caption>
          </div>
          <div className="shrink-0 text-right">
            {price !== null && (
              <Metric className="text-[clamp(14px,4.4vw,17px)] leading-none text-primary">
                {brl(Number(price))}
              </Metric>
            )}
            <Icon as={ChevronRight} size="sm" className="ml-auto mt-1 text-muted-foreground/60" />
          </div>
        </div>

        {/* addresses */}
        <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/40 p-2.5">
          <div className="flex items-start gap-2">
            <Icon as={MapPin} size="sm" className="mt-0.5 text-primary" />
            <BodySmall className="min-w-0 truncate text-foreground">{ride.origin_name}</BodySmall>
          </div>
          <div className="flex items-start gap-2">
            <Icon as={Navigation2} size="sm" className="mt-0.5 text-primary" />
            <BodySmall className="min-w-0 truncate text-foreground">
              {ride.destination_name}
            </BodySmall>
          </div>
        </div>

        {/* meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          {ride.distance_km != null && <Caption>{Number(ride.distance_km).toFixed(1)} km</Caption>}
          {ride.duration_min != null && (
            <Caption>{Math.round(Number(ride.duration_min))} min</Caption>
          )}
          <Caption>{formatPayment(ride.payment_method)}</Caption>
        </div>

        {ride.status === "finalizada" && ride.driver_rated_at && ride.passenger_rating && (
          <div
            data-testid="rating-info"
            className="flex items-center gap-2 border-t border-border/50 pt-2"
          >
            <StarRow value={ride.passenger_rating} />
            <Caption>Sua avaliação · {ride.passenger_rating}/5</Caption>
          </div>
        )}
      </DSCard>
    </Link>
  );
}

function DriverRidesPage() {
  const [rides, setRides] = useState<RideRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("d30");
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
    if (filter === "today") {
      from = startOfToday();
      to = new Date(now);
      to.setHours(23, 59, 59, 999);
    } else if (filter === "d7") {
      from = daysAgo(7);
      to = new Date(now);
      to.setHours(23, 59, 59, 999);
    } else if (filter === "d30") {
      from = daysAgo(30);
      to = new Date(now);
      to.setHours(23, 59, 59, 999);
    } else if (filter === "custom") {
      from = customFrom ? new Date(customFrom + "T00:00:00") : null;
      to = customTo ? new Date(customTo + "T23:59:59") : null;
    }
    const q = query.trim().toLowerCase();
    return rides.filter((r) => {
      const at = new Date(r.completed_at ?? r.created_at);
      if (from && at < from) return false;
      if (to && at > to) return false;
      if (q) {
        const hay =
          `${r.origin_name ?? ""} ${r.destination_name ?? ""} ${r.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rides, filter, customFrom, customTo, query]);

  const summary = useMemo(() => {
    const list = filtered ?? [];
    const finished = list.filter((r) => r.status === "finalizada");
    const total = list.length;
    const revenue = finished.reduce(
      (s, r) => s + Number(r.final_price ?? r.estimated_price ?? 0),
      0,
    );
    const avg = finished.length ? revenue / finished.length : 0;
    return { total, revenue, avg };
  }, [filtered]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 pt-4 pb-28 sm:px-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {/* HEADER */}
          <header className="animate-in fade-in slide-in-from-top-2 duration-500">
            <HeadingXL>Histórico</HeadingXL>
            <Body className="mt-1 text-muted-foreground">Revise suas viagens realizadas</Body>
          </header>

          {/* SUMMARY */}
          <section
            aria-label="Resumo do período"
            className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <SummaryCard label="Corridas" value={String(summary.total)} />
              <SummaryCard label="Recebido" value={brl(summary.revenue)} tone="primary" />
              <SummaryCard label="Ticket médio" value={brl(summary.avg)} />
            </div>
            <Caption className="pl-1">Período: {FILTER_LABEL[filter]}</Caption>
          </section>

          {/* SEARCH */}
          <div className="relative animate-in fade-in duration-500">
            <label htmlFor="ride-search" className="sr-only">
              Buscar por endereço ou categoria
            </label>
            <Icon
              as={Search}
              size="md"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="ride-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por endereço ou categoria"
              className="h-12 w-full rounded-full border border-border/60 bg-card pl-11 pr-4 text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* FILTERS */}
          <section className="flex flex-col gap-3">
            <div
              role="tablist"
              aria-label="Filtro de período"
              className="flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-left-2 duration-500"
            >
              <FilterPill active={filter === "today"} onClick={() => setFilter("today")}>
                Hoje
              </FilterPill>
              <FilterPill active={filter === "d7"} onClick={() => setFilter("d7")}>
                7 dias
              </FilterPill>
              <FilterPill active={filter === "d30"} onClick={() => setFilter("d30")}>
                30 dias
              </FilterPill>
              <FilterPill active={filter === "custom"} onClick={() => setFilter("custom")}>
                Personalizado
              </FilterPill>
            </div>
            {filter === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="sr-only" htmlFor="ride-from">
                  Data inicial
                </label>
                <input
                  id="ride-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-11 rounded-[14px] border border-border/60 bg-card px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <label className="sr-only" htmlFor="ride-to">
                  Data final
                </label>
                <input
                  id="ride-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-11 rounded-[14px] border border-border/60 bg-card px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </section>

          {error && (
            <DSCard className="p-3">
              <Body className="text-destructive">{error}</Body>
            </DSCard>
          )}

          {/* LOADING */}
          {rides === null && <Loading label="Carregando corridas…" />}

          {/* EMPTY */}
          {rides && filtered && filtered.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma corrida encontrada"
              description="Ajuste o filtro ou complete sua primeira viagem para construir seu histórico."
              action={
                <Link to="/motorista/app">
                  <DSButton variant="outline" size="sm">
                    Voltar ao mapa
                  </DSButton>
                </Link>
              }
            />
          )}

          {/* LIST */}
          {filtered && filtered.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {filtered.map((r, i) => (
                <li key={r.id}>
                  <RideCard ride={r} index={i} />
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

/* ---------------- Sub-components ---------------- */

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary";
}) {
  return (
    <DSCard className="flex flex-col gap-1.5 p-3 sm:p-4">
      <Metric
        className={cn(
          "text-[clamp(14px,4.6vw,18px)] leading-none",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </Metric>
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
      role="tab"
      aria-selected={active}
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

export const Route = createFileRoute("/motorista/corridas")({
  head: () => ({ meta: [{ title: "Histórico — APOIS" }] }),
  component: DriverRidesPage,
});
