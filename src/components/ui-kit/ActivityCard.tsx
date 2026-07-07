import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

/**
 * MOVVI ActivityCard — card de viagem no histórico ("Atividade").
 * Header opcional com miniatura do mapa, endereço em destaque, data/hora e
 * valor. Uma ação secundária (ex: "Reagendar", "Detalhes") vive no rodapé.
 */

export interface ActivityCardProps {
  mapPreview?: ReactNode;
  destination: string;
  origin?: string;
  when: string;
  amount?: string;
  statusPill?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
}

export function ActivityCard({
  mapPreview,
  destination,
  origin,
  when,
  amount,
  statusPill,
  action,
  onClick,
}: ActivityCardProps) {
  const clickable = typeof onClick === "function";
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      type={clickable ? "button" : undefined}
      onClick={onClick}
      className="group flex w-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-left shadow-[0_6px_18px_-14px_rgba(0,0,0,0.35)] transition-transform active:scale-[0.995]"
    >
      {mapPreview ? (
        <div className="relative h-36 w-full overflow-hidden bg-muted">
          {mapPreview}
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">
                {destination}
              </p>
              {origin ? (
                <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
                  {origin}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[12px] text-muted-foreground">
            <span>{when}</span>
            {amount ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-foreground">{amount}</span>
              </>
            ) : null}
            {statusPill ? <span className="ml-auto">{statusPill}</span> : null}
          </div>
        </div>
      </div>
      {action ? (
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5">
          {action}
        </div>
      ) : null}
    </Comp>
  );
}
