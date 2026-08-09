import { useEffect, useRef, useState } from "react";
import { Loader2, Camera, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";
import {
  loadOwnProfilePhotoUrl,
  refreshProfilePhotoUrl,
  uploadProfilePhoto,
  validateProfilePhotoFile,
} from "@/lib/profilePhoto";
import { compressImageToSquare } from "@/lib/imageCompress";

type Props = {
  userId: string;
  name?: string | null;
  currentUrl: string | null;
  onUploaded: (result: { signedUrl: string; path: string }) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  size?: number;
  required?: boolean;
  label?: string;
};

export function ProfilePhotoUploader({
  userId,
  name,
  currentUrl,
  onUploaded,
  onRemove,
  size = 96,
  required,
  label = "Foto de perfil",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resolvedCurrentUrl, setResolvedCurrentUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        let resolved: string | null = null;
        if (currentUrl) {
          resolved = /^https?:\/\//i.test(currentUrl)
            ? currentUrl
            : await refreshProfilePhotoUrl(currentUrl);
        }
        if (!resolved) resolved = await loadOwnProfilePhotoUrl();
        if (alive) setResolvedCurrentUrl(resolved);
      } catch {
        if (alive) setResolvedCurrentUrl(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentUrl, userId]);

  async function handleFile(file: File) {
    setError(null);
    const validation = validateProfilePhotoFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    try {
      const compressed = await compressImageToSquare(file, { size: 512, quality: 0.85 });
      const result = await uploadProfilePhoto(userId, compressed);
      await onUploaded(result);
      setResolvedCurrentUrl(result.signedUrl);
      setPreview(result.signedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a foto.");
      setPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const shown = preview ?? resolvedCurrentUrl;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar src={shown} name={name} size={size} />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-card transition hover:brightness-110 disabled:opacity-60"
          aria-label="Alterar foto"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </p>
        <p className="text-[10px] text-muted-foreground">JPG, PNG ou WEBP · até 5 MB</p>
      </div>

      {onRemove && (currentUrl || resolvedCurrentUrl) && !preview && (
        <button
          type="button"
          disabled={uploading || removing}
          onClick={async () => {
            setError(null);
            setRemoving(true);
            try {
              await onRemove();
              setResolvedCurrentUrl(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Falha ao remover.");
            } finally {
              setRemoving(false);
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
        >
          {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Remover foto
        </button>
      )}

      {error && (
        <p className="rounded-md bg-destructive/15 px-2 py-1 text-[11px] text-destructive ring-1 ring-destructive/30">
          {error}
        </p>
      )}
    </div>
  );
}
