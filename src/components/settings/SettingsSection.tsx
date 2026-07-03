import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * MOVVI DS — Settings section.
 * Unified visual language with the Profile hub:
 * - uppercase micro-label above the group,
 * - white grouped card, 24px radius, soft shadow, hairline ring,
 * - children auto-separated by hairline dividers.
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
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3 px-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-[#707070]">
            {Icon ? <Icon className="h-3.5 w-3.5 text-[#76C139]" strokeWidth={2} /> : null}
            <span className="truncate">{title}</span>
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12.5px] text-[#707070]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 [&>*+*]:border-t [&>*+*]:border-[#F1F5F1]">
        {children}
      </div>
    </section>
  );
}
