import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useSettingsVisual } from "./SettingsPageShell";

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
  const driver = useSettingsVisual() === "driver";
  const sectionId = useId();
  const titleId = `${sectionId}-title`;
  const descriptionId = `${sectionId}-description`;
  const normalizedTitle = title.trim() || "Configurações";
  const normalizedDescription = description?.trim() || "";

  return (
    <section
      className="min-w-0 space-y-2"
      aria-labelledby={titleId}
      aria-describedby={normalizedDescription ? descriptionId : undefined}
    >
      <div
        className={
          driver
            ? "flex min-w-0 items-center justify-between gap-3 px-2 max-[359px]:flex-wrap"
            : "flex min-w-0 items-center justify-between gap-3 px-2 max-[359px]:flex-wrap"
        }
      >
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className={
              driver
                ? "flex min-w-0 items-center gap-1.5 text-[13px] font-black uppercase tracking-[0.12em] text-zinc-500"
                : "flex min-w-0 items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-[#707070]"
            }
          >
            {Icon ? (
              <Icon
                className={
                  driver
                    ? "h-3.5 w-3.5 shrink-0 text-[#F6BE1C]"
                    : "h-3.5 w-3.5 shrink-0 text-[#76C139]"
                }
                strokeWidth={2}
                aria-hidden="true"
              />
            ) : null}
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{normalizedTitle}</span>
          </h2>
          {normalizedDescription ? (
            <p
              id={descriptionId}
              className={
                driver
                  ? "mt-1 break-words text-[13px] leading-5 text-zinc-500 [overflow-wrap:anywhere]"
                  : "mt-1 break-words text-[13px] leading-5 text-[#707070] [overflow-wrap:anywhere]"
              }
            >
              {normalizedDescription}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="min-w-0 shrink-0 max-[359px]:basis-full max-[359px]:shrink">
            {action}
          </div>
        ) : null}
      </div>
      <div
        className={
          driver
            ? "min-w-0 overflow-hidden rounded-[22px] border border-white/5 bg-[#101214] shadow-[0_18px_50px_-34px_rgba(0,0,0,0.95)] [&>*+*]:border-t [&>*+*]:border-white/5"
            : "min-w-0 overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 [&>*+*]:border-t [&>*+*]:border-[#F1F5F1]"
        }
      >
        {children}
      </div>
    </section>
  );
}
