import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Settings section — MOVVI Design System wrapper.
 * Standardizes header (icon + title + description) and body spacing
 * for every group inside the Settings screens.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
            <span className="truncate">{title}</span>
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-1.5 divide-y divide-border/60">
        {children}
      </CardContent>
    </Card>
  );
}
