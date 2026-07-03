import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
  return (
    <SettingsRow
      icon={icon}
      title={title}
      hint={hint}
      right={
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
        />
      }
    />
  );
}
