import { APOIS_LOGO_DATA_URL } from "@/assets/apoisLogoData";

interface MovviLogoProps {
  size?: number;
  showTagline?: boolean;
  className?: string;
  productLabel?: string;
}

/**
 * Mantemos o nome do componente por compatibilidade com as telas legadas,
 * porém toda a apresentação visível agora usa a identidade oficial APOIS.
 * `productLabel` evita reutilizar o rótulo MOTORISTA em superfícies como Admin.
 */
export function MovviLogo({ size = 64, showTagline = false, className, productLabel = "MOTORISTA" }: MovviLogoProps) {
  const label = productLabel.trim();
  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ""}`}>
      <div
        className="overflow-hidden rounded-full border border-[#F6BE1C]/20 bg-black shadow-[0_12px_34px_-20px_rgba(246,190,28,0.65)]"
        style={{ width: size, height: size }}
      >
        <img
          src={APOIS_LOGO_DATA_URL}
          alt="APOIS"
          width={size}
          height={size}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      <div className="text-center">
        <div className="font-display text-xl font-black tracking-[0.08em] text-white">
          APOIS{label ? <> <span className="text-[#F6BE1C]">{label}</span></> : null}
        </div>
        {showTagline ? (
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[#F6BE1C]">
            Apois, vamos?
          </div>
        ) : null}
      </div>
    </div>
  );
}
