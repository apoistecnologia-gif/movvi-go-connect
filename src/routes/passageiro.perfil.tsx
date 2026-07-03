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
      const [{ data: u }, { count }, { data: r }] = await Promise.all([
        supabase.from("users").select("name,email,avatar_url,email_verified_at,phone_verified_at").eq("auth_user_id", userId).maybeSingle(),
        supabase.from("rides").select("id", { count: "exact", head: true }).eq("passenger_id", userId).eq("status", "finalizada"),
        supabase.from("rides").select("passenger_rating").eq("passenger_id", userId).not("passenger_rating", "is", null).limit(50),
      ]);
      if (!alive) return;
      if (u) {
        setName(u.name ?? null);
        setEmail(u.email ?? null);
        setPhotoUrl(u.avatar_url ?? null);
        setVerified(Boolean(u.email_verified_at));
      }
      setTotalRides(count ?? 0);
      if (r && r.length > 0) {
        const vals = r.map((x) => Number(x.passenger_rating)).filter((n) => !Number.isNaN(n));
        setRating(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
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
