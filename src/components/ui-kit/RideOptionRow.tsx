import type { ReactNode } from "react";
import { Zap } from "lucide-react";

/**
 * APOIS RideOptionRow — linha vertical de categoria de corrida (Carros,
 * Motos, Frete…). Uma linha por opção, com ilustração à esquerda, título,
 * ETA e preço à direita. Estado selecionado destaca com borda verde.
 *
 * Substitui carrosséis horizontais que cortavam categorias no rodapé.
 */

export interface RideOptionRowProps {
  icon: ReactNode;
  name: string;
  etaLabel?: string; // ex: "13:12 · 4 min"
  helper?: string; // ex: "Mais rápido"
  price: string; // ex: "R$ 17,33"
  strikethroughPrice?: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  fastPill?: boolean;
}

export function RideOptionRow({
  icon,
  name,
  etaLabel,
  helper,
  price,
  strikethroughPrice,
  selected,
  onClick,
  disabled,
  fastPill,
}: RideOptionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl border bg-card px-3 py-3 text-left transition-all disabled:opacity-50 ${
        selected
          ? "border-primary shadow-[0_0_0_1px_var(--color-primary)]"
          : "border-border"
      }`}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {name}
          </p>
          {fastPill ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Zap className="h-3 w-3" strokeWidth={2.5} />
              Rápido
            </span>
          ) : null}
        </div>
        {etaLabel ? (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {etaLabel}
          </p>
        ) : null}
        {helper ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-primary">
            {helper}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        {strikethroughPrice ? (
          <p className="text-[11px] text-muted-foreground line-through">
            {strikethroughPrice}
          </p>
        ) : null}
        <p className="text-[15px] font-bold tabular-nums text-foreground">
          {price}
        </p>
      </div>
    </button>
  );
}
