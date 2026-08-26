import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, MapPin, Navigation2, Search, Star } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverProfile } from "@/lib/driverProfile";
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
  passenger_id: string | null;
  passenger_photo_url?: string | null;
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
  passenger_rated_at: string | null;
};

type Filter = "today" | "d7" | "d30" | "custom";

const FILTER_LABEL: Record<Filter, string> = {
  today: "Hoje",
  d7: "Últimos 7 dias",
  d30: "Últimos 30 dias",
  custom: "Período personalizado",
};

const CATEGORY_LABELS: Record<string, string> = {
  carros: "Carro",
  carro: "Carro",
  motos: "Moto",
  moto: "Moto",
  fretes: "Fretes e Mudanças",
  frete: "Fretes e Mudanças",
  guincho: "Guincho",
  envios: "Envios",
  envio: "Envios",
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDecimal(v: number, digits = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
  if (!method) return "Não informado";
  const m = method.toLowerCase();
  if (m.includes("pix")) return "Pix";
  if (m.includes("credit") || m.includes("credito")) return "Cartão de crédito";
  if (m.includes("debit") || m.includes("debito")) return "Cartão de débito";
  if (m.includes("cash") || m.includes("dinheiro")) return "Dinheiro";
  if (m.includes("wallet") || m.includes("carteira")) return "Carteira APOIS";
  return "Pagamento registrado";
}

function formatCategory(category: string | null): string {
  if (!category) return "Categoria não informada";
  return CATEGORY_LABELS[category.toLowerCase()] ?? "Categoria de serviço";
}

function rideStatus(status: string): {
  key: "finished" | "cancelled" | "trip";
  label: string;
} {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized === "finalizada" || normalized === "completed") return { key: "finished", label: "Concluída" };
  if (normalized.startsWith("cancel") || normalized === "expired" || normalized === "no_driver_available") {
    return { key: "cancelled", label: normalized === "expired" || normalized === "no_driver_available" ? "Busca encerrada" : "Cancelada" };
  }
  const labels: Record<string, string> = {
    solicitada: "Solicitada",
    procurar_motorista: "Buscando motorista",
    buscando_motorista: "Buscando motorista",
    motorista_a_caminho: "Motorista a caminho",
    motorista_chegou: "Motorista chegou",
    aguardando_pin: "Aguardando PIN",
    em_viagem: "Em viagem",
    em_andamento: "Em viagem",
    agendada: "Agendada",
  };
  return { key: "trip", label: labels[normalized] ?? "Em andamento" };
}

