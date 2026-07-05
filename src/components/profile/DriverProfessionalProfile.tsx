/**
 * MOVVI — Driver Professional Profile.
 * Read-only presentational card. Shows only public trust info.
 * Never render sensitive data (CPF, CNH, documents, phone, email).
 */
import { useEffect, useState } from "react";
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

function fmt<T extends string | number | null | undefined>(v: T): string {
  if (v === null || v === undefined) return FALLBACK;
  const s = String(v).trim();
  return s.length ? s : FALLBACK;
}

function formatMemberSince(iso: string | null | undefined): string {
  if (!iso) return FALLBACK;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return FALLBACK;
  }
}

function ApprovalPill({ status }: { status: string | null }) {
  const s = String(status ?? "").toLowerCase();
  const ok = s === "aprovado" || s === "approved" || s === "ativo";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
        ok
          ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40"
          : "bg-muted text-muted-foreground ring-border",
      )}
    >
      <ShieldCheck className="h-3 w-3" />
      {ok ? "Motorista Verificado" : "Cadastro em análise"}
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
  if (loading || !profile) {
    return (
      <div className="animate-pulse space-y-4 p-1">
        <div className="mx-auto h-24 w-24 rounded-full bg-muted/40" />
        <div className="mx-auto h-4 w-40 rounded bg-muted/40" />
        <div className="h-24 rounded-2xl bg-muted/30" />
        <div className="h-24 rounded-2xl bg-muted/30" />
      </div>
    );
  }

  const avg = profile.average_rating != null ? Number(profile.average_rating) : null;

  return (
    <div className="space-y-5 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Hero */}
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="rounded-full ring-2 ring-white/85 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]">
            <Avatar src={profile.photo_url} name={profile.name ?? "Motorista"} size={104} />
          </div>
          {profile.is_online && (
            <span className="absolute bottom-1 right-1 flex h-4 w-4">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-background" />
            </span>
          )}
        </div>

        <h2 className="mt-3 font-display text-[20px] font-bold tracking-tight text-foreground">
          {fmt(profile.name)}
        </h2>

        <div className="mt-1 flex items-center justify-center gap-2">
          <RatingSummary average={avg} total={profile.total_ratings ?? 0} compact />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <RatingBadge role="driver" average={avg} size="md" />
          <ApprovalPill status={profile.approval_status} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<Star className="h-3.5 w-3.5 fill-primary text-primary" />}
          label="Nota"
          value={avg && avg > 0 ? avg.toFixed(2) : "—"}
        />
        <Stat
          icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
          label="Avaliações"
          value={String(profile.total_ratings ?? 0)}
        />
        <Stat
          icon={<BadgeCheck className="h-3.5 w-3.5 text-primary" />}
          label="Corridas"
          value={String(profile.completed_rides ?? 0)}
        />
      </div>

      {/* Vehicle card */}
      <section className="rounded-2xl bg-background/50 p-4 ring-1 ring-border/60">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <Car className="h-3.5 w-3.5" />
          Veículo
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-foreground">
              {fmt(profile.vehicle_model)}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {fmt(profile.vehicle_color)}
              {profile.vehicle_year ? ` · ${profile.vehicle_year}` : ""}
            </div>
            {profile.category && (
              <div className="mt-2 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/25">
                {profile.category}
              </div>
            )}
          </div>

          <div className="shrink-0 rounded-md bg-white px-2.5 py-1 text-[12px] font-extrabold tracking-[0.22em] text-black shadow-[0_2px_6px_-2px_rgba(0,0,0,0.35)]">
            {fmt(profile.vehicle_plate)}
          </div>
        </div>
      </section>

      {/* Meta card */}
      <section className="rounded-2xl bg-background/50 p-4 ring-1 ring-border/60">
        <MetaRow
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Cidade"
          value={
            profile.city
              ? profile.state
                ? `${profile.city} · ${profile.state}`
                : profile.city
              : FALLBACK
          }
        />
        <div className="my-2.5 h-px bg-border/60" />
        <MetaRow
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Motorista desde"
          value={formatMemberSince(profile.member_since)}
        />
      </section>

      <AmenitiesSection userId={profile.user_id} />

      <p className="text-center text-[10.5px] leading-relaxed text-muted-foreground/80">
        Dados públicos de confiança. A MOVVI não compartilha documentos ou informações
        pessoais sensíveis.
      </p>
    </div>
  );
}

function AmenitiesSection({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<DriverAmenities>(DEFAULT_AMENITIES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchDriverAmenitiesPublic(userId).then((p) => {
      if (!alive) return;
      setPrefs(p);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [userId]);

  const enabled = enabledAmenities(prefs);
  if (!loaded || enabled.length === 0) return null;

  return (
    <section className="rounded-2xl bg-background/50 p-4 ring-1 ring-border/60">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        Regalias a bordo
      </div>
      <div className="flex flex-wrap gap-1.5">
        {enabled.map((k) => {
          const meta = AMENITY_META[k];
          const IconEl = meta.icon;
          return (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary ring-1 ring-primary/25"
            >
              <IconEl className="h-3.5 w-3.5" />
              {meta.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}


function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-background/50 p-3 text-center ring-1 ring-border/60">
      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[17px] font-extrabold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="truncate text-[13.5px] font-semibold text-foreground">{value}</div>
    </div>
  );
}

/**
 * Hook — fetches the driver public profile via SECURITY DEFINER RPC.
 * Only public trust data is returned.
 */
export function useDriverPublicProfile(userId: string | null | undefined) {
  const [data, setData] = useState<DriverPublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    supabase
      .rpc("get_driver_public_profile" as never, { target_user_id: userId } as never)
      .then(({ data: rows, error: err }) => {
        if (!alive) return;
        if (err) {
          setError(err.message);
          setData(null);
        } else {
          const arr = rows as unknown as DriverPublicProfile[] | null;
          const first = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
          setData(first);
        }
      })
      .then(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  return { data, loading, error };
}
