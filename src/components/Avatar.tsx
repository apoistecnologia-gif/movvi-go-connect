import { useEffect, useState } from "react";
import { User as UserIcon } from "lucide-react";
import { refreshProfilePhotoUrl } from "@/lib/profilePhoto";

type Props = {
  src?: string | null;
  alt?: string;
  name?: string | null;
  size?: number;
  className?: string;
};

function normalizeSize(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 44;
  return Math.min(256, Math.max(24, Math.round(value)));
}

function normalizeSource(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function isRenderableUrl(value: string) {
  return /^(https:|blob:|data:image\/)/i.test(value);
}

function firstInitial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase("pt-BR") ?? "";
}

/** Avatar with safe fallback (initial or icon) when URL is missing/broken. */
export function Avatar({ src, alt, name, size = 44, className = "" }: Props) {
  const safeSize = normalizeSize(size);
  const normalizedSrc = normalizeSource(src);
  const accessibleName = (alt ?? name ?? "Foto de perfil").trim() || "Foto de perfil";
  const [errored, setErrored] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() =>
    normalizedSrc && isRenderableUrl(normalizedSrc) ? normalizedSrc : null,
  );
  const initial = firstInitial(name ?? alt ?? "");
  const dim = { width: safeSize, height: safeSize };

  useEffect(() => {
    let cancelled = false;
    setErrored(false);

    if (!normalizedSrc) {
      setResolvedSrc(null);
      return () => {
        cancelled = true;
      };
    }

    if (isRenderableUrl(normalizedSrc)) {
      setResolvedSrc(normalizedSrc);
      return () => {
        cancelled = true;
      };
    }

    setResolvedSrc(null);
    void refreshProfilePhotoUrl(normalizedSrc)
      .then((url) => {
        if (cancelled) return;
        const normalized = normalizeSource(url);
        setResolvedSrc(normalized && isRenderableUrl(normalized) ? normalized : null);
      })
      .catch(() => {
        if (!cancelled) setResolvedSrc(null);
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedSrc]);

  const show = Boolean(resolvedSrc && !errored);

  return (
    <div
      style={dim}
      role="img"
      aria-label={accessibleName}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-bold text-primary ring-1 ring-primary/30 ${className}`}
    >
      {show ? (
        <img
          src={resolvedSrc ?? undefined}
          alt=""
          aria-hidden="true"
          width={safeSize}
          height={safeSize}
          onLoad={() => setErrored(false)}
          onError={() => setErrored(true)}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : initial ? (
        <span aria-hidden="true" style={{ fontSize: safeSize * 0.42 }}>
          {initial}
        </span>
      ) : (
        <UserIcon
          aria-hidden="true"
          style={{ width: safeSize * 0.55, height: safeSize * 0.55 }}
        />
      )}
    </div>
  );
}
