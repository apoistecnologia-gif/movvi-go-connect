import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SettingsRow } from "./SettingsRow";

/**
 * Row that navigates to another route or triggers an action.
 * If `to` is provided, renders a <Link>. Otherwise renders a <button>.
 */
export function SettingsLinkRow({
  icon,
  title,
  hint,
  to,
  onClick,
  destructive,
  badge,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  to?: string;
  onClick?: () => void;
  destructive?: boolean;
  badge?: ReactNode;
}) {
  const right = (
    <div className="flex items-center gap-2 text-muted-foreground">
      {badge}
      <ChevronRight className="h-4 w-4" />
    </div>
  );
  const content = (
    <SettingsRow
      icon={icon}
      title={
        <span className={destructive ? "text-destructive" : undefined}>{title}</span>
      }
      hint={hint}
      right={right}
    />
  );
  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-lg -mx-1 px-1 transition-colors active:scale-[0.99] active:opacity-90 hover:bg-muted/40"
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg -mx-1 px-1 text-left transition-colors active:scale-[0.99] active:opacity-90 hover:bg-muted/40"
    >
      {content}
    </button>
  );
}
