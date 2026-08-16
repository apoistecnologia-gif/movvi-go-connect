import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SettingsRow } from "./SettingsRow";
import { useSettingsVisual } from "./SettingsPageShell";

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
  const driver = useSettingsVisual() === "driver";
  const accessibleLabel = typeof title === "string" ? title.trim() || undefined : undefined;
  const right = (
    <div
      className={
        driver
          ? "flex min-w-0 items-center gap-2 text-zinc-500"
          : "flex min-w-0 items-center gap-2 text-[#94A3B8]"
      }
    >
      {badge ? <span className="min-w-0 break-words">{badge}</span> : null}
      <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
    </div>
  );
  const inner = (
    <SettingsRow
      icon={icon}
      title={title}
      hint={hint}
      right={right}
      destructive={destructive}
    />
  );
  const cls = driver
    ? "block min-w-0 rounded-[inherit] transition active:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F6BE1C] motion-reduce:transition-none"
    : "block min-w-0 rounded-[inherit] transition active:bg-[#F7F9F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#76C139] motion-reduce:transition-none";

  if (to?.trim()) {
    return (
      <Link to={to} className={cls} aria-label={accessibleLabel}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} w-full text-left`}
        aria-label={accessibleLabel}
      >
        {inner}
      </button>
    );
  }

  return inner;
}
