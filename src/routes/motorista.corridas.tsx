import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, ClipboardList, MapPin, Navigation2, Star } from "lucide-react";
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

function StarRow({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Avaliação: ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
        />
      ))}
    </div>
  );
}

function RideCard({ ride }: { ride: RideRow }) {
  const price = ride.final_price ?? ride.estimated_price;
  const date = ride.completed_at ?? ride.created_at;
  return (
    <Link
      to="/motorista/corridas/$id"
      params={{ id: ride.id }}
      data-testid="ride-card"
      className="block rounded-2xl border border-border bg-card p-4 text-sm transition hover:border-primary/40 active:scale-[0.99]"
    >
      <header className="mb-3 flex items-start gap-3">
        <Avatar src={ride.passenger_photo_url} name="Passageiro" size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {new Date(date).toLocaleString("pt-BR")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {ride.category ?? "—"}
            {ride.distance_km != null ? ` · ${Number(ride.distance_km).toFixed(1)} km` : ""}
            {ride.duration_min != null ? ` · ${Math.round(Number(ride.duration_min))} min` : ""}
            {ride.payment_method ? ` · ${ride.payment_method}` : ""}
          </p>
        </div>
        <div className="text-right">
          {price !== null && (
            <p className="text-base font-bold text-primary">R$ {Number(price).toFixed(2)}</p>
          )}
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </div>
      </header>

      <div className="space-y-1.5 text-xs">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 text-primary" />
          <span className="truncate">{ride.origin_name}</span>
        </p>
        <p className="flex items-start gap-2">
          <Navigation2 className="mt-0.5 h-3.5 w-3.5 text-primary" />
          <span className="truncate">{ride.destination_name}</span>
        </p>
      </div>

      {ride.status === "finalizada" && ride.driver_rated_at && ride.passenger_rating && (
        <div
          data-testid="rating-info"
          className="mt-3 rounded-xl border border-border/60 bg-background/40 p-3"
        >
          <p className="mb-1 text-xs font-medium text-foreground">Você avaliou o passageiro</p>
          <div className="flex items-center gap-2">
            <StarRow value={ride.passenger_rating} />
            <span className="text-xs text-muted-foreground">{ride.passenger_rating}/5</span>
          </div>
          {ride.passenger_rating_comment && (
            <p className="mt-1.5 text-xs italic text-muted-foreground">
              "{ride.passenger_rating_comment}"
            </p>
          )}
        </div>
      )}
    </Link>
  );
}

function DriverRidesPage() {
  const [rides, setRides] = useState<RideRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-24">
        <div className="container mx-auto max-w-xl">
          <header className="mb-5 flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">Minhas corridas</h1>
              <p className="text-xs text-muted-foreground">
                Histórico de viagens realizadas com a MOVVI.
              </p>
            </div>
          </header>

          {error && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </p>
          )}

          {rides === null && (
            <div className="space-y-3" aria-busy="true" aria-label="Carregando corridas">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted/50" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted/50" />
                      <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted/40" />
                    </div>
                    <div className="h-4 w-16 animate-pulse rounded bg-muted/50" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-5/6 animate-pulse rounded bg-muted/40" />
                    <div className="h-3 w-4/6 animate-pulse rounded bg-muted/40" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {rides && rides.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-12 text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <ClipboardList className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">Nenhuma corrida ainda</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Fique online no MOVVI DRIVE para começar a receber solicitações na sua região.
              </p>
            </div>
          )}

          {rides && rides.length > 0 && (
            <div className="space-y-3">
              {rides.map((r) => (
                <RideCard key={r.id} ride={r} />
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
