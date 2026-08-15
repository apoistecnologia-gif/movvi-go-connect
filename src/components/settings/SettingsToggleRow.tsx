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
  disabled,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const switchId = useId();
  const accessibleLabel = typeof title === "string" ? title : undefined;

  return (
    <SettingsRow
      icon={icon}
      title={title}
      hint={hint}
      right={
        <label htmlFor={switchId} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl">
          <Switch
            id={switchId}
            aria-label={accessibleLabel}
            checked={checked}
            onCheckedChange={onChange}
            disabled={disabled}
          />
        </label>
      }
    />
  );
}
