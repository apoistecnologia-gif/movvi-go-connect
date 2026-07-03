import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { DriverInfoCard } from "@/components/profile/DriverInfoCard";
import {
  ApprovalBadge, SubscriptionBadge, OnlineBadge, DocumentsBadge, VerifiedBadge,
} from "@/components/profile/ProfileStatusBadges";

export const Route = createFileRoute("/motorista/perfil")({
  head: () => ({ meta: [{ title: "Perfil do Motorista — MOVVI DRIVE" }] }),
  component: DriverProfilePage,
});

type Driver = {
  name: string | null; email: string | null;
  photo_url: string | null; category: string | null;
  vehicle_model: string | null; vehicle_color: string | null;
  vehicle_plate: string | null; vehicle_year: number | null;
  rating: number | null;
  approval_status: string | null;
  subscription_status: string | null;
  is_online: boolean | null;
  created_at: string | null;
};

function DriverProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [totalRides, setTotalRides] = useState(0);
  const [docsStatus, setDocsStatus] = useState<"ok" | "pending" | "missing">("pending");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data: d } = await supabase.from("drivers")
        .select("id,name,email,photo_url,category,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,rating,average_rating,total_ratings,completed_rides,approval_status,subscription_status,is_online,created_at")
        .eq("user_id", userId).maybeSingle();
      if (!alive) return;
      setDriver((d ?? null) as Driver | null);

      const driverId = (d as { id?: string } | null)?.id;
      const [{ count }, docsRes, { data: u }] = await Promise.all([
        supabase.from("rides").select("id", { count: "exact", head: true })
          .eq("driver_id", userId).eq("status", "finalizada"),
        driverId
          ? supabase.from("driver_documents").select("status").eq("driver_id", driverId)
          : Promise.resolve({ data: [] as { status: string | null }[] }),
        supabase.from("users").select("email_verified_at").eq("auth_user_id", userId).maybeSingle(),
      ]);
      if (!alive) return;
      setTotalRides(count ?? 0);
      setVerified(Boolean(u?.email_verified_at));
      const docs = (docsRes as { data: { status: string | null }[] | null }).data ?? [];
      if (docs.length > 0) {
        const statuses = docs.map((x) => String(x.status ?? "").toLowerCase());
        if (statuses.every((s) => s === "aprovado" || s === "approved" || s === "ok")) setDocsStatus("ok");
        else if (statuses.some((s) => s === "reprovado" || s === "rejected" || s === "missing")) setDocsStatus("missing");
        else setDocsStatus("pending");
      } else {
        setDocsStatus("missing");
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  const badges = driver ? (
    <>
      <VerifiedBadge verified={verified} />
      <ApprovalBadge status={driver.approval_status} />
      <SubscriptionBadge status={driver.subscription_status} />
      <OnlineBadge online={driver.is_online} />
      <DocumentsBadge status={docsStatus} />
    </>
  ) : null;

  return (
    <ProfileForm
      role="driver"
      title="Perfil do motorista"
      description="Seus dados, veículo e status da conta em um só lugar."
      onLoaded={({ userId: id }) => setUserId(id)}
      headerSlot={
        <div className="space-y-4 animate-phase-in">
          <ProfileHero
            name={driver?.name ?? null}
            email={driver?.email ?? null}
            photoUrl={driver?.photo_url ?? null}
            badges={badges}
          />
        </div>
      }
      extraSlot={
        driver ? (
          <DriverInfoCard
            vehicleModel={driver.vehicle_model}
            vehicleColor={driver.vehicle_color}
            vehiclePlate={driver.vehicle_plate}
            vehicleYear={driver.vehicle_year}
            category={driver.category}
            rating={driver.rating}
            totalRides={totalRides}
            createdAt={driver.created_at}
          />
        ) : null
      }
    />
  );
}
