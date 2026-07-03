/**
 * MOVVI — Passenger stats card (informative only).
 * Trip count / rating / badge. Does NOT modify ride flow.
 */
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Star, CreditCard, MapPin } from "lucide-react";
import { RatingBadge, RatingSummary } from "@/components/rating/RatingBadge";

type Props = {
  totalRides: number;
  rating?: number | null;
  totalRatings?: number | null;
};

export function PassengerStatsCard({ totalRides, rating, totalRatings }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Sua conta</h3>
          <RatingBadge role="passenger" average={rating} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">Reputação</span>
          <RatingSummary average={rating} total={totalRatings ?? 0} compact />
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Tile icon={<ClipboardList className="h-4 w-4" />} label="Corridas" value={String(totalRides)} />
          <Tile
            icon={<Star className="h-4 w-4" />}
            label="Avaliação"
            value={rating != null && rating > 0 ? rating.toFixed(2) : "—"}
          />
          <Tile icon={<CreditCard className="h-4 w-4" />} label="Pagamento" value="Em breve" muted />
          <Tile icon={<MapPin className="h-4 w-4" />} label="Favoritos" value="Em breve" muted />
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-2">
      <div className={`mb-1 flex justify-center ${muted ? "text-muted-foreground" : "text-primary"}`}>{icon}</div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`truncate text-sm font-bold ${muted ? "text-muted-foreground" : ""}`}>{value}</p>
    </div>
  );
}
