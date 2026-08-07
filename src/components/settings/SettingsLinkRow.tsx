import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SettingsRow } from "./SettingsRow";

/**
 * APOIS DS — Navigable settings row.
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
    <div className="flex items-center gap-2 text-[#94A3B8]">
      {badge}
      <ChevronRight className="h-4 w-4" strokeWidth={2} />
    </div>
  );
  const inner = (
    <SettingsRow icon={icon} title={title} hint={hint} right={right} destructive={destructive} />
  );
  if (to) {
    return (
      <Link to={to} className="block transition active:bg-[#F7F9F7]">
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left transition active:bg-[#F7F9F7]"
    >
      {inner}
    </button>
  );
}
