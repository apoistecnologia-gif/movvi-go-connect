import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/**
 * APOIS ServiceCard — card compacto para grid de serviços (Carros, Motos,
 * Fretes, Guincho, Envios). Ícone linear, título curto, opcional badge "Novo".
 *
 * Renderiza como `<Link>` quando `to` é passado, ou `<button>` caso contrário.
 */

export interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  badge?: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ServiceCard({
  icon: Icon,
  title,
  description,
  badge,
  to,
  onClick,
  disabled,
  className,
}: ServiceCardProps) {
  const content = (
    <>
      {badge ? (
        <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
          {badge}
        </span>
      ) : null}
      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary transition-colors group-hover:bg-primary/20">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h3 className="text-[14px] font-semibold leading-tight text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {description}
        </p>
      ) : null}
    </>
  );

  const cls = `group relative flex flex-col items-start rounded-2xl border border-border bg-card p-4 text-left shadow-[0_6px_18px_-14px_rgba(0,0,0,0.4)] transition-transform duration-200 ease-out active:scale-[0.98] disabled:opacity-50 ${
    className ?? ""
  }`.trim();

  if (to && !disabled) {
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {content}
    </button>
  );
}

/**
 * APOIS ServicesGrid — grid responsivo para ServiceCard. Prefer 2 colunas
 * em mobile, 3 a partir de sm, 4 a partir de md. Wrapper opcional com
 * título e ação secundária.
 */
export function ServicesGrid({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      {(title || action) && (
        <div className="flex items-end justify-between px-1">
          {title ? (
            <h2 className="font-display text-lg font-bold tracking-tight">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
