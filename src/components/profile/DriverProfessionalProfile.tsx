/**
 * APOIS — Driver Professional Profile.
 * Read-only presentational card. Shows only public trust info.
 * Never render sensitive data (CPF, CNH, documents, phone, email).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Star,
  Car,
  MapPin,
  ShieldCheck,
  CalendarDays,
  BadgeCheck,
  Sparkles,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { RatingBadge, RatingSummary } from "@/components/rating/RatingBadge";
import { cn } from "@/lib/utils";
import {
  AMENITY_META,
  DEFAULT_AMENITIES,
  enabledAmenities,
  fetchDriverAmenitiesPublic,
  type DriverAmenities,
} from "@/lib/driverAmenities";

export type DriverPublicProfile = {
  user_id: string;
  name: string | null;
  photo_url: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  vehicle_year: number | null;
  average_rating: number | null;
  total_ratings: number | null;
  completed_rides: number | null;
  approval_status: string | null;
  is_online: boolean | null;
  member_since: string | null;
};

const FALLBACK = "Não informado";
const DRIVER_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60;

function safeText(value: unknown, max = 120): string {
  if (typeof value !== "string" && typeof value !== "number") return FALLBACK;
  const text = String(value).replace(/\s+/g, " ").trim().slice(0, max);
  return text || FALLBACK;
}

function safeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function safeRating(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(5, Math.max(0, parsed));
}

function safeVehicleYear(value: unknown): number | null {
  const parsed = Number(value);
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > maxYear) return null;
  return parsed;
}

function formatMemberSince(iso: string | null | undefined): string {
  const raw = iso?.trim();
  if (!raw) return FALLBACK;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return FALLBACK;
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function isSafeRemotePhoto(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function signDriverPhotoPath(path: string | null): Promise<string | null> {
  const normalized = path?.trim();
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return isSafeRemotePhoto(normalized) ? normalized : null;
  const signed = await supabase.storage
    .from("profile-photos")
    .createSignedUrl(normalized, DRIVER_PHOTO_SIGNED_URL_TTL_SECONDS);
  const signedUrl = signed.data?.signedUrl?.trim();
  if (signed.error || !signedUrl || !isSafeRemotePhoto(signedUrl)) return null;
  return signedUrl;
}

function ApprovalPill({ status }: { status: string | null }) {
  const normalized = String(status ?? "").trim().toLowerCase();
  const ok = ["aprovado", "approved", "ativo", "ativa", "active"].includes(normalized);
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold leading-4 ring-1",
        ok
          ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40"
          : "bg-muted text-muted-foreground ring-border",
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {ok ? "Motorista verificado" : "Cadastro em análise"}
    </span>
  );
}

export function DriverProfessionalProfile({
  profile,
  loading,
}: {
  profile: DriverPublicProfile | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-1 motion-reduce:animate-none" role="status" aria-live="polite" aria-label="Carregando perfil do motorista">
        <div className="mx-auto h-24 w-24 rounded-full bg-muted/40" />
        <div className="mx-auto h-4 w-40 rounded bg-muted/40" />
        <div className="h-24 rounded-2xl bg-muted/30" />
        <div className="h-24 rounded-2xl bg-muted/30" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-2xl bg-muted/30 p-5 text-center ring-1 ring-border/60" role="status">
        <p className="text-[14px] font-semibold text-foreground">Perfil indisponível</p>
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">Não foi possível exibir os dados públicos deste motorista agora.</p>
      </div>
    );
  }

  const avg = safeRating(profile.average_rating);
  const totalRatings = safeCount(profile.total_ratings);
  const completedRides = safeCount(profile.completed_rides);
  const vehicleYear = safeVehicleYear(profile.vehicle_year);
  const driverName = safeText(profile.name, 80);
  const vehicleModel = safeText(profile.vehicle_model, 80);
  const vehicleColor = safeText(profile.vehicle_color, 40);
  const category = safeText(profile.category, 40);
  const city = safeText(profile.city, 60);
  const state = safeText(profile.state, 30);
  const plateRaw = safeText(profile.vehicle_plate, 12);
  const plate = plateRaw === FALLBACK ? FALLBACK : plateRaw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8) || FALLBACK;
  const location = city === FALLBACK ? FALLBACK : state === FALLBACK ? city : `${city} · ${state}`;

  return (
    <div className="min-w-0 space-y-5 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <div className="flex min-w-0 flex-col items-center text-center">
        <div className="relative">
          <div className="rounded-full ring-2 ring-white/85 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]">
            <Avatar src={profile.photo_url} name={driverName === FALLBACK ? "Motorista" : driverName} size={104} />
          </div>
          {profile.is_online === true && (
            <span className="absolute bottom-1 right-1 flex h-4 w-4" aria-label="Motorista online" role="status">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70 motion-reduce:animate-none" aria-hidden="true" />
              <span className="relative h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-background" aria-hidden="true" />
            </span>
          )}
        </div>

        <h2 className="mt-3 max-w-full break-words font-display text-[20px] font-bold tracking-tight text-foreground">
          {driverName}
        </h2>

        <div className="mt-1 flex min-w-0 items-center justify-center gap-2">
          <RatingSummary average={avg} total={totalRatings} compact />
        </div>

        <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-1.5">
          <RatingBadge role="driver" average={avg} size="md" />
          <ApprovalPill status={profile.approval_status} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 max-[340px]:grid-cols-1">
        <Stat icon={<Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden="true" />} label="Nota" value={avg ? avg.toFixed(2) : "—"} />
        <Stat icon={<Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />} label="Avaliações" value={String(totalRatings)} />
        <Stat icon={<BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />} label="Corridas" value={String(completedRides)} />
      </div>

      <section className="min-w-0 rounded-2xl bg-background/50 p-4 ring-1 ring-border/60" aria-labelledby="driver-vehicle-title">
        <div id="driver-vehicle-title" className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          <Car className="h-3.5 w-3.5" aria-hidden="true" />
          Veículo
        </div>

        <div className="flex min-w-0 items-start justify-between gap-3 max-[340px]:flex-col">
          <div className="min-w-0 flex-1">
            <div className="break-words text-[15px] font-semibold text-foreground">{vehicleModel}</div>
            <div className="mt-0.5 break-words text-[13px] leading-5 text-muted-foreground">
              {vehicleColor}{vehicleYear ? ` · ${vehicleYear}` : ""}
            </div>
            {category !== FALLBACK && (
              <div className="mt-2 inline-flex max-w-full items-center rounded-md bg-primary/10 px-2 py-1 text-[12px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/25">
                <span className="break-words">{category}</span>
              </div>
            )}
          </div>

          <div className="max-w-full shrink-0 break-all rounded-md bg-white px-2.5 py-1 text-[13px] font-extrabold tracking-[0.18em] text-black shadow-[0_2px_6px_-2px_rgba(0,0,0,0.35)]" aria-label={`Placa ${plate}`}>
            {plate}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-background/50 p-4 ring-1 ring-border/60" aria-label="Informações públicas do motorista">
        <MetaRow icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />} label="Cidade" value={location} />
        <div className="my-2.5 h-px bg-border/60" aria-hidden="true" />
        <MetaRow icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />} label="Motorista desde" value={formatMemberSince(profile.member_since)} />
      </section>

      <AmenitiesSection userId={profile.user_id} />

      <p className="text-center text-[13px] leading-5 text-muted-foreground/90">
        Dados públicos de confiança. A APOIS não compartilha documentos ou informações pessoais sensíveis.
      </p>
    </div>
  );
}

function AmenitiesSection({ userId }: { userId: string }) {
  const normalizedUserId = userId.trim();
  const [prefs, setPrefs] = useState<DriverAmenities>(DEFAULT_AMENITIES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setPrefs(DEFAULT_AMENITIES);
    if (!normalizedUserId) {
      setLoaded(true);
      return () => { alive = false; };
    }
    void fetchDriverAmenitiesPublic(normalizedUserId)
      .then((result) => {
        if (!alive) return;
        setPrefs(result ?? DEFAULT_AMENITIES);
      })
      .catch(() => {
        if (!alive) return;
        setPrefs(DEFAULT_AMENITIES);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => { alive = false; };
  }, [normalizedUserId]);

  const enabled = useMemo(() => enabledAmenities(prefs), [prefs]);
  if (!loaded || enabled.length === 0) return null;

  return (
    <section className="rounded-2xl bg-background/50 p-4 ring-1 ring-border/60" aria-labelledby="driver-amenities-title">
      <div id="driver-amenities-title" className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Regalias a bordo
      </div>
      <div className="flex flex-wrap gap-1.5">
        {enabled.map((key) => {
          const meta = AMENITY_META[key];
          if (!meta) return null;
          const IconEl = meta.icon;
          return (
            <span key={key} className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[13px] font-semibold text-primary ring-1 ring-primary/25">
              <IconEl className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="break-words">{meta.label}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-background/50 p-3 text-center ring-1 ring-border/60">
      <div className="flex min-w-0 items-center justify-center gap-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon}<span className="break-words">{label}</span>
      </div>
      <div className="mt-1 break-words text-[17px] font-extrabold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 max-[340px]:items-start max-[340px]:flex-col">
      <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}<span className="break-words">{label}</span>
      </div>
      <div className="min-w-0 break-words text-[13.5px] font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function useDriverPublicProfile(userId: string | null | undefined) {
  const [data, setData] = useState<DriverPublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedUserId = userId?.trim() ?? "";

  useEffect(() => {
    if (!normalizedUserId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let alive = true;
    setData(null);
    setLoading(true);
    setError(null);

    void (async () => {
      const { data: rows, error: rpcError } = await supabase.rpc(
        "get_driver_public_profile" as never,
        { target_user_id: normalizedUserId } as never,
      );
      if (!alive) return;

      if (rpcError) {
        setError("Não foi possível carregar o perfil do motorista.");
        setData(null);
        setLoading(false);
        return;
      }

      const arr = rows as unknown as DriverPublicProfile[] | null;
      const first = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      if (!first) {
        setData(null);
        setLoading(false);
        return;
      }

      let resolvedPhoto: string | null = null;
      try {
        resolvedPhoto = await signDriverPhotoPath(first.photo_url);
      } catch {
        resolvedPhoto = null;
      }
      if (!alive) return;

      setData({ ...first, photo_url: resolvedPhoto });
      setLoading(false);
    })().catch(() => {
      if (!alive) return;
      setError("Não foi possível carregar o perfil do motorista.");
      setData(null);
      setLoading(false);
    });

    return () => { alive = false; };
  }, [normalizedUserId]);

  return { data, loading, error };
}
