import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SettingsRow } from "./SettingsRow";
import { useSettingsVisual } from "./SettingsPageShell";

export function SettingsLinkRow({ icon, title, hint, to, onClick, destructive, badge }: {
  icon?: LucideIcon; title: ReactNode; hint?: ReactNode; to?: string; onClick?: () => void; destructive?: boolean; badge?: ReactNode;
}) {
  const driver = useSettingsVisual() === "driver";
  const right = <div className={driver ? "flex items-center gap-2 text-zinc-600" : "flex items-center gap-2 text-[#94A3B8]"}>{badge}<ChevronRight className="h-4 w-4" strokeWidth={2} /></div>;
  const inner = <SettingsRow icon={icon} title={title} hint={hint} right={right} destructive={destructive} />;
  const cls = driver ? "block transition active:bg-white/5" : "block transition active:bg-[#F7F9F7]";
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={`${cls} w-full text-left`}>{inner}</button>;
}
