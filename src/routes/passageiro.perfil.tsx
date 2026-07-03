import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { PassengerStatsCard } from "@/components/profile/PassengerStatsCard";
import { VerifiedBadge } from "@/components/profile/ProfileStatusBadges";
import { PassengerProfessionalProfileDialog } from "@/components/profile/PassengerProfessionalProfileDialog";

export const Route = createFileRoute("/passageiro/perfil")({
  head: () => ({ meta: [{ title: "Perfil — MOVVI DRIVE" }] }),
  component: PerfilPassageiro,
});

function PerfilPassageiro() {
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [totalRides, setTotalRides] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [totalRatings, setTotalRatings] = useState(0);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [{ data: u }, { count }] = await Promise.all([
        supabase.from("users").select("name,email,avatar_url,email_verified_at,phone_verified_at,average_rating,total_ratings,completed_rides").eq("auth_user_id", userId).maybeSingle(),
        supabase.from("rides").select("id", { count: "exact", head: true }).eq("passenger_id", userId).eq("status", "finalizada"),
      ]);
      if (!alive) return;
      if (u) {
        setName(u.name ?? null);
        setEmail(u.email ?? null);
        setPhotoUrl(u.avatar_url ?? null);
        setVerified(Boolean(u.email_verified_at));
        const avg = Number((u as any).average_rating);
        setRating(Number.isFinite(avg) && avg > 0 ? avg : null);
        setTotalRatings(Number((u as any).total_ratings ?? 0));
        setTotalRides(Number((u as any).completed_rides ?? count ?? 0));
      } else {
        setTotalRides(count ?? 0);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  return (
    <>
      <ProfileForm
        role="passenger"
        title="Meu perfil"
        description="Mantenha seus dados completos e atualizados."
        onLoaded={({ userId: id }) => setUserId(id)}
        headerSlot={
          <div className="space-y-4 animate-phase-in">
            <ProfileHero
              name={name}
              email={email}
              photoUrl={photoUrl}
              badges={<VerifiedBadge verified={verified} />}
            />
            <PassengerStatsCard totalRides={totalRides} rating={rating} totalRatings={totalRatings} />
          </div>
        }
        extraSlot={
          userId ? (
            <button
              type="button"
              onClick={() => setPublicProfileOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-border transition active:scale-[0.99] hover:ring-primary/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Ver perfil público</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    Assim é como os motoristas te veem.
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Abrir</span>
            </button>
          ) : null
        }
      />
      <PassengerProfessionalProfileDialog
        open={publicProfileOpen}
        onOpenChange={setPublicProfileOpen}
        passengerUserId={userId}
      />
    </>
  );
}

