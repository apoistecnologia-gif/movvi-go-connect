/**
 * MOVVI — Driver info card (informative only).
 * Shows vehicle, plate, category, rating, trip count, reputation badge.
 * Does NOT change any ride, dispatch or GPS logic.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Car, Star, ClipboardList, IdCard, Tag } from "lucide-react";
import { RatingBadge, RatingSummary } from "@/components/rating/RatingBadge";

type Props = {
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  vehicleYear: number | null;
  category: string | null;
  rating: number | null;
  totalRatings?: number | null;
  totalRides: number;
  createdAt: string | null;
};

export function DriverInfoCard({
  vehicleModel, vehicleColor, vehiclePlate, vehicleYear,
  category, rating, totalRatings, totalRides, createdAt,
}: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Car className="h-4 w-4 text-primary" /> Veículo e desempenho
          </h3>
          <RatingBadge role="driver" average={rating} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">Reputação</span>
          <RatingSummary average={rating} total={totalRatings ?? 0} compact />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <MetricTile icon={<Star className="h-4 w-4" />} label="Avaliação" value={Number(rating ?? 0).toFixed(2)} />
          <MetricTile icon={<ClipboardList className="h-4 w-4" />} label="Corridas" value={String(totalRides)} />
          <MetricTile icon={<Tag className="h-4 w-4" />} label="Categoria" value={category ?? "—"} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Info label="Modelo" value={vehicleModel ?? "—"} />
          <Info label="Cor" value={vehicleColor ?? "—"} />
          <Info label="Placa" value={vehiclePlate ?? "—"} icon={<IdCard className="h-3 w-3" />} />
          <Info label="Ano" value={vehicleYear ? String(vehicleYear) : "—"} />
          <Info label="Motorista desde" value={createdAt ? new Date(createdAt).toLocaleDateString("pt-BR") : "—"} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2 transition-transform active:scale-[0.98]">
      <div className="mb-1 flex justify-center text-primary">{icon}</div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}
