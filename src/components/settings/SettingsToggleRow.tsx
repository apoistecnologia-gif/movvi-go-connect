import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "./SettingsRow";

export function SettingsToggleRow({
  icon,
  title,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const switchId = useId();
  const titleId = `${switchId}-title`;
  const hintId = `${switchId}-hint`;
  const accessibleLabel = typeof title === "string" ? title.trim() || "Opção" : undefined;

  return (
    <SettingsRow
      icon={icon}
      title={title}
      hint={hint}
      titleId={titleId}
      hintId={hint ? hintId : undefined}
      disabled={disabled}
      right={
        <div className="flex min-h-12 min-w-12 items-center justify-center rounded-xl">
          <Switch
            id={switchId}
            aria-label={accessibleLabel}
            aria-labelledby={accessibleLabel ? undefined : titleId}
            aria-describedby={hint ? hintId : undefined}
            checked={Boolean(checked)}
            onCheckedChange={(next) => {
              if (!disabled) onChange(next);
            }}
            disabled={disabled}
          />
        </div>
      }
    />
  );
}
