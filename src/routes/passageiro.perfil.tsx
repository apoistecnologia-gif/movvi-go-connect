import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { PassengerStatsCard } from "@/components/profile/PassengerStatsCard";
import { VerifiedBadge } from "@/components/profile/ProfileStatusBadges";

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
          <PassengerStatsCard totalRides={totalRides} rating={rating} />
        </div>
      }
    />
  );
}
