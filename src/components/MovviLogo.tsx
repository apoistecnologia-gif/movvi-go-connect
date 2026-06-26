interface MovviLogoProps {
  size?: number;
  showTagline?: boolean;
  className?: string;
}

/**
 * Logo MOVVI DRIVE em SVG (M + D estilizado com estrada e curva verde).
 * Sem dependência de arquivo de imagem — vetorial, escalável, alinhado à identidade.
 */
export function MovviLogo({ size = 64, showTagline = false, className }: MovviLogoProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ""}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="MOVVI DRIVE logo"
      >
        {/* M */}
        <path
          d="M18 100 L18 28 L40 28 L60 70 L60 100 Z"
          fill="hsl(0 0% 100%)"
        />
        {/* Curva verde do D */}
        <path
          d="M60 28 Q100 28 100 64 Q100 100 60 100 L60 78 Q82 78 82 64 Q82 50 60 50 Z"
          fill="hsl(95 75% 51%)"
        />
        {/* Estrada cinza/preta atravessando */}
        <path
          d="M28 82 Q60 60 95 82"
          stroke="hsl(220 30% 8%)"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M28 82 Q60 60 95 82"
          stroke="hsl(0 0% 100%)"
          strokeWidth="1.5"
          strokeDasharray="4 5"
          fill="none"
        />
      </svg>
      <div className="text-center">
        <div className="font-display text-2xl font-bold tracking-wider text-foreground">
          MOVVI <span className="text-primary">DRIVE</span>
        </div>
        {showTagline && (
          <div className="mt-1 text-xs uppercase tracking-[0.3em] text-primary">
            Mobilidade que move você
          </div>
        )}
      </div>
    </div>
  );
}
