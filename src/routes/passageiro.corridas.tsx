import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ClipboardList,
  Star,
  MapPin,
  Navigation2,
  Heart,
  Flag,
  Repeat,
  Loader2,
  X,
  Filter,
  Receipt as ReceiptIcon,
  Clock,
  CreditCard,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { avaliarMotorista } from "@/lib/rideLifecycle";
import { RideReceiptDialog } from "@/components/rides/RideReceiptDialog";
import type { ReceiptData } from "@/lib/rideReceipt";

type RideRow = {
  id: string;
  status: string;
  origin_name: string;
  destination_name: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  final_price: number | null;
  estimated_price: number | null;
  distance_km: number | null;
  duration_min: number | null;
  completed_at: string | null;
  created_at: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_photo_url: string | null;
  driver_rating: number | null;
  driver_rating_comment: string | null;
  passenger_rated_at: string | null;
  category: string | null;
};

type FilterKey = "todas" | "finalizada" | "cancelada";

function StarRow({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5" aria-label={`Avaliação: ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${cls} ${n <= value ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
        />
      ))}
    </div>
  );
}

function statusBadge(s: string) {
  if (s === "finalizada")
    return <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Finalizada</span>;
  if (s.startsWith("cancelada"))
    return <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">Cancelada</span>;
  return <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-[10px] font-semibold">{s}</span>;
}

