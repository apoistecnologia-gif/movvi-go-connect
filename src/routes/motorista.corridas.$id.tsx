import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Navigation2,
  Receipt as ReceiptIcon,
  Star,
} from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { downloadRideReceipt } from "@/lib/driverReceipt";
import { RideReceiptDialog } from "@/components/rides/RideReceiptDialog";
import { DSButton, DSCard, DSCardContent } from "@/design-system";

export const Route = createFileRoute("/motorista/corridas/$id")({
  head: () => ({ meta: [{ title: "Detalhes da corrida — APOIS" }] }),
  component: RideDetailsPage,
});

type RideRow = {
  id: string;
  status: string;
  category: string | null;
  origin_name: string;
  destination_name: string;
  pickup_label?: string | null;
  pickup_short_label?: string | null;
  distance_km: number | null;
  duration_min: number | null;
  estimated_price: number | null;
  final_price: number | null;
  payment_method: string | null;
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  passenger_id: string | null;
  driver_to_passenger_rating: number | null;
  driver_to_passenger_comment: string | null;
  driver_rated_at: string | null;
  driver_name: string | null;
  driver_vehicle_model: string | null;
  driver_vehicle_color: string | null;
  driver_vehicle_plate: string | null;
};

type SettlementRow = {
  passenger_charge: number;
  driver_earning: number | null;
  payment_method: string;
  payment_status: string;
  status: string;
  currency: string;
  settled_at: string | null;
};

type PassengerSummary = {
  name: string | null;
  avatar_url: string | null;
};

type RpcError = { message: string };
type RpcResult = { data: unknown; error: RpcError | null };
type DynamicRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

const rpcClient = supabase as unknown as DynamicRpcClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSettlement(value: unknown): SettlementRow | null {
  if (!isRecord(value)) return null;
  const passengerCharge = Number(value.passenger_charge);
  if (!Number.isFinite(passengerCharge) || passengerCharge <= 0) return null;

  const driverEarningRaw = value.driver_earning;
  const driverEarning =
    driverEarningRaw === null || driverEarningRaw === undefined
      ? null
      : Number(driverEarningRaw);

  return {
    passenger_charge: passengerCharge,
    driver_earning: driverEarning !== null && Number.isFinite(driverEarning) ? driverEarning : null,
    payment_method: typeof value.payment_method === "string" ? value.payment_method : "",
    payment_status: typeof value.payment_status === "string" ? value.payment_status : "",
    status: typeof value.status === "string" ? value.status : "",
    currency: typeof value.currency === "string" ? value.currency : "BRL",
    settled_at: typeof value.settled_at === "string" ? value.settled_at : null,
  };
}

function brl(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function categoryLabel(category: string | null | undefined): string {
  if (!category) return "Categoria não informada";
  const labels: Record<string, string> = {
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
  return labels[category.trim().toLowerCase()] ?? "Categoria cadastrada";
}

function rideStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  const labels: Record<string, string> = {
    solicitada: "Solicitada",
    agendada: "Agendada",
    aguardando_pagamento: "Aguardando pagamento",
    procurar_motorista: "Buscando motorista",
    buscando_motorista: "Buscando motorista",
    motorista_a_caminho: "A caminho do embarque",
    motorista_chegou: "Motorista chegou",
    em_andamento: "Em andamento",
    em_viagem: "Em andamento",
    finalizada: "Concluída",
    cancelada: "Cancelada",
    cancelado: "Cancelada",
    cancelada_passageiro: "Cancelada pelo passageiro",
    cancelada_motorista: "Cancelada por você",
    expired: "Busca encerrada",
  };
  return labels[normalized] ?? "Status atualizado";
}

function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "Não informado";
  const normalized = method.toLowerCase();
  if (normalized.includes("pix")) return "Pix";
  if (normalized.includes("cash") || normalized.includes("dinheiro")) return "Dinheiro";
  if (normalized.includes("credit") || normalized.includes("credito")) return "Cartão de crédito";
  if (normalized.includes("debit") || normalized.includes("debito")) return "Cartão de débito";
  if (normalized.includes("wallet") || normalized.includes("carteira")) return "Carteira APOIS";
  return "Forma de pagamento registrada";
}

function paymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "confirmed":
      return "Pagamento confirmado";
    case "cash_confirmed":
      return "Dinheiro confirmado";
    case "cash_pending":
      return "Dinheiro aguardando confirmação";
    case "refunded":
      return "Pagamento reembolsado";
    case "failed":
      return "Pagamento não confirmado";
    case "pending":
      return "Aguardando confirmação do pagamento";
    default:
      return "Situação do pagamento indisponível";
  }
}

