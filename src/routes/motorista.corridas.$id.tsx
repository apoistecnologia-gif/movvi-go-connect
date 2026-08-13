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
  passenger_rating: number | null;
  passenger_rating_comment: string | null;
  driver_rated_at: string | null;
  driver_name: string | null;
  driver_vehicle_model: string | null;
  driver_vehicle_color: string | null;
  driver_vehicle_plate: string | null;
  security_code: string | null;
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

function RideDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState<RideRow | null>(null);
  const [passenger, setPassenger] = useState<PassengerSummary | null>(null);
  const [settlement, setSettlement] = useState<SettlementRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth?.user) {
        if (active) await navigate({ to: "/motorista/login", replace: true });
        return;
      }

      // rides.driver_id referencia public.drivers.id, nunca auth.users.id.
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      if (profileError || !profile) {
        if (active) setLoading(false);
        return;
      }

      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (driverError || !driver) {
        if (active) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("id", id)
        .eq("driver_id", driver.id)
        .maybeSingle();

      if (!active) return;
      if (error || !data) {
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

      // Leitura financeira via RPC SECURITY DEFINER que valida o motorista
      // atribuído à corrida. Não dependemos de tipos locais atrasados nem
      // consultamos diretamente uma tabela financeira nova.
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <MovviHeader logoutRedirect="/" />
        <main className="flex-1 p-6 text-center text-sm text-muted-foreground">
          Corrida não encontrada.
          <div className="mt-4">
            <DSButton asChild>
              <Link to="/motorista/corridas">Voltar</Link>
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
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6">
        <div className="container mx-auto max-w-xl space-y-4">
          <Link
            to="/motorista/corridas"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>

          <DSCard>
            <DSCardContent className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Avatar
                  src={passenger?.avatar_url ?? null}
                  name={passenger?.name ?? "Passageiro"}
                  size={56}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{passenger?.name ?? "Passageiro"}</p>
                  <p className="text-xs text-muted-foreground">
                    {ride.category ?? "—"} · ID #{ride.id.slice(0, 8)}
                  </p>
                </div>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">
                  {ride.status}
                </span>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3 text-sm">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{ride.pickup_label || ride.origin_name}</span>
                </p>
                <p className="flex items-start gap-2">
                  <Navigation2 className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{ride.destination_name}</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini
                  label="Distância"
                  value={
                    ride.distance_km != null ? `${Number(ride.distance_km).toFixed(1)} km` : "—"
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

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Linha do tempo
                </h3>
                <ol className="space-y-2">
                  {timeline.map((item) => (
                    <li key={item.label} className="flex items-center gap-3 text-xs">
                      <Clock
                        className={`h-3.5 w-3.5 ${
                          item.at ? "text-primary" : "text-muted-foreground/40"
                        }`}
                      />
                      <span className="w-20 text-muted-foreground">{item.label}</span>
                      <span className={item.at ? "font-medium" : "text-muted-foreground/60"}>
                        {item.at ? new Date(item.at).toLocaleString("pt-BR") : "—"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Info
                  label="Pagamento"
                  value={settlement?.payment_method ?? ride.payment_method ?? "—"}
                />
                <Info label="PIN segurança" value={ride.security_code ?? "—"} />
              </div>

              {ride.status === "finalizada" ? (
                <div className="rounded-lg border border-border bg-card/40 p-3 text-xs">
                  <p className="text-[10px] uppercase text-muted-foreground">Situação financeira</p>
                  <p className="mt-1 font-semibold">
                    {settlement
                      ? paymentStatusLabel(settlement.payment_status)
                      : "Settlement ainda indisponível"}
                  </p>
                  {settlement?.driver_earning != null ? (
                    <p className="mt-2 text-muted-foreground">
                      Repasse do motorista:{" "}
                      <strong className="text-foreground">{brl(settlement.driver_earning)}</strong>
                    </p>
                  ) : (
                    <p className="mt-2 leading-5 text-muted-foreground">
                      O app não presume ganho ou pagamento confirmado antes de o backend consolidar o settlement.
                    </p>
                  )}
                </div>
              ) : null}

              {ride.cancellation_reason ? (
                <Info label="Motivo do cancelamento" value={ride.cancellation_reason} />
              ) : null}

              {ride.status === "finalizada" &&
              ride.driver_rated_at &&
              ride.passenger_rating != null ? (
                <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
                  <RatingLine
                    label="Sua avaliação do passageiro"
                    value={ride.passenger_rating}
                    comment={ride.passenger_rating_comment}
                  />
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <DSButton variant="outline" className="w-full" onClick={() => setReceiptOpen(true)}>
                  <ReceiptIcon className="mr-2 h-4 w-4" /> Ver recibo
                </DSButton>
                {ride.status === "finalizada" ? (
                  <DSButton
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      downloadRideReceipt({
                        ...ride,
                        driver_name: ride.driver_name,
                        driver_vehicle: driverVehicle,
                        passenger_name: passenger?.name ?? null,
                      })
                    }
                  >
                    <FileText className="mr-2 h-4 w-4" /> Baixar PDF
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
      className={`rounded-lg border p-2 ${
        highlight ? "border-primary/40 bg-primary/10" : "border-border bg-background/40"
      }`}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono text-sm">{value}</p>
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
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`h-3.5 w-3.5 ${
              n <= value ? "fill-primary text-primary" : "text-muted-foreground/40"
            }`}
          />
        ))}
        <span className="ml-1 text-xs">{value}/5</span>
      </div>
      {comment ? <p className="mt-1 text-xs italic text-muted-foreground">“{comment}”</p> : null}
    </div>
  );
}