function RideCard({ ride, onOpen }: { ride: RideRow; onOpen: () => void }) {
  const price = ride.final_price ?? ride.estimated_price;
  const date = ride.completed_at ?? ride.created_at;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="ride-card"
      className="w-full rounded-2xl border border-border bg-card p-4 text-left text-sm transition hover:border-primary/40 hover:bg-card/70"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {new Date(date).toLocaleString("pt-BR")}
          </p>
          {ride.driver_name && (
            <p className="truncate font-medium">{ride.driver_name}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {statusBadge(ride.status)}
          {price !== null && (
            <p className="text-base font-bold text-primary">R$ {Number(price).toFixed(2)}</p>
          )}
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

      {ride.status === "finalizada" && ride.passenger_rated_at && ride.driver_rating && (
        <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2">
          <StarRow value={ride.driver_rating} />
          <span className="text-xs text-muted-foreground">Sua avaliação</span>
        </div>
      )}
      {ride.status === "finalizada" && !ride.passenger_rated_at && (
        <p className="mt-3 border-t border-border/60 pt-2 text-xs font-medium text-primary">
          Avaliar motorista →
        </p>
      )}
    </button>
  );
}

function RideDetailSheet({
  ride,
  onClose,
  onChange,
}: {
  ride: RideRow | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const navigate = useNavigate();
  const callRate = useServerFn(avaliarMotorista);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  // Report form
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    setStars(5);
    setComment("");
    setReportOpen(false);
    setReportReason("");
    setReportDetails("");
    setIsFavorite(false);
    if (!ride?.driver_id) return;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("favorite_drivers")
        .select("id")
        .eq("passenger_id", uid)
        .eq("driver_id", ride.driver_id!)
        .maybeSingle();
      setIsFavorite(!!data);
    })();
  }, [ride]);

  if (!ride) return null;

  const price = ride.final_price ?? ride.estimated_price;

  async function submitRating(e: FormEvent) {
    e.preventDefault();
    if (!ride) return;
    setSaving(true);
    try {
      await callRate({ data: { rideId: ride.id, stars, comment: comment.trim() || undefined } });
      toast.success("Avaliação enviada. Obrigado!");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao avaliar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorite() {
    if (!ride?.driver_id) return;
    setFavBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      if (isFavorite) {
        await supabase
          .from("favorite_drivers")
          .delete()
          .eq("passenger_id", uid)
          .eq("driver_id", ride.driver_id);
        setIsFavorite(false);
        toast.success("Motorista removido dos favoritos");
      } else {
        const { error } = await supabase
          .from("favorite_drivers")
          .insert({ passenger_id: uid, driver_id: ride.driver_id });
        if (error) throw error;
        setIsFavorite(true);
        toast.success("Motorista adicionado aos favoritos");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha.");
    } finally {
      setFavBusy(false);
    }
  }

  async function submitReport(e: FormEvent) {
    e.preventDefault();
    if (!ride?.driver_id) return;
    if (!reportReason.trim()) {
      toast.error("Informe o motivo do relato.");
      return;
    }
    setReportBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { error } = await supabase.from("driver_reports").insert({
        passenger_id: uid,
        driver_id: ride.driver_id,
        ride_id: ride.id,
        reason: reportReason.trim(),
        details: reportDetails.trim() || null,
      });
      if (error) throw error;
      toast.success("Relato enviado. Obrigado por reportar.");
      setReportOpen(false);
      setReportReason("");
      setReportDetails("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reportar.");
    } finally {
      setReportBusy(false);
    }
  }

  function repeatRide() {
    if (!ride) return;
    sessionStorage.setItem(
      "movvi:repeat_ride",
      JSON.stringify({
        origin: {
          name: ride.origin_name,
          lat: ride.origin_lat,
          lng: ride.origin_lng,
        },
        destination: {
          name: ride.destination_name,
          lat: ride.destination_lat,
          lng: ride.destination_lng,
        },
      }),
    );
    void navigate({ to: "/passageiro/app" });
  }

  const canRate = ride.status === "finalizada" && !ride.passenger_rated_at;

  return (
    <Sheet open={!!ride} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto bg-background">
        <SheetHeader className="text-left">
          <SheetTitle>Detalhes da corrida</SheetTitle>
          <SheetDescription className="text-xs">
            {new Date(ride.completed_at ?? ride.created_at).toLocaleString("pt-BR")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Driver */}
          {ride.driver_name && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <Avatar src={ride.driver_photo_url} name={ride.driver_name} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{ride.driver_name}</p>
                {ride.category && (
                  <p className="text-xs text-muted-foreground">{ride.category}</p>
                )}
              </div>
              {statusBadge(ride.status)}
            </div>
          )}

          {/* Route */}
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{ride.origin_name}</span>
            </p>
            <p className="flex items-start gap-2">
              <Navigation2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{ride.destination_name}</span>
            </p>
          </div>

          {/* Fare */}
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-4 text-center text-xs">
            <div>
              <p className="text-muted-foreground">Distância</p>
              <p className="text-sm font-semibold">
                {ride.distance_km ? `${ride.distance_km.toFixed(1)} km` : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Duração</p>
              <p className="text-sm font-semibold">
                {ride.duration_min ? `${Math.round(ride.duration_min)} min` : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="text-sm font-bold text-primary">
                {price !== null ? `R$ ${Number(price).toFixed(2)}` : "—"}
              </p>
            </div>
          </div>

          {/* Rate */}
          {canRate && (
            <form onSubmit={submitRating} className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Avalie seu motorista</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-label={`${n} estrelas`}
                  >
                    <Star
                      className={`h-8 w-8 ${n <= stars ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte como foi (opcional)"
                rows={3}
                maxLength={500}
              />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar avaliação
              </Button>
            </form>
          )}

          {/* Existing rating */}
          {ride.status === "finalizada" && ride.passenger_rated_at && ride.driver_rating && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Sua avaliação</p>
              <StarRow value={ride.driver_rating} size="md" />
              {ride.driver_rating_comment && (
                <p className="text-xs italic text-muted-foreground">
                  “{ride.driver_rating_comment}”
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={repeatRide}>
              <Repeat className="mr-1 h-3.5 w-3.5" /> Repetir
            </Button>
            {ride.driver_id && (
              <Button
                variant={isFavorite ? "default" : "outline"}
                size="sm"
                onClick={toggleFavorite}
                disabled={favBusy}
              >
                <Heart className={`mr-1 h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} />
                {isFavorite ? "Favorito" : "Favoritar"}
              </Button>
            )}
            {ride.driver_id && (
              <Button variant="outline" size="sm" onClick={() => setReportOpen((v) => !v)}>
                <Flag className="mr-1 h-3.5 w-3.5" /> Reportar
              </Button>
            )}
          </div>

          {/* Report form */}
          {reportOpen && ride.driver_id && (
            <form
              onSubmit={submitReport}
              className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Reportar motorista</p>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="rounded-full p-1 hover:bg-background"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Motivo (obrigatório)"
                maxLength={120}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <Textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Detalhes (opcional)"
                rows={3}
                maxLength={1000}
              />
              <Button type="submit" variant="destructive" className="w-full" disabled={reportBusy}>
                {reportBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar relato
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PassengerRidesPage() {
  const [rides, setRides] = useState<RideRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("todas");
  const [selected, setSelected] = useState<RideRow | null>(null);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      setRides([]);
      return;
    }
    const { data, error } = await supabase
      .from("rides")
      .select(
        "id,status,origin_name,destination_name,origin_lat,origin_lng,destination_lat,destination_lng,final_price,estimated_price,distance_km,duration_min,completed_at,created_at,driver_id,driver_name,driver_photo_url,driver_rating,driver_rating_comment,passenger_rated_at,category",
      )
      .eq("passenger_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setError(error.message);
    else setRides((data ?? []) as RideRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!rides) return null;
    if (filter === "todas") return rides;
    if (filter === "finalizada") return rides.filter((r) => r.status === "finalizada");
    return rides.filter((r) => r.status.startsWith("cancelada"));
  }, [rides, filter]);

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
                Histórico das suas viagens com a MOVVI.
              </p>
            </div>
          </header>

          <div className="mb-4 flex items-center gap-2 overflow-x-auto">
            <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {(["todas", "finalizada", "cancelada"] as FilterKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === k
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "todas" ? "Todas" : k === "finalizada" ? "Finalizadas" : "Canceladas"}
              </button>
            ))}
          </div>

          {error && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </p>
          )}

          {filtered === null && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}

          {filtered && filtered.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
              Nenhuma corrida encontrada neste filtro.
            </p>
          )}

          {filtered && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((r) => (
                <RideCard key={r.id} ride={r} onOpen={() => setSelected(r)} />
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomNav items={PASSENGER_NAV} />
      <RideDetailSheet
        ride={selected}
        onClose={() => setSelected(null)}
        onChange={() => {
          void load();
          setSelected(null);
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/passageiro/corridas")({
  head: () => ({ meta: [{ title: "Minhas Corridas — MOVVI DRIVE" }] }),
  component: PassengerRidesPage,
});
