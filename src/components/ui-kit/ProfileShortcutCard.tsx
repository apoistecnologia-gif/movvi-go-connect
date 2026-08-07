import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

/**
 * APOIS ProfileShortcutCard — atalho grande para a tela de Conta.
 * Ícone + título; opcionalmente subtítulo. Renderiza como link ou botão.
 */

export interface ProfileShortcutCardProps {
  icon: LucideIcon;
  label: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  tone?: "default" | "danger";
}

export function ProfileShortcutCard({
  icon: Icon,
  label,
  hint,
  to,
  onClick,
  tone = "default",
}: ProfileShortcutCardProps) {
  const iconBg =
    tone === "danger"
      ? "bg-destructive/12 text-destructive"
      : "bg-primary/12 text-primary";

  const inner = (
    <>
      <span
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-foreground">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );

  const cls =
    "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors active:scale-[0.99]";

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function ProfileShortcutGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{children}</div>
  );
}
