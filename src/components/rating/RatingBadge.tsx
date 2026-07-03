/**
 * MOVVI — Rating badge + summary.
 * Automatic tier based on average rating.
 * Read-only presentational component.
 */
import { Star, Award } from "lucide-react";
import { cn } from "@/lib/utils";

export type RatingRole = "driver" | "passenger";

export type RatingTier = {
  key: "gold" | "excellent" | "good" | "none";
  label: string;
  className: string;
};

export function getRatingTier(role: RatingRole, avg: number | null | undefined): RatingTier {
  const v = typeof avg === "number" ? avg : 0;
  if (role === "driver") {
    if (v >= 4.9)  return { key: "gold",      label: "MOVVI Ouro",   className: "bg-yellow-500/15 text-yellow-400 ring-yellow-500/40" };
    if (v >= 4.8)  return { key: "excellent", label: "Excelente",    className: "bg-primary/15 text-primary ring-primary/40" };
    if (v >= 4.6)  return { key: "good",      label: "Muito Bom",    className: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40" };
    return         { key: "none",      label: "Sem selo",     className: "bg-muted text-muted-foreground ring-border" };
  }
  if (v >= 4.9)    return { key: "gold",      label: "Passageiro Premium", className: "bg-yellow-500/15 text-yellow-400 ring-yellow-500/40" };
  if (v >= 4.8)    return { key: "excellent", label: "Muito Educado",       className: "bg-primary/15 text-primary ring-primary/40" };
  return           { key: "none",      label: "Sem selo",            className: "bg-muted text-muted-foreground ring-border" };
}

export function RatingBadge({ role, average, size = "sm" }: {
  role: RatingRole;
  average: number | null | undefined;
  size?: "sm" | "md";
}) {
  const tier = getRatingTier(role, average);
  if (tier.key === "none") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
        size === "md" && "px-3 py-1.5 text-xs",
        tier.className,
      )}
    >
      <Award className={cn("h-3 w-3", size === "md" && "h-3.5 w-3.5")} />
      {tier.label}
    </span>
  );
}

export function RatingSummary({
  average,
  total,
  countLabel = "avaliações",
  compact = false,
}: {
  average: number | null | undefined;
  total: number | null | undefined;
  countLabel?: string;
  compact?: boolean;
}) {
  const avg = typeof average === "number" && average > 0 ? average : 0;
  const cnt = typeof total === "number" ? total : 0;
  return (
    <span className={cn("inline-flex items-baseline gap-1", compact ? "text-sm" : "text-base")}>
      <Star className={cn("self-center fill-primary text-primary", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <span className="font-semibold tabular-nums">{avg > 0 ? avg.toFixed(2) : "—"}</span>
      <span className="text-xs text-muted-foreground">
        ({cnt} {countLabel})
      </span>
    </span>
  );
}
