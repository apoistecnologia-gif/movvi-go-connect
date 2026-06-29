import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, FileText, Loader2, MapPin, Navigation2, Star, User as UserIcon } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { downloadRideReceipt } from "@/lib/driverReceipt";

export const Route = createFileRoute("/motorista/corridas/$id")({
  head: () => ({ meta: [{ title: "Detalhes da corrida — MOVVI DRIVE" }] }),
  component: RideDetailsPage,
});

type RideRow = {
  id: string; status: string; category: string | null;
  origin_name: string; destination_name: string;
  pickup_label?: string | null; pickup_short_label?: string | null;
  distance_km: number | null; duration_min: number | null;
  estimated_price: number | null; final_price: number | null;
  payment_method: string | null;
  created_at: string; accepted_at: string | null; started_at: string | null;
  completed_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  passenger_id: string | null;
  passenger_photo_url: string | null;
  passenger_rating: number | null; passenger_rating_comment: string | null;
  driver_rating: number | null; driver_rating_comment: string | null;
  driver_name: string | null; driver_vehicle: string | null;
  safety_code: string | null;
};

function brl(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function RideDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState<RideRow | null>(null);
  const [passengerName, setPassengerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.auth.getUser();
      if (!a?.user) { navigate({ to: "/motorista/login" }); return; }
      const { data, error } = await supabase
        .from("rides").select("*").eq("id", id).eq("driver_id", a.user.id).maybeSingle();
      if (error || !data) { setLoading(false); return; }
      setRide(data as RideRow);
      if (data.passenger_id) {
        const { data: pas } = await supabase.from("users").select("name").eq("auth_user_id", data.passenger_id).maybeSingle();
        setPassengerName(pas?.name ?? null);
      }
      setLoading(false);
    })();
  }, [id, navigate]);

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
          <div className="mt-4"><Button asChild><Link to="/motorista/corridas">Voltar</Link></Button></div>
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6">
        <div className="container mx-auto max-w-xl space-y-4">
          <Link to="/motorista/corridas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <Avatar src={ride.passenger_photo_url} name={passengerName ?? "Passageiro"} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{passengerName ?? "Passageiro"}</p>
                  <p className="text-xs text-muted-foreground">
                    {ride.category ?? "—"} · ID #{ride.id.slice(0, 8)}
                  </p>
                </div>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">
                  {ride.status}
                </span>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3 text-sm">
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-primary" /><span>{ride.origin_name}</span></p>
                <p className="flex items-start gap-2"><Navigation2 className="mt-0.5 h-4 w-4 text-primary" /><span>{ride.destination_name}</span></p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini label="Distância" value={ride.distance_km != null ? `${Number(ride.distance_km).toFixed(1)} km` : "—"} />
                <Mini label="Tempo" value={ride.duration_min != null ? `${Math.round(Number(ride.duration_min))} min` : "—"} />
                <Mini label="Valor" value={brl(ride.final_price ?? ride.estimated_price)} highlight />
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Linha do tempo</h3>
                <ol className="space-y-2">
                  {timeline.map((t) => (
                    <li key={t.label} className="flex items-center gap-3 text-xs">
                      <Clock className={`h-3.5 w-3.5 ${t.at ? "text-primary" : "text-muted-foreground/40"}`} />
                      <span className="w-20 text-muted-foreground">{t.label}</span>
                      <span className={t.at ? "font-medium" : "text-muted-foreground/60"}>
                        {t.at ? new Date(t.at).toLocaleString("pt-BR") : "—"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Info label="Pagamento" value={ride.payment_method ?? "—"} />
                <Info label="PIN segurança" value={ride.safety_code ?? "—"} />
              </div>

              {(ride.driver_rating != null || ride.passenger_rating != null) && (
                <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
                  {ride.driver_rating != null && (
                    <RatingLine label="Você foi avaliado" value={ride.driver_rating} comment={ride.driver_rating_comment} />
                  )}
                  {ride.passenger_rating != null && (
                    <RatingLine label="Você avaliou o passageiro" value={ride.passenger_rating} comment={ride.passenger_rating_comment} />
                  )}
                </div>
              )}

              {ride.status === "finalizada" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    downloadRideReceipt({
                      ...ride,
                      driver_name: ride.driver_name,
                      driver_vehicle: ride.driver_vehicle,
                      passenger_name: passengerName,
                    })
                  }
                >
                  <FileText className="mr-2 h-4 w-4" /> Baixar recibo PDF
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-background/40"}`}>
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
function RatingLine({ label, value, comment }: { label: string; value: number; comment: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
        ))}
        <span className="ml-1 text-xs">{value}/5</span>
      </div>
      {comment && <p className="mt-1 text-xs italic text-muted-foreground">"{comment}"</p>}
    </div>
  );
}