function ratingLabel(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function RideDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState<RideRow | null>(null);
  const [passenger, setPassenger] = useState<PassengerSummary | null>(null);
  const [settlement, setSettlement] = useState<SettlementRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user) {
        if (active) await navigate({ to: "/motorista/login", replace: true });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      if (profileError || !profile) {
        if (active) {
          setLoadError("Não foi possível identificar seu perfil para abrir esta corrida.");
          setLoading(false);
        }
        return;
      }

      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (driverError || !driver) {
        if (active) {
          setLoadError("Não foi possível identificar seu cadastro de motorista.");
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("rides")
        .select(
          "id,status,category,origin_name,destination_name,pickup_label,pickup_short_label,distance_km,duration_min,estimated_price,final_price,payment_method,created_at,accepted_at,started_at,completed_at,cancelled_at,cancellation_reason,passenger_id,driver_to_passenger_rating,driver_to_passenger_comment,driver_rated_at,driver_name,driver_vehicle_model,driver_vehicle_color,driver_vehicle_plate",
        )
        .eq("id", id)
        .eq("driver_id", driver.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setLoadError("Não foi possível carregar os detalhes desta corrida agora.");
        setLoading(false);
        return;
      }
      if (!data) {
        setLoadError("Esta corrida não foi encontrada no seu histórico.");
        setLoading(false);
        return;
      }

      const normalizedRide = data as unknown as RideRow;
      setRide(normalizedRide);

      if (normalizedRide.passenger_id) {
        const { data: passengerData } = await supabase
          .from("users")
          .select("name,avatar_url")
          .eq("id", normalizedRide.passenger_id)
          .maybeSingle();
        if (active) setPassenger(passengerData ?? null);
      }

      const { data: settlementResponse, error: settlementError } = await rpcClient.rpc(
        "get_driver_ride_settlement",
        { _ride_id: id },
      );

      if (settlementError) {
        console.warn("[DriverRideDetails] Settlement unavailable", settlementError.message);
      }

      let nextSettlement: SettlementRow | null = null;
      if (
        isRecord(settlementResponse) &&
        settlementResponse.ok === true &&
        isRecord(settlementResponse.settlement)
      ) {
        nextSettlement = normalizeSettlement(settlementResponse.settlement);
      }

      if (active) {
        setSettlement(nextSettlement);
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id, navigate]);

  const driverVehicle = useMemo(() => {
    if (!ride) return null;
    return (
      [ride.driver_vehicle_model, ride.driver_vehicle_color, ride.driver_vehicle_plate]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" • ") || null
    );
  }, [ride]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4" role="status" aria-live="polite">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          <span className="break-words">Carregando detalhes da corrida…</span>
        </div>
      </div>
    );
  }

  if (loadError || !ride) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <MovviHeader logoutRedirect="/" />
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center text-sm text-muted-foreground">
          <p className="max-w-sm break-words leading-6" role="alert">{loadError ?? "Esta corrida não foi encontrada."}</p>
          <div className="mt-4 w-full max-w-xs">
            <DSButton asChild className="min-h-11 w-full">
              <Link to="/motorista/corridas">Voltar ao histórico</Link>
            </DSButton>
          </div>
        </main>
      </div>
    );
  }

  const timeline: Array<{ label: string; at: string | null }> = [
    { label: "Solicitada", at: ride.created_at },
    { label: "Aceita", at: ride.accepted_at },
    { label: "Iniciada", at: ride.started_at },
    { label: "Finalizada", at: ride.completed_at },
    ...(ride.cancelled_at ? [{ label: "Cancelada", at: ride.cancelled_at }] : []),
  ];

  const rideValue = settlement?.passenger_charge ?? ride.final_price ?? ride.estimated_price;

  return (
    <div className="flex min-h-dvh min-w-0 flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="min-w-0 flex-1 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        <div className="container mx-auto min-w-0 max-w-xl space-y-4">
          <Link
            to="/motorista/corridas"
            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-words">Voltar ao histórico</span>
          </Link>

          <DSCard className="min-w-0">
            <DSCardContent className="min-w-0 space-y-4 p-4 max-[339px]:p-3">
              <div className="flex min-w-0 flex-wrap items-start gap-3">
                <Avatar
                  src={passenger?.avatar_url ?? null}
                  name={passenger?.name ?? "Passageiro"}
                  size={56}
                />
                <div className="min-w-0 flex-1 basis-[150px]">
                  <p className="break-words text-sm font-bold">{passenger?.name ?? "Passageiro"}</p>
                  <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">
                    {categoryLabel(ride.category)} · Corrida #{ride.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <span className="max-w-full shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-center text-[11px] font-semibold leading-4 text-primary">
                  {rideStatusLabel(ride.status)}
                </span>
              </div>

              <div className="min-w-0 space-y-2 rounded-lg border border-border bg-card/40 p-3 text-sm">
                <p className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words leading-5 [overflow-wrap:anywhere]">{ride.pickup_label || ride.origin_name || "Local de embarque"}</span>
                </p>
                <p className="flex min-w-0 items-start gap-2">
                  <Navigation2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words leading-5 [overflow-wrap:anywhere]">{ride.destination_name || "Destino da corrida"}</span>
                </p>
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-2 text-center sm:grid-cols-3 max-[339px]:grid-cols-1">
                <Mini
                  label="Distância"
                  value={
                    ride.distance_km != null ? `${Number(ride.distance_km).toFixed(1).replace(".", ",")} km` : "—"
                  }
                />
                <Mini
                  label="Tempo"
                  value={
                    ride.duration_min != null ? `${Math.round(Number(ride.duration_min))} min` : "—"
                  }
                />
                <Mini label="Valor da corrida" value={brl(rideValue)} highlight />
              </div>

              <div className="min-w-0">
                <h3 className="mb-2 break-words text-xs font-semibold uppercase text-muted-foreground">
                  Linha do tempo
                </h3>
                <ol className="min-w-0 space-y-2">
                  {timeline.map((item) => (
                    <li
                      key={item.label}
                      className="grid min-w-0 grid-cols-[14px_minmax(68px,auto)_minmax(0,1fr)] items-start gap-2 text-xs max-[339px]:grid-cols-[14px_minmax(0,1fr)]"
                    >
                      <Clock
                        aria-hidden="true"
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          item.at ? "text-primary" : "text-muted-foreground/40"
                        }`}
                      />
                      <span className="break-words text-muted-foreground">{item.label}</span>
                      <span
                        className={`${item.at ? "font-medium" : "text-muted-foreground/60"} min-w-0 break-words max-[339px]:col-start-2`}
                      >
                        {item.at ? new Date(item.at).toLocaleString("pt-BR") : "—"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <Info
                label="Pagamento"
                value={paymentMethodLabel(settlement?.payment_method ?? ride.payment_method)}
              />

              {ride.status === "finalizada" ? (
                <div className="min-w-0 rounded-lg border border-border bg-card/40 p-3 text-xs">
                  <p className="break-words text-[10px] uppercase text-muted-foreground">Situação financeira</p>
                  <p className="mt-1 break-words font-semibold leading-5">
                    {settlement
                      ? paymentStatusLabel(settlement.payment_status)
                      : "Dados financeiros ainda sendo consolidados"}
                  </p>
                  {settlement?.driver_earning != null ? (
                    <p className="mt-2 break-words text-muted-foreground">
                      Repasse do motorista:{" "}
                      <strong className="text-foreground">{brl(settlement.driver_earning)}</strong>
                    </p>
                  ) : (
                    <p className="mt-2 break-words leading-5 text-muted-foreground">
                      O valor recebido só aparece depois da confirmação financeira do backend.
                    </p>
                  )}
                </div>
              ) : null}

              {ride.cancellation_reason ? (
                <Info label="Motivo do cancelamento" value={ride.cancellation_reason} />
              ) : null}

              {ride.status === "finalizada" &&
              ride.driver_rated_at &&
              ride.driver_to_passenger_rating != null ? (
                <div className="min-w-0 space-y-2 rounded-lg border border-border bg-card/40 p-3">
                  <RatingLine
                    label="Sua avaliação do passageiro"
                    value={ride.driver_to_passenger_rating}
                    comment={ride.driver_to_passenger_comment}
                  />
                </div>
              ) : null}

              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <DSButton variant="outline" className="min-h-11 w-full min-w-0" onClick={() => setReceiptOpen(true)}>
                  <ReceiptIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="break-words">Ver recibo</span>
                </DSButton>
                {ride.status === "finalizada" ? (
                  <DSButton
                    variant="outline"
                    className="min-h-11 w-full min-w-0"
                    onClick={() =>
                      downloadRideReceipt({
                        ...ride,
                        driver_name: ride.driver_name,
                        driver_vehicle: driverVehicle,
                        passenger_name: passenger?.name ?? null,
                      })
                    }
                  >
                    <FileText className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="break-words">Baixar PDF</span>
                  </DSButton>
                ) : null}
              </div>
            </DSCardContent>
          </DSCard>
        </div>
      </main>

      <RideReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        receipt={{
          rideId: ride.id,
          date: ride.completed_at ?? ride.created_at,
          origin: ride.pickup_label || ride.origin_name,
          destination: ride.destination_name,
          driverName: ride.driver_name,
          passengerName: passenger?.name ?? null,
          vehicle: driverVehicle,
          paymentMethod: settlement?.payment_method ?? ride.payment_method,
          value: rideValue,
          status: ride.status,
          distanceKm: ride.distance_km,
          durationMin: ride.duration_min,
        }}
      />
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-lg border p-2 ${
        highlight ? "border-primary/40 bg-primary/10" : "border-border bg-background/40"
      }`}
    >
      <p className="break-words text-[10px] leading-4 text-muted-foreground">{label}</p>
      <p className={`break-words text-sm font-bold leading-5 ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card/40 p-2.5">
      <p className="break-words text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm leading-5 [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function RatingLine({
  label,
  value,
  comment,
}: {
  label: string;
  value: number;
  comment: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="break-words text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1" aria-label={`${label}: ${ratingLabel(value)} de 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 ${
              n <= value ? "fill-primary text-primary" : "text-muted-foreground/40"
            }`}
          />
        ))}
        <span className="ml-1 text-xs">{ratingLabel(value)}/5</span>
      </div>
      {comment ? <p className="mt-1 break-words text-xs italic leading-5 text-muted-foreground [overflow-wrap:anywhere]">“{comment}”</p> : null}
    </div>
  );
}