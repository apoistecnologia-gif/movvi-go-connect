import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useSettingsVisual } from "./SettingsPageShell";

export function SettingsSection({ icon: Icon, title, description, children, action }: {
  icon?: LucideIcon; title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  const driver = useSettingsVisual() === "driver";
  return (
    <section className={driver ? "space-y-2.5" : "space-y-2"}>
      <div className={driver ? "flex items-end justify-between gap-3 px-1" : "flex items-end justify-between gap-3 px-2"}>
        <div className="min-w-0">
          <h2 className={driver ? "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500" : "flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-[#707070]"}>
            {Icon ? (
              <span className={driver ? "grid h-7 w-7 place-items-center rounded-[10px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/7" : "contents"}>
                <Icon className={driver ? "h-3.5 w-3.5 text-[#F6BE1C]" : "h-3.5 w-3.5 text-[#76C139]"} strokeWidth={2} />
              </span>
            ) : null}
            <span className="truncate">{title}</span>
          </h2>
          {description ? <p className={driver ? "mt-1 pl-9 text-[11px] font-medium text-zinc-600" : "mt-0.5 text-[12.5px] text-[#707070]"}>{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={driver
        ? "overflow-hidden rounded-[22px] border border-white/[0.075] bg-[linear-gradient(180deg,#101316,#0A0C0E)] shadow-[0_20px_54px_-36px_rgba(0,0,0,0.98)] ring-1 ring-black/20 [&>*+*]:border-t [&>*+*]:border-white/[0.055]"
        : "overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 [&>*+*]:border-t [&>*+*]:border-[#F1F5F1]"}>
        {children}
      </div>
    </section>
  );
}
