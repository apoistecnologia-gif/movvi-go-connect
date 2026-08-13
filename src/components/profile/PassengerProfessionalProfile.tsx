/**
 * APOIS — Passenger Professional Profile.
 * Read-only presentational card. Shows only public trust info.
 * Never renders sensitive data (CPF, phone, email, emergency contacts, birth date).
 */
import { useEffect, useState } from "react";
import { Star, MapPin, CalendarDays, BadgeCheck, Sparkles, UserRound } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { RatingBadge, RatingSummary } from "@/components/rating/RatingBadge";

export type PassengerPublicProfile = {
  user_id: string;
  name: string | null;
  photo_url: string | null;
  city: string | null;
  average_rating: number | null;
  total_ratings: number | null;
  completed_rides: number | null;
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
    return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return FALLBACK;
  }
}

export function PassengerProfessionalProfile({
  profile,
  loading,
}: {
  profile: PassengerPublicProfile | null;
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
        <div className="rounded-full ring-2 ring-white/85 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]">
          <Avatar src={profile.photo_url} name={profile.name ?? "Passageiro"} size={104} />
        </div>

        <h2 className="mt-3 font-display text-[20px] font-bold tracking-tight text-foreground">
          {fmt(profile.name)}
        </h2>

        <div className="mt-1 flex items-center justify-center gap-2">
          <RatingSummary average={avg} total={profile.total_ratings ?? 0} compact />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <RatingBadge role="passenger" average={avg} size="md" />
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary ring-1 ring-primary/30">
            <UserRound className="h-3 w-3" />
            Passageiro APOIS
          </span>
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

      {/* Meta card */}
      <section className="rounded-2xl bg-background/50 p-4 ring-1 ring-border/60">
        <MetaRow
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Cidade"
          value={fmt(profile.city)}
        />
        <div className="my-2.5 h-px bg-border/60" />
        <MetaRow
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Passageiro desde"
          value={formatMemberSince(profile.member_since)}
        />
      </section>

      <p className="text-center text-[10.5px] leading-relaxed text-muted-foreground/80">
        Dados públicos de confiança. A APOIS não compartilha documentos ou informações
        pessoais sensíveis.
      </p>
    </div>
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
 * Hook — fetches the passenger public profile via SECURITY DEFINER RPC.
 * Only public trust data is returned.
 */
export function usePassengerPublicProfile(userId: string | null | undefined) {
  const [data, setData] = useState<PassengerPublicProfile | null>(null);
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
      .rpc("get_passenger_public_profile" as never, { target_user_id: userId } as never)
      .then(({ data: rows, error: err }) => {
        if (!alive) return;
        if (err) {
          setError(err.message);
          setData(null);
        } else {
          const arr = rows as unknown as PassengerPublicProfile[] | null;
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
