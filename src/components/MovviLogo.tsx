import { APOIS_LOGO_DATA_URL } from "@/assets/apoisLogoData";

interface MovviLogoProps {
  size?: number;
  showTagline?: boolean;
  className?: string;
  productLabel?: string;
  iconOnly?: boolean;
}

function safeLogoSize(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 64;
  return Math.min(160, Math.max(40, Math.round(value)));
}

function safeProductLabel(value: string | undefined) {
  const normalized = (value ?? "MOTORISTA").trim().replace(/\s+/g, " ");
  return normalized.slice(0, 24);
}

/**
 * Mantemos o nome do componente por compatibilidade com as telas legadas,
 * porém toda a apresentação visível agora usa a identidade oficial APOIS.
 */
export function MovviLogo({
  size,
  showTagline = false,
  className,
  productLabel,
  iconOnly = false,
}: MovviLogoProps) {
  const logoSize = safeLogoSize(size);
  const label = safeProductLabel(productLabel);
  const accessibleName = label ? `APOIS ${label}` : "APOIS";

  const icon = (
    <div
      className="shrink-0 overflow-hidden rounded-full border border-[#E51B23]/20 bg-white shadow-[0_12px_34px_-20px_rgba(229,27,35,0.32)]"
      style={{ width: logoSize, height: logoSize }}
      aria-hidden="true"
    >
      <img
        src={APOIS_LOGO_DATA_URL}
        alt=""
        width={logoSize}
        height={logoSize}
        className="h-full w-full object-cover"
        draggable={false}
        decoding="async"
      />
    </div>
  );

  if (iconOnly) {
    return (
      <div className={`shrink-0 ${className ?? ""}`} role="img" aria-label={accessibleName}>
        {icon}
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-0 max-w-full flex-col items-center gap-2 text-center ${className ?? ""}`}
      role="img"
      aria-label={accessibleName}
    >
      {icon}

      <div className="min-w-0 max-w-full" aria-hidden="true">
        <div className="break-words font-display text-xl font-black leading-tight tracking-[0.08em] text-foreground">
          APOIS
          {label ? (
            <>
              {" "}
              <span className="text-[#E51B23]">{label}</span>
            </>
          ) : null}
        </div>
        {showTagline ? (
          <div className="mt-1 break-words text-xs font-bold uppercase leading-4 tracking-[0.22em] text-[#C9141B]">
            Apois, vamos?
          </div>
        ) : null}
      </div>
    </div>
  );
}
