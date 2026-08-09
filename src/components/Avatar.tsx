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

function isRenderableUrl(value: string) {
  return /^(https?:|blob:|data:)/i.test(value);
}

/** Avatar with safe fallback (initial or icon) when URL is missing/broken. */
export function Avatar({ src, alt, name, size = 44, className = "" }: Props) {
  const [errored, setErrored] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!src) return null;
    return isRenderableUrl(src) ? src : null;
  });
  const initial = (name ?? alt ?? "").trim().charAt(0).toUpperCase();
  const dim = { width: size, height: size };

  useEffect(() => {
    let cancelled = false;
    setErrored(false);
    if (!src) {
      setResolvedSrc(null);
      return () => {
        cancelled = true;
      };
    }
    if (isRenderableUrl(src)) {
      setResolvedSrc(src);
      return () => {
        cancelled = true;
      };
    }

    setResolvedSrc(null);
    void refreshProfilePhotoUrl(src).then((url) => {
      if (!cancelled) setResolvedSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const show = resolvedSrc && !errored;
  return (
    <div
      style={dim}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-primary font-bold ring-1 ring-primary/30 ${className}`}
    >
      {show ? (
        <img
          src={resolvedSrc}
          alt={alt ?? name ?? "Foto de perfil"}
          width={size}
          height={size}
          onError={() => setErrored(true)}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : initial ? (
        <span style={{ fontSize: size * 0.42 }}>{initial}</span>
      ) : (
        <UserIcon style={{ width: size * 0.55, height: size * 0.55 }} />
      )}
    </div>
  );
}
