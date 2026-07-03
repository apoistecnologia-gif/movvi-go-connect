/**
 * MOVVI — Account status badges.
 * Small, semantic badges built on top of the DS status pill.
 * Purely presentational — no ride/GPS/realtime coupling.
 */
import { DSStatusPill } from "@/design-system";
import { BadgeCheck, ShieldAlert, ShieldCheck, ShieldX, CircleDot, CircleOff, Clock } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "success" | "primary" | "warning" | "danger" | "muted";

const toneCls: Record<Tone, string> = {
  success: "bg-[color-mix(in_oklab,var(--color-success)_16%,transparent)] text-success border-success/30",
  primary: "bg-[color-mix(in_oklab,var(--color-primary)_14%,transparent)] text-primary border-primary/30",
  warning: "bg-[color-mix(in_oklab,var(--color-warning)_16%,transparent)] text-warning border-warning/30",
  danger:  "bg-[color-mix(in_oklab,var(--color-error)_14%,transparent)] text-destructive border-destructive/30",
  muted:   "bg-muted/40 text-muted-foreground border-border",
};

export function StatusBadge({
  icon, label, tone = "muted",
}: { icon?: ReactNode; label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${toneCls[tone]}`}
    >
      {icon}
      {label}
    </span>
  );
}

/* ---------- Account-level helpers ---------- */

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <StatusBadge icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Verificado" tone="success" />
  ) : (
    <StatusBadge icon={<Clock className="h-3.5 w-3.5" />} label="Verificação pendente" tone="warning" />
  );
}

/* ---------- Driver-specific helpers ---------- */

export function ApprovalBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "").toLowerCase();
  if (s === "aprovado" || s === "approved")
    return <StatusBadge icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Aprovado" tone="success" />;
  if (s === "recusado" || s === "rejected" || s === "reprovado")
    return <StatusBadge icon={<ShieldX className="h-3.5 w-3.5" />} label="Reprovado" tone="danger" />;
  if (s === "pendente" || s === "pending" || s === "em_analise")
    return <StatusBadge icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Em análise" tone="warning" />;
  return <StatusBadge icon={<ShieldAlert className="h-3.5 w-3.5" />} label={status || "—"} tone="muted" />;
}

export function SubscriptionBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "ativa")
    return <StatusBadge icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Assinatura ativa" tone="success" />;
  if (s === "expired" || s === "vencida" || s === "overdue")
    return <StatusBadge icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Assinatura vencida" tone="danger" />;
  if (s === "blocked" || s === "bloqueada")
    return <StatusBadge icon={<ShieldX className="h-3.5 w-3.5" />} label="Bloqueada" tone="danger" />;
  if (s === "cancelled" || s === "cancelada")
    return <StatusBadge icon={<ShieldX className="h-3.5 w-3.5" />} label="Cancelada" tone="muted" />;
  if (!status) return <StatusBadge label="Sem assinatura" tone="muted" />;
  return <StatusBadge label={status} tone="muted" />;
}

export function OnlineBadge({ online }: { online: boolean | null | undefined }) {
  // Delegates to DS pill so the color exactly matches driver home / admin map.
  return <DSStatusPill status={online ? "online" : "offline"} />;
}

export function DocumentsBadge({ status }: { status: "ok" | "pending" | "missing" | string }) {
  if (status === "ok")
    return <StatusBadge icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Documentos OK" tone="success" />;
  if (status === "missing")
    return <StatusBadge icon={<ShieldX className="h-3.5 w-3.5" />} label="Documentos faltando" tone="danger" />;
  return <StatusBadge icon={<Clock className="h-3.5 w-3.5" />} label="Documentos em análise" tone="warning" />;
}

export { CircleDot, CircleOff };