function StarRow({ value }: { value: number }) {
  const safeValue = Math.min(5, Math.max(0, value));
  const labelValue = formatDecimal(safeValue, 1);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Avaliação: ${labelValue} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn(
            "h-3 w-3 shrink-0",
            n <= safeValue ? "fill-primary text-primary" : "text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

function RideCard({ ride, index }: { ride: RideRow; index: number }) {
  const rawPrice = Number(ride.final_price ?? ride.estimated_price);
  const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null;
  const date = new Date(ride.completed_at ?? ride.created_at);
  const passengerName = ride.passenger_name?.trim() || "Passageiro";
  const status = rideStatus(ride.status);
  const category = formatCategory(ride.category);
  const hasValidDate = Number.isFinite(date.getTime());
  const distance = Number(ride.distance_km);
  const duration = Number(ride.duration_min);

  const dateStr = hasValidDate ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "Data indisponível";
  const timeStr = hasValidDate ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <Link
      to="/motorista/corridas/$id"
      params={{ id: ride.id }}
      data-testid="ride-card"
      aria-label={`Abrir corrida de ${passengerName}, ${status.label}`}
      className="block min-w-0 rounded-2xl animate-in fade-in slide-in-from-bottom-1 fill-mode-both focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms`, animationDuration: "320ms" }}
    >
      <DSCard className="press-scale flex min-w-0 flex-col gap-3 p-3 transition hover:-translate-y-[1px] sm:p-4">
        <div className="flex min-w-0 flex-wrap items-start gap-3 min-[360px]:flex-nowrap">
          <Avatar src={ride.passenger_photo_url} name={passengerName} size={40} />
          <div className="min-w-[140px] flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Body className="min-w-0 break-words font-semibold">{passengerName}</Body>
              <StatusPill status={status.key} label={status.label} pulse={false} />
            </div>
            <Caption className="mt-0.5 block break-words leading-4">
              {dateStr}{timeStr ? ` · ${timeStr}` : ""} · {category}
            </Caption>
          </div>
          <div className="min-w-[96px] max-w-full shrink-0 text-right max-[359px]:ml-[52px] max-[359px]:text-left">
            {price !== null ? (
              <Metric className="break-words text-[clamp(14px,4.4vw,17px)] leading-tight text-primary">
                {brl(price)}
              </Metric>
            ) : (
              <Caption className="block break-words">Valor indisponível</Caption>
            )}
            <Caption className="mt-1 block break-words">valor da corrida</Caption>
            <Icon as={ChevronRight} size="sm" className="ml-auto mt-1 text-muted-foreground/60 max-[359px]:ml-0" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-muted/40 p-2.5">
          <div className="flex min-w-0 items-start gap-2">
            <Icon as={MapPin} size="sm" className="mt-0.5 shrink-0 text-primary" />
            <BodySmall className="min-w-0 break-words leading-5 text-foreground">{ride.origin_name?.trim() || "Origem não informada"}</BodySmall>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <Icon as={Navigation2} size="sm" className="mt-0.5 shrink-0 text-primary" />
            <BodySmall className="min-w-0 break-words leading-5 text-foreground">
              {ride.destination_name?.trim() || "Destino não informado"}
            </BodySmall>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          {Number.isFinite(distance) && distance >= 0 ? <Caption>{formatDecimal(distance)} km</Caption> : null}
          {Number.isFinite(duration) && duration >= 0 ? <Caption>{Math.round(duration)} min</Caption> : null}
          <Caption className="max-w-full break-words">{formatPayment(ride.payment_method)}</Caption>
        </div>

        {ride.status === "finalizada" &&
          ride.passenger_rated_at &&
          ride.passenger_rating != null &&
          Number.isFinite(Number(ride.passenger_rating)) && (
            <div
              data-testid="rating-info"
              className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border/50 pt-2"
            >
              <StarRow value={Number(ride.passenger_rating)} />
              <Caption className="break-words">Avaliação recebida · {formatDecimal(Number(ride.passenger_rating))}/5</Caption>
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
    void (async () => {
      const profile = await loadDriverProfile();
      if (!profile.ok) {
        if (active) {
          setError("Não foi possível identificar seu cadastro de motorista.");
          setRides([]);
        }
        return;
      }
      const driverId = profile.profile.id;
      const { data, error: ridesError } = await supabase
        .from("rides")
        .select(
          "id,status,category,payment_method,passenger_id,origin_name,destination_name,final_price,estimated_price,distance_km,duration_min,completed_at,created_at,accepted_at,passenger_rating,passenger_rating_comment,passenger_rated_at",
        )
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (ridesError) {
        console.error("[APOIS Motorista] histórico de corridas:", ridesError);
        setError("Não foi possível carregar seu histórico de corridas agora.");
        setRides([]);
        return;
      }

      const baseRides = (data ?? []) as RideRow[];
      const passengerIds = Array.from(
        new Set(baseRides.map((ride) => ride.passenger_id).filter(Boolean)),
      ) as string[];
      let passengerMap = new Map<string, { name: string | null; avatar_url: string | null }>();

      if (passengerIds.length > 0) {
        const { data: passengers, error: passengersError } = await supabase
          .from("users")
          .select("id,name,avatar_url")
          .in("id", passengerIds);
        if (passengersError) {
          console.warn("[APOIS Motorista] dados públicos dos passageiros indisponíveis:", passengersError);
        } else {
          passengerMap = new Map(
            (passengers ?? []).map((passenger) => [
              passenger.id,
              { name: passenger.name ?? null, avatar_url: passenger.avatar_url ?? null },
            ]),
          );
        }
      }

      if (!active) return;
      setError(null);
      setRides(
        baseRides.map((ride) => {
          const passenger = ride.passenger_id ? passengerMap.get(ride.passenger_id) : null;
          return {
            ...ride,
            passenger_name: passenger?.name ?? null,
            passenger_photo_url: passenger?.avatar_url ?? null,
          };
        }),
      );
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
      from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
      to = customTo ? new Date(`${customTo}T23:59:59`) : null;
    }
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return rides.filter((r) => {
      const at = new Date(r.completed_at ?? r.created_at);
      if (!Number.isFinite(at.getTime())) return false;
      if (from && at < from) return false;
      if (to && at > to) return false;
      if (q) {
        const hay = `${r.origin_name ?? ""} ${r.destination_name ?? ""} ${formatCategory(r.category)} ${formatPayment(r.payment_method)} ${r.passenger_name ?? ""}`.toLocaleLowerCase("pt-BR");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rides, filter, customFrom, customTo, query]);

  const summary = useMemo(() => {
    const list = filtered ?? [];
    const finished = list.filter((r) => r.status === "finalizada");
    const total = list.length;
    const grossVolume = finished.reduce((sum, ride) => {
      const value = Number(ride.final_price ?? ride.estimated_price ?? 0);
      return Number.isFinite(value) && value >= 0 ? sum + value : sum;
    }, 0);
    const avgFare = finished.length ? grossVolume / finished.length : 0;
    return { total, grossVolume, avgFare };
  }, [filtered]);

  const customRangeInvalid = Boolean(customFrom && customTo && customFrom > customTo);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">
        <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-5">
          <header className="min-w-0 animate-in fade-in slide-in-from-top-2 duration-500">
            <HeadingXL className="break-words">Histórico</HeadingXL>
            <Body className="mt-1 break-words text-muted-foreground">Revise suas viagens realizadas</Body>
          </header>

          <section
            aria-label="Resumo do período"
            className="flex min-w-0 flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3 sm:gap-3">
              <SummaryCard label="Corridas" value={String(summary.total)} />
              <SummaryCard label="Valor das corridas" value={brl(summary.grossVolume)} tone="primary" />
              <SummaryCard label="Tarifa média" value={brl(summary.avgFare)} />
            </div>
            <Caption className="break-words pl-1">Período: {FILTER_LABEL[filter]}</Caption>
            <Caption className="break-words pl-1">
              Este resumo mostra o valor bruto das viagens. Seu saldo e valores realmente creditados ficam em Carteira.
            </Caption>
          </section>

          <div className="relative min-w-0 animate-in fade-in duration-500">
            <label htmlFor="ride-search" className="sr-only">
              Buscar por passageiro, endereço, categoria ou pagamento
            </label>
            <Icon
              as={Search}
              size="md"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="ride-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar corrida"
              autoComplete="off"
              enterKeyHint="search"
              className="min-h-12 w-full min-w-0 rounded-full border border-border/60 bg-card pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <section className="flex min-w-0 flex-col gap-3">
            <div
              role="tablist"
              aria-label="Filtro de período"
              className="flex min-w-0 flex-wrap gap-1.5 animate-in fade-in slide-in-from-left-2 duration-500"
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
              <div className="grid min-w-0 grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <label className="sr-only" htmlFor="ride-from">
                  Data inicial
                </label>
                <input
                  id="ride-from"
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="min-h-11 min-w-0 rounded-[14px] border border-border/60 bg-card px-3 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <label className="sr-only" htmlFor="ride-to">
                  Data final
                </label>
                <input
                  id="ride-to"
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="min-h-11 min-w-0 rounded-[14px] border border-border/60 bg-card px-3 text-base text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {customRangeInvalid ? (
                  <p className="break-words text-sm font-semibold text-destructive min-[380px]:col-span-2" role="alert">
                    A data final precisa ser igual ou posterior à data inicial.
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {error && (
            <DSCard className="min-w-0 p-3" role="alert">
              <Body className="break-words text-destructive">{error}</Body>
            </DSCard>
          )}

          {rides === null && <Loading label="Carregando corridas…" />}

          {rides && filtered && filtered.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="Nenhuma corrida encontrada"
              description={query.trim() || filter !== "d30" ? "Nenhuma corrida corresponde aos filtros atuais." : "Complete sua primeira viagem para construir seu histórico."}
              action={
                <Link to="/motorista/app" className="inline-flex min-h-11 items-center">
                  <DSButton variant="outline" size="sm">
                    Voltar ao mapa
                  </DSButton>
                </Link>
              }
            />
          )}

          {filtered && filtered.length > 0 && !customRangeInvalid && (
            <ul className="flex min-w-0 flex-col gap-2.5" aria-label={`${filtered.length} corridas encontradas`}>
              {filtered.map((ride, index) => (
                <li key={ride.id} className="min-w-0">
                  <RideCard ride={ride} index={index} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <ApoisDriverBottomNav />
    </div>
  );
}

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
    <DSCard className="flex min-w-0 flex-col gap-1.5 p-3 sm:p-4">
      <Metric
        className={cn(
          "max-w-full break-words text-[clamp(14px,4.6vw,18px)] leading-tight",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </Metric>
      <Label className="break-words">{label}</Label>
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
        "min-h-11 max-w-full whitespace-normal rounded-full px-4 text-center",
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