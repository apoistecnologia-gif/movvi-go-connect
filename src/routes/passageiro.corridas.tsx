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
import { DSButton, DSTextarea } from "@/design-system";

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
  accepted_at: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_photo_url: string | null;
  driver_vehicle: string | null;
  driver_rating: number | null;
  driver_rating_comment: string | null;
  passenger_rated_at: string | null;
  category: string | null;
  payment_method: string | null;
  safety_code: string | null;
  scheduled_for: string | null;
};

function rideToReceipt(r: RideRow): ReceiptData {
  return {
    rideId: r.id,
    date: r.completed_at ?? r.created_at,
    origin: r.origin_name,
    destination: r.destination_name,
    driverName: r.driver_name,
    vehicle: r.driver_vehicle,
    paymentMethod: r.payment_method,
    value: r.final_price ?? r.estimated_price,
    status: r.status,
    distanceKm: r.distance_km,
    durationMin: r.duration_min,
  };
}

type FilterKey = "hoje" | "semana" | "mes" | "todas";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "todas", label: "Todas" },
];

function StarRow({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5" aria-label={`Avaliação: ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${cls} ${n <= value ? "fill-[#76C139] text-[#76C139]" : "text-[#707070]/40"}`}
        />
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "finalizada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#76C139]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#4d8823]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#76C139]" />
        Concluída
      </span>
    );
  }
  if (status.startsWith("cancelada")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#707070]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#707070]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#707070]" />
        Cancelada
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-semibold text-[#111418]">
      {status}
    </span>
  );
}

// Legacy alias kept for RideDetailSheet compatibility.
function statusBadge(s: string) {
  return <StatusPill status={s} />;
}

function formatDatePart(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

function categoryLabel(c?: string | null) {
  if (!c) return null;
  const map: Record<string, string> = {
    carros: "Carro",
    moto: "Moto",
    pet: "Pet",
    entrega: "Entrega",
    executivo: "Executivo",
  };
  return map[c.toLowerCase()] ?? c;
}

function RideCard({
  ride,
  onOpen,
  onReceipt,
}: {
  ride: RideRow;
  onOpen: () => void;
  onReceipt: () => void;
}) {
  const price = ride.final_price ?? ride.estimated_price;
  const iso = ride.completed_at ?? ride.created_at;
  const { date, time } = formatDatePart(iso);
  const cat = categoryLabel(ride.category);

  return (
    <article
      data-testid="ride-card"
      className="group rounded-[24px] bg-white p-4 ring-1 ring-black/5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)] transition duration-200 hover:ring-[#76C139]/25 hover:shadow-[0_16px_36px_-20px_rgba(118,193,57,0.28)] animate-in fade-in slide-in-from-bottom-1"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] text-[#707070]">
              <span className="font-medium text-[#111418]">{date}</span>
              <span className="text-[#707070]/40">•</span>
              <span>{time}</span>
            </div>
            {ride.driver_name && (
              <p className="mt-1 truncate text-[18px] font-bold text-[#111418]">
                {ride.driver_name}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <StatusPill status={ride.status} />
              {cat && (
                <span className="rounded-full bg-[#F7F9F7] px-2 py-0.5 text-[11px] font-medium text-[#707070]">
                  {cat}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[22px] font-bold leading-none tracking-tight text-[#111418]">
              {price !== null ? `R$ ${Number(price).toFixed(2)}` : "—"}
            </p>
          </div>
        </header>

        <div className="mt-3.5 space-y-2 rounded-[16px] bg-[#F7F9F7] px-3 py-2.5 text-[13px]">
          <div className="flex items-start gap-2.5">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#76C139] ring-4 ring-[#76C139]/15" />
            <span className="truncate text-[#111418]">{ride.origin_name}</span>
          </div>
          <div className="ml-[3px] h-3 w-px border-l border-dashed border-[#707070]/30" />
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c53030]" strokeWidth={2.4} />
            <span className="truncate text-[#111418]">{ride.destination_name}</span>
          </div>
        </div>
      </button>

      {ride.status === "finalizada" && ride.passenger_rated_at && ride.driver_rating && (
        <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5">
          <div className="flex items-center gap-1.5">
            <StarRow value={ride.driver_rating} />
            <span className="text-[11px] text-[#707070]">Sua avaliação</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReceipt();
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[#111418] transition hover:bg-[#F7F9F7]"
          >
            <ReceiptIcon className="h-3.5 w-3.5" />
            Recibo
          </button>
        </div>
      )}
      {ride.status === "finalizada" && !ride.passenger_rated_at && (
        <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2.5">
          <button
            type="button"
            onClick={onOpen}
            className="text-[12px] font-semibold text-[#76C139]"
          >
            Avaliar motorista →
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReceipt();
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[#111418] transition hover:bg-[#F7F9F7]"
          >
            <ReceiptIcon className="h-3.5 w-3.5" />
            Recibo
          </button>
        </div>
      )}
      {ride.status.startsWith("cancelada") && (
        <div className="mt-3 flex justify-end border-t border-black/5 pt-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReceipt();
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[#111418] transition hover:bg-[#F7F9F7]"
          >
            <ReceiptIcon className="h-3.5 w-3.5" />
            Recibo
          </button>
        </div>
      )}
    </article>
  );
}


function RideDetailSheet({
  ride,
  onClose,
  onChange,
  onViewReceipt,
}: {
  ride: RideRow | null;
  onClose: () => void;
  onChange: () => void;
  onViewReceipt: (r: RideRow) => void;
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
              <DSTextarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte como foi (opcional)"
                rows={3}
                maxLength={500}
              />
              <DSButton type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar avaliação
              </DSButton>
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

          {/* Payment + PIN */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
                <CreditCard className="h-3 w-3" /> Pagamento
              </p>
              <p className="mt-1 font-medium">{ride.payment_method ?? "Não informado"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">PIN segurança</p>
              <p className="mt-1 font-mono font-medium">{ride.safety_code ?? "Não informado"}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Linha do tempo
            </p>
            <ol className="space-y-1.5 text-xs">
              {[
                { label: "Solicitada", at: ride.created_at },
                { label: "Aceita", at: ride.accepted_at },
                { label: "Iniciada", at: ride.started_at },
                { label: "Finalizada", at: ride.completed_at },
                ...(ride.cancelled_at ? [{ label: "Cancelada", at: ride.cancelled_at }] : []),
              ].map((t) => (
                <li key={t.label} className="flex items-center gap-2">
                  <Clock className={`h-3 w-3 ${t.at ? "text-primary" : "text-muted-foreground/40"}`} />
                  <span className="w-20 text-muted-foreground">{t.label}</span>
                  <span className={t.at ? "font-medium" : "text-muted-foreground/50"}>
                    {t.at ? new Date(t.at).toLocaleString("pt-BR") : "—"}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <DSButton variant="outline" size="sm" onClick={repeatRide}>
              <Repeat className="mr-1 h-3.5 w-3.5" /> Repetir
            </DSButton>
            <DSButton size="sm" onClick={() => onViewReceipt(ride)}>
              <ReceiptIcon className="mr-1 h-3.5 w-3.5" /> Recibo
            </DSButton>
            {ride.driver_id && (
              <DSButton
                variant={isFavorite ? "default" : "outline"}
                size="sm"
                onClick={toggleFavorite}
                disabled={favBusy}
              >
                <Heart className={`mr-1 h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`} />
                {isFavorite ? "Favorito" : "Favoritar"}
              </DSButton>
            )}
            {ride.driver_id && (
              <DSButton variant="outline" size="sm" onClick={() => setReportOpen((v) => !v)}>
                <Flag className="mr-1 h-3.5 w-3.5" /> Reportar
              </DSButton>
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
              <DSTextarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Detalhes (opcional)"
                rows={3}
                maxLength={1000}
              />
              <DSButton type="submit" variant="destructive" className="w-full" disabled={reportBusy}>
                {reportBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar relato
              </DSButton>
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
  const [receiptRide, setReceiptRide] = useState<RideRow | null>(null);

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
        "id,status,origin_name,destination_name,origin_lat,origin_lng,destination_lat,destination_lng,final_price,estimated_price,distance_km,duration_min,completed_at,created_at,accepted_at,started_at,cancelled_at,driver_id,driver_name,driver_photo_url,driver_vehicle,driver_rating,driver_rating_comment,passenger_rated_at,category,payment_method,safety_code,scheduled_for",
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

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000; // últimos 7 dias
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const filtered = useMemo(() => {
    if (!rides) return null;
    if (filter === "todas") return rides;
    const threshold =
      filter === "hoje" ? startOfToday : filter === "semana" ? startOfWeek : startOfMonth;
    return rides.filter((r) => {
      const iso = r.completed_at ?? r.created_at;
      return new Date(iso).getTime() >= threshold;
    });
  }, [rides, filter, startOfToday, startOfWeek, startOfMonth]);

  const stats = useMemo(() => {
    if (!rides) return { today: 0, month: 0, total: 0 };
    let today = 0;
    let month = 0;
    for (const r of rides) {
      if (r.status !== "finalizada") continue;
      const t = new Date(r.completed_at ?? r.created_at).getTime();
      if (t >= startOfToday) today++;
      if (t >= startOfMonth) month++;
    }
    const total = rides.filter((r) => r.status === "finalizada").length;
    return { today, month, total };
  }, [rides, startOfToday, startOfMonth]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F9F7]">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="container mx-auto max-w-xl">
          {/* Header */}
          <header className="mb-5 animate-in fade-in slide-in-from-top-1 duration-300">
            <h1 className="text-[28px] font-bold tracking-tight text-[#111418]">
              Histórico de viagens
            </h1>
            <p className="mt-1 text-[13px] text-[#707070]">
              Revise todas as suas corridas concluídas.
            </p>
          </header>

          {/* Summary cards */}
          <section
            aria-label="Resumo"
            className="mb-5 grid grid-cols-3 gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            {[
              { label: "Hoje", value: stats.today },
              { label: "Este mês", value: stats.month },
              { label: "Total", value: stats.total },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-[20px] bg-white p-3.5 ring-1 ring-black/5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#707070]">
                  {s.label}
                </p>
                <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-[#111418]">
                  {rides === null ? "—" : s.value}
                </p>
              </div>
            ))}
          </section>

          {/* Filter pills */}
          <div className="mb-4 -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 animate-in fade-in slide-in-from-left-2 duration-300">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition duration-200 active:scale-95 ${
                    active
                      ? "bg-[#111418] text-white shadow-[0_10px_24px_-14px_rgba(17,20,24,0.5)]"
                      : "bg-white text-[#707070] ring-1 ring-black/5 hover:text-[#111418]"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {error && (
            <p className="rounded-2xl bg-destructive/10 p-3 text-[13px] text-destructive ring-1 ring-destructive/30">
              {error}
            </p>
          )}

          {filtered === null && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[140px] animate-pulse rounded-[24px] bg-white ring-1 ring-black/5"
                />
              ))}
            </div>
          )}

          {filtered && filtered.length === 0 && (
            <div className="rounded-[24px] bg-white p-8 text-center ring-1 ring-black/5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)] animate-in fade-in duration-300">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#76C139]/12">
                <ClipboardList className="h-7 w-7 text-[#76C139]" strokeWidth={1.75} />
              </div>
              <h2 className="text-[18px] font-bold text-[#111418]">Nenhuma viagem ainda</h2>
              <p className="mt-1 text-[13px] text-[#707070]">
                Suas corridas concluídas aparecerão aqui.
              </p>
            </div>
          )}

          {filtered && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((r) => (
                <RideCard
                  key={r.id}
                  ride={r}
                  onOpen={() => setSelected(r)}
                  onReceipt={() => setReceiptRide(r)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
      <RideDetailSheet
        ride={selected}
        onClose={() => setSelected(null)}
        onChange={() => {
          void load();
          setSelected(null);
        }}
        onViewReceipt={(r) => setReceiptRide(r)}
      />
      <RideReceiptDialog
        open={!!receiptRide}
        onOpenChange={(o) => !o && setReceiptRide(null)}
        receipt={receiptRide ? rideToReceipt(receiptRide) : null}
      />
    </div>
  );
}


export const Route = createFileRoute("/passageiro/corridas")({
  head: () => ({ meta: [{ title: "Minhas Corridas — MOVVI DRIVE" }] }),
  component: PassengerRidesPage,
});
