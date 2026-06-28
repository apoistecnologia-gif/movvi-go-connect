import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Award, Car, ClipboardList, Loader2, Star, UserCheck } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { Avatar } from "@/components/Avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/motorista/perfil")({
  head: () => ({ meta: [{ title: "Perfil do Motorista — MOVVI DRIVE" }] }),
  component: DriverProfilePage,
});

type Driver = {
  id: string; name: string | null; email: string | null; phone: string | null;
  photo_url: string | null; category: string | null;
  vehicle_model: string | null; vehicle_color: string | null;
  vehicle_plate: string | null; vehicle_year: number | null;
  rating: number | null; approval_status: string | null;
  created_at: string | null; cpf: string | null;
};

function DriverProfilePage() {
  const navigate = useNavigate();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [totalRides, setTotalRides] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.auth.getUser();
      if (!a?.user) { navigate({ to: "/motorista/login" }); return; }
      const { data } = await supabase
        .from("drivers")
        .select("id,name,email,phone,photo_url,category,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,rating,approval_status,created_at,cpf")
        .eq("user_id", a.user.id).maybeSingle();
      setDriver((data ?? null) as Driver | null);
      const { count } = await supabase
        .from("rides").select("id", { count: "exact", head: true })
        .eq("driver_id", a.user.id).eq("status", "finalizada");
      setTotalRides(count ?? 0);
      setLoading(false);
    })();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <MovviHeader logoutRedirect="/" />
        <p className="p-6 text-center text-sm text-muted-foreground">Perfil não encontrado.</p>
      </div>
    );
  }

  const completed = [
    !!driver.photo_url, !!driver.name, !!driver.phone, !!driver.email,
    !!driver.cpf, !!driver.vehicle_model, !!driver.vehicle_plate, !!driver.vehicle_color,
  ].filter(Boolean).length;
  const completion = Math.round((completed / 8) * 100);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="container mx-auto max-w-xl space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <Avatar src={driver.photo_url} name={driver.name ?? "Motorista"} size={96} />
                <div>
                  <h1 className="text-xl font-bold">{driver.name ?? "Motorista"}</h1>
                  <p className="text-xs text-muted-foreground">{driver.email}</p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary">
                  <Star className="h-4 w-4 fill-current" /> {Number(driver.rating ?? 0).toFixed(2)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat icon={<ClipboardList className="h-4 w-4" />} label="Corridas" value={String(totalRides)} />
                <Stat icon={<Award className="h-4 w-4" />} label="Nível" value={totalRides >= 500 ? "Ouro" : totalRides >= 100 ? "Prata" : "Bronze"} />
                <Stat icon={<UserCheck className="h-4 w-4" />} label="Status" value={driver.approval_status ?? "—"} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Perfil completo</span>
                  <span className="font-semibold">{completion}%</span>
                </div>
                <Progress value={completion} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Car className="h-4 w-4 text-primary" /> Veículo
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Categoria" value={driver.category ?? "—"} />
                <Info label="Modelo" value={driver.vehicle_model ?? "—"} />
                <Info label="Cor" value={driver.vehicle_color ?? "—"} />
                <Info label="Placa" value={driver.vehicle_plate ?? "—"} />
                <Info label="Ano" value={driver.vehicle_year ? String(driver.vehicle_year) : "—"} />
                <Info label="Motorista desde" value={driver.created_at ? new Date(driver.created_at).toLocaleDateString("pt-BR") : "—"} />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2">
      <div className="mb-1 flex justify-center text-primary">{icon}</div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}
